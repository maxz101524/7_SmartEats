from django.shortcuts import render

import json
from  django.http import HttpResponse, JsonResponse
from django.views import View
from django.views.generic import ListView
from .models import DiningHall, Dish, UserProfile, Meal
from django.forms.models import model_to_dict
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
# Create your views here.


def dining_hall_view(request):

    dining_hall = list(DiningHall.objects.values())

    return HttpResponse(json.dumps(dining_hall), content_type="application/json")


# def dish_list_view(request):

#     dishes = list(Dish.objects.values('dish_id', 'dish_name', 'calories', 'category', 'dining_hall__name'))
#     return JsonResponse(dishes,safe=False)


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

    dishes = Dish.objects.all()

    
    if search_query:
        dishes = dishes.filter(dish_name__icontains=search_query)

    data = list(dishes.values(
        'dish_id', 'dish_name', 'calories', 'category', 'dining_hall__name'
    ))
    
    return JsonResponse(data, safe=False)

def dish_detail_view(request, dish_id):
    
    dish = Dish.objects.get(pk=dish_id)
    data = model_to_dict(dish)
    data['dining_hall__name'] = dish.dining_hall.name
    return JsonResponse(data)


class UserProfileBaseView(View):

    def get(self, request):
        profiles = []
        for profile in UserProfile.objects.all():
            data = model_to_dict(profile, exclude=['meals'])
            data['get_absolute_url'] = profile.get_absolute_url()
            profiles.append(data)

        return JsonResponse(profiles, safe=False)
    

class MealListView(ListView):

    model = Meal

    def render_to_response(self, context, **response_kwargs):
        data = list(self.get_queryset().values())

        return JsonResponse(data,safe=False )
