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


from mealPlanning.services.wger_client import lookup_nutrition


class WgerClientTest(TestCase):

    @patch("mealPlanning.services.wger_client.requests.get")
    def test_exact_match_returns_nutrition(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "results": [
                {
                    "name": "Banana",
                    "energy": 89,
                    "protein": "1.100",
                    "carbohydrates": "23.000",
                    "fat": "0.300",
                    "fiber": "2.600",
                    "sodium": "0.001",
                }
            ]
        }
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        result = lookup_nutrition("Banana")
        self.assertIsNotNone(result)
        self.assertEqual(result["calories"], 89)
        self.assertAlmostEqual(result["protein"], 1.1)
        self.assertAlmostEqual(result["fiber"], 2.6)

    @patch("mealPlanning.services.wger_client.requests.get")
    def test_no_match_returns_none(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"results": []}
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        result = lookup_nutrition("Xylophone Casserole")
        self.assertIsNone(result)

    @patch("mealPlanning.services.wger_client.requests.get")
    def test_low_similarity_returns_none(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "results": [
                {
                    "name": "Completely Different Food Item",
                    "energy": 200,
                    "protein": "10.0",
                    "carbohydrates": "20.0",
                    "fat": "5.0",
                    "fiber": "1.0",
                    "sodium": "0.5",
                }
            ]
        }
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        result = lookup_nutrition("Banana")
        self.assertIsNone(result)

    @patch("mealPlanning.services.wger_client.requests.get")
    def test_timeout_returns_none(self, mock_get):
        import requests as req
        mock_get.side_effect = req.exceptions.Timeout("timeout")
        result = lookup_nutrition("Banana")
        self.assertIsNone(result)


from mealPlanning.services.gemini_client import estimate_nutrition


class GeminiClientTest(TestCase):

    @patch("mealPlanning.services.gemini_client.genai")
    def test_returns_structured_nutrition(self, mock_genai):
        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = '{"calories": 350, "protein": 8.0, "carbohydrates": 45.0, "fat": 15.0, "fiber": 2.0, "sodium": 400.0, "confidence": "medium"}'
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        result = estimate_nutrition(
            dish_name="Blueberry Muffin",
            category="Baked Expectations",
            meal_period="Continental Breakfast",
            allergens=["Eggs", "Gluten", "Milk"],
            dietary_flags=["Vegetarian"],
            serving_unit="Baked Expectations",
        )
        self.assertEqual(result["calories"], 350)
        self.assertAlmostEqual(result["protein"], 8.0)
        self.assertEqual(result["confidence"], "medium")

    @patch("mealPlanning.services.gemini_client.genai")
    def test_returns_none_on_api_error(self, mock_genai):
        mock_model = MagicMock()
        mock_model.generate_content.side_effect = Exception("API error")
        mock_genai.GenerativeModel.return_value = mock_model

        result = estimate_nutrition(
            dish_name="Mystery Dish",
            category="Unknown",
            meal_period="Dinner",
        )
        self.assertIsNone(result)

    @patch("mealPlanning.services.gemini_client.genai")
    def test_returns_none_on_invalid_json(self, mock_genai):
        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "not valid json"
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        result = estimate_nutrition(
            dish_name="Bad Response Dish",
            category="Unknown",
            meal_period="Lunch",
        )
        self.assertIsNone(result)
