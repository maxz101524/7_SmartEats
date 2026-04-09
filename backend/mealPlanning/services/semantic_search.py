import logging
import pickle

import numpy as np

logger = logging.getLogger(__name__)

MODEL_NAME = "sentence-transformers/all-mpnet-base-v2"
_model = None


def _get_model():
    global _model
    if _model is None:
        import torch
        from sentence_transformers import SentenceTransformer
        device = "mps" if torch.backends.mps.is_available() else "cpu"
        logger.info("Loading embedding model %s on %s", MODEL_NAME, device)
        _model = SentenceTransformer(MODEL_NAME, device=device)
    return _model


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
    """Encode text to a normalized 768-dim vector and return as pickled bytes."""
    model = _get_model()
    vec = model.encode(text, normalize_embeddings=True).astype(np.float32)
    return pickle.dumps(vec)


def decode_from_bytes(blob):
    """Deserialize a stored embedding blob back to a numpy array."""
    return pickle.loads(bytes(blob))


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
            if np.linalg.norm(vec) > 0:
                vecs.append(vec)
                valid_dishes.append(dish)
        except Exception as exc:
            logger.warning("Could not decode embedding for dish %s: %s", dish.dish_id, exc)

    if not vecs:
        return []

    matrix = np.stack(vecs)                                         # (N, D)
    model = _get_model()
    query_vec = model.encode(query.strip(), normalize_embeddings=True).astype(np.float32)  # (D,)
    scores = matrix @ query_vec                                     # cosine similarity

    top_indices = np.argsort(scores)[::-1][:top_k]

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
