from django.shortcuts import render

import json
from  django.http import HttpResponse, JsonResponse
from django.views import View
from django.views.generic import ListView
from .models import DiningHall, Dish, UserProfile, Meal, TempMeal, TempMealItem
from django.db.models import Q, Prefetch
from django.db.models import Sum, Count
from io import BytesIO
import matplotlib.pyplot as plt
import base64

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
    - Multi-dish requirement search (Return meals containing ALL specified dishes).
    - GET: For simple queries (< 3 dishes) to allow sharing.
    - POST: For complex queries (>= 3 dishes) to prevent URL overflow/bloat.
    - Relationship Spanning: Filter meals based on related Dish names.
    - Nutrition Calculation: Summation of macros per meal.
    """

    def _get_meals_by_dishes(self, dish_names_list, show_hidden=False):
        """
        Core logic: Finds meals that contain EVERY dish in the dish_names_list.
        """
        if not dish_names_list:
            return []

        # 1. Clean the input list
        dish_names = [name.strip() for name in dish_names_list if name.strip()]
        num_dishes = len(dish_names)

        # 2. Relationship Spanning & Filtering
        # We find meals that have items matching the names, then ensure the count
        # of matches equals the count of searched dishes (The 'AND' logic).
        meals_qs = TempMeal.objects.filter(
            items__dish__dish_name__in=dish_names
        ).annotate(
            matches=Count('items__dish__dish_name', distinct=True)
        ).filter(matches=num_dishes)

        # 3. Privacy Filter (Assignment requirement: hide data)
        if not show_hidden:
            meals_qs = meals_qs.filter(is_public=True)

        # 4. Data Transformation & Nutrition Calculation
        results = []
        for meal in meals_qs:
            # Span to TempMealItem and related Dish for calculation
            meal_items = meal.items.all().select_related('dish')

            total_calories = total_protein = total_carbs = total_fat = 0
            dish_list = []

            for item in meal_items:
                factor = item.weight_in_grams / 100.0
                total_calories += item.dish.calories * factor
                total_protein += item.dish.protein * factor
                total_carbs += item.dish.carbohydrates * factor
                total_fat += item.dish.fat * factor

                dish_list.append({
                    "name": item.dish.dish_name,
                    "weight": item.weight_in_grams
                })

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
        # GET for simple sharing (1-2 dishes)
        raw_dishes = request.GET.get("dishes", "")
        dish_list = raw_dishes.split(",") if raw_dishes else []

        # Logic check: If user tries to send too many via GET, we could redirect or handle here
        # For assignment purposes, we process it but mark it as 'Simple Search'
        data = self._get_meals_by_dishes(dish_list, show_hidden=False)

        return JsonResponse({
            "mode": "GET_Simple_Search",
            "count": len(data),
            "results": data
        })

    def post(self, request, *args, **kwargs):
        # POST for complex/snapshot queries (3+ dishes)
        # Prevents long URLs like ?dishes=Chicken,Broccoli,Rice,Egg,Spinach,Tomato...
        raw_dishes = request.POST.get("dishes", "")
        show_hidden = request.POST.get("show_hidden", "false").lower() == "true"

        dish_list = raw_dishes.split(",") if raw_dishes else []

        data = self._get_meals_by_dishes(dish_list, show_hidden=show_hidden)

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
            # 1. Get query parameters
            start_date = request.GET.get("start")
            end_date = request.GET.get("end")

            if not start_date or not end_date:
                return JsonResponse({"error": "Please provide 'start' and 'end' date parameters"}, status=400)

            # 2. Filter meals for the current user in the given date range
            user_meals = Meal.objects.filter(user=request.user, date__range=[start_date, end_date])

            # 3. Calculate total number of meals
            total_meals = user_meals.count()  # One total (count)

            # 4. Aggregate total nutrition (One grouped summary)
            totals = user_meals.aggregate(
                total_calories=Sum('total_calories'),
                total_protein=Sum('total_protein'),
                total_carbs=Sum('total_carbohydrates'),
                total_fat=Sum('total_fat')
            )

            # Ensure zero if no meals
            total_calories = totals['total_calories'] or 0
            total_protein = totals['total_protein'] or 0
            total_carbs = totals['total_carbs'] or 0
            total_fat = totals['total_fat'] or 0

            # 5. Generate pie chart for protein/carbs/fat proportion (Visualization)
            labels = ['Protein', 'Carbs', 'Fat']
            values = [total_protein, total_carbs, total_fat]

            fig, ax = plt.subplots()
            if sum(values) == 0:
                # Avoid matplotlib warning if all zeros
                ax.text(0.5, 0.5, 'No data', ha='center', va='center')
            else:
                ax.pie(values, labels=labels, autopct='%1.1f%%')
            ax.set_title(f'Nutrition from {start_date} to {end_date}')

            # Convert pie chart to base64
            buffer = BytesIO()
            fig.savefig(buffer, format='png', bbox_inches='tight')
            plt.close(fig)
            buffer.seek(0)
            image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

            # 6. Return JSON with stats + pie chart
            response_data = {
                "total_meals": total_meals,
                "total_nutrition": {
                    "calories": total_calories,
                    "protein": total_protein,
                    "carbs": total_carbs,
                    "fat": total_fat
                },
                "nutrition_pie_chart_base64": image_base64
            }

            return JsonResponse(response_data)