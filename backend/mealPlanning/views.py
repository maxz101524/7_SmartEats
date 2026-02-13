from django.shortcuts import render

import json
from  django.http import HttpResponse, JsonResponse
from django.views import View
from django.views.generic import ListView
from .models import DiningHall, Dish, UserProfile, Meal, TempMeal, TempMealItem
from django.db.models import Q, Prefetch, Sum, Count
from io import BytesIO
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import base64
from datetime import datetime


# Create your views here.


def dining_hall_view(request):

    dining_hall = list(DiningHall.objects.values())

    return HttpResponse(json.dumps(dining_hall), content_type="application/json")


def dish_list_view(request):

    dishes = list(Dish.objects.values('dish_id', 'dish_name', 'calories', 'category', 'dining_hall__name'))
    return JsonResponse(dishes,safe=False)


class UserProfileBaseView(View):

    def get(self, request):
        profiles = list(UserProfile.objects.values())

        return JsonResponse(profiles, safe= False)
    

class MealListView(ListView):

    model = Meal

    def render_to_response(self, context, **response_kwargs):
        data = list(self.get_queryset().values())

        return JsonResponse(data,safe=False )


class AIMealView(View):
    """
    Features:
    - Return meals containing ALL specified dishes.
    - Filter meals based on related Dish names.
    - Return the total nutrition content for each meal.
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



class MealSummaryView(View):
    """
    Returns user's historical meal summary.
    Method: GET
    Features:
    - Filter meals by start and end date
    - Return total number of meals
    - Aggregate total nutrition: calories, protein, carbs, fat
    - Generate a pie chart showing nutrition proportion
    """

    def get(self, request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Authentication required"}, status=401)

        start = request.GET.get("start")
        end = request.GET.get("end")

        if not start or not end:
            return JsonResponse({"error": "Please provide start and end dates"}, status=400)

        # Validate date format
        try:
            start_dt = datetime.strptime(start, "%Y-%m-%d")
            end_dt = datetime.strptime(end, "%Y-%m-%d")
        except ValueError:
            return JsonResponse({"error": "Date format must be YYYY-MM-DD"}, status=400)

        # Filter meals
        user_meals = Meal.objects.filter(user=request.user, date__range=[start_dt, end_dt])

        # Aggregations
        total_count = user_meals.count()
        category_stats = user_meals.values('category').annotate(num=Count('meal_id'))
        totals = user_meals.aggregate(
            total_calories=Sum('total_calories') or 0,
            total_protein=Sum('total_protein') or 0,
            total_carbs=Sum('total_carbohydrates') or 0,
            total_fat=Sum('total_fat') or 0
        )

        # Pie chart
        labels = ['Protein', 'Carbs', 'Fat']
        values = [totals['total_protein'], totals['total_carbs'], totals['total_fat']]

        fig, ax = plt.subplots(figsize=(6,6))
        if sum(values) > 0:
            ax.pie(values, labels=labels, autopct='%1.1f%%', startangle=140)
            ax.axis('equal')
            ax.legend(title="Macro Distribution", loc="best")
        else:
            ax.text(0.5, 0.5, 'No historical data found', ha='center', va='center')

        ax.set_title(f"Nutritional Summary for {request.user.username}")

        buffer = BytesIO()
        fig.savefig(buffer, format='png', bbox_inches='tight')
        plt.close(fig)
        buffer.seek(0)

        return HttpResponse(buffer.getvalue(), content_type="image/png")