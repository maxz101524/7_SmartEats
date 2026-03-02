import json
import logging
import time

from django.conf import settings

try:
    import google.generativeai as genai
except ImportError:
    genai = None

logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-1.5-flash"
_last_call_time = 0.0
RATE_LIMIT_SECONDS = 0.5

NUTRITION_SCHEMA = {
    "type": "object",
    "properties": {
        "calories": {"type": "integer"},
        "protein": {"type": "number"},
        "carbohydrates": {"type": "number"},
        "fat": {"type": "number"},
        "fiber": {"type": "number"},
        "sodium": {"type": "number"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    },
    "required": ["calories", "protein", "carbohydrates", "fat", "fiber", "sodium", "confidence"],
}


def _get_model():
    api_key = getattr(settings, "GEMINI_API_KEY", None)
    if not api_key:
        import os
        api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(
        MODEL_NAME,
        generation_config={
            "temperature": 0,
            "response_mime_type": "application/json",
            "response_schema": NUTRITION_SCHEMA,
        },
    )


def estimate_nutrition(
    dish_name,
    category="",
    meal_period="",
    allergens=None,
    dietary_flags=None,
    serving_unit="",
):
    """
    Use Gemini to estimate nutrition for a dish. Returns a dict with
    calories, protein, carbohydrates, fat, fiber, sodium, confidence
    or None on failure.
    """
    global _last_call_time

    if genai is None:
        logger.error("google-generativeai not installed")
        return None

    prompt = (
        f"Estimate the nutritional content per standard serving of this university dining hall dish.\n\n"
        f"Dish: {dish_name}\n"
        f"Category: {category}\n"
        f"Meal period: {meal_period}\n"
        f"Station: {serving_unit}\n"
        f"Allergens: {', '.join(allergens or [])}\n"
        f"Dietary flags: {', '.join(dietary_flags or [])}\n\n"
        f"Return JSON with: calories (int), protein (g), carbohydrates (g), "
        f"fat (g), fiber (g), sodium (mg), and confidence (high/medium/low)."
    )

    # Rate limiting
    elapsed = time.time() - _last_call_time
    if elapsed < RATE_LIMIT_SECONDS:
        time.sleep(RATE_LIMIT_SECONDS - elapsed)

    try:
        model = _get_model()
        response = model.generate_content(prompt)
        _last_call_time = time.time()
        data = json.loads(response.text)
        # Validate required keys
        required = {"calories", "protein", "carbohydrates", "fat", "fiber", "sodium", "confidence"}
        if not required.issubset(data.keys()):
            logger.warning("Gemini response missing keys for '%s': %s", dish_name, data)
            return None
        return data
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("Gemini JSON error for '%s': %s", dish_name, exc)
        return None
    except Exception as exc:
        logger.error("Gemini API error for '%s': %s", dish_name, exc)
        return None
