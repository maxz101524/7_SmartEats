"""
Local LLM service using stabilityai/stablelm-2-zephyr-1_6b for calorie/macro estimation.

The model is lazy-loaded on first request and kept in memory for subsequent calls.
Uses zero-shot prompting (fastest, ~2s inference time).

Set USE_LOCAL_LLM=true in your environment to enable the real model.
On memory-constrained hosts (e.g. Render free tier), omit it to use the
Mifflin-St Jeor fallback instead.
"""

import logging
import os
import re
import time

logger = logging.getLogger(__name__)

MODEL_ID = "stabilityai/stablelm-2-zephyr-1_6b"

# Load real model by default (instructor testing). Set USE_LOCAL_LLM=false on Render.
USE_LOCAL_LLM = os.environ.get("USE_LOCAL_LLM", "true").lower() not in ("false", "0", "no")

# Conditional imports — only pull in torch/transformers when actually needed
if USE_LOCAL_LLM:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

# Singleton model + tokenizer (lazy-loaded)
_model = None
_tokenizer = None


# ── Activity level multipliers (Mifflin-St Jeor standard) ──────────────────

ACTIVITY_MULTIPLIERS = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}

# ── Goal calorie adjustments ────────────────────────────────────────────────

GOAL_ADJUSTMENTS = {
    "fat_loss": -500,
    "muscle_gain": 300,
    "maintain": 0,
}

# ── Macro ratios by goal (protein%, carbs%, fat%) ───────────────────────────

MACRO_RATIOS = {
    "fat_loss":     {"protein": 0.35, "carbs": 0.35, "fat": 0.30},
    "muscle_gain":  {"protein": 0.30, "carbs": 0.45, "fat": 0.25},
    "maintain":     {"protein": 0.25, "carbs": 0.50, "fat": 0.25},
}


def _load_model():
    """Lazy-load model and tokenizer as singletons."""
    global _model, _tokenizer

    if _model is not None and _tokenizer is not None:
        return _model, _tokenizer

    logger.info("Loading local LLM: %s", MODEL_ID)
    start = time.time()

    _tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=False)
    _model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float16,
        trust_remote_code=False,
    )

    elapsed = round(time.time() - start, 2)
    logger.info("Model loaded in %.2fs", elapsed)
    return _model, _tokenizer


def _build_zero_shot_prompt(age, sex, weight_kg, height_cm):
    """Build the zero-shot prompt as proven in the notebook."""
    sex_label = "man" if sex == "male" else "woman"
    return (
        f"How many calories does a {age}-year-old {sex_label} "
        f"who weighs {weight_kg}kg and is {height_cm} cm tall need per day?\n"
        "Respond in this exact format:\n"
        "BMR: X kcal\n"
        "TDEE (sedentary): X kcal\n"
        "TDEE (moderately active): X kcal\n"
        "TDEE (very active): X kcal\n\n"
        "Output:\n"
    )


def _parse_llm_response(text):
    """Parse BMR and TDEE values from the model's structured response."""
    result = {}

    bmr_match = re.search(r"BMR:\s*([\d,]+)\s*kcal", text)
    if bmr_match:
        result["bmr"] = int(bmr_match.group(1).replace(",", ""))

    sedentary_match = re.search(r"TDEE\s*\(sedentary\):\s*([\d,]+)\s*kcal", text)
    if sedentary_match:
        result["tdee_sedentary"] = int(sedentary_match.group(1).replace(",", ""))

    moderate_match = re.search(r"TDEE\s*\(moderately active\):\s*([\d,]+)\s*kcal", text)
    if moderate_match:
        result["tdee_moderate"] = int(moderate_match.group(1).replace(",", ""))

    active_match = re.search(r"TDEE\s*\(very active\):\s*([\d,]+)\s*kcal", text)
    if active_match:
        result["tdee_active"] = int(active_match.group(1).replace(",", ""))

    return result


def _fallback_mifflin(age, sex, weight_kg, height_cm):
    """
    Mifflin-St Jeor fallback if the LLM fails to produce parseable output.
    This ensures the endpoint always returns useful data.
    """
    if sex == "male":
        bmr = round(10 * weight_kg + 6.25 * height_cm - 5 * age + 5)
    else:
        bmr = round(10 * weight_kg + 6.25 * height_cm - 5 * age - 161)

    return {
        "bmr": bmr,
        "tdee_sedentary": round(bmr * 1.2),
        "tdee_moderate": round(bmr * 1.55),
        "tdee_active": round(bmr * 1.9),
    }


def _pick_tdee(parsed, activity_level):
    """Select the appropriate TDEE based on activity level."""
    mapping = {
        "sedentary": "tdee_sedentary",
        "light": "tdee_sedentary",       # closest available
        "moderate": "tdee_moderate",
        "active": "tdee_active",
        "very_active": "tdee_active",    # closest available
    }
    key = mapping.get(activity_level, "tdee_moderate")
    return parsed.get(key, parsed.get("tdee_moderate", 2000))


def estimate_daily_nutrition(age, sex, weight_kg, height_cm, activity_level, goal):
    """
    Estimate daily calorie and macro needs using the local LLM.

    Returns a dict with bmr, tdee, recommended_calories, macros, and metadata.
    Falls back to Mifflin-St Jeor calculation if the LLM fails.
    """
    used_fallback = False

    if not USE_LOCAL_LLM:
        # Skip model loading on memory-constrained hosts (Render free tier)
        logger.info("USE_LOCAL_LLM is disabled, using Mifflin-St Jeor fallback")
        parsed = _fallback_mifflin(age, sex, weight_kg, height_cm)
        used_fallback = True
    else:
        try:
            model, tokenizer = _load_model()

            prompt = _build_zero_shot_prompt(age, sex, weight_kg, height_cm)
            inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

            start = time.time()
            with torch.no_grad():
                outputs = model.generate(**inputs, max_new_tokens=200)
            inference_time = round(time.time() - start, 2)

            response_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
            logger.info("LLM response (%.2fs): %s", inference_time, response_text[:300])

            parsed = _parse_llm_response(response_text)

            # Validate parsed output — need at least BMR and one TDEE
            if "bmr" not in parsed or not any(
                k in parsed for k in ("tdee_sedentary", "tdee_moderate", "tdee_active")
            ):
                logger.warning("LLM output incomplete, falling back to Mifflin-St Jeor")
                parsed = _fallback_mifflin(age, sex, weight_kg, height_cm)
                used_fallback = True

        except Exception as exc:
            logger.error("LLM inference failed: %s", exc)
            parsed = _fallback_mifflin(age, sex, weight_kg, height_cm)
            used_fallback = True

    # Select TDEE for the chosen activity level
    tdee = _pick_tdee(parsed, activity_level)

    # Apply goal adjustment
    adjustment = GOAL_ADJUSTMENTS.get(goal, 0)
    recommended_calories = max(1200, tdee + adjustment)  # Safety floor

    # Compute macros
    ratios = MACRO_RATIOS.get(goal, MACRO_RATIOS["maintain"])
    macros = {
        "protein_g": round(recommended_calories * ratios["protein"] / 4),
        "carbs_g": round(recommended_calories * ratios["carbs"] / 4),
        "fat_g": round(recommended_calories * ratios["fat"] / 9),
    }

    return {
        "bmr": parsed.get("bmr", 0),
        "tdee": tdee,
        "recommended_calories": recommended_calories,
        "macros": macros,
        "activity_level": activity_level,
        "goal": goal,
        "model": MODEL_ID,
        "used_fallback": used_fallback,
    }
