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
