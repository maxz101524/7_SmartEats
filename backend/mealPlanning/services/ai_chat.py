import json
import logging
import re
from difflib import get_close_matches

from django.conf import settings

from mealPlanning.models import Dish, DiningHall

try:
    from google import genai
except ImportError:
    genai = None

logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-2.5-flash"
MAX_HISTORY_MESSAGES = 16
MAX_RECOMMENDATIONS = 5
MAX_FOLLOW_UP_SUGGESTIONS = 3


def _get_client():
    api_key = getattr(settings, "GEMINI_API_KEY", None)
    if not api_key:
        import os
        api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured")
    return genai.Client(api_key=api_key)


def _normalize_name(name):
    return re.sub(r"[^a-z0-9]+", " ", str(name).lower()).strip()


def _build_menu_context():
    """Build menu context and lookup indexes for grounding recommendations."""
    halls = DiningHall.objects.all()
    hall_names = [h.name for h in halls]

    dishes = (
        Dish.objects
        .select_related("dining_hall")
        .filter(calories__gt=0)
        .order_by("dining_hall__name", "serving_unit", "dish_name")
    )

    lines = []
    dish_lookup = {}
    name_index = {}

    for dish in dishes[:350]:  # Cap context to avoid token limits
        flags = ", ".join(dish.dietary_flags) if dish.dietary_flags else ""
        allergen_str = ", ".join(dish.allergens) if dish.allergens else ""
        lines.append(
            f"- {dish.dish_name} | {dish.dining_hall.name} | {dish.serving_unit} | "
            f"{dish.calories}cal {dish.protein}g P {dish.carbohydrates}g C {dish.fat}g F | "
            f"flags: {flags} | allergens: {allergen_str}"
        )
        record = {
            "dish_id": dish.dish_id,
            "dish_name": dish.dish_name,
            "dining_hall_name": dish.dining_hall.name,
            "serving_unit": dish.serving_unit or "",
        }
        dish_lookup[dish.dish_id] = record
        norm_name = _normalize_name(dish.dish_name)
        if norm_name:
            name_index.setdefault(norm_name, []).append(record)

    return hall_names, "\n".join(lines), dish_lookup, name_index


def _normalize_history(history):
    if not isinstance(history, list):
        return []

    normalized = []
    for item in history[-MAX_HISTORY_MESSAGES:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role", "")).strip().lower()
        content = str(item.get("content", "")).strip()
        if not content:
            continue
        if role in {"assistant", "ai"}:
            normalized.append({"role": "assistant", "content": content})
        elif role == "user":
            normalized.append({"role": "user", "content": content})
    return normalized


def _format_history(history):
    if not history:
        return "No previous conversation."

    lines = []
    for item in history:
        speaker = "User" if item["role"] == "user" else "Assistant"
        lines.append(f"{speaker}: {item['content']}")
    return "\n".join(lines)


def _format_user_context(user_context):
    if not isinstance(user_context, dict) or not user_context:
        return "No authenticated user profile context."

    ordered_keys = [
        "name", "goal", "sex", "age", "height_cm", "weight_kg",
        "dietary_preferences", "allergy_avoidances",
    ]
    lines = []
    for key in ordered_keys:
        value = user_context.get(key)
        if value in ("", None, [], {}):
            continue
        lines.append(f"- {key}: {value}")
    return "\n".join(lines) if lines else "No authenticated user profile context."


def _resolve_recommended_dishes(raw_recommended, dish_lookup, name_index):
    resolved = []
    seen_ids = set()

    if not isinstance(raw_recommended, list):
        return resolved

    normalized_name_keys = list(name_index.keys())

    for item in raw_recommended:
        if not isinstance(item, dict):
            continue

        reason = str(item.get("reason", "")).strip()
        if not reason:
            continue

        record = None

        raw_id = item.get("dish_id")
        try:
            dish_id = int(raw_id)
        except (TypeError, ValueError):
            dish_id = None

        if dish_id is not None:
            record = dish_lookup.get(dish_id)

        if record is None:
            raw_name = str(item.get("dish_name", "")).strip()
            norm = _normalize_name(raw_name)
            if norm in name_index and name_index[norm]:
                record = name_index[norm][0]
            elif norm:
                close = get_close_matches(norm, normalized_name_keys, n=1, cutoff=0.8)
                if close and name_index.get(close[0]):
                    record = name_index[close[0]][0]

        if record is None:
            continue

        if record["dish_id"] in seen_ids:
            continue
        seen_ids.add(record["dish_id"])

        resolved.append({
            "dish_id": record["dish_id"],
            "dish_name": record["dish_name"],
            "reason": reason,
        })
        if len(resolved) >= MAX_RECOMMENDATIONS:
            break

    return resolved


def _sanitize_follow_up_suggestions(raw_suggestions):
    if not isinstance(raw_suggestions, list):
        return []

    cleaned = []
    seen = set()
    for item in raw_suggestions:
        text = str(item).strip()
        if not text:
            continue
        if len(text) > 80:
            continue
        lowered = text.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        cleaned.append(text)
        if len(cleaned) >= MAX_FOLLOW_UP_SUGGESTIONS:
            break
    return cleaned


def get_response(user_message, history=None, user_context=None):
    """
    Send user message to Gemini with dining context.
    Returns dict with 'response' (str) and 'recommended_dishes' (list).
    Returns None on failure.
    """
    if genai is None:
        logger.error("google-genai not installed")
        return None

    hall_names, dish_list, dish_lookup, name_index = _build_menu_context()
    normalized_history = _normalize_history(history or [])

    prompt = (
        "You are SmartEats AI, a conversational nutrition coach for UIUC dining halls.\n"
        "You are in an active back-and-forth chat. Keep continuity with prior messages.\n\n"
        f"AVAILABLE DINING HALLS:\n{', '.join(hall_names)}\n\n"
        f"CURRENT MENU (dishes with nutrition data):\n{dish_list}\n\n"
        f"AUTHENTICATED USER PROFILE (if available):\n{_format_user_context(user_context)}\n\n"
        f"CONVERSATION HISTORY:\n{_format_history(normalized_history)}\n\n"
        f"LATEST USER MESSAGE:\n{user_message}\n\n"
        "Behavior rules:\n"
        "1. Keep a natural chatbot tone, not one-shot search results.\n"
        "2. Remember user preferences and constraints stated earlier in this conversation.\n"
        "3. If user goals are unclear, ask one focused follow-up question.\n"
        "4. If recommending dishes, only use items from CURRENT MENU and explain tradeoffs.\n"
        "5. Prefer concrete guidance (calories/protein/carbs/fat) when available.\n"
        "6. Keep response concise but useful (3-7 sentences).\n\n"
        "Return strict JSON with:\n"
        '- "response": string\n'
        '- "recommended_dishes": [{"dish_id": int, "dish_name": string, "reason": string}] (optional, max 5)\n'
        '- "follow_up_suggestions": [string] (optional, 1-3 short suggestions for next user prompts)'
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
        response_text = str(data.get("response", "")).strip()
        if not response_text:
            logger.warning("AI chat response missing 'response' key: %s", data)
            return None

        recommended = _resolve_recommended_dishes(
            data.get("recommended_dishes", []),
            dish_lookup=dish_lookup,
            name_index=name_index,
        )
        follow_up_suggestions = _sanitize_follow_up_suggestions(
            data.get("follow_up_suggestions", []),
        )

        return {
            "response": response_text,
            "recommended_dishes": recommended,
            "follow_up_suggestions": follow_up_suggestions,
        }
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("AI chat JSON error: %s", exc)
        return None
    except Exception as exc:
        logger.error("AI chat error: %s", exc)
        return None
