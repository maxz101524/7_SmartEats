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
