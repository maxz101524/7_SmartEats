import json
import os
import pickle
import numpy as np
from datetime import date
from types import SimpleNamespace
from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from rest_framework.authtoken.models import Token

from mealPlanning.models import (
    ChatMessage,
    Conversation,
    DailyRecommendationSnapshot,
    DiningHall,
    Dish,
    Meal,
    create_user_profile,
    ensure_user_profile,
    save_user_profile,
)
from mealPlanning.services import ai_chat, semantic_search
from mealPlanning.services.semantic_search import dish_text, encode_to_bytes, decode_from_bytes, search


def current_embedding_blob(vec):
    return pickle.dumps({
        "schema_version": semantic_search.EMBEDDING_SCHEMA_VERSION,
        "model": semantic_search.MODEL_NAME,
        "encoder": semantic_search.EMBEDDING_ENCODER,
        "dim": semantic_search.EMBEDDING_DIM,
        "vector": vec,
    })


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

    def test_embedding_field_help_text_matches_current_model(self):
        help_text = Dish._meta.get_field("embedding").help_text
        self.assertIn("384-dim", help_text)
        self.assertIn("all-MiniLM-L6-v2", help_text)


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

    @patch("mealPlanning.services.semantic_search.encode_to_bytes")
    @patch("mealPlanning.services.gemini_client.estimate_nutrition")
    @patch("mealPlanning.services.uiuc_dining.fetch_menu")
    def test_refreshes_outdated_embeddings_for_existing_scraped_dishes(self, mock_fetch, mock_gemini, mock_encode):
        hall = DiningHall.objects.create(name="Ikenberry Dining Center", location="Ikenberry")
        Dish.objects.create(
            dish_name="Banana",
            category="Fruits",
            dining_hall=hall,
            nutrition_source="ai_generated",
            embedding=pickle.dumps(np.zeros(768, dtype=np.float32)),
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
        mock_gemini.return_value = None
        mock_encode.return_value = b"refreshed_embedding"

        out = StringIO()
        call_command("scrape_menu", "--date=2026-03-01", stdout=out)

        dish = Dish.objects.get(dish_name="Banana", dining_hall=hall)
        self.assertEqual(bytes(dish.embedding), b"refreshed_embedding")
        mock_encode.assert_called_once()

    @patch("mealPlanning.services.semantic_search.encode_to_bytes")
    @patch("mealPlanning.services.gemini_client.estimate_nutrition")
    @patch("mealPlanning.services.uiuc_dining.fetch_menu")
    def test_skips_dishes_already_enriched(self, mock_fetch, mock_gemini, mock_encode):
        mock_encode.return_value = b"fake_embedding"
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

    @patch("mealPlanning.services.semantic_search.encode_to_bytes")
    @patch("mealPlanning.services.gemini_client.estimate_nutrition")
    @patch("mealPlanning.services.uiuc_dining.fetch_menu")
    def test_force_flag_re_enriches_existing_dishes(self, mock_fetch, mock_gemini, mock_encode):
        mock_encode.return_value = b"fake_embedding"
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


class MealLoggingAndRecommendationsViewTest(TestCase):
    def setUp(self):
        post_save.disconnect(create_user_profile, sender=User)
        post_save.disconnect(save_user_profile, sender=User)
        self.addCleanup(post_save.connect, create_user_profile, sender=User)
        self.addCleanup(post_save.connect, save_user_profile, sender=User)

        self.user = User.objects.create_user(username="meal_user", password="pw123456")
        self.token = Token.objects.create(user=self.user)
        self.hall = DiningHall.objects.create(name="Ikenberry Dining Center", location="Ikenberry")
        self.dish = Dish.objects.create(
            dish_name="Grilled Salmon",
            category="Entrees",
            calories=430,
            protein=38,
            carbohydrates=12,
            fat=18,
            meal_period="Dinner",
            dining_hall=self.hall,
            last_seen=date.today(),
        )

    def test_post_meals_creates_logged_meal(self):
        response = self.client.post(
            "/api/meals/",
            data=json.dumps({"dish_ids": [self.dish.dish_id]}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Token {self.token.key}",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["total_calories"], 430)
        self.assertEqual(payload["category"], "Dinner")
        self.assertEqual(payload["dishes"][0]["dish_name"], "Grilled Salmon")
        self.assertEqual(Meal.objects.filter(user=self.user).count(), 1)

    def test_post_meals_keeps_duplicate_servings_in_totals(self):
        response = self.client.post(
            "/api/meals/",
            data=json.dumps({"dish_ids": [self.dish.dish_id, self.dish.dish_id]}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Token {self.token.key}",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["total_calories"], 860)
        self.assertEqual(payload["total_protein"], 76)
        self.assertEqual(len(payload["dishes"]), 1)

    @patch("mealPlanning.views._generate_recommendation_payload")
    @patch("mealPlanning.views.ensure_user_profile")
    def test_ai_recommend_reuses_daily_snapshot_until_forced(self, mock_ensure_profile, mock_generate):
        mock_ensure_profile.return_value = SimpleNamespace(goal=None)
        mock_generate.return_value = {
            "recommendations": [
                {
                    "dish_id": self.dish.dish_id,
                    "dish_name": self.dish.dish_name,
                    "hall_name": self.hall.name,
                    "reason": "High protein",
                    "calories": self.dish.calories,
                    "meal_period": self.dish.meal_period,
                },
            ],
            "tip": "Keep protein high today.",
        }

        first = self.client.post(
            "/api/ai-recommend/",
            data=json.dumps({}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Token {self.token.key}",
        )
        second = self.client.post(
            "/api/ai-recommend/",
            data=json.dumps({}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Token {self.token.key}",
        )
        forced = self.client.post(
            "/api/ai-recommend/",
            data=json.dumps({"force": True}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Token {self.token.key}",
        )

        self.assertEqual(first.status_code, 200)
        self.assertFalse(first.json()["cached"])
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.json()["cached"])
        self.assertEqual(forced.status_code, 200)
        self.assertFalse(forced.json()["cached"])
        self.assertEqual(mock_generate.call_count, 2)
        self.assertEqual(DailyRecommendationSnapshot.objects.filter(user=self.user).count(), 1)

    @patch("mealPlanning.views.ensure_user_profile")
    def test_meal_reports_returns_summary_with_profile_context(self, mock_ensure_profile):
        mock_ensure_profile.return_value = SimpleNamespace(netID=None)
        response = self.client.get(
            "/api/meal-reports/",
            HTTP_AUTHORIZATION=f"Token {self.token.key}",
        )

        self.assertEqual(response.status_code, 200)
        mock_ensure_profile.assert_called_once()
        self.assertEqual(response.json()["statistics"]["total_count"], 0)


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

    @patch("mealPlanning.views.ensure_user_profile")
    @patch("mealPlanning.services.ai_chat.get_response")
    def test_ai_chat_passes_authenticated_meal_context(self, mock_get_response, mock_ensure_profile):
        post_save.disconnect(create_user_profile, sender=User)
        post_save.disconnect(save_user_profile, sender=User)
        self.addCleanup(post_save.connect, create_user_profile, sender=User)
        self.addCleanup(post_save.connect, save_user_profile, sender=User)

        mock_get_response.return_value = {"response": "hello", "recommended_dishes": []}
        mock_ensure_profile.return_value = SimpleNamespace(
            goal="fat_loss",
            activity_level="light",
            sex="female",
            age=20,
            height_cm=165,
            weight_kg=60,
            daily_cal_goal=1800,
            daily_protein_goal=140,
            daily_carbs_goal=180,
            daily_fat_goal=60,
        )

        user = User.objects.create_user(username="chat_user", password="pw123456")
        token = Token.objects.create(user=user)
        hall = DiningHall.objects.create(name="ISR Dining Center", location="ISR")
        dish = Dish.objects.create(
            dish_name="Greek Yogurt Parfait",
            category="Breakfast",
            calories=220,
            protein=18,
            carbohydrates=24,
            fat=5,
            meal_period="Breakfast",
            dining_hall=hall,
            last_seen=date.today(),
        )

        meal = Meal.objects.create(user=user, category="Breakfast")
        meal.contain_dish.set([dish])
        meal.total_calories = dish.calories
        meal.total_protein = dish.protein
        meal.total_carbohydrates = dish.carbohydrates
        meal.total_fat = dish.fat
        meal.save()

        payload = {
            "message": "What fits the rest of my macros?",
            "history": [],
            "tray_context": {
                "item_count": 2,
                "unique_dishes": 1,
                "totals": {"calories": 440, "protein": 36, "carbohydrates": 48, "fat": 10},
                "items": [
                    {
                        "dish_id": dish.dish_id,
                        "dish_name": dish.dish_name,
                        "hall": hall.name,
                        "quantity": 2,
                        "calories": dish.calories,
                        "protein": dish.protein,
                        "carbohydrates": dish.carbohydrates,
                        "fat": dish.fat,
                    }
                ],
            },
        }
        response = self.client.post(
            "/api/ai-chat/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Token {token.key}",
        )

        self.assertEqual(response.status_code, 200)
        mock_get_response.assert_called_once()
        _, kwargs = mock_get_response.call_args
        self.assertEqual(kwargs["history"], [])
        self.assertEqual(kwargs["user_context"]["goal"], "fat_loss")
        self.assertEqual(kwargs["user_context"]["today_logged_totals"]["calories"], 220)
        self.assertEqual(kwargs["user_context"]["today_remaining_goals"]["protein"], 122)
        self.assertEqual(kwargs["user_context"]["current_meal_tray"]["item_count"], 2)


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
                "Are you looking for vegetarian options?",
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
            {
                "dish_id": 11,
                "dish_name": "Grilled Chicken",
                "reason": "High protein",
                "dining_hall_name": "Illinois Street Dining Center",
                "serving_unit": "Grill",
            },
        ])
        self.assertEqual(result["follow_up_suggestions"], [
            "Show me lower-carb options",
            "What if I need vegetarian?",
        ])

    @patch("mealPlanning.services.ai_chat._build_menu_context")
    def test_goal_meal_plan_uses_exact_nutrition_and_filters_bakery(self, mock_build_context):
        records = {
            1: {
                "dish_id": 1,
                "dish_name": "Banana Nut Muffin",
                "dining_hall_name": "Ikenberry Dining Center",
                "hall_name": "Ikenberry Dining Center",
                "serving_size": "1 piece",
                "serving_unit": "Baked Expectations",
                "calories": 500,
                "protein": 6,
                "carbohydrates": 62,
                "fat": 26,
            },
            2: {
                "dish_id": 2,
                "dish_name": "Grilled Chicken Breast",
                "dining_hall_name": "Ikenberry Dining Center",
                "hall_name": "Ikenberry Dining Center",
                "serving_size": "1 breast",
                "serving_unit": "Grill",
                "calories": 280,
                "protein": 52,
                "carbohydrates": 0,
                "fat": 6,
            },
            3: {
                "dish_id": 3,
                "dish_name": "Turkey Patty",
                "dining_hall_name": "Ikenberry Dining Center",
                "hall_name": "Ikenberry Dining Center",
                "serving_size": "1 patty",
                "serving_unit": "Grill",
                "calories": 250,
                "protein": 30,
                "carbohydrates": 2,
                "fat": 12,
            },
            4: {
                "dish_id": 4,
                "dish_name": "Greek Yogurt",
                "dining_hall_name": "Ikenberry Dining Center",
                "hall_name": "Ikenberry Dining Center",
                "serving_size": "1 cup",
                "serving_unit": "Breakfast",
                "calories": 140,
                "protein": 18,
                "carbohydrates": 8,
                "fat": 0,
            },
        }
        mock_build_context.return_value = (
            ["Ikenberry Dining Center"],
            "\n".join(f"- {record['dish_name']}" for record in records.values()),
            records,
            {ai_chat._normalize_name(record["dish_name"]): [record] for record in records.values()},
        )

        result = ai_chat.get_response(
            "can you help me plan out a meal at ikenberry to hit my remaining goals?",
            history=[],
            user_context={
                "today_remaining_goals": {
                    "calories": 1303,
                    "protein": 180,
                    "carbohydrates": 64,
                    "fat": 41,
                }
            },
        )

        self.assertIsNotNone(result)
        self.assertIn("meal_plan", result)
        planned_names = [item["dish_name"] for item in result["meal_plan"]["items"]]
        self.assertNotIn("Banana Nut Muffin", planned_names)
        self.assertIn("Grilled Chicken Breast", planned_names)
        self.assertIn("Turkey Patty", planned_names)
        self.assertEqual(result["meal_plan"]["totals"], {
            "calories": 1200,
            "protein": 182,
            "carbohydrates": 12,
            "fat": 36,
        })
        chicken = next(item for item in result["meal_plan"]["items"] if item["dish_name"] == "Grilled Chicken Breast")
        self.assertEqual(chicken["quantity"], 2)


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
    def setUp(self):
        self.local_model_env = patch.dict(os.environ, {"USE_LOCAL_MODEL": "true"})
        self.local_model_env.start()

    def tearDown(self):
        self.local_model_env.stop()

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

    def test_dish_text_includes_context_and_nutrition_descriptors(self):
        dish = Dish(
            dish_name="Garden Bowl",
            category="Entrees",
            course="Bowls",
            meal_period="Lunch",
            serving_unit="Plant Forward",
            calories=320,
            protein=24,
            carbohydrates=42,
            fat=8,
            fiber=6,
            sodium=420,
            dietary_flags=["Vegan"],
            allergens=[],
            nutrition_source="ai_generated",
        )

        result = dish_text(dish)

        self.assertIn("Plant Forward", result)
        self.assertIn("320 calories", result)
        self.assertIn("low calorie", result)
        self.assertIn("high protein", result)
        self.assertIn("high fiber", result)
        self.assertIn("low sodium", result)

    @patch("mealPlanning.services.semantic_search._get_model")
    def test_encode_decode_roundtrip(self, mock_get_model):
        mock_model = MagicMock()
        vec = np.zeros(384, dtype=np.float32)
        vec[:3] = [0.1, 0.2, 0.3]
        mock_model.encode.return_value = vec
        mock_get_model.return_value = mock_model

        blob = encode_to_bytes("test dish")
        result = decode_from_bytes(blob)
        np.testing.assert_array_almost_equal(result, vec / np.linalg.norm(vec))

    @patch("huggingface_hub.InferenceClient")
    def test_hf_api_token_embeddings_are_mean_pooled(self, mock_client_class):
        row1 = np.zeros(384, dtype=np.float32)
        row1[0] = 1.0
        row2 = np.zeros(384, dtype=np.float32)
        row2[1] = 1.0
        mock_client = MagicMock()
        mock_client.feature_extraction.return_value = np.stack([row1, row2])
        mock_client_class.return_value = mock_client

        result = semantic_search._encode_via_hf_api("vegetables")
        expected = np.zeros(384, dtype=np.float32)
        expected[:2] = [0.5, 0.5]
        expected = expected / np.linalg.norm(expected)

        np.testing.assert_array_almost_equal(result, expected)

    def test_model_name_uses_minilm_for_production_memory_budget(self):
        self.assertEqual(
            semantic_search.MODEL_NAME,
            "sentence-transformers/all-MiniLM-L6-v2",
        )

    @patch("mealPlanning.services.semantic_search._get_model")
    def test_search_returns_most_similar_dish_first(self, mock_get_model):
        mock_model = MagicMock()
        mock_get_model.return_value = mock_model

        hall = DiningHall.objects.create(name="Test Hall", location="Test")
        # Both dishes score above MIN_SCORE (0.30); dish1 scores higher
        vec1 = np.zeros(384, dtype=np.float32)
        vec1[:2] = [1.0, 0.0]
        vec2 = np.zeros(384, dtype=np.float32)
        vec2[:2] = [0.8, 0.6]
        dish1 = Dish.objects.create(
            dish_name="Grilled Chicken", category="Entrees",
            dining_hall=hall, last_seen=date.today(), protein=30,
            embedding=current_embedding_blob(vec1),
        )
        Dish.objects.create(
            dish_name="Garden Salad", category="Salads",
            dining_hall=hall, last_seen=date.today(), protein=24,
            embedding=current_embedding_blob(vec2),
        )
        # Query points toward dish1
        query_vec = np.zeros(384, dtype=np.float32)
        query_vec[:2] = [1.0, 0.0]
        mock_model.encode.return_value = query_vec

        results = search("high protein")
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["dish_name"], "Grilled Chicken")
        self.assertGreater(results[0]["score"], results[1]["score"])

    @patch("mealPlanning.services.semantic_search._get_model")
    def test_search_filters_out_results_below_min_score(self, mock_get_model):
        mock_model = MagicMock()
        mock_get_model.return_value = mock_model

        hall = DiningHall.objects.create(name="Threshold Hall", location="Test")
        strong_match = np.zeros(384, dtype=np.float32)
        strong_match[0] = 1.0
        weak_match = np.zeros(384, dtype=np.float32)
        weak_match[:2] = [0.2, 0.98]
        Dish.objects.create(
            dish_name="Strong Match", category="Entrees",
            dining_hall=hall, last_seen=date.today(),
            embedding=current_embedding_blob(strong_match),
        )
        Dish.objects.create(
            dish_name="Weak Match", category="Entrees",
            dining_hall=hall, last_seen=date.today(),
            embedding=current_embedding_blob(weak_match),
        )
        query_vec = np.zeros(384, dtype=np.float32)
        query_vec[0] = 1.0
        mock_model.encode.return_value = query_vec

        results = search("protein")
        self.assertEqual([result["dish_name"] for result in results], ["Strong Match"])
        self.assertGreaterEqual(results[0]["score"], 0.30)

    @patch("mealPlanning.services.semantic_search._get_model")
    def test_low_calorie_query_uses_nutrition_in_ranking(self, mock_get_model):
        mock_model = MagicMock()
        mock_get_model.return_value = mock_model

        hall = DiningHall.objects.create(name="Nutrition Rank Hall", location="Test")
        high_calorie_vec = np.zeros(384, dtype=np.float32)
        high_calorie_vec[0] = 1.0
        low_calorie_vec = np.zeros(384, dtype=np.float32)
        low_calorie_vec[:2] = [0.5, 0.866]
        Dish.objects.create(
            dish_name="Loaded Pasta",
            category="Entrees",
            dining_hall=hall,
            last_seen=date.today(),
            calories=900,
            protein=12,
            nutrition_source="ai_generated",
            embedding=current_embedding_blob(high_calorie_vec),
        )
        Dish.objects.create(
            dish_name="Vegetable Bowl",
            category="Entrees",
            dining_hall=hall,
            last_seen=date.today(),
            calories=320,
            protein=18,
            fiber=6,
            nutrition_source="ai_generated",
            embedding=current_embedding_blob(low_calorie_vec),
        )
        query_vec = np.zeros(384, dtype=np.float32)
        query_vec[0] = 1.0
        mock_model.encode.return_value = query_vec

        results = search("low calories")

        self.assertEqual(results[0]["dish_name"], "Vegetable Bowl")
        self.assertIn("Low calorie: 320 calories", results[0]["match_reasons"])
        self.assertGreater(results[0]["nutrition_score"], results[1]["nutrition_score"])

    @patch("mealPlanning.services.semantic_search._get_model")
    def test_search_applies_plain_language_allergen_and_dietary_filters(self, mock_get_model):
        mock_model = MagicMock()
        mock_get_model.return_value = mock_model

        hall = DiningHall.objects.create(name="Filter Hall", location="Test")
        milk_vec = np.zeros(384, dtype=np.float32)
        milk_vec[0] = 1.0
        safe_vec = np.zeros(384, dtype=np.float32)
        safe_vec[:2] = [0.8, 0.6]
        Dish.objects.create(
            dish_name="Cheesy Vegetable Pasta",
            category="Entrees",
            dining_hall=hall,
            last_seen=date.today(),
            allergens=["Milk"],
            dietary_flags=["Vegetarian"],
            embedding=current_embedding_blob(milk_vec),
        )
        Dish.objects.create(
            dish_name="Garden Vegetable Pasta",
            category="Entrees",
            dining_hall=hall,
            last_seen=date.today(),
            allergens=[],
            dietary_flags=["Vegetarian"],
            embedding=current_embedding_blob(safe_vec),
        )
        query_vec = np.zeros(384, dtype=np.float32)
        query_vec[0] = 1.0
        mock_model.encode.return_value = query_vec

        results = search("vegetarian without milk")

        self.assertEqual([result["dish_name"] for result in results], ["Garden Vegetable Pasta"])
        self.assertIn("Vegetarian", results[0]["match_reasons"])
        self.assertIn("No listed Milk allergen", results[0]["match_reasons"])

    @patch("mealPlanning.services.semantic_search._get_model")
    def test_search_relaxes_constraints_when_no_exact_match_exists(self, mock_get_model):
        mock_model = MagicMock()
        mock_get_model.return_value = mock_model

        hall = DiningHall.objects.create(name="Relax Hall", location="Test")
        vec = np.zeros(384, dtype=np.float32)
        vec[0] = 1.0
        Dish.objects.create(
            dish_name="Vegetarian Grain Bowl",
            category="Entrees",
            dining_hall=hall,
            last_seen=date.today(),
            allergens=[],
            dietary_flags=["Vegetarian"],
            embedding=current_embedding_blob(vec),
        )
        query_vec = np.zeros(384, dtype=np.float32)
        query_vec[0] = 1.0
        mock_model.encode.return_value = query_vec

        results = search("vegan without milk")

        self.assertEqual([result["dish_name"] for result in results], ["Vegetarian Grain Bowl"])
        self.assertTrue(results[0]["constraints_relaxed"])
        self.assertIn("No exact constraint match; showing closest options", results[0]["match_reasons"])

    @patch("mealPlanning.services.semantic_search._get_model")
    def test_search_applies_numeric_calorie_filter(self, mock_get_model):
        mock_model = MagicMock()
        mock_get_model.return_value = mock_model

        hall = DiningHall.objects.create(name="Numeric Hall", location="Test")
        high_vec = np.zeros(384, dtype=np.float32)
        high_vec[0] = 1.0
        low_vec = np.zeros(384, dtype=np.float32)
        low_vec[:2] = [0.7, 0.714]
        Dish.objects.create(
            dish_name="Heavy Entree",
            category="Entrees",
            dining_hall=hall,
            last_seen=date.today(),
            calories=700,
            nutrition_source="ai_generated",
            embedding=current_embedding_blob(high_vec),
        )
        Dish.objects.create(
            dish_name="Light Entree",
            category="Entrees",
            dining_hall=hall,
            last_seen=date.today(),
            calories=450,
            nutrition_source="ai_generated",
            embedding=current_embedding_blob(low_vec),
        )
        query_vec = np.zeros(384, dtype=np.float32)
        query_vec[0] = 1.0
        mock_model.encode.return_value = query_vec

        results = search("under 500 calories")

        self.assertEqual([result["dish_name"] for result in results], ["Light Entree"])
        self.assertFalse(results[0]["constraints_relaxed"])

    @patch("mealPlanning.services.semantic_search._get_model")
    def test_search_skips_embeddings_from_old_model_dimensions(self, mock_get_model):
        mock_model = MagicMock()
        mock_get_model.return_value = mock_model

        hall = DiningHall.objects.create(name="Mixed Embedding Hall", location="Test")
        old_embedding = np.ones(768, dtype=np.float32)
        fresh_embedding = np.zeros(384, dtype=np.float32)
        fresh_embedding[:2] = [1.0, 0.0]
        Dish.objects.create(
            dish_name="Old Embedding Dish",
            category="Entrees",
            dining_hall=hall,
            last_seen=date.today(),
            embedding=pickle.dumps(old_embedding),
        )
        Dish.objects.create(
            dish_name="Fresh Embedding Dish",
            category="Entrees",
            dining_hall=hall,
            last_seen=date.today(),
            embedding=current_embedding_blob(fresh_embedding),
        )
        query_vec = np.zeros(384, dtype=np.float32)
        query_vec[:2] = [1.0, 0.0]
        mock_model.encode.return_value = query_vec

        results = search("protein")

        self.assertEqual([result["dish_name"] for result in results], ["Fresh Embedding Dish"])

    @patch("mealPlanning.services.semantic_search._get_model")
    def test_search_falls_back_to_all_embedded_dishes_when_none_seen_today(self, mock_get_model):
        mock_model = MagicMock()
        query_vec = np.zeros(384, dtype=np.float32)
        query_vec[:2] = [1.0, 0.0]
        mock_model.encode.return_value = query_vec
        mock_get_model.return_value = mock_model

        hall = DiningHall.objects.create(name="Fallback Hall", location="Test")
        stale_fallback = np.zeros(384, dtype=np.float32)
        stale_fallback[:2] = [1.0, 0.0]
        Dish.objects.create(
            dish_name="Yesterday's Chili", category="Soups",
            dining_hall=hall, last_seen=date(2026, 1, 1),
            embedding=current_embedding_blob(stale_fallback),
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

    def test_has_current_embeddings_uses_fast_existence_check(self):
        hall = DiningHall.objects.create(name="Fast Check Hall", location="Test")
        Dish.objects.create(
            dish_name="Corrupt Blob",
            category="Entrees",
            dining_hall=hall,
            last_seen=date.today(),
            embedding=b"not a pickle",
        )

        self.assertTrue(semantic_search.has_current_embeddings())


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
    def test_refreshes_stale_embeddings_without_force_flag(self, mock_encode):
        mock_encode.return_value = b"fresh_embedding"
        hall = DiningHall.objects.create(name="ISR", location="ISR")
        dish = Dish.objects.create(
            dish_name="Legacy Chili",
            category="Lunch",
            dining_hall=hall,
            last_seen=date.today(),
            embedding=pickle.dumps(np.zeros(768, dtype=np.float32)),
        )

        out = io.StringIO()
        call_command("build_embeddings", stdout=out)

        dish.refresh_from_db()
        self.assertEqual(bytes(dish.embedding), b"fresh_embedding")
        mock_encode.assert_called_once()

    @patch("mealPlanning.services.semantic_search.encode_to_bytes")
    def test_refreshes_legacy_384_embeddings_without_force_flag(self, mock_encode):
        mock_encode.return_value = b"fresh_embedding"
        hall = DiningHall.objects.create(name="Legacy 384 Hall", location="Test")
        legacy_embedding = np.zeros(384, dtype=np.float32)
        legacy_embedding[0] = 1.0
        dish = Dish.objects.create(
            dish_name="Legacy Salad",
            category="Lunch",
            dining_hall=hall,
            last_seen=date.today(),
            embedding=pickle.dumps(legacy_embedding),
        )

        out = io.StringIO()
        call_command("build_embeddings", stdout=out)

        dish.refresh_from_db()
        self.assertEqual(bytes(dish.embedding), b"fresh_embedding")
        mock_encode.assert_called_once()

    @patch("mealPlanning.services.semantic_search.encode_to_bytes")
    def test_skips_dishes_that_already_have_current_embeddings(self, mock_encode):
        hall = DiningHall.objects.create(name="PAR", location="PAR")
        current_embedding = np.zeros(384, dtype=np.float32)
        current_embedding[0] = 1.0
        Dish.objects.create(
            dish_name="Eggs", category="Breakfast",
            dining_hall=hall, last_seen=date.today(),
            embedding=current_embedding_blob(current_embedding),
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
        mock_search.assert_called_once_with("soup", hall_id="3", top_k=10)

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
        current_embedding = np.zeros(384, dtype=np.float32)
        current_embedding[0] = 1.0
        Dish.objects.create(
            dish_name="Embedded Soup",
            category="Soups",
            dining_hall=hall,
            last_seen=date.today(),
            embedding=current_embedding_blob(current_embedding),
        )

        response = self.client.get("/api/semantic-search/?q=soup")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["no_embeddings"])

    @patch("mealPlanning.services.semantic_search.search")
    def test_service_error_returns_503(self, mock_search):
        mock_search.side_effect = RuntimeError("model crashed")
        response = self.client.get("/api/semantic-search/?q=breakfast")
        self.assertEqual(response.status_code, 503)


class ConversationModelTest(TestCase):
    def setUp(self):
        post_save.disconnect(create_user_profile, sender=User)
        post_save.disconnect(save_user_profile, sender=User)
        self.addCleanup(post_save.connect, create_user_profile, sender=User)
        self.addCleanup(post_save.connect, save_user_profile, sender=User)
        self.user = User.objects.create_user(username="alice", password="pw")

    def test_conversation_defaults_and_fields(self):
        convo = Conversation.objects.create(user=self.user)
        convo.refresh_from_db()
        self.assertEqual(convo.title, "New chat")
        self.assertEqual(convo.user, self.user)
        self.assertIsNotNone(convo.created_at)
        self.assertIsNotNone(convo.updated_at)

    def test_conversation_ordered_by_updated_at_desc(self):
        c1 = Conversation.objects.create(user=self.user, title="first")
        c2 = Conversation.objects.create(user=self.user, title="second")
        c1.title = "touched"
        c1.save()  # updated_at bumps
        ordered = list(Conversation.objects.filter(user=self.user))
        self.assertEqual(ordered[0].id, c1.id)
        self.assertEqual(ordered[1].id, c2.id)

    def test_enforce_lru_cap_deletes_oldest_when_over_limit(self):
        from django.utils import timezone
        from datetime import timedelta

        base = timezone.now()
        convos = []
        for i in range(21):
            c = Conversation.objects.create(user=self.user, title=f"c{i}")
            Conversation.objects.filter(pk=c.pk).update(
                updated_at=base - timedelta(minutes=21 - i)
            )
            convos.append(c)

        Conversation.enforce_lru_cap_for_user(self.user, cap=20)

        remaining = Conversation.objects.filter(user=self.user).count()
        self.assertEqual(remaining, 20)
        self.assertFalse(Conversation.objects.filter(pk=convos[0].pk).exists())
        self.assertTrue(Conversation.objects.filter(pk=convos[-1].pk).exists())

    def test_enforce_lru_cap_noop_when_under_limit(self):
        for i in range(5):
            Conversation.objects.create(user=self.user, title=f"c{i}")
        Conversation.enforce_lru_cap_for_user(self.user, cap=20)
        self.assertEqual(Conversation.objects.filter(user=self.user).count(), 5)

    def test_enforce_lru_cap_only_affects_target_user(self):
        post_save.disconnect(create_user_profile, sender=User)
        post_save.disconnect(save_user_profile, sender=User)
        try:
            other = User.objects.create_user(username="other", password="pw")
        finally:
            post_save.connect(create_user_profile, sender=User)
            post_save.connect(save_user_profile, sender=User)

        for i in range(21):
            Conversation.objects.create(user=self.user, title=f"mine{i}")
        Conversation.objects.create(user=other, title="theirs")

        Conversation.enforce_lru_cap_for_user(self.user, cap=20)
        self.assertEqual(Conversation.objects.filter(user=self.user).count(), 20)
        self.assertEqual(Conversation.objects.filter(user=other).count(), 1)


class ChatMessageModelTest(TestCase):
    def setUp(self):
        post_save.disconnect(create_user_profile, sender=User)
        post_save.disconnect(save_user_profile, sender=User)
        self.addCleanup(post_save.connect, create_user_profile, sender=User)
        self.addCleanup(post_save.connect, save_user_profile, sender=User)
        self.user = User.objects.create_user(username="bob", password="pw")
        self.convo = Conversation.objects.create(user=self.user)

    def test_chat_message_fields(self):
        msg = ChatMessage.objects.create(
            conversation=self.convo,
            role="user",
            content="Hello",
            metadata={"foo": "bar"},
        )
        msg.refresh_from_db()
        self.assertEqual(msg.role, "user")
        self.assertEqual(msg.content, "Hello")
        self.assertEqual(msg.metadata, {"foo": "bar"})
        self.assertIsNotNone(msg.created_at)

    def test_messages_ordered_by_created_at(self):
        m1 = ChatMessage.objects.create(conversation=self.convo, role="user", content="a")
        m2 = ChatMessage.objects.create(conversation=self.convo, role="assistant", content="b")
        msgs = list(self.convo.messages.all())
        self.assertEqual(msgs[0].id, m1.id)
        self.assertEqual(msgs[1].id, m2.id)

    def test_metadata_defaults_to_empty_dict(self):
        msg = ChatMessage.objects.create(
            conversation=self.convo,
            role="assistant",
            content="x",
        )
        self.assertEqual(msg.metadata, {})

    def test_cascade_delete_removes_messages(self):
        ChatMessage.objects.create(conversation=self.convo, role="user", content="a")
        ChatMessage.objects.create(conversation=self.convo, role="assistant", content="b")
        self.assertEqual(ChatMessage.objects.count(), 2)
        self.convo.delete()
        self.assertEqual(ChatMessage.objects.count(), 0)


class ConversationsEndpointTest(TestCase):
    def setUp(self):
        post_save.disconnect(create_user_profile, sender=User)
        post_save.disconnect(save_user_profile, sender=User)
        self.addCleanup(post_save.connect, create_user_profile, sender=User)
        self.addCleanup(post_save.connect, save_user_profile, sender=User)
        self.user = User.objects.create_user(username="alice", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.token.key}"}

    def test_get_returns_401_when_unauthenticated(self):
        resp = self.client.get("/api/conversations/")
        self.assertEqual(resp.status_code, 401)

    def test_get_returns_empty_list_initially(self):
        resp = self.client.get("/api/conversations/", **self.auth)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), [])

    def test_get_returns_user_conversations_with_message_count(self):
        c1 = Conversation.objects.create(user=self.user, title="One")
        ChatMessage.objects.create(conversation=c1, role="user", content="hi")
        ChatMessage.objects.create(conversation=c1, role="assistant", content="hello")
        Conversation.objects.create(user=self.user, title="Two")

        resp = self.client.get("/api/conversations/", **self.auth)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 2)
        titles = [c["title"] for c in data]
        self.assertIn("One", titles)
        self.assertIn("Two", titles)
        one = next(c for c in data if c["title"] == "One")
        self.assertEqual(one["message_count"], 2)
        self.assertIn("updated_at", one)
        self.assertIn("id", one)

    def test_get_does_not_leak_other_users_conversations(self):
        post_save.disconnect(create_user_profile, sender=User)
        post_save.disconnect(save_user_profile, sender=User)
        try:
            other = User.objects.create_user(username="eve", password="pw")
        finally:
            post_save.connect(create_user_profile, sender=User)
            post_save.connect(save_user_profile, sender=User)
        Conversation.objects.create(user=other, title="Secret")
        Conversation.objects.create(user=self.user, title="Mine")

        resp = self.client.get("/api/conversations/", **self.auth)
        titles = [c["title"] for c in resp.json()]
        self.assertEqual(titles, ["Mine"])

    def test_post_creates_empty_conversation(self):
        resp = self.client.post(
            "/api/conversations/",
            data=json.dumps({}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertIn("id", data)
        self.assertEqual(data["title"], "New chat")
        self.assertEqual(Conversation.objects.filter(user=self.user).count(), 1)


class ConversationDetailEndpointTest(TestCase):
    def setUp(self):
        post_save.disconnect(create_user_profile, sender=User)
        post_save.disconnect(save_user_profile, sender=User)
        self.addCleanup(post_save.connect, create_user_profile, sender=User)
        self.addCleanup(post_save.connect, save_user_profile, sender=User)
        self.user = User.objects.create_user(username="alice", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.token.key}"}
        self.convo = Conversation.objects.create(user=self.user, title="Test convo")
        ChatMessage.objects.create(conversation=self.convo, role="user", content="Hi")
        ChatMessage.objects.create(
            conversation=self.convo,
            role="assistant",
            content="Hello back",
            metadata={"follow_up_suggestions": ["more?"]},
        )

    def test_get_returns_conversation_with_messages(self):
        resp = self.client.get(f"/api/conversations/{self.convo.id}/", **self.auth)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["id"], self.convo.id)
        self.assertEqual(data["title"], "Test convo")
        self.assertEqual(len(data["messages"]), 2)
        self.assertEqual(data["messages"][0]["role"], "user")
        self.assertEqual(data["messages"][0]["content"], "Hi")
        self.assertEqual(data["messages"][1]["role"], "assistant")
        self.assertEqual(data["messages"][1]["metadata"], {"follow_up_suggestions": ["more?"]})

    def test_get_returns_404_for_other_users_conversation(self):
        post_save.disconnect(create_user_profile, sender=User)
        post_save.disconnect(save_user_profile, sender=User)
        try:
            other = User.objects.create_user(username="eve", password="pw")
        finally:
            post_save.connect(create_user_profile, sender=User)
            post_save.connect(save_user_profile, sender=User)
        other_convo = Conversation.objects.create(user=other, title="Theirs")
        resp = self.client.get(f"/api/conversations/{other_convo.id}/", **self.auth)
        self.assertEqual(resp.status_code, 404)

    def test_get_returns_401_when_unauthenticated(self):
        resp = self.client.get(f"/api/conversations/{self.convo.id}/")
        self.assertEqual(resp.status_code, 401)

    def test_patch_renames_conversation(self):
        resp = self.client.patch(
            f"/api/conversations/{self.convo.id}/",
            data=json.dumps({"title": "Renamed"}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(resp.status_code, 200)
        self.convo.refresh_from_db()
        self.assertEqual(self.convo.title, "Renamed")

    def test_patch_truncates_title_to_80_chars(self):
        long_title = "x" * 200
        resp = self.client.patch(
            f"/api/conversations/{self.convo.id}/",
            data=json.dumps({"title": long_title}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(resp.status_code, 200)
        self.convo.refresh_from_db()
        self.assertEqual(len(self.convo.title), 80)

    def test_patch_rejects_empty_title(self):
        resp = self.client.patch(
            f"/api/conversations/{self.convo.id}/",
            data=json.dumps({"title": "   "}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(resp.status_code, 400)

    def test_delete_removes_conversation_and_cascades_messages(self):
        convo_id = self.convo.id
        resp = self.client.delete(f"/api/conversations/{convo_id}/", **self.auth)
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Conversation.objects.filter(id=convo_id).exists())
        self.assertEqual(ChatMessage.objects.filter(conversation_id=convo_id).count(), 0)
