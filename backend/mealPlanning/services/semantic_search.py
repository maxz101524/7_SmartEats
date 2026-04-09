import logging
import os
import pickle

import numpy as np

logger = logging.getLogger(__name__)

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
HF_API_URL = f"https://api-inference.huggingface.co/models/{MODEL_NAME}"
EMBEDDING_DIM = 384
EMBEDDING_SCHEMA_VERSION = 2
EMBEDDING_ENCODER = "normalized-sentence-embedding"
MIN_SCORE = 0.30
_model = None


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
    """Return True when at least one stored dish embedding is usable by search."""
    from mealPlanning.models import Dish

    qs = Dish.objects.exclude(embedding=None)
    if hall_id is not None:
        qs = qs.filter(dining_hall_id=hall_id)
    return any(
        not embedding_blob_needs_refresh(blob)
        for blob in qs.values_list("embedding", flat=True)
    )


def search(query, hall_id=None, top_k=10):
    """
    Semantic search over today's dishes.
    Returns a ranked list of dish dicts with an added 'score' field.
    """
    from datetime import date
    from mealPlanning.models import Dish

    if not query or not query.strip():
        return []

    today = date.today()
    qs = Dish.objects.filter(last_seen=today).exclude(embedding=None)
    if hall_id is not None:
        qs = qs.filter(dining_hall_id=hall_id)

    dishes = list(qs)
    if not dishes:
        # Fallback: use all embedded dishes when none have today's date
        # (handles local dev / demo without requiring a daily scrape)
        qs = Dish.objects.exclude(embedding=None)
        if hall_id is not None:
            qs = qs.filter(dining_hall_id=hall_id)
        dishes = list(qs)
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
    query_vec = _encode(query.strip())                               # (D,)
    scores = matrix @ query_vec                                     # cosine similarity

    top_indices = np.argsort(scores)[::-1][:top_k]

    # Drop results below the relevance threshold — prevents weak matches from flooding results
    top_indices = [i for i in top_indices if scores[i] >= MIN_SCORE]

    results = []
    for idx in top_indices:
        dish = valid_dishes[int(idx)]
        results.append({
            "dish_id": dish.dish_id,
            "dish_name": dish.dish_name,
            "score": float(scores[idx]),
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
        })

    return results
