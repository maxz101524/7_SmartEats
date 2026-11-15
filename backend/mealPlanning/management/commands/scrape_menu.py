import logging
import os
from datetime import date

from django.core.management.base import BaseCommand
from django.utils import timezone

from mealPlanning.models import DiningHall, Dish
from mealPlanning.services import uiuc_dining, gemini_client, semantic_search

logger = logging.getLogger(__name__)


def _env_flag(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


NUTRITION_FIELDS = (
    "calories",
    "protein",
    "carbohydrates",
    "fat",
    "fiber",
    "sodium",
    "serving_size",
    "nutrition_source",
    "ai_confidence",
)


def _copy_existing_nutrition(dish):
    source = (
        Dish.objects
        .filter(dish_name__iexact=dish.dish_name, calories__gt=0)
        .exclude(pk=dish.pk)
        .exclude(nutrition_source="")
        .order_by("-last_seen", "dining_hall__name")
        .first()
    )
    if source is None:
        return False

    for field in NUTRITION_FIELDS:
        setattr(dish, field, getattr(source, field))
    if not dish.nutrition_source:
        dish.nutrition_source = "copied"
    dish.save(update_fields=NUTRITION_FIELDS)
    return True


def _nutrition_cache_key(dish):
    return (
        str(dish.dish_name or "").strip().lower(),
        str(dish.category or "").strip().lower(),
        str(dish.meal_period or "").strip().lower(),
        str(dish.serving_unit or "").strip().lower(),
    )


def _apply_ai_nutrition(dish, ai_data):
    dish.calories = ai_data["calories"]
    dish.protein = round(ai_data["protein"])
    dish.carbohydrates = round(ai_data["carbohydrates"])
    dish.fat = round(ai_data["fat"])
    dish.fiber = ai_data["fiber"]
    dish.sodium = ai_data["sodium"]
    dish.serving_size = ai_data.get("serving_size", "")
    dish.nutrition_source = "ai_generated"
    dish.ai_confidence = ai_data.get("confidence", "")
    dish.save()


class Command(BaseCommand):
    help = "Fetch today's UIUC dining menu and enrich dishes with nutrition data via Gemini."

    def add_arguments(self, parser):
        parser.add_argument(
            "--date",
            type=str,
            default=None,
            help="Menu date in YYYY-MM-DD format (defaults to today)",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Re-enrich existing nutrition only when combined with --enrich-gemini.",
        )
        parser.add_argument(
            "--enrich-gemini",
            action="store_true",
            help="Force Gemini nutrition enrichment on when DISABLE_GEMINI_NUTRITION=true.",
        )
        parser.add_argument(
            "--skip-gemini",
            action="store_true",
            help="Skip Gemini nutrition enrichment for this run.",
        )

    def handle(self, *args, **options):
        menu_date = options["date"] or timezone.localdate().isoformat()
        force = options["force"]
        disable_by_env = _env_flag("DISABLE_GEMINI_NUTRITION", default=False)
        enrich_with_gemini = (
            (options["enrich_gemini"] or not disable_by_env)
            and not options["skip_gemini"]
        )
        self.stdout.write(
            f"Scraping menu for {menu_date} (force={force}, enrich_gemini={enrich_with_gemini})..."
        )

        stats = {
            "halls": 0,
            "created": 0,
            "updated": 0,
            "ai": 0,
            "ai_calls": 0,
            "copied": 0,
            "skipped": 0,
            "ai_disabled": 0,
            "force_enriched": 0,
        }
        dishes_to_enrich = []
        today_dishes = []

        for option_id, hall_name in uiuc_dining.DINING_OPTIONS.items():
            items = uiuc_dining.fetch_menu(option_id, menu_date)
            if not items:
                self.stdout.write(self.style.WARNING(f"  No items for {hall_name}"))
                continue

            hall, _ = DiningHall.objects.get_or_create(
                name=hall_name,
                defaults={"location": hall_name},
            )
            stats["halls"] += 1

            for item in items:
                dish, created = Dish.objects.get_or_create(
                    dish_name=item["formal_name"],
                    dining_hall=hall,
                    defaults={"category": item["category"]},
                )

                # Always update metadata
                dish.category = item["category"]
                dish.meal_period = item["meal"]
                dish.course = item["course"]
                dish.serving_unit = item["serving_unit"]
                dish.allergens = item["allergens"]
                dish.dietary_flags = item["dietary_flags"]
                dish.uiuc_item_id = item["item_id"]
                dish.last_seen = date.fromisoformat(menu_date)
                dish.save()
                today_dishes.append(dish)

                if created:
                    stats["created"] += 1
                else:
                    stats["updated"] += 1

                # Reuse known nutrition first; only truly missing rows need Gemini.
                needs_nutrition = dish.nutrition_source == ""
                if needs_nutrition and _copy_existing_nutrition(dish):
                    stats["copied"] += 1
                    needs_nutrition = False

                force_reenrich = force and options["enrich_gemini"]
                if force and not options["enrich_gemini"] and not needs_nutrition:
                    stats["skipped"] += 1
                elif force_reenrich or needs_nutrition:
                    if enrich_with_gemini:
                        dishes_to_enrich.append(dish)
                    else:
                        stats["ai_disabled"] += 1
                else:
                    stats["skipped"] += 1

        # Nutrition enrichment phase. Use --skip-gemini only for emergency no-AI refreshes.
        if not enrich_with_gemini and stats["ai_disabled"]:
            self.stdout.write(self.style.WARNING(
                f"Gemini enrichment disabled; skipped {stats['ai_disabled']} dishes. "
                "Remove --skip-gemini or use --enrich-gemini to opt in."
            ))
        self.stdout.write(f"Enriching {len(dishes_to_enrich)} dishes via Gemini...")

        enrich_groups = {}
        for dish in dishes_to_enrich:
            enrich_groups.setdefault(_nutrition_cache_key(dish), []).append(dish)

        for group in enrich_groups.values():
            dish = group[0]
            ai_data = gemini_client.estimate_nutrition(
                dish_name=dish.dish_name,
                category=dish.category,
                meal_period=dish.meal_period,
                allergens=dish.allergens,
                dietary_flags=dish.dietary_flags,
                serving_unit=dish.serving_unit,
            )

            if ai_data:
                stats["ai_calls"] += 1
                for grouped_dish in group:
                    _apply_ai_nutrition(grouped_dish, ai_data)
                    if force:
                        stats["force_enriched"] += 1
                    stats["ai"] += 1
            else:
                logger.warning("No nutrition data for '%s'", dish.dish_name)

        self.stdout.write(self.style.SUCCESS(
            f"Done! Halls: {stats['halls']}, "
            f"Created: {stats['created']}, Updated: {stats['updated']}, "
            f"AI: {stats['ai']}, AI calls: {stats['ai_calls']}, Copied: {stats['copied']}, "
            f"Skipped: {stats['skipped']}, AI disabled: {stats['ai_disabled']}, "
            f"Force re-enriched: {stats['force_enriched']}"
        ))

        # Embedding phase — compute for dishes scraped today that are missing or stale
        dishes_needing_embedding = [
            d for d in today_dishes
            if semantic_search.embedding_blob_needs_refresh(d.embedding)
        ]
        self.stdout.write(f"Embedding {len(dishes_needing_embedding)} dishes...")
        for dish in dishes_needing_embedding:
            try:
                dish.refresh_from_db()  # pick up any nutrition updates
                text = semantic_search.dish_text(dish)
                dish.embedding = semantic_search.encode_to_bytes(text)
                dish.save(update_fields=["embedding"])
            except Exception as exc:
                logger.warning("Embedding failed for '%s': %s", dish.dish_name, exc)
