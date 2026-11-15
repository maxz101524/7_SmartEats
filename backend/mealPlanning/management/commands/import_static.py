"""
Load the static JSON export (menu.json + embeddings.json) back into the
database. Used by the daily ETL job to rebuild state in a fresh SQLite DB
before scraping, so nutrition data and embeddings are never recomputed.

Usage:
    python manage.py migrate --settings=SmartEats_config.settings.etl
    python manage.py import_static --settings=SmartEats_config.settings.etl
"""

import json
import pickle
from datetime import date
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from mealPlanning.models import DiningHall, Dish
from mealPlanning.services import semantic_search

from .export_static import DEFAULT_OUT_DIR, EMBEDDINGS_FILE, MENU_FILE, dequantize_vector

DISH_FIELDS = (
    "dish_name", "category", "calories", "protein", "carbohydrates", "fat",
    "fiber", "sodium", "allergens", "dietary_flags", "nutrition_source",
    "ai_confidence", "meal_period", "course", "serving_unit", "serving_size",
    "uiuc_item_id",
)


def _embedding_blob(vec):
    return pickle.dumps(
        {
            "schema_version": semantic_search.EMBEDDING_SCHEMA_VERSION,
            "model": semantic_search.MODEL_NAME,
            "encoder": semantic_search.EMBEDDING_ENCODER,
            "dim": semantic_search.EMBEDDING_DIM,
            "vector": vec,
        },
        protocol=pickle.HIGHEST_PROTOCOL,
    )


class Command(BaseCommand):
    help = "Import the static JSON export into the database (inverse of export_static)."

    def add_arguments(self, parser):
        parser.add_argument("--src", type=str, default=str(DEFAULT_OUT_DIR))

    @transaction.atomic
    def handle(self, *args, **options):
        src = Path(options["src"])
        menu = json.loads((src / MENU_FILE).read_text(encoding="utf-8"))

        embeddings = {}
        emb_path = src / EMBEDDINGS_FILE
        if emb_path.exists():
            emb = json.loads(emb_path.read_text(encoding="utf-8"))
            if emb.get("model") == semantic_search.MODEL_NAME:
                embeddings = {v["id"]: v for v in emb.get("vectors", [])}

        for hall in menu["halls"]:
            DiningHall.objects.update_or_create(
                Dining_Hall_ID=hall["Dining_Hall_ID"],
                defaults={"name": hall["name"], "location": hall["location"]},
            )

        count = 0
        for record in menu["dishes"]:
            defaults = {field: record.get(field) for field in DISH_FIELDS}
            defaults["dining_hall_id"] = record["dining_hall"]
            defaults["last_seen"] = (
                date.fromisoformat(record["last_seen"]) if record.get("last_seen") else None
            )
            for text_field in ("nutrition_source", "ai_confidence", "meal_period",
                               "course", "serving_unit", "serving_size", "category"):
                defaults[text_field] = defaults[text_field] or ""
            entry = embeddings.get(record["dish_id"])
            if entry:
                defaults["embedding"] = _embedding_blob(dequantize_vector(entry))
            Dish.objects.update_or_create(dish_id=record["dish_id"], defaults=defaults)
            count += 1

        self.stdout.write(self.style.SUCCESS(
            f"Imported {len(menu['halls'])} halls, {count} dishes, {len(embeddings)} embeddings"
        ))
