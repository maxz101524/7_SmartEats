import logging
import os
import pickle

import numpy as np

logger = logging.getLogger(__name__)

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
HF_API_URL = f"https://api-inference.huggingface.co/models/{MODEL_NAME}"
EMBEDDING_DIM = 384
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

    vec = np.array(result, dtype=np.float32)
    if vec.ndim > 1:
        vec = vec[0]  # flatten if nested

    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    return vec


def _encode(text):
    """
    Encode text to a normalized 384-dim float32 vector.
    Routes to local model (dev) or HF Inference API (production).
    """
    if _use_local_model():
        return _get_model().encode(text, normalize_embeddings=True).astype(np.float32)
    return _encode_via_hf_api(text)


def dish_text(dish):
    """Build a plain-text representation of a dish for embedding."""
    parts = [dish.dish_name]
    if dish.category:
        parts.append(dish.category)
    if dish.dietary_flags:
        parts.extend(dish.dietary_flags)
    if dish.allergens:
        parts.extend(dish.allergens)
    return " ".join(parts)


def encode_to_bytes(text):
    """Encode text to a normalized 384-dim vector and return as pickled bytes."""
    vec = _encode(text)
    return pickle.dumps(vec)


def decode_from_bytes(blob):
    """Deserialize a stored embedding blob back to a numpy array."""
    return pickle.loads(bytes(blob))


def is_current_embedding(vec):
    """Return True when an embedding matches the active model's vector shape."""
    return isinstance(vec, np.ndarray) and vec.ndim == 1 and vec.shape[0] == EMBEDDING_DIM


def embedding_blob_needs_refresh(blob):
    """Return True when an embedding is missing, invalid, or from an older model."""
    if blob is None:
        return True
    try:
        vec = decode_from_bytes(blob)
    except Exception:
        return True
    return not is_current_embedding(vec)


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
            vec = decode_from_bytes(dish.embedding)
            if not is_current_embedding(vec):
                logger.info(
                    "Skipping stale embedding for dish %s; expected %s-dim vector",
                    dish.dish_id,
                    EMBEDDING_DIM,
                )
                continue
            if np.linalg.norm(vec) > 0:
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
