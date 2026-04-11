import logging
import os
import pickle
import re

import numpy as np

logger = logging.getLogger(__name__)

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
HF_API_URL = f"https://api-inference.huggingface.co/models/{MODEL_NAME}"
EMBEDDING_DIM = 384
EMBEDDING_SCHEMA_VERSION = 2
# MODEL_NAME = "sentence-transformers/all-mpnet-base-v2"
# HF_API_URL = f"https://api-inference.huggingface.co/models/{MODEL_NAME}"
# EMBEDDING_DIM = 768
# EMBEDDING_SCHEMA_VERSION = 3



EMBEDDING_ENCODER = "normalized-sentence-embedding"
MIN_SCORE = 0.30
MAX_CANDIDATES = int(os.environ.get("SEMANTIC_SEARCH_MAX_CANDIDATES", "600"))
_model = None

STOPWORDS = {
    "a", "an", "and", "any", "are", "at", "be", "but", "by", "can", "for",
    "from", "get", "give", "hall", "have", "i", "in", "is", "like", "me",
    "no", "of", "on", "or", "please", "some", "something", "that", "the",
    "to", "want", "with", "without", "avoid", "exclude", "under", "below",
    "less", "than", "over", "above", "at", "least", "more",
}

ALLERGEN_SYNONYMS = {
    "milk": {"milk", "dairy", "cheese", "cream", "butter"},
    "egg": {"egg", "eggs"},
    "fish": {"fish"},
    "shellfish": {"shellfish", "shrimp", "crab"},
    "peanuts": {"peanut", "peanuts"},
    "tree nuts": {"tree nut", "tree nuts", "nut", "nuts"},
    "soy": {"soy", "soya"},
    "wheat": {"wheat"},
    "gluten": {"gluten"},
    "sesame": {"sesame"},
}
ALLERGEN_DISPLAY = {
    "milk": "Milk",
    "egg": "Egg",
    "fish": "Fish",
    "shellfish": "Shellfish",
    "peanuts": "Peanuts",
    "tree nuts": "Tree nuts",
    "soy": "Soy",
    "wheat": "Wheat",
    "gluten": "Gluten",
    "sesame": "Sesame",
}
SEARCH_FIELDS = (
    "dish_id",
    "dish_name",
    "category",
    "calories",
    "protein",
    "carbohydrates",
    "fat",
    "fiber",
    "sodium",
    "allergens",
    "dietary_flags",
    "nutrition_source",
    "ai_confidence",
    "meal_period",
    "course",
    "serving_unit",
    "uiuc_item_id",
    "serving_size",
    "last_seen",
    "embedding",
    "dining_hall_id",
)


def _use_local_model():
    """Return True when USE_LOCAL_MODEL=true is set in the environment."""
    return os.environ.get("USE_LOCAL_MODEL", "false").lower() == "true"


def _get_model():
    global _model
    if _model is None:
        import torch
        from sentence_transformers import SentenceTransformer
        device = "mps" if torch.backends.mps.is_available() else "cpu"
        logger.info("Loading embedding model %s on %s", MODEL_NAME, device)
        _model = SentenceTransformer(MODEL_NAME, device=device)
    return _model


def _normalize_vector(value, *, allow_token_matrix=False):
    """Coerce encoder output to one normalized 384-dim float32 sentence vector."""
    vec = np.asarray(value, dtype=np.float32).squeeze()

    if vec.ndim == 2 and allow_token_matrix and vec.shape[-1] == EMBEDDING_DIM:
        # Some HF feature-extraction backends return token embeddings. Mean-pooling
        # keeps query semantics instead of accidentally using only the first token.
        vec = vec.mean(axis=0)

    if vec.ndim != 1 or vec.shape[0] != EMBEDDING_DIM:
        raise ValueError(
            f"Expected {EMBEDDING_DIM}-dim embedding vector, got shape {vec.shape}"
        )
    if not np.all(np.isfinite(vec)):
        raise ValueError("Embedding contains non-finite values")

    norm = np.linalg.norm(vec)
    if norm <= 0:
        raise ValueError("Embedding has zero norm")
    return (vec / norm).astype(np.float32)


def _encode_via_hf_api(text):
    """
    Encode text using the HuggingFace InferenceClient.
    The model runs on HF's servers — no local memory cost.
    Requires HF_API_TOKEN env var (free account at huggingface.co).
    Returns a normalized float32 numpy array.
    """
    from huggingface_hub import InferenceClient

    hf_token = os.environ.get("HF_API_TOKEN")
    client = InferenceClient(token=hf_token)
    result = client.feature_extraction(text, model=MODEL_NAME)
    return _normalize_vector(result, allow_token_matrix=True)


def _encode(text):
    """
    Encode text to a normalized 384-dim float32 vector.
    Routes to local model (dev) or HF Inference API (production).
    """
    if _use_local_model():
        result = _get_model().encode(text, normalize_embeddings=True)
        return _normalize_vector(result)
    return _encode_via_hf_api(text)


def dish_text(dish):
    """Build a plain-text representation of a dish for embedding."""
    parts = [dish.dish_name]
    if dish.category:
        parts.append(dish.category)
    if dish.course:
        parts.append(dish.course)
    if dish.meal_period:
        parts.append(dish.meal_period)
    if dish.serving_unit:
        parts.append(dish.serving_unit)
    if dish.dietary_flags:
        parts.extend(dish.dietary_flags)
    if dish.allergens:
        parts.extend(dish.allergens)
    if dish.nutrition_source:
        parts.extend(_nutrition_text(dish))
    return " ".join(parts)


def _nutrition_text(dish):
    parts = []

    if dish.calories is not None:
        parts.append(f"{dish.calories} calories")
        if dish.calories <= 400:
            parts.append("low calorie")
        elif dish.calories >= 700:
            parts.append("high calorie")

    if dish.protein is not None:
        parts.append(f"{dish.protein}g protein")
        if dish.protein >= 20:
            parts.append("high protein")

    if dish.carbohydrates is not None:
        parts.append(f"{dish.carbohydrates}g carbohydrates")

    if dish.fat is not None:
        parts.append(f"{dish.fat}g fat")

    if dish.fiber is not None:
        fiber = float(dish.fiber)
        parts.append(f"{fiber:g}g fiber")
        if fiber >= 5:
            parts.append("high fiber")

    if dish.sodium is not None:
        sodium = float(dish.sodium)
        parts.append(f"{sodium:g}mg sodium")
        if sodium <= 500:
            parts.append("low sodium")
        elif sodium >= 900:
            parts.append("high sodium")

    return parts


def encode_to_bytes(text):
    """Encode text to a normalized 384-dim vector and return as pickled bytes."""
    vec = _encode(text)
    payload = {
        "schema_version": EMBEDDING_SCHEMA_VERSION,
        "model": MODEL_NAME,
        "encoder": EMBEDDING_ENCODER,
        "dim": EMBEDDING_DIM,
        "vector": vec,
    }
    return pickle.dumps(payload, protocol=pickle.HIGHEST_PROTOCOL)


def decode_from_bytes(blob):
    """Deserialize a stored embedding blob back to a numpy array."""
    payload = pickle.loads(bytes(blob))
    if isinstance(payload, dict):
        payload = payload.get("vector")
    return _normalize_vector(payload)


def is_current_embedding(vec):
    """Return True when an embedding matches the active model's vector shape."""
    try:
        _normalize_vector(vec)
    except Exception:
        return False
    return True


def _is_current_payload(payload):
    if not isinstance(payload, dict):
        return False
    if payload.get("schema_version") != EMBEDDING_SCHEMA_VERSION:
        return False
    if payload.get("model") != MODEL_NAME:
        return False
    if payload.get("encoder") != EMBEDDING_ENCODER:
        return False
    if payload.get("dim") != EMBEDDING_DIM:
        return False
    return is_current_embedding(payload.get("vector"))


def _load_current_vector(blob):
    payload = pickle.loads(bytes(blob))
    if not _is_current_payload(payload):
        raise ValueError("Embedding payload is missing current model metadata")
    return _normalize_vector(payload["vector"])


def embedding_blob_needs_refresh(blob):
    """Return True when an embedding is missing, invalid, or from an older model."""
    if blob is None:
        return True
    try:
        payload = pickle.loads(bytes(blob))
    except Exception:
        return True
    return not _is_current_payload(payload)


def has_current_embeddings(hall_id=None):
    """Return True when at least one stored dish embedding exists for the scope."""
    from mealPlanning.models import Dish

    qs = Dish.objects.exclude(embedding=None)
    if hall_id is not None:
        qs = qs.filter(dining_hall_id=hall_id)
    return qs.only("dish_id").exists()


def parse_query_intent(query):
    """Turn plain-language food search into hard filters and soft preferences."""
    text = query.strip()
    normalized = _normalize_text(text)
    intent = {
        "raw_query": text,
        "semantic_query": _semantic_query_text(text),
        "terms": _tokenize(text),
        "required_flags": set(),
        "excluded_allergens": set(),
        "meal_period": None,
        "max_calories": None,
        "min_calories": None,
        "min_protein": None,
        "max_sodium": None,
        "min_fiber": None,
        "max_fat": None,
        "max_carbohydrates": None,
        "soft_preferences": set(),
    }

    if re.search(r"\bvegan\b", normalized):
        intent["required_flags"].add("vegan")
    elif re.search(r"\bvegetarian\b", normalized):
        intent["required_flags"].add("vegetarian")

    for period in ("breakfast", "lunch", "dinner", "brunch"):
        if re.search(rf"\b{period}\b", normalized):
            intent["meal_period"] = period
            break

    _parse_allergen_exclusions(normalized, intent)
    _parse_numeric_constraints(normalized, intent)
    _parse_soft_preferences(normalized, intent)

    if intent["required_flags"]:
        intent["soft_preferences"].add("dietary_fit")
    if intent["meal_period"]:
        intent["soft_preferences"].add("meal_period")

    intent["has_hard_filters"] = any([
        intent["required_flags"],
        intent["excluded_allergens"],
        intent["meal_period"],
        intent["max_calories"] is not None,
        intent["min_calories"] is not None,
        intent["min_protein"] is not None,
        intent["max_sodium"] is not None,
        intent["min_fiber"] is not None,
        intent["max_fat"] is not None,
        intent["max_carbohydrates"] is not None,
    ])
    intent["has_structured_intent"] = (
        intent["has_hard_filters"] or bool(intent["soft_preferences"])
    )
    return intent


def _normalize_text(text):
    return re.sub(r"\s+", " ", text.lower().replace("-", " ")).strip()


def _tokenize(text):
    tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9]*", _normalize_text(text))
    return [_stem_token(token) for token in tokens if token not in STOPWORDS]


def _stem_token(token):
    if len(token) > 4 and token.endswith("ies"):
        return f"{token[:-3]}y"
    if len(token) > 3 and token.endswith("s"):
        return token[:-1]
    return token


def _semantic_query_text(query):
    text = _normalize_text(query)
    for synonyms in ALLERGEN_SYNONYMS.values():
        for synonym in sorted(synonyms, key=len, reverse=True):
            escaped = re.escape(synonym)
            text = re.sub(
                rf"\b(?:without|avoid|exclude|no)\s+(?:any\s+)?{escaped}\b",
                " ",
                text,
            )
            text = re.sub(rf"\b{escaped}\s+free\b", " ", text)

    numeric_patterns = [
        r"\b(?:under|below|less than|fewer than|max(?:imum)?|no more than|at most)\s*\d+\s*(?:calories|calorie|cal|kcal|mg|g)?\b",
        r"\b(?:over|above|at least|min(?:imum)?|more than)\s*\d+\s*(?:calories|calorie|cal|kcal|mg|g)?\b",
        r"\b\d+\s*(?:calories|calorie|cal|kcal|mg|g)\s*(?:or less|or more|and under|and over)?\b",
    ]
    for pattern in numeric_patterns:
        text = re.sub(pattern, " ", text)

    text = re.sub(r"\s+", " ", text).strip()
    return text or query.strip()


def _parse_allergen_exclusions(text, intent):
    for canonical, synonyms in ALLERGEN_SYNONYMS.items():
        for synonym in synonyms:
            escaped = re.escape(synonym)
            if re.search(
                rf"\b(?:without|avoid|exclude|no)\s+(?:any\s+)?{escaped}\b",
                text,
            ) or re.search(rf"\b{escaped}\s+free\b", text):
                _add_excluded_allergen(intent, canonical)


def _add_excluded_allergen(intent, canonical):
    if canonical == "dairy":
        canonical = "milk"
    if canonical == "gluten":
        intent["excluded_allergens"].update({"gluten", "wheat"})
        return
    if canonical == "tree nuts":
        intent["excluded_allergens"].update({"tree nuts", "peanuts"})
        return
    intent["excluded_allergens"].add(canonical)


def _parse_numeric_constraints(text, intent):
    intent["max_calories"] = _first_number([
        r"\b(?:under|below|less than|fewer than|max(?:imum)?|no more than|at most)\s*(\d+)\s*(?:calories|calorie|cal|kcal)\b",
        r"\b(\d+)\s*(?:calories|calorie|cal|kcal)\s*(?:or less|and under|max)\b",
    ], text)
    intent["min_calories"] = _first_number([
        r"\b(?:over|above|at least|min(?:imum)?|more than)\s*(\d+)\s*(?:calories|calorie|cal|kcal)\b",
        r"\b(\d+)\s*(?:calories|calorie|cal|kcal)\s*(?:or more|and over|min)\b",
    ], text)
    intent["min_protein"] = _first_number([
        r"\b(?:over|above|at least|min(?:imum)?|more than)\s*(\d+)\s*g?\s*(?:of\s+)?protein\b",
        r"\b(\d+)\s*g?\s*protein\s*(?:or more|minimum|min)?\b",
    ], text)
    intent["max_sodium"] = _first_number([
        r"\b(?:under|below|less than|max(?:imum)?|no more than|at most)\s*(\d+)\s*mg\s*sodium\b",
        r"\b(\d+)\s*mg\s*sodium\s*(?:or less|and under|max)\b",
    ], text)
    intent["min_fiber"] = _first_number([
        r"\b(?:over|above|at least|min(?:imum)?|more than)\s*(\d+)\s*g?\s*(?:of\s+)?fiber\b",
        r"\b(\d+)\s*g?\s*fiber\s*(?:or more|minimum|min)?\b",
    ], text)
    intent["max_fat"] = _first_number([
        r"\b(?:under|below|less than|max(?:imum)?|no more than|at most)\s*(\d+)\s*g?\s*(?:of\s+)?fat\b",
        r"\b(\d+)\s*g?\s*fat\s*(?:or less|and under|max)\b",
    ], text)
    intent["max_carbohydrates"] = _first_number([
        r"\b(?:under|below|less than|max(?:imum)?|no more than|at most)\s*(\d+)\s*g?\s*(?:carbs|carbohydrates)\b",
        r"\b(\d+)\s*g?\s*(?:carbs|carbohydrates)\s*(?:or less|and under|max)\b",
    ], text)


def _first_number(patterns, text):
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return int(match.group(1))
    return None


def _parse_soft_preferences(text, intent):
    if re.search(r"\b(low calorie|low calories|low cal|light|lighter|healthy|lean)\b", text):
        intent["soft_preferences"].add("low_calorie")
    if re.search(r"\b(high protein|protein|post workout|recovery)\b", text):
        intent["soft_preferences"].add("high_protein")
    if re.search(r"\b(high fiber|fiber|filling|satiating|full)\b", text):
        intent["soft_preferences"].add("high_fiber")
    if re.search(r"\b(low sodium|heart healthy)\b", text):
        intent["soft_preferences"].add("low_sodium")
    if re.search(r"\b(low fat|lean)\b", text):
        intent["soft_preferences"].add("low_fat")
    if re.search(r"\b(low carb|low carbohydrate)\b", text):
        intent["soft_preferences"].add("low_carb")
    if re.search(r"\b(filling|satiating|full)\b", text):
        intent["soft_preferences"].add("filling")
    if re.search(r"\b(vegetable|vegetables|veggie|veggies|greens|salad|plant forward|plant based)\b", text):
        intent["soft_preferences"].add("plant_forward")
    if re.search(r"\b(healthy|balanced)\b", text):
        intent["soft_preferences"].update({"low_calorie", "high_fiber", "low_sodium"})
    if intent["max_calories"] is not None:
        intent["soft_preferences"].add("low_calorie")
    if intent["min_protein"] is not None:
        intent["soft_preferences"].add("high_protein")
    if intent["max_sodium"] is not None:
        intent["soft_preferences"].add("low_sodium")
    if intent["min_fiber"] is not None:
        intent["soft_preferences"].add("high_fiber")
    if intent["max_fat"] is not None:
        intent["soft_preferences"].add("low_fat")
    if intent["max_carbohydrates"] is not None:
        intent["soft_preferences"].add("low_carb")


def _dish_matches_hard_filters(dish, intent):
    if _has_numeric_hard_filter(intent) and not _has_nutrition_data(dish):
        return False

    if intent["meal_period"] and intent["meal_period"] not in _normalize_text(dish.meal_period or ""):
        return False

    for required_flag in intent["required_flags"]:
        if not _dish_has_dietary_flag(dish, required_flag):
            return False

    dish_allergens = _normalized_allergens(dish)
    if intent["excluded_allergens"] and dish_allergens.intersection(intent["excluded_allergens"]):
        return False

    if intent["max_calories"] is not None and _number(dish.calories) > intent["max_calories"]:
        return False
    if intent["min_calories"] is not None and _number(dish.calories) < intent["min_calories"]:
        return False
    if intent["min_protein"] is not None and _number(dish.protein) < intent["min_protein"]:
        return False
    if intent["max_sodium"] is not None and _number(dish.sodium) > intent["max_sodium"]:
        return False
    if intent["min_fiber"] is not None and _number(dish.fiber) < intent["min_fiber"]:
        return False
    if intent["max_fat"] is not None and _number(dish.fat) > intent["max_fat"]:
        return False
    if (
        intent["max_carbohydrates"] is not None
        and _number(dish.carbohydrates) > intent["max_carbohydrates"]
    ):
        return False

    return True


def _apply_db_safe_filters(qs, intent):
    """Push portable scalar filters into SQL before loading embedding blobs."""
    if intent["meal_period"]:
        qs = qs.filter(meal_period__icontains=intent["meal_period"])
    if intent["max_calories"] is not None:
        qs = qs.filter(calories__lte=intent["max_calories"])
    if intent["min_calories"] is not None:
        qs = qs.filter(calories__gte=intent["min_calories"])
    if intent["min_protein"] is not None:
        qs = qs.filter(protein__gte=intent["min_protein"])
    if intent["max_sodium"] is not None:
        qs = qs.filter(sodium__lte=intent["max_sodium"])
    if intent["min_fiber"] is not None:
        qs = qs.filter(fiber__gte=intent["min_fiber"])
    if intent["max_fat"] is not None:
        qs = qs.filter(fat__lte=intent["max_fat"])
    if intent["max_carbohydrates"] is not None:
        qs = qs.filter(carbohydrates__lte=intent["max_carbohydrates"])
    return qs


def _base_candidate_queryset(hall_id):
    from django.utils import timezone
    from mealPlanning.models import Dish

    today = timezone.localdate()
    qs = Dish.objects.filter(last_seen=today).exclude(embedding=None)
    if hall_id is not None:
        qs = qs.filter(dining_hall_id=hall_id)

    if qs.only("dish_id").exists():
        return qs.order_by("dish_id"), False

    qs = Dish.objects.exclude(embedding=None)
    if hall_id is not None:
        qs = qs.filter(dining_hall_id=hall_id)
    return qs.order_by("-last_seen", "dish_id"), True


def _candidate_dishes(hall_id, intent):
    base_qs, using_date_fallback = _base_candidate_queryset(hall_id)
    if not base_qs.only("dish_id").exists():
        return [], using_date_fallback, False

    sql_filtered_qs = _apply_db_safe_filters(base_qs, intent)
    using_relaxed_constraints = bool(intent["has_hard_filters"] and not sql_filtered_qs.only("dish_id").exists())
    qs = base_qs if using_relaxed_constraints else sql_filtered_qs
    qs = qs.only(*SEARCH_FIELDS)[:MAX_CANDIDATES]

    dishes = list(qs.iterator(chunk_size=100))
    python_filtered = [dish for dish in dishes if _dish_matches_hard_filters(dish, intent)]
    if python_filtered:
        return python_filtered, using_date_fallback, using_relaxed_constraints

    if intent["has_hard_filters"]:
        return dishes, using_date_fallback, True

    return dishes, using_date_fallback, using_relaxed_constraints


def _has_numeric_hard_filter(intent):
    return any(
        intent[key] is not None
        for key in (
            "max_calories",
            "min_calories",
            "min_protein",
            "max_sodium",
            "min_fiber",
            "max_fat",
            "max_carbohydrates",
        )
    )


def _has_nutrition_data(dish):
    if dish.nutrition_source:
        return True
    return any([
        _number(dish.calories) > 0,
        _number(dish.protein) > 0,
        _number(dish.carbohydrates) > 0,
        _number(dish.fat) > 0,
        _number(dish.fiber) > 0,
        _number(dish.sodium) > 0,
    ])


def _dish_has_dietary_flag(dish, flag):
    flags = {_normalize_text(value) for value in (dish.dietary_flags or [])}
    if flag == "vegetarian":
        return "vegetarian" in flags or "vegan" in flags
    return flag in flags


def _normalized_allergens(dish):
    normalized = set()
    for allergen in dish.allergens or []:
        value = _normalize_text(str(allergen))
        normalized.add(value)
        for canonical, synonyms in ALLERGEN_SYNONYMS.items():
            if value in synonyms:
                normalized.add(canonical)
    return normalized


def _number(value):
    if value is None:
        return 0
    return float(value)


def _score_weights(intent):
    if not intent["has_structured_intent"]:
        return {
            "semantic": 0.85,
            "nutrition": 0.00,
            "lexical": 0.15,
            "dietary": 0.00,
        }

    if _has_nutrition_intent(intent):
        return {
            "semantic": 0.35,
            "nutrition": 0.45,
            "lexical": 0.10,
            "dietary": 0.10,
        }

    if intent["required_flags"] or intent["excluded_allergens"]:
        return {
            "semantic": 0.40,
            "nutrition": 0.10,
            "lexical": 0.15,
            "dietary": 0.35,
        }
 

    return {
        "semantic": 0.55,
        "nutrition": 0.15,
        "lexical": 0.20,
        "dietary": 0.10,
    }


def _has_nutrition_intent(intent):
    nutrition_preferences = {
        "low_calorie", "high_protein", "high_fiber", "low_sodium",
        "low_fat", "low_carb", "filling",
    }
    return bool(intent["soft_preferences"].intersection(nutrition_preferences))


def _score_dish(dish, intent, semantic_score, constraints_relaxed=False):
    semantic_component = max(0.0, float(semantic_score))
    nutrition_score, nutrition_reasons = _nutrition_fit(dish, intent)
    lexical_score, lexical_reasons = _lexical_fit(dish, intent)
    dietary_score, dietary_reasons = _dietary_fit(dish, intent)
    weights = _score_weights(intent)

    final_score = (
        weights["semantic"] * semantic_component
        + weights["nutrition"] * nutrition_score
        + weights["lexical"] * lexical_score
        + weights["dietary"] * dietary_score
    )

    reasons = []
    if constraints_relaxed:
        reasons.append("No exact constraint match; showing closest options")
    if semantic_component >= 0.45:
        reasons.append("Semantically close to your search")
    reasons.extend(nutrition_reasons)
    reasons.extend(dietary_reasons)
    reasons.extend(lexical_reasons)

    return {
        "score": round(float(final_score), 6),
        "semantic_score": round(float(semantic_score), 6),
        "nutrition_score": round(float(nutrition_score), 6),
        "lexical_score": round(float(lexical_score), 6),
        "dietary_score": round(float(dietary_score), 6),
        "match_reasons": _dedupe_reasons(reasons)[:4],
        "constraints_relaxed": constraints_relaxed,
    }


def _nutrition_fit(dish, intent):
    preferences = intent["soft_preferences"]
    scores = []
    reasons = []

    if "low_calorie" in preferences:
        calories = _number(dish.calories)
        scores.append(_low_is_better(calories, ideal=400, worst=800))
        if 0 < calories <= 400:
            reasons.append(f"Low calorie: {int(calories)} calories")
    if "high_protein" in preferences:
        protein = _number(dish.protein)
        scores.append(min(protein / 25.0, 1.0))
        if protein >= 20:
            reasons.append(f"High protein: {int(protein)}g")
    if "high_fiber" in preferences:
        fiber = _number(dish.fiber)
        scores.append(min(fiber / 8.0, 1.0))
        if fiber >= 5:
            reasons.append(f"High fiber: {fiber:g}g")
    if "low_sodium" in preferences:
        sodium = _number(dish.sodium)
        scores.append(_low_is_better(sodium, ideal=500, worst=1200))
        if 0 < sodium <= 500:
            reasons.append(f"Low sodium: {sodium:g}mg")
    if "low_fat" in preferences:
        fat = _number(dish.fat)
        scores.append(_low_is_better(fat, ideal=10, worst=30))
        if 0 < fat <= 10:
            reasons.append(f"Low fat: {int(fat)}g")
    if "low_carb" in preferences:
        carbs = _number(dish.carbohydrates)
        scores.append(_low_is_better(carbs, ideal=30, worst=80))
        if 0 < carbs <= 30:
            reasons.append(f"Lower carb: {int(carbs)}g")
    if "filling" in preferences:
        protein_score = min(_number(dish.protein) / 25.0, 1.0)
        fiber_score = min(_number(dish.fiber) / 8.0, 1.0)
        scores.append((protein_score + fiber_score) / 2.0)
        if protein_score >= 0.8 or fiber_score >= 0.6:
            reasons.append("Filling protein/fiber profile")

    if not scores:
        return 0.0, reasons
    return float(np.mean(scores)), reasons


def _low_is_better(value, *, ideal, worst):
    value = float(value)
    if value <= 0:
        return 0.0
    if value <= ideal:
        return 1.0
    if value >= worst:
        return 0.0
    return (worst - value) / (worst - ideal)


def _lexical_fit(dish, intent):
    terms = [term for term in intent["terms"] if not term.isdigit()]
    if not terms:
        return 0.0, []

    dish_terms = set(_tokenize(dish_text(dish)))
    matched = sorted({term for term in terms if term in dish_terms})
    if not matched:
        return 0.0, []

    score = min(len(matched) / max(len(set(terms)), 1), 1.0)
    return score, [f"Text match: {', '.join(matched[:3])}"]


def _dietary_fit(dish, intent):
    scores = []
    reasons = []

    for flag in intent["required_flags"]:
        if _dish_has_dietary_flag(dish, flag):
            scores.append(1.0)
            reasons.append(flag.title())
        else:
            scores.append(0.0)

    if intent["excluded_allergens"]:
        dish_allergens = _normalized_allergens(dish)
        if not dish_allergens.intersection(intent["excluded_allergens"]):
            scores.append(1.0)
            excluded = [
                ALLERGEN_DISPLAY.get(allergen, allergen.title())
                for allergen in sorted(intent["excluded_allergens"])
            ]
            reasons.append(f"No listed {', '.join(excluded[:2])} allergen")
        else:
            scores.append(0.0)

    if "plant_forward" in intent["soft_preferences"]:
        text = _normalize_text(dish_text(dish))
        plant_terms = ("vegetable", "veggie", "greens", "salad", "plant", "vegan", "vegetarian")
        plant_score = 1.0 if any(term in text for term in plant_terms) else 0.0
        if _dish_has_dietary_flag(dish, "vegetarian"):
            plant_score = max(plant_score, 0.8)
        scores.append(plant_score)
        if plant_score > 0:
            reasons.append("Plant-forward match")

    if intent["meal_period"]:
        meal_match = intent["meal_period"] in _normalize_text(dish.meal_period or "")
        scores.append(1.0 if meal_match else 0.0)
        if meal_match:
            reasons.append(f"{intent['meal_period'].title()} option")

    if not scores:
        return 0.0, reasons
    return float(np.mean(scores)), reasons


def _dedupe_reasons(reasons):
    deduped = []
    seen = set()
    for reason in reasons:
        if reason and reason not in seen:
            deduped.append(reason)
            seen.add(reason)
    return deduped


def search(query, hall_id=None, top_k=10):
    """
    Semantic search over today's dishes.
    Returns a ranked list of dish dicts with an added 'score' field.
    """
    if not query or not query.strip():
        return []

    intent = parse_query_intent(query)
    dishes, using_date_fallback, constraints_relaxed = _candidate_dishes(hall_id, intent)
    if not dishes:
        return []

    # Build embedding matrix
    vecs = []
    valid_dishes = []
    for dish in dishes:
        try:
            vec = _load_current_vector(dish.embedding)
            vecs.append(vec)
            valid_dishes.append(dish)
        except Exception as exc:
            logger.warning("Could not decode embedding for dish %s: %s", dish.dish_id, exc)

    if not vecs:
        return []

    matrix = np.stack(vecs)                                         # (N, D)
    query_vec = _encode(intent["semantic_query"])                    # (D,)
    semantic_scores = matrix @ query_vec                             # cosine similarity

    scored = []
    for idx, semantic_score in enumerate(semantic_scores):
        dish = valid_dishes[int(idx)]
        score_info = _score_dish(
            dish,
            intent,
            semantic_score,
            constraints_relaxed=constraints_relaxed,
        )
        scored.append((score_info["score"], idx, score_info))

    scored.sort(key=lambda item: item[0], reverse=True)
    thresholded = [item for item in scored if item[0] >= MIN_SCORE]
    is_plant_forward = "plant_forward" in intent["soft_preferences"]
    if not thresholded and (constraints_relaxed or is_plant_forward):
        thresholded = scored
    scored = thresholded[:top_k]

    results = []
    for _, idx, score_info in scored:
        dish = valid_dishes[int(idx)]
        result = {
            "dish_id": dish.dish_id,
            "dish_name": dish.dish_name,
            "score": score_info["score"],
            "semantic_score": score_info["semantic_score"],
            "nutrition_score": score_info["nutrition_score"],
            "lexical_score": score_info["lexical_score"],
            "dietary_score": score_info["dietary_score"],
            "match_reasons": score_info["match_reasons"],
            "constraints_relaxed": score_info["constraints_relaxed"],
            "using_date_fallback": using_date_fallback,
            "calories": dish.calories,
            "protein": dish.protein,
            "carbohydrates": dish.carbohydrates,
            "fat": dish.fat,
            "fiber": float(dish.fiber) if dish.fiber is not None else None,
            "sodium": float(dish.sodium) if dish.sodium is not None else None,
            "category": dish.category,
            "allergens": dish.allergens,
            "dietary_flags": dish.dietary_flags,
            "serving_unit": dish.serving_unit,
            "serving_size": dish.serving_size,
            "course": dish.course,
            "meal_period": dish.meal_period,
            "nutrition_source": dish.nutrition_source,
            "ai_confidence": dish.ai_confidence,
        }
        results.append(result)

    return results
