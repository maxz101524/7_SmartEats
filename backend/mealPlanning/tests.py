import json
import pickle
import numpy as np
from datetime import date
from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from rest_framework.authtoken.models import Token

from mealPlanning.models import (
    DiningHall,
    Dish,
    Meal,
    create_user_profile,
    save_user_profile,
)
from mealPlanning.services import ai_chat
from mealPlanning.services.semantic_search import dish_text, encode_to_bytes, decode_from_bytes, search


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
            nutrition_source="ai_generated",
            ai_confidence="medium",
            meal_period="Lunch",
            course="Entrees",
            serving_unit="Grill Station",
            serving_size="1 piece (~170g)",
            uiuc_item_id=12345,
        )
        dish.refresh_from_db()
        self.assertEqual(dish.fiber, 2.5)
        self.assertEqual(dish.sodium, 150.0)
        self.assertEqual(dish.allergens, ["Gluten", "Milk"])
        self.assertEqual(dish.dietary_flags, ["Vegetarian"])
        self.assertEqual(dish.nutrition_source, "ai_generated")
        self.assertEqual(dish.meal_period, "Lunch")
        self.assertEqual(dish.course, "Entrees")
        self.assertEqual(dish.serving_unit, "Grill Station")
        self.assertEqual(dish.serving_size, "1 piece (~170g)")
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
        self.assertEqual(dish.serving_size, "")
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
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.text = '{"calories": 350, "protein": 8.0, "carbohydrates": 45.0, "fat": 15.0, "fiber": 2.0, "sodium": 400.0, "sugar": 18.0, "serving_size": "1 muffin (~110g)", "confidence": "medium"}'
        mock_client.models.generate_content.return_value = mock_response
        mock_genai.Client.return_value = mock_client

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
        self.assertEqual(result["serving_size"], "1 muffin (~110g)")
        self.assertAlmostEqual(result["sugar"], 18.0)

    @patch("mealPlanning.services.gemini_client.genai")
    def test_returns_none_on_api_error(self, mock_genai):
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = Exception("API error")
        mock_genai.Client.return_value = mock_client

        result = estimate_nutrition(
            dish_name="Mystery Dish",
            category="Unknown",
            meal_period="Dinner",
        )
        self.assertIsNone(result)

    @patch("mealPlanning.services.gemini_client.genai")
    def test_returns_none_on_invalid_json(self, mock_genai):
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "not valid json"
        mock_client.models.generate_content.return_value = mock_response
        mock_genai.Client.return_value = mock_client

        result = estimate_nutrition(
            dish_name="Bad Response Dish",
            category="Unknown",
            meal_period="Lunch",
        )
        self.assertIsNone(result)


from django.core.management import call_command
from io import StringIO
from datetime import date


class ScrapeMenuCommandTest(TestCase):

    @patch("mealPlanning.services.semantic_search.encode_to_bytes")
    @patch("mealPlanning.services.gemini_client.estimate_nutrition")
    @patch("mealPlanning.services.uiuc_dining.fetch_menu")
    def test_creates_hall_and_dishes_via_gemini(self, mock_fetch, mock_gemini, mock_encode):
        mock_encode.return_value = b"fake_vec"
        mock_fetch.return_value = [
            {
                "formal_name": "Banana",
                "category": "Fruits",
                "course": "Fruits",
                "meal": "Lunch",
                "serving_unit": "Deli",
                "item_id": 841,
                "allergens": [],
                "dietary_flags": ["Vegan", "Vegetarian"],
            },
        ]
        mock_gemini.return_value = {
            "calories": 105,
            "protein": 1.3,
            "carbohydrates": 27.0,
            "fat": 0.4,
            "fiber": 3.1,
            "sodium": 1.0,
            "sugar": 14.0,
            "serving_size": "1 medium banana (~120g)",
            "confidence": "high",
        }

        out = StringIO()
        call_command("scrape_menu", "--date=2026-03-01", stdout=out)

        # Hall created
        self.assertTrue(DiningHall.objects.filter(name="Ikenberry Dining Center").exists())

        # Dish created with AI nutrition
        dish = Dish.objects.get(dish_name="Banana", dining_hall__name="Ikenberry Dining Center")
        self.assertEqual(dish.calories, 105)
        self.assertEqual(dish.nutrition_source, "ai_generated")
        self.assertEqual(dish.ai_confidence, "high")
        self.assertEqual(dish.serving_size, "1 medium banana (~120g)")
        self.assertEqual(dish.dietary_flags, ["Vegan", "Vegetarian"])
        self.assertEqual(dish.last_seen, date(2026, 3, 1))
        self.assertEqual(bytes(dish.embedding), b"fake_vec")

    @patch("mealPlanning.services.gemini_client.estimate_nutrition")
    @patch("mealPlanning.services.uiuc_dining.fetch_menu")
    def test_skips_dishes_already_enriched(self, mock_fetch, mock_gemini):
        hall = DiningHall.objects.create(name="Ikenberry Dining Center", location="Ikenberry")
        Dish.objects.create(
            dish_name="Banana",
            category="Fruits",
            dining_hall=hall,
            calories=89,
            nutrition_source="ai_generated",
        )

        items = [
            {
                "formal_name": "Banana",
                "category": "Fruits",
                "course": "Fruits",
                "meal": "Lunch",
                "serving_unit": "Deli",
                "item_id": 841,
                "allergens": [],
                "dietary_flags": ["Vegan"],
            },
        ]
        # Only return items for option 1 (Ikenberry), empty for others
        mock_fetch.side_effect = lambda option_id, date_str: items if option_id == 1 else []

        out = StringIO()
        call_command("scrape_menu", "--date=2026-03-01", stdout=out)

        # Gemini should NOT have been called — dish already has nutrition
        mock_gemini.assert_not_called()

        # But metadata should be updated
        dish = Dish.objects.get(dish_name="Banana", dining_hall=hall)
        self.assertEqual(dish.last_seen, date(2026, 3, 1))
        self.assertEqual(dish.dietary_flags, ["Vegan"])

    @patch("mealPlanning.services.gemini_client.estimate_nutrition")
    @patch("mealPlanning.services.uiuc_dining.fetch_menu")
    def test_force_flag_re_enriches_existing_dishes(self, mock_fetch, mock_gemini):
        hall = DiningHall.objects.create(name="Ikenberry Dining Center", location="Ikenberry")
        Dish.objects.create(
            dish_name="Banana",
            category="Fruits",
            dining_hall=hall,
            calories=89,
            nutrition_source="ai_generated",
            ai_confidence="low",
        )

        items = [
            {
                "formal_name": "Banana",
                "category": "Fruits",
                "course": "Fruits",
                "meal": "Lunch",
                "serving_unit": "Deli",
                "item_id": 841,
                "allergens": [],
                "dietary_flags": ["Vegan"],
            },
        ]
        mock_fetch.side_effect = lambda option_id, date_str: items if option_id == 1 else []
        mock_gemini.return_value = {
            "calories": 105,
            "protein": 1.3,
            "carbohydrates": 27.0,
            "fat": 0.4,
            "fiber": 3.1,
            "sodium": 1.0,
            "sugar": 14.0,
            "serving_size": "1 medium banana (~120g)",
            "confidence": "high",
        }

        out = StringIO()
        call_command("scrape_menu", "--date=2026-03-01", "--force", stdout=out)

        # Gemini SHOULD have been called — force flag
        mock_gemini.assert_called()

        # Dish should be updated with new data
        dish = Dish.objects.get(dish_name="Banana", dining_hall=hall)
        self.assertEqual(dish.calories, 105)
        self.assertEqual(dish.ai_confidence, "high")
        self.assertEqual(dish.serving_size, "1 medium banana (~120g)")


class ExportMealsViewTest(TestCase):
    def setUp(self):
        post_save.disconnect(create_user_profile, sender=User)
        post_save.disconnect(save_user_profile, sender=User)
        self.addCleanup(post_save.connect, create_user_profile, sender=User)
        self.addCleanup(post_save.connect, save_user_profile, sender=User)

        self.user = User.objects.create_user(username="user_a", password="pw123456")
        self.other_user = User.objects.create_user(username="user_b", password="pw123456")
        self.token = Token.objects.create(user=self.user)

        self.user_meal = Meal.objects.create(
            user=self.user,
            total_calories=500,
            total_protein=30,
            total_carbohydrates=50,
            total_fat=15,
        )
        Meal.objects.create(
            user=self.other_user,
            total_calories=900,
            total_protein=80,
            total_carbohydrates=20,
            total_fat=40,
        )

    def test_export_meals_requires_auth(self):
        response = self.client.get("/api/export-meals/?file_format=json")
        self.assertEqual(response.status_code, 401)

    def test_export_meals_json_returns_only_authenticated_users_data(self):
        response = self.client.get(
            "/api/export-meals/?file_format=json",
            HTTP_AUTHORIZATION=f"Token {self.token.key}",
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["record_count"], 1)
        self.assertEqual(len(payload["meals"]), 1)
        self.assertEqual(payload["meals"][0]["meal_id"], self.user_meal.meal_id)

    def test_export_meals_invalid_format_returns_400(self):
        response = self.client.get(
            "/api/export-meals/?file_format=xml",
            HTTP_AUTHORIZATION=f"Token {self.token.key}",
        )
        self.assertEqual(response.status_code, 400)


class AIChatViewTest(TestCase):
    @patch("mealPlanning.services.ai_chat.get_response")
    def test_ai_chat_passes_history(self, mock_get_response):
        mock_get_response.return_value = {"response": "hello", "recommended_dishes": []}
        payload = {
            "message": "what should I eat?",
            "history": [
                {"role": "user", "content": "I need more protein"},
                {"role": "assistant", "content": "Try lean meats and yogurt"},
            ],
        }
        response = self.client.post(
            "/api/ai-chat/",
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        mock_get_response.assert_called_once_with(
            "what should I eat?",
            history=payload["history"],
            user_context={},
        )

    def test_ai_chat_requires_message(self):
        response = self.client.post(
            "/api/ai-chat/",
            data=json.dumps({"history": []}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)


class AIChatServiceTest(TestCase):
    @patch("mealPlanning.services.ai_chat._build_menu_context")
    @patch("mealPlanning.services.ai_chat._get_client")
    def test_get_response_grounds_recommendations_and_suggestions(self, mock_get_client, mock_build_context):
        mock_build_context.return_value = (
            ["Illinois Street Dining Center"],
            "- Grilled Chicken | Illinois Street Dining Center | Grill | 250cal 35g P 5g C 8g F",
            {
                11: {
                    "dish_id": 11,
                    "dish_name": "Grilled Chicken",
                    "dining_hall_name": "Illinois Street Dining Center",
                    "serving_unit": "Grill",
                },
            },
            {
                "grilled chicken": [{
                    "dish_id": 11,
                    "dish_name": "Grilled Chicken",
                    "dining_hall_name": "Illinois Street Dining Center",
                    "serving_unit": "Grill",
                }],
            },
        )

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "response": "Try a lean option first.",
            "recommended_dishes": [
                {"dish_id": 999, "dish_name": "Not On Menu", "reason": "invalid"},
                {"dish_id": 11, "dish_name": "Wrong Label", "reason": "High protein"},
            ],
            "follow_up_suggestions": [
                "Show me lower-carb options",
                "Show me lower-carb options",
                "x" * 120,
                "What if I need vegetarian?",
            ],
        })
        mock_client.models.generate_content.return_value = mock_response
        mock_get_client.return_value = mock_client

        result = ai_chat.get_response(
            "I need protein",
            history=[{"role": "user", "content": "I am cutting"}],
            user_context={"goal": "fat_loss"},
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["response"], "Try a lean option first.")
        self.assertEqual(result["recommended_dishes"], [
            {"dish_id": 11, "dish_name": "Grilled Chicken", "reason": "High protein"},
        ])
        self.assertEqual(result["follow_up_suggestions"], [
            "Show me lower-carb options",
            "What if I need vegetarian?",
        ])


class NutritionEstimateViewTest(TestCase):
    """Tests for the local-LLM nutrition estimation endpoint."""

    @patch("mealPlanning.services.local_llm.estimate_daily_nutrition")
    def test_valid_request_returns_200(self, mock_estimate):
        mock_estimate.return_value = {
            "bmr": 1800,
            "tdee": 2790,
            "recommended_calories": 3090,
            "macros": {"protein_g": 232, "carbs_g": 347, "fat_g": 86},
            "activity_level": "moderate",
            "goal": "muscle_gain",
            "model": "stabilityai/stablelm-2-zephyr-1_6b",
            "used_fallback": False,
        }

        payload = {
            "age": 25,
            "sex": "male",
            "weight_kg": 80,
            "height_cm": 175,
            "activity_level": "moderate",
            "goal": "muscle_gain",
        }
        response = self.client.post(
            "/api/nutrition-estimate/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("bmr", data)
        self.assertIn("tdee", data)
        self.assertIn("recommended_calories", data)
        self.assertIn("macros", data)
        self.assertIn("protein_g", data["macros"])
        mock_estimate.assert_called_once()

    def test_missing_fields_returns_400(self):
        payload = {"age": 25}  # missing sex, weight_kg, height_cm, activity_level, goal
        response = self.client.post(
            "/api/nutrition-estimate/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("errors", data)
        self.assertTrue(len(data["errors"]) >= 4)

    def test_invalid_ranges_returns_400(self):
        payload = {
            "age": 300,
            "sex": "male",
            "weight_kg": 80,
            "height_cm": 175,
            "activity_level": "moderate",
            "goal": "muscle_gain",
        }
        response = self.client.post(
            "/api/nutrition-estimate/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertTrue(any("age" in e for e in data["errors"]))

    def test_invalid_json_returns_400(self):
        response = self.client.post(
            "/api/nutrition-estimate/",
            data="not json",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)


class SemanticSearchServiceTest(TestCase):

    def test_dish_text_combines_name_category_flags_allergens(self):
        dish = Dish(
            dish_name="Grilled Chicken",
            category="Entrees",
            dietary_flags=["Gluten-Free"],
            allergens=["Milk"],
        )
        result = dish_text(dish)
        self.assertEqual(result, "Grilled Chicken Entrees Gluten-Free Milk")

    def test_dish_text_handles_none_and_empty_fields(self):
        dish = Dish(
            dish_name="Pasta",
            category=None,
            dietary_flags=None,
            allergens=None,
        )
        result = dish_text(dish)
        self.assertEqual(result, "Pasta")

    def test_dish_text_handles_empty_lists(self):
        dish = Dish(
            dish_name="Soup",
            category="Soups",
            dietary_flags=[],
            allergens=[],
        )
        result = dish_text(dish)
        self.assertEqual(result, "Soup Soups")

    @patch("mealPlanning.services.semantic_search._get_model")
    def test_encode_decode_roundtrip(self, mock_get_model):
        mock_model = MagicMock()
        mock_model.encode.return_value = np.array([0.1, 0.2, 0.3], dtype=np.float32)
        mock_get_model.return_value = mock_model

        blob = encode_to_bytes("test dish")
        result = decode_from_bytes(blob)
        np.testing.assert_array_almost_equal(result, [0.1, 0.2, 0.3])

    @patch("mealPlanning.services.semantic_search._get_model")
    def test_search_returns_most_similar_dish_first(self, mock_get_model):
        mock_model = MagicMock()
        mock_get_model.return_value = mock_model

        hall = DiningHall.objects.create(name="Test Hall", location="Test")
        # Both dishes score above MIN_SCORE (0.30); dish1 scores higher
        vec1 = np.array([1.0, 0.0], dtype=np.float32)   # dot [1,0] = 1.0
        vec2 = np.array([0.8, 0.6], dtype=np.float32)   # dot [1,0] = 0.8 (both pass threshold)
        dish1 = Dish.objects.create(
            dish_name="Grilled Chicken", category="Entrees",
            dining_hall=hall, last_seen=date.today(),
            embedding=pickle.dumps(vec1),
        )
        Dish.objects.create(
            dish_name="Garden Salad", category="Salads",
            dining_hall=hall, last_seen=date.today(),
            embedding=pickle.dumps(vec2),
        )
        # Query points toward dish1
        mock_model.encode.return_value = np.array([1.0, 0.0], dtype=np.float32)

        results = search("high protein")
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["dish_name"], "Grilled Chicken")
        self.assertGreater(results[0]["score"], results[1]["score"])

    @patch("mealPlanning.services.semantic_search._get_model")
    def test_search_filters_out_results_below_min_score(self, mock_get_model):
        mock_model = MagicMock()
        mock_get_model.return_value = mock_model

        hall = DiningHall.objects.create(name="Threshold Hall", location="Test")
        Dish.objects.create(
            dish_name="Strong Match", category="Entrees",
            dining_hall=hall, last_seen=date.today(),
            embedding=pickle.dumps(np.array([0.31, 0.0], dtype=np.float32)),
        )
        Dish.objects.create(
            dish_name="Weak Match", category="Entrees",
            dining_hall=hall, last_seen=date.today(),
            embedding=pickle.dumps(np.array([0.29, 0.0], dtype=np.float32)),
        )
        mock_model.encode.return_value = np.array([1.0, 0.0], dtype=np.float32)

        results = search("protein")
        self.assertEqual([result["dish_name"] for result in results], ["Strong Match"])
        self.assertGreaterEqual(results[0]["score"], 0.30)

    @patch("mealPlanning.services.semantic_search._get_model")
    def test_search_falls_back_to_all_embedded_dishes_when_none_seen_today(self, mock_get_model):
        mock_model = MagicMock()
        mock_model.encode.return_value = np.array([1.0, 0.0], dtype=np.float32)
        mock_get_model.return_value = mock_model

        hall = DiningHall.objects.create(name="Fallback Hall", location="Test")
        Dish.objects.create(
            dish_name="Yesterday's Chili", category="Soups",
            dining_hall=hall, last_seen=date(2026, 1, 1),
            embedding=pickle.dumps(np.array([1.0, 0.0], dtype=np.float32)),
        )

        results = search("comfort food")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["dish_name"], "Yesterday's Chili")

    @patch("mealPlanning.services.semantic_search._get_model")
    def test_search_returns_empty_list_when_no_embeddings_exist_anywhere(self, mock_get_model):
        mock_model = MagicMock()
        mock_model.encode.return_value = np.array([1.0, 0.0], dtype=np.float32)
        mock_get_model.return_value = mock_model

        # No embedded dishes exist anywhere in the local DB
        results = search("anything")
        self.assertEqual(results, [])

    def test_search_returns_empty_list_for_empty_query(self):
        results = search("")
        self.assertEqual(results, [])
        results = search("   ")
        self.assertEqual(results, [])


from django.core.management import call_command
import io

class BuildEmbeddingsCommandTest(TestCase):

    @patch("mealPlanning.services.semantic_search.encode_to_bytes")
    def test_embeds_dishes_without_embeddings(self, mock_encode):
        mock_encode.return_value = b"fake_embedding"
        hall = DiningHall.objects.create(name="Ikenberry", location="Ikenberry")
        dish = Dish.objects.create(
            dish_name="Pancakes", category="Breakfast",
            dining_hall=hall, last_seen=date.today(),
        )
        self.assertIsNone(dish.embedding)

        out = io.StringIO()
        call_command("build_embeddings", stdout=out)

        dish.refresh_from_db()
        self.assertEqual(bytes(dish.embedding), b"fake_embedding")
        mock_encode.assert_called_once()

    @patch("mealPlanning.services.semantic_search.encode_to_bytes")
    def test_skips_dishes_that_already_have_embeddings(self, mock_encode):
        hall = DiningHall.objects.create(name="PAR", location="PAR")
        Dish.objects.create(
            dish_name="Eggs", category="Breakfast",
            dining_hall=hall, last_seen=date.today(),
            embedding=b"existing",
        )
        out = io.StringIO()
        call_command("build_embeddings", stdout=out)

        mock_encode.assert_not_called()


from rest_framework.test import APIClient

class SemanticSearchViewTest(TestCase):

    def setUp(self):
        self.client = APIClient()

    def test_missing_query_returns_400(self):
        response = self.client.get("/api/semantic-search/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.data)

    def test_empty_query_returns_400(self):
        response = self.client.get("/api/semantic-search/?q=")
        self.assertEqual(response.status_code, 400)

    def test_query_too_long_returns_400(self):
        response = self.client.get(f"/api/semantic-search/?q={'x' * 201}")
        self.assertEqual(response.status_code, 400)

    @patch("mealPlanning.services.semantic_search.search")
    def test_valid_query_returns_200_with_results(self, mock_search):
        mock_search.return_value = [
            {"dish_id": 1, "dish_name": "Chicken", "score": 0.9}
        ]
        response = self.client.get("/api/semantic-search/?q=high protein")
        self.assertEqual(response.status_code, 200)
        self.assertIn("results", response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["query"], "high protein")

    @patch("mealPlanning.services.semantic_search.search")
    def test_hall_param_is_passed_to_service(self, mock_search):
        mock_search.return_value = []
        self.client.get("/api/semantic-search/?q=soup&hall=3")
        # "soup" is ≤3 words → expanded by query expansion logic
        mock_search.assert_called_once_with("A UIUC dining hall dish that is soup", hall_id="3", top_k=10)

    @patch("mealPlanning.services.semantic_search.search")
    def test_empty_results_without_embeddings_report_no_embeddings(self, mock_search):
        mock_search.return_value = []
        response = self.client.get("/api/semantic-search/?q=soup")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["no_embeddings"])

    @patch("mealPlanning.services.semantic_search.search")
    def test_empty_results_with_existing_embeddings_report_no_embeddings_false(self, mock_search):
        mock_search.return_value = []
        hall = DiningHall.objects.create(name="API Hall", location="Test")
        Dish.objects.create(
            dish_name="Embedded Soup",
            category="Soups",
            dining_hall=hall,
            last_seen=date.today(),
            embedding=b"existing",
        )

        response = self.client.get("/api/semantic-search/?q=soup")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["no_embeddings"])

    @patch("mealPlanning.services.semantic_search.search")
    def test_service_error_returns_503(self, mock_search):
        mock_search.side_effect = RuntimeError("model crashed")
        response = self.client.get("/api/semantic-search/?q=breakfast")
        self.assertEqual(response.status_code, 503)
