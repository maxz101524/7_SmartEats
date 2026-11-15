import json
import pickle
import tempfile
from datetime import date
from decimal import Decimal
from pathlib import Path

import numpy as np
from django.core.management import call_command
from django.test import TestCase

from mealPlanning.models import DiningHall, Dish
from mealPlanning.services import semantic_search


def _embedding_blob(vec):
    return pickle.dumps({
        "schema_version": semantic_search.EMBEDDING_SCHEMA_VERSION,
        "model": semantic_search.MODEL_NAME,
        "encoder": semantic_search.EMBEDDING_ENCODER,
        "dim": semantic_search.EMBEDDING_DIM,
        "vector": vec,
    })


class StaticExportRoundTripTests(TestCase):
    def test_export_then_import_preserves_dishes_and_embeddings(self):
        hall = DiningHall.objects.create(name="Ikenberry Dining Center", location="301 E. Gregory Drive")
        vec = np.random.default_rng(0).normal(size=semantic_search.EMBEDDING_DIM).astype(np.float32)
        vec /= np.linalg.norm(vec)
        Dish.objects.create(
            dish_id=42, dish_name="Grilled Chicken", category="Entrees", dining_hall=hall,
            calories=310, protein=52, carbohydrates=1, fat=8, fiber=Decimal("0.50"),
            sodium=Decimal("420.00"), allergens=["Soy"], dietary_flags=["Halal"],
            nutrition_source="ai_generated", meal_period="Lunch", serving_size="1 piece",
            last_seen=date(2026, 11, 15), embedding=_embedding_blob(vec),
        )

        with tempfile.TemporaryDirectory() as tmp:
            call_command("export_static", out=tmp, skip_hours=True, stdout=open("/dev/null", "w"))
            menu = json.loads((Path(tmp) / "menu.json").read_text())
            self.assertEqual(menu["menu_date"], "2026-11-15")
            self.assertEqual(menu["halls"][0]["option_id"], 1)
            self.assertEqual(menu["dishes"][0]["fiber"], 0.5)

            Dish.objects.all().delete()
            DiningHall.objects.all().delete()
            call_command("import_static", src=tmp, stdout=open("/dev/null", "w"))

        dish = Dish.objects.get(dish_id=42)
        self.assertEqual(dish.dining_hall.name, "Ikenberry Dining Center")
        self.assertEqual((dish.calories, dish.protein, dish.allergens), (310, 52, ["Soy"]))
        self.assertEqual(dish.last_seen, date(2026, 11, 15))
        self.assertFalse(semantic_search.embedding_blob_needs_refresh(dish.embedding))
        restored = semantic_search.decode_from_bytes(dish.embedding)
        self.assertGreater(float(restored @ vec), 0.999)
