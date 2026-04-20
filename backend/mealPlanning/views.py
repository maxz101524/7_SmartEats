from django.shortcuts import get_object_or_404, render

import json
import logging
import time
from decimal import Decimal

logger = logging.getLogger(__name__)
import requests as http_requests
from  django.http import HttpResponse, JsonResponse
from django.views import View
from .models import (
    AIAnalyticsEvent,
    DailyRecommendationSnapshot,
    DiningHall,
    Dish,
    Meal,
    TempMeal,
    TempMealItem,
    UserProfile,
    ensure_user_profile,
)
from django.db.models import Q, Prefetch, Sum, Count
from django.db.models.functions import Coalesce
from io import BytesIO
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import base64
from datetime import datetime
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
import io
from datetime import timedelta

from django.forms.models import model_to_dict
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from django.utils.decorators import method_decorator
from django.contrib.auth import authenticate
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from rest_framework import status
from django.utils.timezone import now
import csv
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
# Create your views here.

#for google auth
from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.providers.oauth2.client import OAuth2Client
from dj_rest_auth.registration.views import SocialLoginView
from rest_framework.decorators import api_view
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests
import os
from django.conf import settings
from allauth.socialaccount.models import SocialAccount
from mealPlanning.services.uiuc_dining import DINING_OPTIONS
from mealPlanning.services.uiuc_hours import compute_status, fetch_hours_html, parse_hours_rows


def _get_user_from_token(request):
    """
    Extract authenticated User from `Authorization: Token <key>` header.
    Returns None if missing/invalid. Used by plain Django Views that don't
    have DRF's authentication plumbing.
    """
    from rest_framework.authtoken.models import Token
    auth_header = request.META.get("HTTP_AUTHORIZATION", "")
    if not auth_header.startswith("Token "):
        return None
    key = auth_header.split(" ", 1)[1].strip()
    try:
        return Token.objects.select_related("user").get(key=key).user
    except Token.DoesNotExist:
        return None

ANALYTICS_INPUT_RATE_PER_MILLION = Decimal("0.15")
ANALYTICS_OUTPUT_RATE_PER_MILLION = Decimal("0.60")


def _bucket_for_prompt_chars(prompt_chars):
    if prompt_chars <= 50:
        return "0-50"
    if prompt_chars <= 150:
        return "51-150"
    if prompt_chars <= 300:
        return "151-300"
    return "301+"


def _estimate_tokens_from_text(text):
    # Lightweight fallback approximation: ~4 characters per token.
    chars = len(str(text or "").strip())
    if chars == 0:
        return 0
    return max(1, round(chars / 4))


def _estimate_cost_usd(prompt_tokens, completion_tokens):
    prompt_millions = Decimal(prompt_tokens) / Decimal("1000000")
    completion_millions = Decimal(completion_tokens) / Decimal("1000000")
    return (
        (prompt_millions * ANALYTICS_INPUT_RATE_PER_MILLION)
        + (completion_millions * ANALYTICS_OUTPUT_RATE_PER_MILLION)
    )


def _infer_intent_label(message):
    lower = str(message or "").lower()
    if any(term in lower for term in ("protein", "post-workout", "muscle", "macro")):
        return "high_protein"
    if any(term in lower for term in ("vegetarian", "vegan", "plant")):
        return "vegetarian"
    if any(term in lower for term in ("allergy", "allergen", "gluten", "dairy", "peanut", "nut")):
        return "allergy"
    if any(term in lower for term in ("low carb", "carb", "keto")):
        return "low_carb"
    if any(term in lower for term in ("calorie", "under", "light")):
        return "calorie_control"
    return "general"


def _recommendation_context_signature(goal, dietary_flags):
    return json.dumps({
        "goal": goal or "maintain",
        "dietary_flags": dietary_flags or [],
    }, sort_keys=True)


def _serialize_meal(meal):
    dishes = list(meal.contain_dish.all())
    return {
        "meal_id": meal.meal_id,
        "category": meal.category,
        "total_calories": meal.total_calories,
        "total_protein": meal.total_protein,
        "total_carbohydrates": meal.total_carbohydrates,
        "total_fat": meal.total_fat,
        "date": meal.date.isoformat(),
        "dishes": [
            {
                "dish_id": dish.dish_id,
                "dish_name": dish.dish_name,
                "hall_name": dish.dining_hall.name,
            }
            for dish in dishes
        ],
    }


def _derive_meal_category(dishes):
    for field_name in ("meal_period", "category", "course"):
        for dish in dishes:
            value = getattr(dish, field_name, "")
            if value:
                return value
    return "Logged Meal"


def _sanitize_tray_context(raw_tray_context):
    if not isinstance(raw_tray_context, dict):
        return None

    raw_items = raw_tray_context.get("items", [])
    items = []
    if isinstance(raw_items, list):
        for raw_item in raw_items[:8]:
            if not isinstance(raw_item, dict):
                continue

            dish_name = str(raw_item.get("dish_name", "")).strip()
            if not dish_name:
                continue

            try:
                quantity = max(1, int(raw_item.get("quantity", 1)))
            except (TypeError, ValueError):
                quantity = 1

            items.append({
                "dish_id": raw_item.get("dish_id"),
                "dish_name": dish_name,
                "hall": str(raw_item.get("hall", "")).strip(),
                "quantity": quantity,
                "calories": int(raw_item.get("calories") or 0),
                "protein": int(raw_item.get("protein") or 0),
                "carbohydrates": int(raw_item.get("carbohydrates") or 0),
                "fat": int(raw_item.get("fat") or 0),
                "serving_size": str(raw_item.get("serving_size", "")).strip(),
            })

    totals = raw_tray_context.get("totals", {})
    if not isinstance(totals, dict):
        totals = {}

    try:
        item_count = int(raw_tray_context.get("item_count", 0))
    except (TypeError, ValueError):
        item_count = 0

    try:
        unique_dishes = int(raw_tray_context.get("unique_dishes", len(items)))
    except (TypeError, ValueError):
        unique_dishes = len(items)

    return {
        "item_count": item_count,
        "unique_dishes": unique_dishes,
        "totals": {
            "calories": int(totals.get("calories") or 0),
            "protein": int(totals.get("protein") or 0),
            "carbohydrates": int(totals.get("carbohydrates") or 0),
            "fat": int(totals.get("fat") or 0),
        },
        "items": items,
    }


def _generate_recommendation_payload(goal, dietary_flags, today):
    from mealPlanning.services.gemini_client import _get_client

    dishes = list(
        Dish.objects
        .filter(last_seen=today)
        .select_related("dining_hall")[:30]
    )
    if not dishes:
        dishes = list(
            Dish.objects
            .select_related("dining_hall")
            .order_by("-protein", "dish_name")[:30]
        )

    dish_list = [
        {
            "dish_id": d.dish_id,
            "name": d.dish_name,
            "hall": d.dining_hall.name,
            "calories": d.calories,
            "protein": d.protein,
            "carbs": d.carbohydrates,
            "fat": d.fat,
            "meal_period": d.meal_period,
            "dietary_flags": d.dietary_flags,
        }
        for d in dishes
    ]

    prompt = (
        "You are a university dining nutrition advisor. "
        f"The student's goal is: {goal or 'maintain'}. "
        f"Preferred dietary flags: {', '.join(dietary_flags) if dietary_flags else 'none'}.\n"
        "Here are today's available dishes:\n"
        f"{json.dumps(dish_list, indent=2)}\n\n"
        "Recommend exactly 3 dishes and explain why in one sentence each. "
        "Also provide one short pro-tip about their nutrition today. "
        "Respond ONLY with valid JSON in this exact format:\n"
        '{"recommendations": [{"dish_id": N, "dish_name": "...", "hall_name": "...", '
        '"reason": "...", "calories": N, "meal_period": "..."}], "tip": "..."}'
    )

    try:
        client = _get_client()
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
        if text.startswith("json"):
            text = text[4:]
        result = json.loads(text.strip())
        return {
            "recommendations": result.get("recommendations", []),
            "tip": result.get("tip", ""),
        }
    except Exception:
        fallback = sorted(dish_list, key=lambda d: d["protein"], reverse=True)[:3]
        return {
            "recommendations": [
                {
                    "dish_id": d["dish_id"],
                    "dish_name": d["name"],
                    "hall_name": d["hall"],
                    "reason": "High in protein",
                    "calories": d["calories"],
                    "meal_period": d["meal_period"],
                }
                for d in fallback
            ],
            "tip": "Try to hit your protein goal today — it helps with recovery and focus.",
        }




class GoogleLogin(APIView):
    def post(self, request):
        """
        Handle Google ID token authentication.
        Expected payload: {"id_token": "<google_id_token>"}
        """
        id_token_str = request.data.get('id_token')
        
        if not id_token_str:
            return Response(
                {"error": "id_token is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Verify the Google ID token
            idinfo = google_id_token.verify_oauth2_token(
                id_token_str, 
                requests.Request()
            )
            
            # Verify token audience in environments where client ID is configured.
            client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
            if client_id and idinfo.get("aud") != client_id:
                return Response(
                    {"error": "Google token audience mismatch"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            
            email = idinfo.get('email')
            first_name = idinfo.get('given_name', '')
            last_name = idinfo.get('family_name', '')
            
            if not email:
                return Response(
                    {"error": "Email not found in token"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Get or create user
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    'username': email,
                    'first_name': first_name,
                    'last_name': last_name,
                }
            )
            if not created:
                updated_fields = []
                if first_name and not user.first_name:
                    user.first_name = first_name
                    updated_fields.append("first_name")
                if last_name and not user.last_name:
                    user.last_name = last_name
                    updated_fields.append("last_name")
                if updated_fields:
                    user.save(update_fields=updated_fields)

            ensure_user_profile(user)
            
            # Get or create token
            token, _ = Token.objects.get_or_create(user=user)
            
            return Response({
                'key': token.key,
                'user': {
                    'id': user.id,
                    'email': user.email,
                    'first_name': user.first_name,
                    'last_name': user.last_name,
                }
            }, status=status.HTTP_200_OK)
            
        except ValueError as e:
            # Invalid token
            return Response(
                {"error": f"Invalid ID token: {str(e)}"},
                status=status.HTTP_401_UNAUTHORIZED
            )
        except Exception as e:
            return Response(
                {"error": f"Authentication failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class RegisterAPIView(APIView):
    def post(self, request):

        netID = request.data.get("netID")
        email = request.data.get("email")
        password = request.data.get("password")
        first_name = request.data.get("first_name")
        last_name = request.data.get("last_name")


        sex = request.data.get("sex")
        age = request.data.get("age")
        height_cm = request.data.get("height_cm")
        weight_kg = request.data.get("weight_kg")
        goal = request.data.get("goal")

        if User.objects.filter(username = netID).exists():
            return Response({"error": "A user with this NetID already exists."}, status=status.HTTP_400_BAD_REQUEST)
        
        else:
           
            user = User.objects.create_user(
                username=netID, 
                email=email, 
                password=password,
                first_name=first_name,
                last_name=last_name
            )

           
            profile = ensure_user_profile(user)
            profile.netID = netID
            profile.sex = sex
            profile.age = age
            profile.height_cm = height_cm
            profile.weight_kg = weight_kg
            profile.goal = goal
            profile.save() 

            token, created = Token.objects.get_or_create(user=user)

            return Response({
                "token": token.key,
                "message": "User created successfully!"
            }, status=status.HTTP_201_CREATED)

        




class LoginAPIView(APIView):
    def post(self, request):

        netID = request.data.get("netID")
        password = request.data.get("password")


        user = authenticate(username = netID, password = password)


        if user is not None:
            token, created = Token.objects.get_or_create(user = user)

            profile = ensure_user_profile(user)

            return Response({"token": token.key,
                             "first_name": user.first_name,
                             "last_name":user.last_name,
                             "netID": profile.netID,
                             "goal": profile.goal}, status=status.HTTP_200_OK )

        else: 
            return Response({"error": "Invalid NetID or Password"}, status=status.HTTP_400_BAD_REQUEST)
        
class UserProfileView(APIView):

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        profile = ensure_user_profile(user)

        return Response({
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email": user.email,
            "netID": profile.netID,
            "sex": profile.sex,
            "age": profile.age,
            "height_cm": profile.height_cm,
            "weight_kg": profile.weight_kg,
            "goal": profile.goal,
            "activity_level": profile.activity_level,
            "daily_cal_goal": profile.daily_cal_goal,
            "daily_protein_goal": profile.daily_protein_goal,
            "daily_carbs_goal": profile.daily_carbs_goal,
            "daily_fat_goal": profile.daily_fat_goal,
            "goals_source": profile.goals_source,
            "date_joined": user.date_joined.isoformat(),
        })

    def put(self, request):
        user = request.user
        profile = ensure_user_profile(user)
        data = request.data

        # Update User fields
        for field in ("first_name", "last_name"):
            if field in data:
                setattr(user, field, data[field])
        if any(f in data for f in ("first_name", "last_name")):
            user.save()

        # Update Profile fields
        profile_fields = [
            "netID", "sex", "age", "height_cm", "weight_kg", "goal",
            "activity_level", "daily_cal_goal", "daily_protein_goal",
            "daily_carbs_goal", "daily_fat_goal", "goals_source",
        ]
        for field in profile_fields:
            if field in data:
                setattr(profile, field, data[field] if data[field] != "" else None)
        profile.save()

        return Response({"message": "Profile updated"}, status=status.HTTP_200_OK)


class DailyIntakeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        profile = ensure_user_profile(user)
        today = timezone.localdate()

        totals = user.meals.filter(date=today).aggregate(
            calories=Sum("total_calories"),
            protein=Sum("total_protein"),
            carbs=Sum("total_carbohydrates"),
            fat=Sum("total_fat"),
        )

        consumed = {
            "calories": totals["calories"] or 0,
            "protein": totals["protein"] or 0,
            "carbs": totals["carbs"] or 0,
            "fat": totals["fat"] or 0,
        }

        goals_set = profile.daily_cal_goal is not None
        goals = None
        if goals_set:
            goals = {
                "calories": profile.daily_cal_goal,
                "protein": profile.daily_protein_goal,
                "carbs": profile.daily_carbs_goal,
                "fat": profile.daily_fat_goal,
            }

        return Response({
            "consumed": consumed,
            "goals": goals,
            "goals_set": goals_set,
        })


class DailyHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        days = int(request.query_params.get("days", 7))
        days = min(days, 365)
        user = request.user
        start_date = timezone.localdate() - timedelta(days=days - 1)

        meals_by_day = (
            user.meals
            .filter(date__gte=start_date)
            .values("date")
            .annotate(
                calories=Sum("total_calories"),
                protein=Sum("total_protein"),
                carbs=Sum("total_carbohydrates"),
                fat=Sum("total_fat"),
            )
            .order_by("date")
        )

        result = [
            {
                "date": entry["date"].isoformat(),
                "calories": entry["calories"] or 0,
                "protein": entry["protein"] or 0,
                "carbs": entry["carbs"] or 0,
                "fat": entry["fat"] or 0,
            }
            for entry in meals_by_day
        ]

        return Response(result)


def dining_hall_view(request):

    today = timezone.localdate()
    halls = DiningHall.objects.all()

    data = []

    for hall in halls:

        data.append({
            "Dining_Hall_ID": hall.Dining_Hall_ID,
            "name": hall.name,
            "location": hall.location,
            "dishes": list(hall.dish.filter(last_seen=today).values(
                'dish_id', 'dish_name', 'calories', 'protein', 'carbohydrates', 'fat',
                'fiber', 'sodium', 'allergens', 'dietary_flags', 'nutrition_source',
                'ai_confidence', 'meal_period', 'course', 'serving_unit', 'serving_size',
            ))
        })

    return JsonResponse(data, safe=False)


def hall_status_view(_request):
    """
    Returns open/closed + current meal period for supported UIUC dining options.
    Source of truth: https://web.housing.illinois.edu/diningmenus
    """
    html = fetch_hours_html()
    if not html:
        return JsonResponse({}, safe=False)

    rows = parse_hours_rows(html)
    if not rows:
        return JsonResponse({}, safe=False)

    option_ids = sorted(DINING_OPTIONS.keys())
    status_map = compute_status(rows, option_ids=option_ids)

    # Return as string keys for stable JSON.
    payload = {str(option_id): status_map.get(option_id, {}) for option_id in option_ids}
    return JsonResponse(payload, safe=False)

class DishManagementView(View):
    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        dishes = list(Dish.objects.values())
        return JsonResponse(dishes, safe=False)
    
    def post(self, request):
        try:
            data = json.loads(request.body)
            
            # Validate required fields
            if not data.get('dish_name'):
                return JsonResponse({"error": "Dish name is required"}, status=400)
            if not data.get('dining_hall'):
                return JsonResponse({"error": "Dining hall is required"}, status=400)
            
            # Verify dining hall exists
            try:
                dining_hall = DiningHall.objects.get(pk=data.get('dining_hall'))
            except DiningHall.DoesNotExist:
                return JsonResponse({"error": "Selected dining hall does not exist"}, status=400)
           
            new_dish = Dish.objects.create(
                dish_name=data.get('dish_name'),
                calories=data.get('calories', 0),
                category=data.get('category', 'General'),
                protein=data.get('protein', 0),
                carbohydrates=data.get('carbohydrates', 0),
                fat=data.get('fat', 0),
                dining_hall_id=data.get('dining_hall')
            )
            
            return JsonResponse({
                "message": "Dish added successfully!",
                "dish_id": new_dish.dish_id
            }, status=201)
            
        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON format"}, status=400)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=400)

def dish_list_view(request):

    search_query = request.GET.get('search', None)
    hall_id = request.GET.get('hall_id', None)

    today = timezone.localdate()
    dishes = Dish.objects.select_related('dining_hall').filter(last_seen=today)

    if search_query:
        dishes = dishes.filter(dish_name__icontains=search_query)

    if hall_id:
        dishes = dishes.filter(dining_hall_id=hall_id)

    data = []
    for dish in dishes:
        data.append({
            'dish_id': dish.dish_id,
            'dish_name': dish.dish_name,
            'calories': dish.calories,
            'protein': dish.protein,
            'carbohydrates': dish.carbohydrates,
            'fat': dish.fat,
            'fiber': dish.fiber,
            'sodium': dish.sodium,
            'category': dish.category,
            'allergens': dish.allergens,
            'dietary_flags': dish.dietary_flags,
            'serving_unit': dish.serving_unit,
            'serving_size': dish.serving_size,
            'course': dish.course,
            'meal_period': dish.meal_period,
            'dining_hall__name': dish.dining_hall.name,
            'detail_url': dish.get_absolute_url(),
        })

    return JsonResponse(data, safe=False)

def dish_detail_view(request, dish_id):
    
    dish = get_object_or_404(Dish, pk=dish_id)
    data = model_to_dict(dish)
    data['dining_hall__name'] = dish.dining_hall.name
    data['detail_url'] = dish.get_absolute_url()  # model-driven URL
    return JsonResponse(data)



class UserProfileBaseView(View):

    def get(self, request):
        profiles = []
        for profile in UserProfile.objects.all():
            data = model_to_dict(profile, exclude=['meals'])
            data['detail_url'] = profile.get_absolute_url()  # model-driven URL
            profiles.append(data)

        return JsonResponse(profiles, safe=False)


def user_profile_detail_view(request, netID):
    """Detail view for a single user profile, linked via get_absolute_url()."""
    profile = get_object_or_404(UserProfile, pk=netID)
    data = model_to_dict(profile, exclude=['meals'])
    data['detail_url'] = profile.get_absolute_url()
    return JsonResponse(data)
    

class MealListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        meals = (
            Meal.objects
            .filter(user=request.user)
            .prefetch_related(
                Prefetch(
                    "contain_dish",
                    queryset=Dish.objects.select_related("dining_hall").order_by("dish_name"),
                )
            )
            .order_by("-date", "-meal_id")
        )
        return Response([_serialize_meal(meal) for meal in meals])

    def post(self, request):
        raw_dish_ids = request.data.get("dish_ids")
        if not isinstance(raw_dish_ids, list) or not raw_dish_ids:
            return Response(
                {"error": "dish_ids must be a non-empty list."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        dish_ids = []
        for raw_id in raw_dish_ids:
            try:
                dish_ids.append(int(raw_id))
            except (TypeError, ValueError):
                return Response(
                    {"error": "Each dish id must be an integer."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        dishes = list(
            Dish.objects
            .filter(dish_id__in=set(dish_ids))
            .select_related("dining_hall")
        )
        if len(dishes) != len(set(dish_ids)):
            found_ids = {dish.dish_id for dish in dishes}
            missing_ids = sorted(set(dish_ids) - found_ids)
            return Response(
                {"error": f"Some dishes could not be found: {missing_ids}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        dish_lookup = {dish.dish_id: dish for dish in dishes}
        ordered_dishes = [dish_lookup[dish_id] for dish_id in dish_ids]
        unique_dishes = []
        seen_ids = set()
        for dish in ordered_dishes:
            if dish.dish_id in seen_ids:
                continue
            seen_ids.add(dish.dish_id)
            unique_dishes.append(dish)

        category = str(request.data.get("category", "")).strip() or _derive_meal_category(ordered_dishes)

        meal = Meal.objects.create(
            user=request.user,
            category=category,
        )
        meal.contain_dish.set(unique_dishes)
        meal.total_calories = sum(dish.calories for dish in ordered_dishes)
        meal.total_protein = sum(dish.protein for dish in ordered_dishes)
        meal.total_carbohydrates = sum(dish.carbohydrates for dish in ordered_dishes)
        meal.total_fat = sum(dish.fat for dish in ordered_dishes)
        meal.save(
            update_fields=[
                "total_calories",
                "total_protein",
                "total_carbohydrates",
                "total_fat",
            ]
        )
        meal.refresh_from_db()

        return Response(_serialize_meal(meal), status=status.HTTP_201_CREATED)


@method_decorator(csrf_exempt, name='dispatch')
class AIMealView(View):
    """
    Features:
    - Return meals containing ALL specified dishes.
    - Filter meals based on related Dish names.
    - Return the total nutrition content for each meal.
    - GET: fuzzy search (icontains) — results shareable via URL query params.
    - POST: exact match — hides search data from URL for precise lookups.
    """

    def _get_meals_by_dishes(self, dish_names_list, mode="GET"):
        """
        Core logic: Finds meals that contain EVERY dish in dish_names_list.
        mode: "GET" -> fuzzy search (__icontains)
              "POST" -> exact search (__exact)
        """
        if not dish_names_list:
            return []

        # Clean input
        dish_names = [name.strip() for name in dish_names_list if name.strip()]
        if not dish_names:
            return []

        # Relationship spanning & filtering
        query = Q()
        lookup_type = "icontains" if mode == "GET" else "exact"

        for dish in dish_names:
            query &= Q(**{f"items__dish__dish_name__{lookup_type}": dish})

        meals_qs = TempMeal.objects.filter(query).distinct()

        # Nutrition calculation
        results = []
        for meal in meals_qs.prefetch_related("items__dish"):
            total_calories = sum(item.dish.calories * item.weight_in_grams / 100 for item in meal.items.all())
            total_protein = sum(item.dish.protein * item.weight_in_grams / 100 for item in meal.items.all())
            total_carbs = sum(item.dish.carbohydrates * item.weight_in_grams / 100 for item in meal.items.all())
            total_fat = sum(item.dish.fat * item.weight_in_grams / 100 for item in meal.items.all())

            dish_list = [
                {"name": item.dish.dish_name, "weight": item.weight_in_grams}
                for item in meal.items.all()
            ]

            results.append({
                "meal_id": meal.meal_id,
                "meal_name": meal.meal_name,
                "total_nutrition": {
                    "calories": round(total_calories, 1),
                    "protein": round(total_protein, 1),
                    "carbs": round(total_carbs, 1),
                    "fat": round(total_fat, 1),
                },
                "dishes_contained": dish_list
            })

        return results

    def get(self, request, *args, **kwargs):
        raw_dishes = request.GET.get("dishes", "")
        dish_list = raw_dishes.split(",") if raw_dishes else []

        data = self._get_meals_by_dishes(dish_list, mode="GET")

        return JsonResponse({
            "mode": "GET_Simple_Search",
            "count": len(data),
            "results": data
        })

    def post(self, request, *args, **kwargs):
        raw_dishes = request.POST.get("dishes", "")
        dish_list = raw_dishes.split(",") if raw_dishes else []

        data = self._get_meals_by_dishes(dish_list, mode="POST")

        return JsonResponse({
            "mode": "POST_Snapshot_Search",
            "count": len(data),
            "results": data
        })



def dish_stats_view(request):
    """
    Public aggregation endpoint — returns dish statistics as JSON.
    Demonstrates: Count (total), annotate + Count (grouped summary).
    """
    # One total (count)
    total_dishes = Dish.objects.count()
    total_halls = DiningHall.objects.count()

    # Grouped summary: dishes per category (annotate + count)
    dishes_by_category = list(
        Dish.objects.values('category')
        .annotate(count=Count('dish_id'))
        .order_by('-count')
    )

    # Grouped summary: dishes per dining hall (annotate + count)
    dishes_by_hall = list(
        Dish.objects.values('dining_hall__name')
        .annotate(count=Count('dish_id'))
        .order_by('-count')
    )

    return JsonResponse({
        'total_dishes': total_dishes,
        'total_halls': total_halls,
        'dishes_by_category': dishes_by_category,
        'dishes_by_hall': dishes_by_hall,
    })


class MealSummaryView(View):

    def get(self, request, *args, **kwargs):

        # -------- Authentication Check --------
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Authentication required"}, status=401)

        start = request.GET.get("start")
        end = request.GET.get("end")

        if not start or not end:
            return JsonResponse({"error": "Please provide start and end dates"}, status=400)

        try:
            start_dt = datetime.strptime(start, "%Y-%m-%d")
            end_dt = datetime.strptime(end, "%Y-%m-%d")
        except ValueError:
            return JsonResponse({"error": "Date format must be YYYY-MM-DD"}, status=400)

        # -------- Filter Meals --------
        user_meals = Meal.objects.filter(
            user=request.user,
            date__range=[start_dt, end_dt]
        )

        # One total (count)
        total_count = user_meals.count()

        # -------- Category Stats --------
        # One grouped summary (annotate + count)
        category_stats = user_meals.values("category") \
                                   .annotate(num=Count("pk")) \
                                   .order_by()

        category_labels = [
            item["category"] if item["category"] else "Uncategorized"
            for item in category_stats
        ]
        category_values = [item["num"] for item in category_stats]

        # -------- Nutrition Aggregation --------
        totals = user_meals.aggregate(
            total_calories=Coalesce(Sum("total_calories"), 0),
            total_protein=Coalesce(Sum("total_protein"), 0),
            total_carbs=Coalesce(Sum("total_carbohydrates"), 0),
            total_fat=Coalesce(Sum("total_fat"), 0),
        )

        macro_labels = ["Protein", "Carbs", "Fat"]
        macro_values = [
            totals["total_protein"],
            totals["total_carbs"],
            totals["total_fat"],
        ]

        # -------- Create Figure --------
        fig, axs = plt.subplots(1, 2, figsize=(12, 6))

        # ===== Left: Macronutrient Pie =====
        if sum(macro_values) > 0:
            axs[0].pie(
                macro_values,
                labels=macro_labels,
                autopct="%1.1f%%",
                startangle=90
            )
            axs[0].axis("equal")
        else:
            axs[0].text(0.5, 0.5, "No Macro Data", ha="center")

        axs[0].set_title("Macronutrient Distribution")

        # ===== Right: Category Pie =====
        if sum(category_values) > 0:
            axs[1].pie(
                category_values,
                labels=category_labels,
                autopct="%1.1f%%",
                startangle=90
            )
            axs[1].axis("equal")
        else:
            axs[1].text(0.5, 0.5, "No Category Data", ha="center")

        axs[1].set_title("Meal Category Distribution")

        # -------- Clean Title Layout --------
        fig.suptitle(
            f"{request.user.username}'s Meal Summary",
            fontsize=18,
            y=1.02
        )

        fig.text(
            0.5,
            0.95,
            f"Total Meals: {total_count} ({start} to {end})",
            ha="center",
            fontsize=12
        )

        # Prevent overlap
        fig.tight_layout(rect=[0, 0, 1, 0.88])

        # -------- Return Image --------
        buffer = BytesIO()
        fig.savefig(buffer, format="png", bbox_inches="tight")
        plt.close(fig)
        buffer.seek(0)

        return HttpResponse(buffer.getvalue(), content_type="image/png")


# views.py
class DishSummaryImageView(View):
    def get(self, request, dish_id, *args, **kwargs):
        from django.db.models import Sum
        # 1. Get the dish
        dish = get_object_or_404(Dish, pk=dish_id)

        # 2. Prepare data for the pie chart
        # Note: Using float() because these are often stored as strings or decimals
        labels = ["Protein", "Carbs", "Fat"]
        values = [float(dish.protein), float(dish.carbohydrates), float(dish.fat)]

        # 3. Create the Plot
        fig, ax = plt.subplots(figsize=(5, 4))
        if sum(values) > 0:
            ax.pie(values, labels=labels, autopct="%1.1f%%", startangle=90, colors=['#ff9999','#66b3ff','#99ff99'])
        else:
            ax.text(0.5, 0.5, "No Macro Data", ha="center")
        
        ax.set_title(f"Macro Breakdown: {dish.dish_name}")

        # 4. Return as Image
        buffer = BytesIO()
        fig.savefig(buffer, format="png", bbox_inches="tight")
        plt.close(fig)
        buffer.seek(0)
        return HttpResponse(buffer.getvalue(), content_type="image/png")
    
def dishes_per_hall_png(request):
    qs = (
        Dish.objects
        .values("dining_hall__name")
        .annotate(n=Count("dish_id"))
        .order_by("-n")
    )
    labels = [row["dining_hall__name"] for row in qs]
    values = [row["n"] for row in qs]

    fig, ax = plt.subplots(figsize=(8, 4))
    ax.bar(labels, values)
    ax.set_title("Dishes per Dining Hall")
    ax.set_xlabel("Dining Hall")
    ax.set_ylabel("Dish count")
    plt.xticks(rotation=30, ha="right")
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150)
    plt.close(fig)
    buf.seek(0)
    return HttpResponse(buf.getvalue(), content_type="image/png")


def meals_per_day_png(request):
    today = timezone.localdate()
    start = today - timedelta(days=13)

    qs = (
        Meal.objects
        .filter(date__gte=start, date__lte=today)
        .values("date")
        .annotate(n=Count("meal_id"))
        .order_by("date")
    )
    labels = [row["date"].isoformat() for row in qs]
    values = [row["n"] for row in qs]

    fig, ax = plt.subplots(figsize=(10, 4))
    ax.plot(labels, values, marker="o")
    ax.set_title("Meals Logged per Day (Last 14 Days)")
    ax.set_xlabel("Date")
    ax.set_ylabel("Meal count")
    plt.xticks(rotation=45, ha="right")
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150)
    plt.close(fig)
    buf.seek(0)
    return HttpResponse(buf.getvalue(), content_type="image/png")


WGER_INGREDIENT_URL = "https://wger.de/api/v2/ingredient/"


def nutrition_lookup_view(request):
    """
    External API integration (Wger) triangulated with internal SmartEats data.

    Required: ?q=<food_name>
    Optional: ?netID=<user_netID> for personalized daily-goal analysis
    """
    query = request.GET.get('q', '').strip()
    if not query:
        return JsonResponse(
            {"error": "Query parameter 'q' is required. Example: ?q=chicken+breast"},
            status=400,
        )

    # --- External API call (Wger ingredient database) ---
    try:
        wger_response = http_requests.get(
            WGER_INGREDIENT_URL,
            params={
                "name": query,
                "language": 2,
                "format": "json",
                "limit": 5,
            },
            timeout=5,
        )
        wger_response.raise_for_status()
    except http_requests.exceptions.Timeout:
        return JsonResponse({"error": "External API request timed out"}, status=504)
    except http_requests.exceptions.RequestException as exc:
        return JsonResponse({"error": f"External API error: {exc}"}, status=502)

    try:
        wger_results = wger_response.json().get("results", [])
    except ValueError:
        return JsonResponse({"error": "External API returned an unexpected non-JSON response"}, status=502)

    external_items = [
        {
            "name": item["name"],
            "brand": item.get("brand", ""),
            "source": item.get("source_name", ""),
            "per_100g": {
                "energy_kcal": item["energy"],
                "protein": float(item["protein"] or 0),
                "carbohydrates": float(item["carbohydrates"] or 0),
                "fat": float(item["fat"] or 0),
                "fiber": float(item.get("fiber") or 0),
                "sodium": float(item.get("sodium") or 0),
            },
        }
        for item in wger_results
    ]

    # --- Internal data: matching SmartEats dishes ---
    internal_dishes = list(
        Dish.objects.filter(dish_name__icontains=query)
        .select_related("dining_hall")
        .values(
            "dish_id", "dish_name", "calories",
            "protein", "carbohydrates", "fat",
            "dining_hall__name",
        )
    )

    # --- Optional personalised goal analysis ---
    net_id = request.GET.get("netID", "").strip()
    user_analysis = None

    if net_id:
        try:
            profile = UserProfile.objects.get(pk=net_id)

            # Mifflin-St Jeor BMR
            daily_target = None
            if profile.weight_kg and profile.height_cm and profile.age and profile.sex:
                w = float(profile.weight_kg)
                h = float(profile.height_cm)
                a = profile.age
                bmr = (10 * w + 6.25 * h - 5 * a + 5) if profile.sex == "male" \
                    else (10 * w + 6.25 * h - 5 * a - 161)
                tdee = bmr * 1.55

                if profile.goal == "fat_loss":
                    target_cal = round(tdee - 500)
                    daily_target = {
                        "calories": target_cal,
                        "protein": round(w * 2.0),
                        "carbohydrates": round(target_cal * 0.40 / 4),
                        "fat": round(target_cal * 0.25 / 9),
                    }
                elif profile.goal == "muscle_gain":
                    target_cal = round(tdee + 300)
                    daily_target = {
                        "calories": target_cal,
                        "protein": round(w * 2.2),
                        "carbohydrates": round(target_cal * 0.45 / 4),
                        "fat": round(target_cal * 0.25 / 9),
                    }

            today = timezone.localdate()
            intake = Meal.objects.filter(user=profile, date=today).aggregate(
                calories=Coalesce(Sum("total_calories"), 0),
                protein=Coalesce(Sum("total_protein"), 0),
                carbohydrates=Coalesce(Sum("total_carbohydrates"), 0),
                fat=Coalesce(Sum("total_fat"), 0),
            )

            remaining = None
            if daily_target:
                remaining = {
                    k: daily_target[k] - intake[k] for k in daily_target
                }

            user_analysis = {
                "netID": net_id,
                "goal": profile.goal,
                "daily_target": daily_target,
                "todays_intake": intake,
                "remaining": remaining,
            }
        except UserProfile.DoesNotExist:
            user_analysis = {"error": f"User '{net_id}' not found"}

    return JsonResponse({
        "query": query,
        "external_source": "wger.de",
        "external_results_count": len(external_items),
        "external_results": external_items,
        "internal_matches_count": len(internal_dishes),
        "internal_matches": internal_dishes,
        "user_analysis": user_analysis,
    })



class ExportMealsView(APIView):
    """
    Export historical Meal records for the authenticated user as CSV or JSON.
    """
    permission_classes = [IsAuthenticated]
    format_kwarg = None

    def get(self, request):
        export_format = request.GET.get("file_format", "").lower()
        if not export_format:
            export_format = request.GET.get("format", "csv").lower()
        if export_format not in {"csv", "json"}:
            return Response(
                {"error": "Invalid format. Use 'csv' or 'json'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        meals = Meal.objects.filter(user=request.user).order_by("-date", "meal_id")
        timestamp = now().strftime("%Y-%m-%d_%H-%M")

        if export_format == "json":
            meal_list = []
            for meal in meals:
                meal_list.append({
                    "meal_id": meal.meal_id,
                    "total_calories": meal.total_calories,
                    "total_protein": meal.total_protein,
                    "total_carbohydrates": meal.total_carbohydrates,
                    "total_fat": meal.total_fat,
                    "date": meal.date.isoformat(),
                })

            data = {
                "generated_at": now().isoformat(),
                "record_count": meals.count(),
                "meals": meal_list,
            }
            response = JsonResponse(data, json_dumps_params={"indent": 2})
            response["Content-Disposition"] = f'attachment; filename="my_meals_{timestamp}.json"'
            return response

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="my_meals_{timestamp}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            "Meal ID",
            "Total Calories",
            "Total Protein (g)",
            "Total Carbohydrates (g)",
            "Total Fat (g)",
            "Date",
        ])
        for meal in meals:
            writer.writerow([
                meal.meal_id,
                meal.total_calories,
                meal.total_protein,
                meal.total_carbohydrates,
                meal.total_fat,
                meal.date,
            ])
        return response



# class MealReportsView(View):
#     """
#     Reports page showing:
#     - Macronutrient summary
#     - Category summary
#     - Totals line
#     - CSV + JSON download buttons

#     TEMPORARY TESTING: uses first user in database until authentication is implemented
#     """

#     def get(self, request):
#         # -------- TEMPORARY TEST USER --------
#         current_user = UserProfile.objects.first()  # replace with request.user.userprofile later

#         # -------- Filter Meals --------
#         start = request.GET.get("start")
#         end = request.GET.get("end")

#         meals = Meal.objects.filter(user=current_user)
#         if start and end:
#             try:
#                 start_dt = datetime.strptime(start, "%Y-%m-%d")
#                 end_dt = datetime.strptime(end, "%Y-%m-%d")
#                 meals = meals.filter(date__range=[start_dt, end_dt])
#             except ValueError:
#                 pass  # ignore date filtering if invalid

#         total_count = meals.count()

#         # -------- Category Summary --------
#         category_stats = meals.values("category").annotate(num=Count("pk")).order_by()
#         category_labels = [item["category"] or "Uncategorized" for item in category_stats]
#         category_values = [item["num"] for item in category_stats]

#         # -------- Macronutrient Summary --------
#         totals = meals.aggregate(
#             total_calories=Coalesce(Sum("total_calories"), 0),
#             total_protein=Coalesce(Sum("total_protein"), 0),
#             total_carbs=Coalesce(Sum("total_carbohydrates"), 0),
#             total_fat=Coalesce(Sum("total_fat"), 0),
#         )
#         macro_labels = ["Protein", "Carbs", "Fat"]
#         macro_values = [totals["total_protein"], totals["total_carbs"], totals["total_fat"]]

#         # -------- Generate Charts as Base64 --------
#         fig, axs = plt.subplots(1, 2, figsize=(12, 6))
#         if sum(macro_values) > 0:
#             axs[0].pie(macro_values, labels=macro_labels, autopct="%1.1f%%", startangle=90)
#             axs[0].axis("equal")
#         else:
#             axs[0].text(0.5, 0.5, "No Macro Data", ha="center")
#         axs[0].set_title("Macronutrient Distribution")

#         if sum(category_values) > 0:
#             axs[1].pie(category_values, labels=category_labels, autopct="%1.1f%%", startangle=90)
#             axs[1].axis("equal")
#         else:
#             axs[1].text(0.5, 0.5, "No Category Data", ha="center")
#         axs[1].set_title("Meal Category Distribution")

#         fig.suptitle(f"{current_user.netID}'s Meal Summary", fontsize=18, y=1.02)
#         fig.text(0.5, 0.95, f"Total Meals: {total_count}", ha="center", fontsize=12)
#         fig.tight_layout(rect=[0, 0, 1, 0.88])

#         buffer = BytesIO()
#         fig.savefig(buffer, format="png", bbox_inches="tight")
#         plt.close(fig)
#         buffer.seek(0)
#         chart_base64 = base64.b64encode(buffer.getvalue()).decode()

#         return JsonResponse({
#             "user_info": {
#                 "netID": current_user.netID,
#                 "name": current_user.name,
#             },
#             "statistics": {
#                 "total_count": total_count,
#                 "macros": {
#                     "labels": macro_labels,
#                     "values": macro_values,
#                 },
#                 "categories": {
#                     "labels": category_labels,
#                     "values": category_values,
#                 }
#             },
#             "chart_base64": f"data:image/png;base64,{chart_base64}"
#         })

class MealReportsView(APIView):
    """
    Reports page showing:
    - Macronutrient summary
    - Category summary
    - Totals line
    - CSV + JSON download buttons
    """
    # 1. Require the user to be logged in with a valid token
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # 2. Grab the actual authenticated user and their profile
        user = request.user
        profile = ensure_user_profile(user)

        # -------- Filter Meals --------
        start = request.GET.get("start")
        end = request.GET.get("end")

        # 3. Filter meals by the authenticated user
        meals = Meal.objects.filter(user=user)
        
        if start and end:
            try:
                start_dt = datetime.strptime(start, "%Y-%m-%d")
                end_dt = datetime.strptime(end, "%Y-%m-%d")
                meals = meals.filter(date__range=[start_dt, end_dt])
            except ValueError:
                pass  # ignore date filtering if invalid

        total_count = meals.count()

        # -------- Category Summary --------
        category_stats = meals.values("category").annotate(num=Count("pk")).order_by()
        category_labels = [item["category"] or "Uncategorized" for item in category_stats]
        category_values = [item["num"] for item in category_stats]

        # -------- Macronutrient Summary --------
        totals = meals.aggregate(
            total_calories=Coalesce(Sum("total_calories"), 0),
            total_protein=Coalesce(Sum("total_protein"), 0),
            total_carbs=Coalesce(Sum("total_carbohydrates"), 0),
            total_fat=Coalesce(Sum("total_fat"), 0),
        )
        macro_labels = ["Protein", "Carbs", "Fat"]
        macro_values = [totals["total_protein"], totals["total_carbs"], totals["total_fat"]]

        # -------- Generate Charts as Base64 --------
        fig, axs = plt.subplots(1, 2, figsize=(12, 6))
        if sum(macro_values) > 0:
            axs[0].pie(macro_values, labels=macro_labels, autopct="%1.1f%%", startangle=90)
            axs[0].axis("equal")
        else:
            axs[0].text(0.5, 0.5, "No Macro Data", ha="center")
        axs[0].set_title("Macronutrient Distribution")

        if sum(category_values) > 0:
            axs[1].pie(category_values, labels=category_labels, autopct="%1.1f%%", startangle=90)
            axs[1].axis("equal")
        else:
            axs[1].text(0.5, 0.5, "No Category Data", ha="center")
        axs[1].set_title("Meal Category Distribution")

        # 4. Handle display name gracefully (Google users might not have a netID right away)
        display_name = profile.netID if profile.netID else f"{user.first_name} {user.last_name}".strip()
        
        fig.suptitle(f"{display_name}'s Meal Summary", fontsize=18, y=1.02)
        fig.text(0.5, 0.95, f"Total Meals: {total_count}", ha="center", fontsize=12)
        fig.tight_layout(rect=[0, 0, 1, 0.88])

        buffer = BytesIO()
        fig.savefig(buffer, format="png", bbox_inches="tight")
        plt.close(fig)
        buffer.seek(0)
        chart_base64 = base64.b64encode(buffer.getvalue()).decode()

        # 5. Use DRF's Response instead of JsonResponse
        return Response({
            "user_info": {
                "netID": profile.netID,
                "name": f"{user.first_name} {user.last_name}".strip(),
            },
            "statistics": {
                "total_count": total_count,
                "macros": {
                    "labels": macro_labels,
                    "values": macro_values,
                },
                "categories": {
                    "labels": category_labels,
                    "values": category_values,
                }
            },
            "chart_base64": f"data:image/png;base64,{chart_base64}"
        })


class ConversationsView(View):
    """
    GET  /api/conversations/   -> list user's conversations with message_count
    POST /api/conversations/   -> create an empty conversation (lazy creation
                                  is preferred via AIChatView; this endpoint
                                  exists for explicit New-chat flows)
    """

    @method_decorator(csrf_exempt)
    def dispatch(self, request, *args, **kwargs):
        return super().dispatch(request, *args, **kwargs)

    def get(self, request, *args, **kwargs):
        from django.db.models import Count
        from mealPlanning.models import Conversation

        user = _get_user_from_token(request)
        if user is None:
            return JsonResponse({"error": "Authentication required"}, status=401)

        qs = (
            Conversation.objects.filter(user=user)
            .annotate(message_count=Count("messages"))
            .order_by("-updated_at")
        )
        data = [
            {
                "id": c.id,
                "title": c.title,
                "updated_at": c.updated_at.isoformat(),
                "message_count": c.message_count,
            }
            for c in qs
        ]
        return JsonResponse(data, safe=False)

    def post(self, request, *args, **kwargs):
        from mealPlanning.models import Conversation

        user = _get_user_from_token(request)
        if user is None:
            return JsonResponse({"error": "Authentication required"}, status=401)

        convo = Conversation.objects.create(user=user)
        Conversation.enforce_lru_cap_for_user(user, cap=20)
        return JsonResponse(
            {
                "id": convo.id,
                "title": convo.title,
                "updated_at": convo.updated_at.isoformat(),
                "message_count": 0,
            },
            status=201,
        )


class ConversationDetailView(View):
    """
    GET    /api/conversations/<id>/   -> full conversation + messages
    PATCH  /api/conversations/<id>/   -> rename (body: {"title": "..."})
    DELETE /api/conversations/<id>/   -> delete (cascades messages)
    """

    @method_decorator(csrf_exempt)
    def dispatch(self, request, *args, **kwargs):
        return super().dispatch(request, *args, **kwargs)

    def _get_convo_or_404(self, user, convo_id):
        from mealPlanning.models import Conversation
        try:
            return Conversation.objects.get(id=convo_id, user=user)
        except Conversation.DoesNotExist:
            return None

    def get(self, request, convo_id, *args, **kwargs):
        user = _get_user_from_token(request)
        if user is None:
            return JsonResponse({"error": "Authentication required"}, status=401)

        convo = self._get_convo_or_404(user, convo_id)
        if convo is None:
            return JsonResponse({"error": "Not found"}, status=404)

        messages = [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "metadata": m.metadata or {},
                "created_at": m.created_at.isoformat(),
            }
            for m in convo.messages.all()
        ]
        return JsonResponse(
            {
                "id": convo.id,
                "title": convo.title,
                "updated_at": convo.updated_at.isoformat(),
                "messages": messages,
            }
        )

    def patch(self, request, convo_id, *args, **kwargs):
        user = _get_user_from_token(request)
        if user is None:
            return JsonResponse({"error": "Authentication required"}, status=401)

        convo = self._get_convo_or_404(user, convo_id)
        if convo is None:
            return JsonResponse({"error": "Not found"}, status=404)

        try:
            body = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        title = str(body.get("title", "")).strip()
        if not title:
            return JsonResponse({"error": "Title cannot be empty"}, status=400)

        convo.title = title[:80]
        convo.save(update_fields=["title", "updated_at"])

        return JsonResponse(
            {
                "id": convo.id,
                "title": convo.title,
                "updated_at": convo.updated_at.isoformat(),
            }
        )

    def delete(self, request, convo_id, *args, **kwargs):
        user = _get_user_from_token(request)
        if user is None:
            return JsonResponse({"error": "Authentication required"}, status=401)

        convo = self._get_convo_or_404(user, convo_id)
        if convo is None:
            return JsonResponse({"error": "Not found"}, status=404)

        convo.delete()
        return JsonResponse({}, status=204)


@method_decorator(csrf_exempt, name='dispatch')
class AIChatView(View):
    """Gemini-powered AI chat endpoint for dining recommendations."""

    def _extract_authenticated_user(self, request):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Token "):
            return None

        token_key = auth_header.split(" ", 1)[1].strip()
        if not token_key:
            return None

        token = Token.objects.select_related("user").filter(key=token_key).first()
        return token.user if token else None

    def _extract_user_context(self, user, tray_context=None):
        if user is None:
            return {}
        context = {}

        display_name = f"{user.first_name} {user.last_name}".strip()
        if display_name:
            context["name"] = display_name

        profile = ensure_user_profile(user)

        if profile.goal:
            context["goal"] = profile.goal
        if profile.activity_level:
            context["activity_level"] = profile.activity_level
        if profile.sex:
            context["sex"] = profile.sex
        if profile.age is not None:
            context["age"] = profile.age
        if profile.height_cm is not None:
            context["height_cm"] = str(profile.height_cm)
        if profile.weight_kg is not None:
            context["weight_kg"] = str(profile.weight_kg)

        goals_set = profile.daily_cal_goal is not None
        if goals_set:
            context["daily_goals"] = {
                "calories": profile.daily_cal_goal or 0,
                "protein": profile.daily_protein_goal or 0,
                "carbohydrates": profile.daily_carbs_goal or 0,
                "fat": profile.daily_fat_goal or 0,
            }

        today = timezone.localdate()
        meals_today = (
            Meal.objects
            .filter(user=user, date=today)
            .prefetch_related(
                Prefetch(
                    "contain_dish",
                    queryset=Dish.objects.select_related("dining_hall").order_by("dish_name"),
                )
            )
            .order_by("-meal_id")
        )

        consumed = meals_today.aggregate(
            calories=Sum("total_calories"),
            protein=Sum("total_protein"),
            carbohydrates=Sum("total_carbohydrates"),
            fat=Sum("total_fat"),
        )
        context["today_logged_totals"] = {
            "calories": consumed["calories"] or 0,
            "protein": consumed["protein"] or 0,
            "carbohydrates": consumed["carbohydrates"] or 0,
            "fat": consumed["fat"] or 0,
        }

        if goals_set:
            context["today_remaining_goals"] = {
                "calories": max(0, (profile.daily_cal_goal or 0) - context["today_logged_totals"]["calories"]),
                "protein": max(0, (profile.daily_protein_goal or 0) - context["today_logged_totals"]["protein"]),
                "carbohydrates": max(0, (profile.daily_carbs_goal or 0) - context["today_logged_totals"]["carbohydrates"]),
                "fat": max(0, (profile.daily_fat_goal or 0) - context["today_logged_totals"]["fat"]),
            }

        if meals_today.exists():
            context["logged_meals_today"] = [
                {
                    "category": meal.category or "Logged Meal",
                    "calories": meal.total_calories,
                    "protein": meal.total_protein,
                    "carbohydrates": meal.total_carbohydrates,
                    "fat": meal.total_fat,
                    "dishes": [dish.dish_name for dish in meal.contain_dish.all()[:5]],
                }
                for meal in meals_today[:5]
            ]

        sanitized_tray = _sanitize_tray_context(tray_context)
        if sanitized_tray is not None:
            context["current_meal_tray"] = sanitized_tray

        return context

    def _log_ai_chat_event(
        self,
        *,
        user,
        message,
        session_id,
        request_id,
        latency_ms,
        success,
        model_name,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        error_type="",
    ):
        prompt_chars = len(str(message or "").strip())
        input_bucket = _bucket_for_prompt_chars(prompt_chars)
        if total_tokens <= 0:
            total_tokens = prompt_tokens + completion_tokens
        estimated_cost_usd = _estimate_cost_usd(prompt_tokens, completion_tokens)

        AIAnalyticsEvent.objects.create(
            event_type=AIAnalyticsEvent.EVENT_AI_CHAT_REQUEST,
            user=user,
            session_id=str(session_id or "")[:64],
            request_id=str(request_id or "")[:64],
            prompt_chars=prompt_chars,
            prompt_text_redacted=str(message or "")[:240],
            input_bucket=input_bucket,
            intent_label=_infer_intent_label(message),
            latency_ms=max(0, int(latency_ms or 0)),
            success=bool(success),
            error_type=str(error_type or "")[:64],
            model_name=str(model_name or "")[:80],
            prompt_tokens=max(0, int(prompt_tokens or 0)),
            completion_tokens=max(0, int(completion_tokens or 0)),
            total_tokens=max(0, int(total_tokens or 0)),
            estimated_cost_usd=estimated_cost_usd,
        )

    def post(self, request, *args, **kwargs):
        from mealPlanning.services import ai_chat
        from mealPlanning.models import Conversation, ChatMessage

        user = self._extract_authenticated_user(request)
        started = time.perf_counter()

        try:
            body = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            try:
                self._log_ai_chat_event(
                    user=user,
                    message="",
                    session_id="",
                    request_id="",
                    latency_ms=0,
                    success=False,
                    model_name=getattr(ai_chat, "MODEL_NAME", "unknown"),
                    prompt_tokens=0,
                    completion_tokens=0,
                    total_tokens=0,
                    error_type="invalid_json",
                )
            except Exception:
                logger.exception("Failed to write analytics event for invalid_json")
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        message = body.get("message", "").strip()
        session_id = str(body.get("session_id", "")).strip()
        request_id = str(body.get("request_id", "")).strip()
        if not message:
            try:
                self._log_ai_chat_event(
                    user=user,
                    message="",
                    session_id=session_id,
                    request_id=request_id,
                    latency_ms=0,
                    success=False,
                    model_name=getattr(ai_chat, "MODEL_NAME", "unknown"),
                    prompt_tokens=0,
                    completion_tokens=0,
                    total_tokens=0,
                    error_type="missing_message",
                )
            except Exception:
                logger.exception("Failed to write analytics event for missing_message")
            return JsonResponse({"error": "Message is required"}, status=400)

        raw_history = body.get("history", [])
        history = raw_history if isinstance(raw_history, list) else []
        conversation_id = body.get("conversation_id")
        regenerate = bool(body.get("regenerate"))

        user = _get_user_from_token(request)
        convo = None

        if user is not None:
            if conversation_id is not None:
                try:
                    convo = Conversation.objects.get(id=conversation_id, user=user)
                except Conversation.DoesNotExist:
                    return JsonResponse({"error": "Conversation not found"}, status=404)
            else:
                convo = Conversation.objects.create(user=user)
                Conversation.enforce_lru_cap_for_user(user, cap=20)

            if regenerate:
                last_assistant = convo.messages.filter(role="assistant").order_by("-created_at").first()
                if last_assistant is not None:
                    last_assistant.delete()
            else:
                ChatMessage.objects.create(conversation=convo, role="user", content=message)

            history = [
                {"role": m.role if m.role == "user" else "assistant", "content": m.content}
                for m in convo.messages.all()
            ]

            if convo.title == "New chat":
                first_user_msg = convo.messages.filter(role="user").order_by("created_at").first()
                if first_user_msg is not None:
                    convo.title = first_user_msg.content[:80]
                    convo.save(update_fields=["title", "updated_at"])

        user_context = self._extract_user_context(
            user,
            tray_context=body.get("tray_context"),
        )

        result = ai_chat.get_response(
            message,
            history=history,
            user_context=user_context,
        )
        latency_ms = round((time.perf_counter() - started) * 1000)
        if result is None:
            prompt_tokens = _estimate_tokens_from_text(message)
            try:
                self._log_ai_chat_event(
                    user=user,
                    message=message,
                    session_id=session_id,
                    request_id=request_id,
                    latency_ms=latency_ms,
                    success=False,
                    model_name=getattr(ai_chat, "MODEL_NAME", "unknown"),
                    prompt_tokens=prompt_tokens,
                    completion_tokens=0,
                    total_tokens=prompt_tokens,
                    error_type="ai_service_unavailable",
                )
            except Exception:
                logger.exception("Failed to write analytics event for ai_service_unavailable")
            return JsonResponse(
                {"error": "AI service unavailable. Please try again later."},
                status=503,
            )

        meta = result.pop("_meta", {}) if isinstance(result, dict) else {}
        prompt_tokens = int(meta.get("prompt_tokens") or 0)
        completion_tokens = int(meta.get("completion_tokens") or 0)
        total_tokens = int(meta.get("total_tokens") or 0)
        if prompt_tokens <= 0:
            prompt_tokens = _estimate_tokens_from_text(message)
        if completion_tokens <= 0:
            completion_tokens = _estimate_tokens_from_text(result.get("response", ""))
        if total_tokens <= 0:
            total_tokens = prompt_tokens + completion_tokens

        try:
            self._log_ai_chat_event(
                user=user,
                message=message,
                session_id=session_id,
                request_id=request_id,
                latency_ms=latency_ms,
                success=True,
                model_name=meta.get("model_name") or getattr(ai_chat, "MODEL_NAME", "unknown"),
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
            )
        except Exception:
            logger.exception("Failed to write analytics event for ai_chat_request")

        if convo is not None:
            metadata = {
                k: result[k]
                for k in ("recommended_dishes", "meal_plan", "follow_up_suggestions")
                if k in result and result[k] is not None
            }
            ChatMessage.objects.create(
                conversation=convo,
                role="assistant",
                content=result.get("response", ""),
                metadata=metadata,
            )
            convo.save(update_fields=["updated_at"])

            result = {**result, "conversation_id": convo.id, "title": convo.title}

        return JsonResponse(result)


@method_decorator(csrf_exempt, name='dispatch')
class NutritionEstimateView(View):
    """
    Local LLM-powered calorie and macro estimation.

    Uses stabilityai/stablelm-2-zephyr-1_6b loaded via transformers.
    Accepts user body metrics and returns personalised daily nutrition targets.
    """

    # ── Validation constants ────────────────────────────────────────
    VALID_SEX = {"male", "female"}
    VALID_ACTIVITY = {"sedentary", "light", "moderate", "active", "very_active"}
    VALID_GOAL = {"fat_loss", "muscle_gain", "maintain"}

    BOUNDS = {
        "age": (10, 120),
        "weight_kg": (20, 500),
        "height_cm": (50, 300),
    }

    def post(self, request, *args, **kwargs):
        from mealPlanning.services import local_llm

        # ── Parse JSON body ─────────────────────────────────────────
        try:
            body = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        # ── Extract and validate required fields ────────────────────
        errors = []

        # Age
        age = body.get("age")
        if age is None:
            errors.append("'age' is required")
        else:
            try:
                age = int(age)
                lo, hi = self.BOUNDS["age"]
                if not (lo <= age <= hi):
                    errors.append(f"'age' must be between {lo} and {hi}")
            except (TypeError, ValueError):
                errors.append("'age' must be a number")

        # Sex
        sex = body.get("sex", "").strip().lower()
        if not sex:
            errors.append("'sex' is required")
        elif sex not in self.VALID_SEX:
            errors.append(f"'sex' must be one of: {', '.join(sorted(self.VALID_SEX))}")

        # Weight
        weight_kg = body.get("weight_kg")
        if weight_kg is None:
            errors.append("'weight_kg' is required")
        else:
            try:
                weight_kg = float(weight_kg)
                lo, hi = self.BOUNDS["weight_kg"]
                if not (lo <= weight_kg <= hi):
                    errors.append(f"'weight_kg' must be between {lo} and {hi}")
            except (TypeError, ValueError):
                errors.append("'weight_kg' must be a number")

        # Height
        height_cm = body.get("height_cm")
        if height_cm is None:
            errors.append("'height_cm' is required")
        else:
            try:
                height_cm = float(height_cm)
                lo, hi = self.BOUNDS["height_cm"]
                if not (lo <= height_cm <= hi):
                    errors.append(f"'height_cm' must be between {lo} and {hi}")
            except (TypeError, ValueError):
                errors.append("'height_cm' must be a number")

        # Activity level
        activity_level = body.get("activity_level", "").strip().lower()
        if not activity_level:
            errors.append("'activity_level' is required")
        elif activity_level not in self.VALID_ACTIVITY:
            errors.append(
                f"'activity_level' must be one of: {', '.join(sorted(self.VALID_ACTIVITY))}"
            )

        # Goal
        goal = body.get("goal", "").strip().lower()
        if not goal:
            errors.append("'goal' is required")
        elif goal not in self.VALID_GOAL:
            errors.append(
                f"'goal' must be one of: {', '.join(sorted(self.VALID_GOAL))}"
            )

        if errors:
            return JsonResponse({"errors": errors}, status=400)

        # ── Call local LLM service ──────────────────────────────────
        result = local_llm.estimate_daily_nutrition(
            age=age,
            sex=sex,
            weight_kg=weight_kg,
            height_cm=height_cm,
            activity_level=activity_level,
            goal=goal,
        )

        return JsonResponse(result)


@method_decorator(csrf_exempt, name='dispatch')
class AIRecommendView(View):
    def post(self, request):
        try:
            body = json.loads(request.body) if request.body else {}
        except json.JSONDecodeError:
            body = {}

        user = None
        goal = "maintain"
        dietary_flags = body.get("dietary_flags", [])
        force_refresh = bool(body.get("force"))
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Token "):
            token_key = auth_header.split(" ", 1)[1].strip()
            token = Token.objects.select_related("user").filter(key=token_key).first()
            if token:
                user = token.user
                profile = ensure_user_profile(user)
                goal = profile.goal or "maintain"

        today = timezone.localdate()
        context_signature = _recommendation_context_signature(goal, dietary_flags)

        if user is not None and not force_refresh:
            snapshot = (
                DailyRecommendationSnapshot.objects
                .filter(user=user, snapshot_date=today)
                .first()
            )
            if snapshot and snapshot.recommendations and snapshot.context_signature == context_signature:
                return JsonResponse({
                    "recommendations": snapshot.recommendations,
                    "tip": snapshot.tip,
                    "cached": True,
                    "snapshot_date": snapshot.snapshot_date.isoformat(),
                    "generated_at": snapshot.generated_at.isoformat(),
                })

        result = _generate_recommendation_payload(goal, dietary_flags, today)

        generated_at = timezone.now()
        if user is not None:
            snapshot, _ = DailyRecommendationSnapshot.objects.update_or_create(
                user=user,
                snapshot_date=today,
                defaults={
                    "context_signature": context_signature,
                    "recommendations": result["recommendations"],
                    "tip": result["tip"],
                },
            )
            generated_at = snapshot.generated_at

        return JsonResponse({
            "recommendations": result["recommendations"],
            "tip": result["tip"],
            "cached": False,
            "snapshot_date": today.isoformat(),
            "generated_at": generated_at.isoformat(),
        })


class AnalyticsEventView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        event_type = str(request.data.get("event_type", "")).strip()
        if event_type not in {
            AIAnalyticsEvent.EVENT_FOLLOW_UP_CLICK,
            AIAnalyticsEvent.EVENT_DISH_ADD,
            "ai_prompt_submitted",
        }:
            return Response({"error": "Unsupported event_type"}, status=status.HTTP_400_BAD_REQUEST)

        session_id = str(request.data.get("session_id", "")).strip()[:64]
        request_id = str(request.data.get("request_id", "")).strip()[:64]
        message = str(request.data.get("message", "")).strip()
        prompt_chars = len(message)
        prompt_tokens = _estimate_tokens_from_text(message) if event_type == "ai_prompt_submitted" else 0

        AIAnalyticsEvent.objects.create(
            event_type=event_type if event_type != "ai_prompt_submitted" else AIAnalyticsEvent.EVENT_AI_CHAT_REQUEST,
            user=request.user,
            session_id=session_id,
            request_id=request_id,
            prompt_chars=prompt_chars,
            prompt_text_redacted=message[:240],
            input_bucket=_bucket_for_prompt_chars(prompt_chars) if prompt_chars else "",
            intent_label=_infer_intent_label(message) if message else "general",
            latency_ms=0,
            success=True,
            error_type="",
            model_name="client_event",
            prompt_tokens=prompt_tokens,
            completion_tokens=0,
            total_tokens=prompt_tokens,
            estimated_cost_usd=_estimate_cost_usd(prompt_tokens, 0),
            follow_up_clicked=event_type == AIAnalyticsEvent.EVENT_FOLLOW_UP_CLICK,
            dish_added_from_ai=event_type == AIAnalyticsEvent.EVENT_DISH_ADD,
        )
        return Response({"ok": True}, status=status.HTTP_201_CREATED)


class SemanticSearchView(APIView):
    """
    GET /api/semantic-search/?q=<query>&hall=<id>&top_k=10
    Returns dishes ranked by semantic similarity to the query.
    Primary AI feature for A9 using sentence-transformers/all-MiniLM-L6-v2.
    """

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if not query:
            return Response(
                {"error": "Query parameter 'q' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(query) > 200:
            return Response(
                {"error": "Query must be 200 characters or fewer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        hall_id = request.query_params.get("hall") or None
        try:
            top_k = min(int(request.query_params.get("top_k", 10)), 20)
        except ValueError:
            top_k = 10

        try:
            from mealPlanning.services import semantic_search
            results = semantic_search.search(query, hall_id=hall_id, top_k=top_k)
        except Exception as exc:
            logger.error("Semantic search error: %s", exc)
            return Response(
                {"error": "Search service unavailable. Try the filter instead."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({
            "results": results,
            "count": len(results),
            "query": query,
            "no_embeddings": not semantic_search.has_current_embeddings(hall_id=hall_id),
        })
