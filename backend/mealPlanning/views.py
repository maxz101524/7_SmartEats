from django.shortcuts import render

import json
from  django.http import HttpResponse, JsonResponse
from django.views import View
from django.views.generic import ListView
from .models import DiningHall, Dish, UserProfile, Meal

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


import io
from datetime import timedelta

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from django.db.models import Count
from django.shortcuts import render
from django.utils import timezone

from .models import Dish, Meal


def dishes_per_hall_png(request):
    qs = (
        Dish.objects
        .values("dining_hall__name")
        .annotate(n=Count("id"))
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
        .annotate(n=Count("id"))
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


def charts_page(request):
    return render(request, "charts.html")