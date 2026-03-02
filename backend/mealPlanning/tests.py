from django.test import TestCase
from mealPlanning.models import DiningHall, Dish


class DishModelFieldsTest(TestCase):
    def setUp(self):
        self.hall = DiningHall.objects.create(name="Test Hall", location="Test Location")

    def test_new_nutrition_fields_exist(self):
        dish = Dish.objects.create(
            dish_name="Test Dish",
            category="Entree",
            dining_hall=self.hall,
            fiber=2.5,
            sodium=150.0,
            allergens=["Gluten", "Milk"],
            dietary_flags=["Vegetarian"],
            nutrition_source="wger",
            ai_confidence="",
            meal_period="Lunch",
            course="Entrees",
            serving_unit="Grill Station",
            uiuc_item_id=12345,
        )
        dish.refresh_from_db()
        self.assertEqual(dish.fiber, 2.5)
        self.assertEqual(dish.sodium, 150.0)
        self.assertEqual(dish.allergens, ["Gluten", "Milk"])
        self.assertEqual(dish.dietary_flags, ["Vegetarian"])
        self.assertEqual(dish.nutrition_source, "wger")
        self.assertEqual(dish.meal_period, "Lunch")
        self.assertEqual(dish.course, "Entrees")
        self.assertEqual(dish.serving_unit, "Grill Station")
        self.assertEqual(dish.uiuc_item_id, 12345)

    def test_new_fields_default_to_null_or_empty(self):
        dish = Dish.objects.create(
            dish_name="Minimal Dish",
            category="Side",
            dining_hall=self.hall,
        )
        dish.refresh_from_db()
        self.assertIsNone(dish.fiber)
        self.assertIsNone(dish.sodium)
        self.assertEqual(dish.allergens, [])
        self.assertEqual(dish.dietary_flags, [])
        self.assertEqual(dish.nutrition_source, "")
        self.assertEqual(dish.ai_confidence, "")
        self.assertIsNone(dish.uiuc_item_id)
        self.assertIsNone(dish.last_seen)


from unittest.mock import patch, MagicMock
from mealPlanning.services.uiuc_dining import fetch_menu, parse_traits, ALLERGEN_SET, DIET_FLAG_SET


class UIUCDiningClientTest(TestCase):

    def test_parse_traits_splits_allergens_and_flags(self):
        traits_str = "Corn,Eggs,Gluten,Milk,Soy,Vegetarian,Wheat,"
        allergens, flags = parse_traits(traits_str)
        self.assertEqual(set(allergens), {"Corn", "Eggs", "Gluten", "Milk", "Soy", "Wheat"})
        self.assertEqual(flags, ["Vegetarian"])

    def test_parse_traits_empty_string(self):
        allergens, flags = parse_traits("")
        self.assertEqual(allergens, [])
        self.assertEqual(flags, [])

    def test_parse_traits_vegan_and_jain(self):
        allergens, flags = parse_traits("Jain,Vegan,Vegetarian,")
        self.assertEqual(allergens, [])
        self.assertEqual(set(flags), {"Jain", "Vegan", "Vegetarian"})

    @patch("mealPlanning.services.uiuc_dining.requests.post")
    def test_fetch_menu_returns_parsed_items(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {
                "FormalName": "Banana",
                "Category": "Fruits",
                "Course": "Fruits",
                "Meal": "Lunch",
                "Traits": "Jain,Vegan,Vegetarian,",
                "ServingUnit": "Euclid Street Deli",
                "ItemID": 841,
                "EventDate": "2026-03-01T00:00:00",
            }
        ]
        mock_post.return_value = mock_response

        items = fetch_menu(option_id=1, date_str="2026-03-01")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["formal_name"], "Banana")
        self.assertEqual(items[0]["category"], "Fruits")
        self.assertEqual(items[0]["meal"], "Lunch")
        self.assertEqual(items[0]["allergens"], [])
        self.assertEqual(set(items[0]["dietary_flags"]), {"Jain", "Vegan", "Vegetarian"})
        self.assertEqual(items[0]["item_id"], 841)

    @patch("mealPlanning.services.uiuc_dining.requests.post")
    def test_fetch_menu_handles_timeout(self, mock_post):
        import requests as req
        mock_post.side_effect = req.exceptions.Timeout("timeout")
        items = fetch_menu(option_id=1, date_str="2026-03-01")
        self.assertEqual(items, [])
