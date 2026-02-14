from django.urls import path
from . import views

urlpatterns = [

    path('halls/', views.dining_hall_view, name='dining_hall_list'),
    

    path('dishes/', views.dish_list_view, name='dish_list'),
    path('dishes/<int:dish_id>', views.dish_detail_view, name='dish_detail'),


    path('profiles/', views.UserProfileBaseView.as_view(), name='user_profiles'),
   

    path('meals/', views.MealListView.as_view(), name='meal_history'),
    path('dishes-manage/', views.DishManagementView.as_view(), name='dish_manage'),

    path('aimeals/', views.AIMealView.as_view(), name='meal_plan'),

    path('chart/', views.MealSummaryView.as_view(), name='meal-nutrition-chart'),

    path('dish-summary-img/<int:dish_id>/', views.DishSummaryImageView.as_view(), name='dish-chart'),

]