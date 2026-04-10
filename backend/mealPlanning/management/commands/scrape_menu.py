import logging
from datetime import date

from django.core.management.base import BaseCommand
from django.utils import timezone

from mealPlanning.models import DiningHall, Dish
from mealPlanning.services import uiuc_dining, gemini_client, semantic_search

logger = logging.getLogger(__name__)


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
            help="Re-enrich dishes that already have nutrition data",
        )

    def handle(self, *args, **options):
        menu_date = options["date"] or timezone.localdate().isoformat()
        force = options["force"]
        self.stdout.write(f"Scraping menu for {menu_date} (force={force})...")

        stats = {"halls": 0, "created": 0, "updated": 0, "ai": 0, "skipped": 0, "force_enriched": 0}
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

                # Queue for nutrition enrichment
                needs_nutrition = dish.nutrition_source == ""
                if force or needs_nutrition:
                    dishes_to_enrich.append(dish)
                else:
                    stats["skipped"] += 1

        # Nutrition enrichment phase — Gemini only
        self.stdout.write(f"Enriching {len(dishes_to_enrich)} dishes via Gemini...")

        for dish in dishes_to_enrich:
            ai_data = gemini_client.estimate_nutrition(
                dish_name=dish.dish_name,
                category=dish.category,
                meal_period=dish.meal_period,
                allergens=dish.allergens,
                dietary_flags=dish.dietary_flags,
                serving_unit=dish.serving_unit,
            )

            if ai_data:
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
                if force and dish.nutrition_source != "":
                    stats["force_enriched"] += 1
                stats["ai"] += 1
            else:
                logger.warning("No nutrition data for '%s'", dish.dish_name)

        self.stdout.write(self.style.SUCCESS(
            f"Done! Halls: {stats['halls']}, "
            f"Created: {stats['created']}, Updated: {stats['updated']}, "
            f"AI: {stats['ai']}, Skipped: {stats['skipped']}, "
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
