from django.urls import path
from . import views
from . import api_views

urlpatterns = [

    path('halls/', views.dining_hall_view, name='dining_hall_list'),
    

    path('dishes/', views.dish_list_view, name='dish_list'),
    path('dishes/<int:dish_id>', views.dish_detail_view, name='dish_detail'),


    path('profiles/', views.UserProfileBaseView.as_view(), name='user_profiles'),
    path('profiles/<str:netID>/', views.user_profile_detail_view, name='user_profile_detail'),
   

    path('meals/', views.MealListView.as_view(), name='meal_history'),
    path('dishes-manage/', views.DishManagementView.as_view(), name='dish_manage'),

    path('aimeals/', views.AIMealView.as_view(), name='meal_plan'),

    path('dish-stats/', views.dish_stats_view, name='dish_stats'),

    path('chart/', views.MealSummaryView.as_view(), name='meal-nutrition-chart'),

    path('dish-summary-img/<int:dish_id>/', views.DishSummaryImageView.as_view(), name='dish-chart'),

     path("charts/dishes_per_hall.png", views.dishes_per_hall_png, name="dishes_per_hall_png"),
    path("charts/meals_per_day.png", views.meals_per_day_png, name="meals_per_day_png"),

    path("nutrition-lookup/", views.nutrition_lookup_view, name="nutrition_lookup"),


    path("dishes-by-category/", api_views.api_dishes_by_category, name="api_dishes_by_category"),
    path("meals-per-day/", api_views.api_meals_per_day, name="api_meals_per_day"),

]