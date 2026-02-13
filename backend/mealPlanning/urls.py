from django.urls import path
from . import views

urlpatterns = [

    path('halls/', views.dining_hall_view, name='dining_hall_list'),
    

    path('dishes/', views.dish_list_view, name='dish_list'),

    path('profiles/', views.UserProfileBaseView.as_view(), name='user_profiles'),
    
  
    path('meals/', views.MealListView.as_view(), name='meal_history'),

    path('aimeals/', views.AIMealView.as_view(), name='meal_plan'),

    path('chart/', views.MealSummaryView.as_view(), name='meal-nutrition-chart'),

]