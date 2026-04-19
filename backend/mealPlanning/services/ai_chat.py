import json
import logging
import os
import re
from difflib import get_close_matches

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from mealPlanning.models import Dish, DiningHall

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None

logger = logging.getLogger(__name__)

DEFAULT_MODEL_NAME = "gemini-3-flash-preview"
MODEL_NAME = (
    getattr(settings, "AI_CHAT_MODEL", None)
    or os.environ.get("AI_CHAT_MODEL")
    or DEFAULT_MODEL_NAME
)
MAX_HISTORY_MESSAGES = 16
MAX_RECOMMENDATIONS = 5
MAX_FOLLOW_UP_SUGGESTIONS = 3
MAX_MENU_CONTEXT_ITEMS = 90
MAX_MENU_SCAN_ITEMS = 700
ASSISTANT_STYLE_PREFIXES = (
    "are you",
    "do you",
    "would you",
    "could you",
    "can you",
    "what kind of",
    "which kind of",
)
HIGH_PROTEIN_TERMS = (
    "high protein",
    "protein",
    "post workout",
    "post-workout",
    "muscle",
    "macro",
    "macros",
)
LOW_CARB_TERMS = (
    "low carb",
    "lower carb",
    "few carbs",
    "carb limit",
    "carbohydrate limit",
)
GOAL_PLAN_TERMS = (
    "remaining goal",
    "remaining goals",
    "hit my goal",
    "hit my goals",
    "hit my macro",
    "hit my macros",
    "plan out a meal",
    "plan a meal",
    "build a meal",
)
BAKERY_DESSERT_TERMS = (
    "muffin",
    "donut",
    "doughnut",
    "cookie",
    "cake",
    "danish",
    "brownie",
    "blondie",
    "bar",
    "pie",
    "cobbler",
    "pastry",
)
HALL_ALIASES = {
    "ike": ("ikenberry", "ike"),
    "ikenberry": ("ikenberry", "ike"),
    "isr": ("illinois street", "isr"),
    "par": ("pennsylvania avenue", "par"),
    "far": ("florida avenue", "far"),
    "lar": ("lincoln avenue", "lar"),
}


def _get_client():
    api_key = getattr(settings, "GEMINI_API_KEY", None)
    if not api_key:
        api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured")
    return genai.Client(api_key=api_key)


def _generation_config():
    if types is None:
        return {
            "response_mime_type": "application/json",
            "max_output_tokens": 900,
        }

    if MODEL_NAME.startswith("gemini-3"):
        return types.GenerateContentConfig(
            response_mime_type="application/json",
            max_output_tokens=900,
            thinking_config=types.ThinkingConfig(thinking_level="low"),
        )

    return types.GenerateContentConfig(
        temperature=0.35,
        response_mime_type="application/json",
        max_output_tokens=900,
    )


def _normalize_name(name):
    return re.sub(r"[^a-z0-9]+", " ", str(name).lower()).strip()


def _number(value, default=0):
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return default


def _remaining_goals(user_context):
    if not isinstance(user_context, dict):
        return {}

    raw = user_context.get("today_remaining_goals")
    if not isinstance(raw, dict):
        return {}

    return {
        "calories": _number(raw.get("calories")),
        "protein": _number(raw.get("protein")),
        "carbohydrates": _number(raw.get("carbohydrates", raw.get("carbs"))),
        "fat": _number(raw.get("fat")),
    }


def _is_high_protein_intent(user_message, user_context=None):
    lower = str(user_message or "").lower()
    remaining = _remaining_goals(user_context or {})
    return any(term in lower for term in HIGH_PROTEIN_TERMS) or remaining.get("protein", 0) >= 40


def _is_low_carb_intent(user_message, user_context=None):
    lower = str(user_message or "").lower()
    remaining = _remaining_goals(user_context or {})
    return any(term in lower for term in LOW_CARB_TERMS) or (
        remaining.get("carbohydrates", 0) > 0 and remaining.get("carbohydrates", 0) <= 80
    )


def _wants_goal_meal_plan(user_message, user_context=None):
    if not _remaining_goals(user_context or {}):
        return False

    lower = str(user_message or "").lower()
    return any(term in lower for term in GOAL_PLAN_TERMS) or (
        "remaining" in lower and ("protein" in lower or "macro" in lower or "meal" in lower)
    )


def _infer_hall_aliases(user_message):
    lower = str(user_message or "").lower()
    aliases = set()
    for trigger, mapped_aliases in HALL_ALIASES.items():
        if re.search(rf"\b{re.escape(trigger)}\b", lower):
            aliases.update(mapped_aliases)
    return aliases


def _matches_hall(record, aliases):
    if not aliases:
        return True
    hall = _normalize_name(record.get("dining_hall_name", ""))
    return any(alias in hall for alias in aliases)


def _dish_record(dish):
    hall_name = dish.dining_hall.name
    return {
        "dish_id": dish.dish_id,
        "dish_name": dish.dish_name,
        "dining_hall_name": hall_name,
        "hall_name": hall_name,
        "serving_unit": dish.serving_unit or "",
        "serving_size": dish.serving_size or "",
        "meal_period": dish.meal_period or "",
        "course": dish.course or "",
        "calories": _number(dish.calories),
        "protein": _number(dish.protein),
        "carbohydrates": _number(dish.carbohydrates),
        "fat": _number(dish.fat),
        "dietary_flags": dish.dietary_flags or [],
        "allergens": dish.allergens or [],
    }


def _format_record_line(record):
    flags = ", ".join(record.get("dietary_flags") or [])
    allergen_str = ", ".join(record.get("allergens") or [])
    serving = record.get("serving_size") or record.get("serving_unit") or "1 serving"
    return (
        f"- id={record['dish_id']} | {record['dish_name']} | {record['dining_hall_name']} | "
        f"{serving} | {record['calories']} kcal, {record['protein']}g protein, "
        f"{record['carbohydrates']}g carbs, {record['fat']}g fat | "
        f"flags: {flags or 'none'} | allergens: {allergen_str or 'none'}"
    )


def _is_bakery_or_dessert(record):
    name = str(record.get("dish_name", "")).lower()
    course = str(record.get("course", "")).lower()
    station = str(record.get("serving_unit", "")).lower()
    haystack = f"{name} {course} {station}"
    return any(term in haystack for term in BAKERY_DESSERT_TERMS)


def _record_score(record, user_message="", user_context=None):
    protein = _number(record.get("protein"))
    carbs = _number(record.get("carbohydrates"))
    fat = _number(record.get("fat"))
    calories = max(_number(record.get("calories")), 1)
    protein_density = protein / calories
    remaining = _remaining_goals(user_context or {})
    high_protein = _is_high_protein_intent(user_message, user_context)
    low_carb = _is_low_carb_intent(user_message, user_context)

    score = protein * 1.5 + protein_density * 240

    if high_protein:
        score += protein * 2.8 + protein_density * 520
        score -= carbs * 0.9 + fat * 0.65
        if protein < 12:
            score -= 120
        if _is_bakery_or_dessert(record) and (protein < 20 or carbs > max(25, protein * 2)):
            score -= 240

    if low_carb:
        score -= carbs * 1.25
        if carbs <= 15:
            score += 30

    if remaining.get("calories", 0) > 0:
        over_calories = calories - remaining["calories"]
        if over_calories <= 0:
            score += 18
        else:
            score -= min(200, over_calories * 0.25)

    if remaining.get("fat", 0) > 0 and fat <= max(12, remaining["fat"] / 3):
        score += 12

    query_tokens = [
        token for token in _normalize_name(user_message).split()
        if len(token) >= 4 and token not in {"meal", "goals", "remaining", "help", "plan"}
    ]
    normalized_name = _normalize_name(record.get("dish_name", ""))
    for token in query_tokens:
        if token in normalized_name:
            score += 20

    return score


def _build_menu_context(user_message="", user_context=None):
    """Build menu context and lookup indexes for grounding recommendations."""
    halls = DiningHall.objects.all()
    hall_names = [h.name for h in halls]

    base_qs = (
        Dish.objects
        .select_related("dining_hall")
        .filter(calories__gt=0)
        .order_by("dining_hall__name", "serving_unit", "dish_name")
    )
    aliases = _infer_hall_aliases(user_message)
    if aliases:
        hall_filter = Q()
        for alias in aliases:
            hall_filter |= Q(dining_hall__name__icontains=alias)
        scoped_qs = base_qs.filter(hall_filter)
        if scoped_qs.exists():
            base_qs = scoped_qs

    today_qs = base_qs.filter(last_seen=timezone.localdate())
    dishes = today_qs if today_qs.exists() else base_qs

    records = []
    for dish in dishes[:MAX_MENU_SCAN_ITEMS]:
        record = _dish_record(dish)
        if _matches_hall(record, aliases):
            records.append(record)

    records.sort(
        key=lambda record: _record_score(record, user_message, user_context),
        reverse=True,
    )
    selected_records = records[:MAX_MENU_CONTEXT_ITEMS]

    lines = [_format_record_line(record) for record in selected_records]
    dish_lookup = {}
    name_index = {}

    for record in selected_records:
        dish_lookup[record["dish_id"]] = record
        norm_name = _normalize_name(record["dish_name"])
        if norm_name:
            name_index.setdefault(norm_name, []).append(record)

    return hall_names, "\n".join(lines), dish_lookup, name_index


def _grounded_reason(record):
    serving = record.get("serving_size") or record.get("serving_unit") or "1 serving"
    return (
        f"{record.get('calories')} kcal, {record.get('protein')}g protein, "
        f"{record.get('carbohydrates')}g carbs, {record.get('fat')}g fat per {serving}."
    )


def _serialize_recommendation(record, reason=None, quantity=1):
    payload = {
        "dish_id": record["dish_id"],
        "dish_name": record["dish_name"],
        "reason": reason or _grounded_reason(record),
    }
    for key in (
        "dining_hall_name",
        "hall_name",
        "serving_unit",
        "serving_size",
        "meal_period",
        "course",
        "calories",
        "protein",
        "carbohydrates",
        "fat",
    ):
        if key in record:
            payload[key] = record[key]
    if quantity > 1:
        payload["quantity"] = quantity
    return payload


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
        "activity_level", "daily_goals", "today_logged_totals",
        "today_remaining_goals", "logged_meals_today", "current_meal_tray",
        "dietary_preferences", "allergy_avoidances",
    ]
    lines = []
    for key in ordered_keys:
        value = user_context.get(key)
        if value in ("", None, [], {}):
            continue
        if isinstance(value, (dict, list)):
            value = json.dumps(value, ensure_ascii=True)
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

        has_grounded_nutrition = all(
            key in record for key in ("calories", "protein", "carbohydrates", "fat")
        )
        resolved.append(_serialize_recommendation(
            record,
            reason=_grounded_reason(record) if has_grounded_nutrition else reason,
        ))
        if len(resolved) >= MAX_RECOMMENDATIONS:
            break

    return resolved


def _totals_for_items(items):
    totals = {"calories": 0, "protein": 0, "carbohydrates": 0, "fat": 0}
    for item in items:
        quantity = max(1, _number(item.get("quantity"), 1))
        totals["calories"] += _number(item.get("calories")) * quantity
        totals["protein"] += _number(item.get("protein")) * quantity
        totals["carbohydrates"] += _number(item.get("carbohydrates")) * quantity
        totals["fat"] += _number(item.get("fat")) * quantity
    return totals


def _remaining_after_plan(remaining, totals):
    return {
        "calories": max(0, remaining.get("calories", 0) - totals["calories"]),
        "protein": max(0, remaining.get("protein", 0) - totals["protein"]),
        "carbohydrates": max(0, remaining.get("carbohydrates", 0) - totals["carbohydrates"]),
        "fat": max(0, remaining.get("fat", 0) - totals["fat"]),
    }


def _can_add_to_plan(record, totals, remaining):
    next_totals = {
        "calories": totals["calories"] + _number(record.get("calories")),
        "protein": totals["protein"] + _number(record.get("protein")),
        "carbohydrates": totals["carbohydrates"] + _number(record.get("carbohydrates")),
        "fat": totals["fat"] + _number(record.get("fat")),
    }

    calorie_cap = remaining.get("calories", 0)
    carb_cap = remaining.get("carbohydrates", 0)
    fat_cap = remaining.get("fat", 0)

    if calorie_cap > 0 and next_totals["calories"] > calorie_cap * 1.05:
        return False
    if carb_cap > 0 and next_totals["carbohydrates"] > carb_cap * 1.05:
        return False
    if fat_cap > 0 and next_totals["fat"] > fat_cap * 1.05:
        return False
    return True


def _plan_candidate_records(dish_lookup, user_message, user_context):
    records = [
        record for record in dish_lookup.values()
        if all(key in record for key in ("calories", "protein", "carbohydrates", "fat"))
    ]
    aliases = _infer_hall_aliases(user_message)
    records = [record for record in records if _matches_hall(record, aliases)]
    high_protein = _is_high_protein_intent(user_message, user_context)

    filtered = []
    for record in records:
        protein = _number(record.get("protein"))
        calories = max(_number(record.get("calories")), 1)
        carbs = _number(record.get("carbohydrates"))

        if protein <= 0:
            continue
        if high_protein:
            if protein < 12:
                continue
            if protein / calories < 0.035:
                continue
            if _is_bakery_or_dessert(record) and (protein < 20 or carbs > max(25, protein * 2)):
                continue
        filtered.append(record)

    filtered.sort(
        key=lambda record: _record_score(record, user_message, user_context),
        reverse=True,
    )
    return filtered


def _build_goal_meal_plan(user_message, user_context, dish_lookup):
    remaining = _remaining_goals(user_context or {})
    candidates = _plan_candidate_records(dish_lookup, user_message, user_context)
    if not remaining or not candidates:
        return None

    target_protein = remaining.get("protein", 0)
    totals = {"calories": 0, "protein": 0, "carbohydrates": 0, "fat": 0}
    selected = []
    selected_by_id = {}

    for record in candidates:
        if len(selected) >= MAX_RECOMMENDATIONS:
            break

        protein = _number(record.get("protein"))
        carbs = _number(record.get("carbohydrates"))
        fat = _number(record.get("fat"))
        max_quantity = 2 if protein >= 25 and carbs <= 30 and fat <= 20 else 1

        for _ in range(max_quantity):
            if not _can_add_to_plan(record, totals, remaining):
                break

            totals["calories"] += _number(record.get("calories"))
            totals["protein"] += protein
            totals["carbohydrates"] += carbs
            totals["fat"] += fat

            existing = selected_by_id.get(record["dish_id"])
            if existing:
                existing["quantity"] += 1
                existing["reason"] = _grounded_reason(existing)
            else:
                item = dict(record)
                item["quantity"] = 1
                item["reason"] = _grounded_reason(item)
                selected.append(item)
                selected_by_id[record["dish_id"]] = item

            if target_protein and totals["protein"] >= target_protein:
                break

        if target_protein and totals["protein"] >= target_protein:
            break

    if not selected:
        for record in candidates[:3]:
            item = dict(record)
            item["quantity"] = 1
            item["reason"] = _grounded_reason(item)
            selected.append(item)
        totals = _totals_for_items(selected)

    remaining_after = _remaining_after_plan(remaining, totals)
    hall_names = sorted({
        item.get("dining_hall_name", "") for item in selected
        if item.get("dining_hall_name")
    })
    hall_label = hall_names[0] if len(hall_names) == 1 else "the selected halls"
    title = f"Protein-focused meal at {hall_label}"

    first_name = ""
    if isinstance(user_context, dict) and user_context.get("name"):
        first_name = str(user_context["name"]).strip().split()[0]

    response_parts = [
        (
            f"{first_name + ', ' if first_name else ''}I would build this around leaner protein, "
            "not the muffin/donut-style items. Those are mostly carbs for this goal."
        ),
        (
            f"The plan below comes straight from menu nutrition: {totals['calories']} kcal, "
            f"{totals['protein']}g protein, {totals['carbohydrates']}g carbs, and {totals['fat']}g fat."
        ),
    ]
    if target_protein and remaining_after["protein"] > 0:
        response_parts.append(
            f"It still leaves about {remaining_after['protein']}g protein, so hitting the full "
            f"{target_protein}g remaining target may need another lean serving later."
        )
    elif target_protein:
        response_parts.append("It covers your remaining protein target while staying grounded in the menu data.")

    meal_plan_items = [
        _serialize_recommendation(item, reason=item["reason"], quantity=item.get("quantity", 1))
        for item in selected
    ]

    return {
        "response": " ".join(response_parts),
        "recommended_dishes": meal_plan_items[:MAX_RECOMMENDATIONS],
        "meal_plan": {
            "title": title,
            "summary": (
                f"{totals['calories']} kcal · {totals['protein']}g protein · "
                f"{totals['carbohydrates']}g carbs · {totals['fat']}g fat"
            ),
            "items": meal_plan_items,
            "totals": totals,
            "remaining_after": remaining_after,
            "action_label": "Add plan to tray",
            "note": "All numbers are copied from SmartEats dish records per serving.",
        },
        "follow_up_suggestions": [
            "Find one more lean protein item",
            "Show lower-carb swaps",
            "Compare another dining hall",
        ],
    }


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
        if any(lowered.startswith(prefix) for prefix in ASSISTANT_STYLE_PREFIXES):
            continue
        if lowered in seen:
            continue
        seen.add(lowered)
        cleaned.append(text)
        if len(cleaned) >= MAX_FOLLOW_UP_SUGGESTIONS:
            break
    return cleaned


def _extract_usage_metadata(response):
    usage = getattr(response, "usage_metadata", None)
    if usage is None:
        return {}

    prompt_tokens = getattr(usage, "prompt_token_count", None)
    completion_tokens = getattr(usage, "candidates_token_count", None)
    total_tokens = getattr(usage, "total_token_count", None)

    if prompt_tokens is None and isinstance(usage, dict):
        prompt_tokens = usage.get("prompt_token_count")
        completion_tokens = usage.get("candidates_token_count")
        total_tokens = usage.get("total_token_count")

    def _to_int(value):
        try:
            return max(0, int(value))
        except (TypeError, ValueError):
            return 0

    return {
        "prompt_tokens": _to_int(prompt_tokens),
        "completion_tokens": _to_int(completion_tokens),
        "total_tokens": _to_int(total_tokens),
    }


def get_response(user_message, history=None, user_context=None):
    """
    Send user message to Gemini with dining context.
    Returns dict with 'response' (str) and 'recommended_dishes' (list).
    Returns None on failure.
    """
    hall_names, dish_list, dish_lookup, name_index = _build_menu_context(user_message, user_context)
    normalized_history = _normalize_history(history or [])

    if _wants_goal_meal_plan(user_message, user_context):
        fast_plan = _build_goal_meal_plan(user_message, user_context, dish_lookup)
        if fast_plan is not None:
            fast_plan["_meta"] = {
                "model_name": "smart_rule_planner",
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "token_source": "fast_path",
            }
            return fast_plan

    if genai is None:
        logger.error("google-genai not installed")
        return None

    prompt = (
        "You are SmartEats AI, a conversational nutrition coach for UIUC dining halls.\n"
        "You are in an active back-and-forth chat. Keep continuity with prior messages and behave like a useful dining assistant, not a report generator.\n\n"
        f"AVAILABLE DINING HALLS:\n{', '.join(hall_names)}\n\n"
        f"RELEVANT CURRENT MENU CANDIDATES (exact nutrition data):\n{dish_list}\n\n"
        f"AUTHENTICATED USER PROFILE (if available):\n{_format_user_context(user_context)}\n\n"
        f"CONVERSATION HISTORY:\n{_format_history(normalized_history)}\n\n"
        f"LATEST USER MESSAGE:\n{user_message}\n\n"
        "Conversation style:\n"
        "- Be direct, warm, and specific. Avoid stock openers like \"Based on your goals\" on every turn.\n"
        "- Choose the shape that fits the moment: a short answer, a few bullets, a comparison, or a concrete meal idea.\n"
        "- Vary phrasing across turns. Do not force every answer into the same template.\n"
        "- Connect advice to the user's tray, remaining goals, dining hall, or prior preferences when that context exists.\n"
        "- If the user asks casually, answer casually; if they ask for a plan, be more structured.\n\n"
        "Behavior rules:\n"
        "1. Nutrition accuracy is mandatory: never invent calories, protein, carbs, or fat. "
        "Only repeat numbers exactly as shown in the menu candidate lines.\n"
        "2. If recommending dishes, only use items from RELEVANT CURRENT MENU CANDIDATES.\n"
        "3. Do not call an item high-protein unless it has at least 12g protein and a clear protein advantage. "
        "For high-protein or remaining-macro requests, avoid muffins, donuts, cookies, cakes, and pastries unless the user explicitly asks for them.\n"
        "4. Respect remaining goals from AUTHENTICATED USER PROFILE. If a full goal cannot be hit with the available menu, say that plainly.\n"
        "5. Remember user preferences and constraints stated earlier in this conversation.\n"
        "6. If user goals are unclear, ask one focused follow-up question.\n"
        "7. Keep response concise but useful, usually 2-6 sentences unless the user asks for detail.\n"
        "8. follow_up_suggestions must be written as user-ready prompts to tap next, "
        'not assistant questions. Good examples: "Show vegetarian lunches", '
        '"Find something under 400 calories", "Compare high-protein dinners".\n\n'
        "Return strict JSON with:\n"
        '- "response": string\n'
        '- "recommended_dishes": [{"dish_id": int, "dish_name": string, "reason": string}] (optional, max 5; use menu candidate ids)\n'
        '- "follow_up_suggestions": [string] (optional, 1-3 short suggestions for next user prompts)'
    )

    try:
        client = _get_client()
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=_generation_config(),
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
        usage_meta = _extract_usage_metadata(response)
        token_source = "provider" if usage_meta.get("total_tokens", 0) > 0 else "unknown"

        return {
            "response": response_text,
            "recommended_dishes": recommended,
            "follow_up_suggestions": follow_up_suggestions,
            "_meta": {
                "model_name": MODEL_NAME,
                "prompt_tokens": usage_meta.get("prompt_tokens", 0),
                "completion_tokens": usage_meta.get("completion_tokens", 0),
                "total_tokens": usage_meta.get("total_tokens", 0),
                "token_source": token_source,
            },
        }
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("AI chat JSON error: %s", exc)
        return None
    except Exception as exc:
        logger.error("AI chat error: %s", exc)
        return None
