import logging
from datetime import date

from django.core.management.base import BaseCommand

from mealPlanning.models import DiningHall, Dish
from mealPlanning.services import uiuc_dining, wger_client, gemini_client

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Fetch today's UIUC dining menu and enrich dishes with nutrition data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--date",
            type=str,
            default=None,
            help="Menu date in YYYY-MM-DD format (defaults to today)",
        )

    def handle(self, *args, **options):
        menu_date = options["date"] or date.today().isoformat()
        self.stdout.write(f"Scraping menu for {menu_date}...")

        stats = {"halls": 0, "created": 0, "updated": 0, "wger": 0, "ai": 0, "skipped": 0}
        dishes_to_enrich = []

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

                if created:
                    stats["created"] += 1
                else:
                    stats["updated"] += 1

                # Queue for nutrition enrichment if needed
                needs_nutrition = (dish.calories == 0 and dish.nutrition_source == "")
                if needs_nutrition:
                    dishes_to_enrich.append(dish)
                else:
                    stats["skipped"] += 1

        # Nutrition enrichment phase
        self.stdout.write(f"Enriching {len(dishes_to_enrich)} dishes...")

        for dish in dishes_to_enrich:
            wger_data = wger_client.lookup_nutrition(dish.dish_name)

            if wger_data:
                dish.calories = wger_data["calories"]
                dish.protein = round(wger_data["protein"])
                dish.carbohydrates = round(wger_data["carbohydrates"])
                dish.fat = round(wger_data["fat"])
                dish.fiber = wger_data["fiber"]
                dish.sodium = wger_data["sodium"]
                dish.nutrition_source = "wger"
                dish.save()
                stats["wger"] += 1
                continue

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
                dish.nutrition_source = "ai_generated"
                dish.ai_confidence = ai_data.get("confidence", "")
                dish.save()
                stats["ai"] += 1
            else:
                logger.warning("No nutrition data for '%s'", dish.dish_name)

        self.stdout.write(self.style.SUCCESS(
            f"Done! Halls: {stats['halls']}, "
            f"Created: {stats['created']}, Updated: {stats['updated']}, "
            f"Wger: {stats['wger']}, AI: {stats['ai']}, "
            f"Skipped: {stats['skipped']}"
        ))
