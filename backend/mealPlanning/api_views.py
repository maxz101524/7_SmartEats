from django.http import JsonResponse
from django.db.models import Count
from .models import Dish, Meal

def api_dishes_by_category(request):
    if request.method != "GET":
        return JsonResponse({"error": "GET only"}, status=405)

    qs = (
        Dish.objects
        .values("category")
        .annotate(count=Count("dish_id"))
        .order_by("-count")
    )
    return JsonResponse(list(qs), safe=False)

def api_meals_per_day(request):
    if request.method != "GET":
        return JsonResponse({"error": "GET only"}, status=405)

    qs = (
        Meal.objects
        .values("date")
        .annotate(count=Count("meal_id"))
        .order_by("date")
    )
    data = [{"date": r["date"].isoformat(), "count": r["count"]} for r in qs]
    return JsonResponse(data, safe=False)
