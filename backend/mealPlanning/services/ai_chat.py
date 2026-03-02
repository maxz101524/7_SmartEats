import json
import logging

from django.conf import settings

from mealPlanning.models import Dish, DiningHall

try:
    from google import genai
except ImportError:
    genai = None

logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-2.5-flash"


def _get_client():
    api_key = getattr(settings, "GEMINI_API_KEY", None)
    if not api_key:
        import os
        api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured")
    return genai.Client(api_key=api_key)


def _build_menu_context():
    """Build a concise summary of available dishes for the AI prompt."""
    halls = DiningHall.objects.all()
    hall_names = [h.name for h in halls]

    dishes = (
        Dish.objects
        .select_related("dining_hall")
        .filter(calories__gt=0)
        .order_by("dining_hall__name", "serving_unit", "dish_name")
    )

    lines = []
    for dish in dishes[:300]:  # Cap context to avoid token limits
        flags = ", ".join(dish.dietary_flags) if dish.dietary_flags else ""
        allergen_str = ", ".join(dish.allergens) if dish.allergens else ""
        lines.append(
            f"- {dish.dish_name} | {dish.dining_hall.name} | {dish.serving_unit} | "
            f"{dish.calories}cal {dish.protein}g P {dish.carbohydrates}g C {dish.fat}g F | "
            f"flags: {flags} | allergens: {allergen_str}"
        )

    return hall_names, "\n".join(lines)


def get_response(user_message):
    """
    Send user message to Gemini with dining context.
    Returns dict with 'response' (str) and 'recommended_dishes' (list).
    Returns None on failure.
    """
    if genai is None:
        logger.error("google-genai not installed")
        return None

    hall_names, dish_list = _build_menu_context()

    prompt = (
        "You are SmartEats AI, a friendly nutrition assistant for UIUC dining halls.\n\n"
        f"AVAILABLE DINING HALLS:\n{', '.join(hall_names)}\n\n"
        f"CURRENT MENU (dishes with nutrition data):\n{dish_list}\n\n"
        f'The student asks: "{user_message}"\n\n'
        "Respond helpfully about dining options, nutrition, or meal planning.\n"
        "If recommending specific dishes, include their nutrition info and explain why.\n"
        "Keep responses concise and friendly (2-4 sentences for text, up to 5 dish recommendations).\n\n"
        "Return JSON with:\n"
        '- "response": string (your text response)\n'
        '- "recommended_dishes": [{"dish_id": int, "dish_name": string, "reason": string}] '
        "(optional, max 5, only include if recommending specific dishes from the menu)"
    )

    try:
        client = _get_client()
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config={
                "temperature": 0.7,
                "response_mime_type": "application/json",
            },
        )
        data = json.loads(response.text)
        if "response" not in data:
            logger.warning("AI chat response missing 'response' key: %s", data)
            return None
        return {
            "response": data["response"],
            "recommended_dishes": data.get("recommended_dishes", []),
        }
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("AI chat JSON error: %s", exc)
        return None
    except Exception as exc:
        logger.error("AI chat error: %s", exc)
        return None
