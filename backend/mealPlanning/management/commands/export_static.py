"""
Export the dish catalog, dining halls, hall hours and dish embeddings as static
JSON for the frontend (static-first deployment, no live backend required).

The exported files are also the persistent state of the daily ETL job:
`import_static` loads them into a fresh database, `scrape_menu` adds today's
menu, and this command writes them back out.

Usage:
    python manage.py export_static --settings=SmartEats_config.settings.development
    python manage.py export_static --analytics   # also write the analytics snapshot
"""

import base64
import json
from pathlib import Path

import numpy as np
from django.core.management.base import BaseCommand
from django.utils import timezone

from mealPlanning.models import AIAnalyticsEvent, DiningHall, Dish
from mealPlanning.services import semantic_search
from mealPlanning.services.uiuc_dining import DINING_OPTIONS
from mealPlanning.services.uiuc_hours import fetch_hours_html, parse_hours_rows

DEFAULT_OUT_DIR = Path(__file__).resolve().parents[4] / "frontend" / "public" / "data"
MENU_FILE = "menu.json"
EMBEDDINGS_FILE = "embeddings.json"
HOURS_FILE = "hours.json"
ANALYTICS_FILE = "analytics-snapshot.json"


def _decimal(value):
    return float(value) if value is not None else None


def dish_payload(dish):
    return {
        "dish_id": dish.dish_id,
        "dish_name": dish.dish_name,
        "dining_hall": dish.dining_hall_id,
        "category": dish.category,
        "calories": dish.calories,
        "protein": dish.protein,
        "carbohydrates": dish.carbohydrates,
        "fat": dish.fat,
        "fiber": _decimal(dish.fiber),
        "sodium": _decimal(dish.sodium),
        "allergens": dish.allergens or [],
        "dietary_flags": dish.dietary_flags or [],
        "nutrition_source": dish.nutrition_source,
        "ai_confidence": dish.ai_confidence,
        "meal_period": dish.meal_period,
        "course": dish.course,
        "serving_unit": dish.serving_unit,
        "serving_size": dish.serving_size,
        "uiuc_item_id": dish.uiuc_item_id,
        "last_seen": dish.last_seen.isoformat() if dish.last_seen else None,
    }


def quantize_vector(vec):
    """Store a normalized float vector as int8 + scale (base64) to keep files small."""
    vec = np.asarray(vec, dtype=np.float32)
    scale = float(np.max(np.abs(vec))) or 1.0
    q = np.clip(np.round(vec / scale * 127), -127, 127).astype(np.int8)
    return {"s": round(scale, 6), "q": base64.b64encode(q.tobytes()).decode("ascii")}


def dequantize_vector(entry):
    q = np.frombuffer(base64.b64decode(entry["q"]), dtype=np.int8).astype(np.float32)
    vec = q / 127.0 * float(entry["s"])
    norm = np.linalg.norm(vec)
    return (vec / norm).astype(np.float32) if norm > 0 else vec


def write_record_lines(path, header, list_key, records):
    """Write JSON with one record per line so daily git diffs stay readable."""
    head = json.dumps(header, ensure_ascii=False)[:-1]
    lines = [json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in records]
    body = ",\n".join(lines)
    sep = ", " if header else ""
    path.write_text(f'{head}{sep}"{list_key}": [\n{body}\n]}}\n', encoding="utf-8")


class Command(BaseCommand):
    help = "Export dishes, halls, hours and embeddings as static JSON for the frontend."

    def add_arguments(self, parser):
        parser.add_argument("--out", type=str, default=str(DEFAULT_OUT_DIR))
        parser.add_argument(
            "--analytics",
            action="store_true",
            help="Also export the AI analytics events snapshot (one-time; the ETL job skips it).",
        )
        parser.add_argument(
            "--skip-hours",
            action="store_true",
            help="Do not fetch dining hall hours (keeps the existing hours file).",
        )

    def handle(self, *args, **options):
        out_dir = Path(options["out"])
        out_dir.mkdir(parents=True, exist_ok=True)

        option_by_name = {name: option_id for option_id, name in DINING_OPTIONS.items()}
        halls = [
            {
                "Dining_Hall_ID": hall.Dining_Hall_ID,
                "name": hall.name,
                "location": hall.location,
                "option_id": option_by_name.get(hall.name),
            }
            for hall in DiningHall.objects.order_by("name")
        ]

        dishes = list(Dish.objects.select_related("dining_hall").order_by("dish_id"))
        seen_dates = sorted({d.last_seen for d in dishes if d.last_seen})
        menu_date = seen_dates[-1].isoformat() if seen_dates else None

        write_record_lines(
            out_dir / MENU_FILE,
            {
                "generated_at": timezone.now().isoformat(),
                "menu_date": menu_date,
                "halls": halls,
            },
            "dishes",
            [dish_payload(d) for d in dishes],
        )
        today_count = sum(1 for d in dishes if d.last_seen and d.last_seen.isoformat() == menu_date)
        self.stdout.write(
            f"Wrote {MENU_FILE}: {len(halls)} halls, {len(dishes)} dishes "
            f"({today_count} on menu {menu_date})"
        )

        vectors = []
        for dish in dishes:
            if semantic_search.embedding_blob_needs_refresh(dish.embedding):
                continue
            vec = semantic_search.decode_from_bytes(dish.embedding)
            vectors.append({"id": dish.dish_id, **quantize_vector(vec)})
        write_record_lines(
            out_dir / EMBEDDINGS_FILE,
            {
                "model": semantic_search.MODEL_NAME,
                "dim": semantic_search.EMBEDDING_DIM,
                "encoding": "int8-scaled",
            },
            "vectors",
            vectors,
        )
        self.stdout.write(f"Wrote {EMBEDDINGS_FILE}: {len(vectors)} vectors")

        if not options["skip_hours"]:
            html = fetch_hours_html()
            rows = parse_hours_rows(html) if html else []
            if rows:
                write_record_lines(
                    out_dir / HOURS_FILE,
                    {"generated_at": timezone.now().isoformat(), "timezone": "America/Chicago"},
                    "rows",
                    [
                        {
                            "option_id": r.dining_option_id,
                            "date": r.date.isoformat(),
                            "period": r.time_period,
                            "start_24": r.start_24,
                            "end_24": r.end_24,
                            "start": r.start_label,
                            "end": r.end_label,
                        }
                        for r in sorted(rows, key=lambda r: (r.date, r.dining_option_id, r.start_24))
                    ],
                )
                self.stdout.write(f"Wrote {HOURS_FILE}: {len(rows)} rows")
            else:
                self.stdout.write(self.style.WARNING("Hours fetch failed; kept existing hours file"))

        if options["analytics"]:
            events = [
                {
                    "timestamp": e.timestamp.isoformat(),
                    "event_type": e.event_type,
                    "user": e.user_id,
                    "session_id": e.session_id,
                    "prompt_chars": e.prompt_chars,
                    "prompt_text_redacted": e.prompt_text_redacted,
                    "input_bucket": e.input_bucket,
                    "intent_label": e.intent_label,
                    "latency_ms": e.latency_ms,
                    "success": e.success,
                    "model_name": e.model_name,
                    "total_tokens": e.total_tokens,
                    "estimated_cost_usd": float(e.estimated_cost_usd or 0),
                }
                for e in AIAnalyticsEvent.objects.order_by("timestamp")
            ]
            write_record_lines(
                out_dir / ANALYTICS_FILE,
                {"generated_at": timezone.now().isoformat()},
                "events",
                events,
            )
            self.stdout.write(f"Wrote {ANALYTICS_FILE}: {len(events)} events")
