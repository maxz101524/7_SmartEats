from django.shortcuts import get_object_or_404, render

import json
import requests as http_requests
from  django.http import HttpResponse, JsonResponse
from django.views import View
from django.views.generic import ListView
from .models import DiningHall, Dish, UserProfile, Meal, TempMeal, TempMealItem
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


from .models import DiningHall, Dish, UserProfile, Meal
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
            last_name=last_name)

        
            profile = UserProfile.objects.create(
                user=user,
                netID=netID,
                sex=sex,
                age=age,
                height_cm=height_cm,
                weight_kg=weight_kg,
                goal=goal
            )
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

            profile= user.profile

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
        profile=user.profile

        return Response({
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email": user.email,
            "netID": profile.netID,
            "sex": profile.sex,
            "age": profile.age,
            "height_cm": profile.height_cm,
            "weight_kg": profile.weight_kg,
            "goal": profile.goal

        })



def dining_hall_view(request):

    dining_hall = list(DiningHall.objects.values())

    return HttpResponse(json.dumps(dining_hall), content_type="application/json")


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

    dishes = Dish.objects.select_related('dining_hall').all()

    
    if search_query:
        dishes = dishes.filter(dish_name__icontains=search_query)

    data = []
    for dish in dishes:
        data.append({
            'dish_id': dish.dish_id,
            'dish_name': dish.dish_name,
            'calories': dish.calories,
            'category': dish.category,
            'dining_hall__name': dish.dining_hall.name,
            'detail_url': dish.get_absolute_url(),  # model-driven URL
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
    

class MealListView(ListView):

    model = Meal

    def render_to_response(self, context, **response_kwargs):
        data = list(self.get_queryset().values())

        return JsonResponse(data,safe=False )


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



# @login_required
def export_meals(request):
    """
    Export historical Meal records for CURRENT logged-in user as CSV or JSON.
    """

    export_format = request.GET.get("format", "csv").lower()

    # # Filter by current logged-in user
    # meals = Meal.objects.filter(user=request.user.userprofile)

    # temporary testing only
    # Will be replaced with the currently logged-in user once authentication is implemented
    # After that, this view will return only the data belonging to the authenticated user
    fake_user = UserProfile.objects.first()
    meals = Meal.objects.filter(user=fake_user).order_by("-date", "meal_id")

    timestamp = now().strftime("%Y-%m-%d_%H-%M")

    # ---------------- JSON export ----------------
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
            "meals": meal_list
        }

        response = JsonResponse(data, json_dumps_params={"indent": 2})
        response["Content-Disposition"] = f'attachment; filename="my_meals_{timestamp}.json"'
        return response

    # ---------------- CSV export ----------------
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="my_meals_{timestamp}.csv"'

    writer = csv.writer(response)
    writer.writerow([
        "Meal ID",
        "Total Calories",
        "Total Protein (g)",
        "Total Carbohydrates (g)",
        "Total Fat (g)",
        "Date"
    ])

    for meal in meals:
        writer.writerow([
            meal.meal_id,
            meal.total_calories,
            meal.total_protein,
            meal.total_carbohydrates,
            meal.total_fat,
            meal.date
        ])

    return response



class MealReportsView(View):
    """
    Reports page showing:
    - Macronutrient summary
    - Category summary
    - Totals line
    - CSV + JSON download buttons

    TEMPORARY TESTING: uses first user in database until authentication is implemented
    """

    def get(self, request):
        # -------- TEMPORARY TEST USER --------
        current_user = UserProfile.objects.first()  # replace with request.user.userprofile later

        # -------- Filter Meals --------
        start = request.GET.get("start")
        end = request.GET.get("end")

        meals = Meal.objects.filter(user=current_user)
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

        fig.suptitle(f"{current_user.netID}'s Meal Summary", fontsize=18, y=1.02)
        fig.text(0.5, 0.95, f"Total Meals: {total_count}", ha="center", fontsize=12)
        fig.tight_layout(rect=[0, 0, 1, 0.88])

        buffer = BytesIO()
        fig.savefig(buffer, format="png", bbox_inches="tight")
        plt.close(fig)
        buffer.seek(0)
        chart_base64 = base64.b64encode(buffer.getvalue()).decode()

        return JsonResponse({
            "user_info": {
                "netID": current_user.netID,
                "name": current_user.name,
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