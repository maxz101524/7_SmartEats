from django.urls import path
from . import views

urlpatterns = [

    path('halls/', views.dining_hall_view, name='dining_hall_list'),
    

    path('dishes/', views.dish_list_view, name='dish_list'),

    path('profiles/', views.UserProfileBaseView.as_view(), name='user_profiles'),
    
  
    path('meals/', views.MealListView.as_view(), name='meal_history'),

    # data visualization(matplotlib)
    path("charts/", views.charts_page, name="charts_page"),
    path("charts/dishes_per_hall.png", views.dishes_per_hall_png, name="dishes_per_hall_png"),
    path("charts/meals_per_day.png", views.meals_per_day_png, name="meals_per_day_png"),
]