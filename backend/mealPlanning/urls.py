from django.urls import path
from . import views
from . import api_views

urlpatterns = [

    path('halls/', views.dining_hall_view, name='dining_hall_list'),
    path('hall-status/', views.hall_status_view, name='hall_status'),
    

    path('dishes/', views.dish_list_view, name='dish_list'),
    path('dishes/<int:dish_id>', views.dish_detail_view, name='dish_detail'),


    path('profiles/', views.UserProfileBaseView.as_view(), name='user_profiles'),
    path('profiles/<str:netID>/', views.user_profile_detail_view, name='user_profile_detail'),
    path('profile/', views.UserProfileView.as_view(), name='user_profile'),
   

    path('meals/', views.MealListView.as_view(), name='meal_history'),
    path('dishes-manage/', views.DishManagementView.as_view(), name='dish_manage'),

    path('aimeals/', views.AIMealView.as_view(), name='meal_plan'),
    path('ai-chat/', views.AIChatView.as_view(), name='ai_chat'),
    path('conversations/', views.ConversationsView.as_view(), name='conversations_list'),
    path('conversations/<int:convo_id>/', views.ConversationDetailView.as_view(), name='conversation_detail'),

    path('dish-stats/', views.dish_stats_view, name='dish_stats'),

    path('chart/', views.MealSummaryView.as_view(), name='meal-nutrition-chart'),

    path('dish-summary-img/<int:dish_id>/', views.DishSummaryImageView.as_view(), name='dish-chart'),

     path("charts/dishes_per_hall.png", views.dishes_per_hall_png, name="dishes_per_hall_png"),
    path("charts/meals_per_day.png", views.meals_per_day_png, name="meals_per_day_png"),

    path("nutrition-lookup/", views.nutrition_lookup_view, name="nutrition_lookup"),


    path("dishes-by-category/", api_views.api_dishes_by_category, name="api_dishes_by_category"),
    path("meals-per-day/", api_views.api_meals_per_day, name="api_meals_per_day"),
    path("analytics/performance/latency-by-bucket/", api_views.analytics_latency_by_bucket, name="analytics-latency-by-bucket"),
    path("analytics/performance/latency-distribution/", api_views.analytics_latency_distribution, name="analytics-latency-distribution"),
    path("analytics/performance/latency-trend/", api_views.analytics_latency_trend, name="analytics-latency-trend"),
    path("analytics/behavior/dau/", api_views.analytics_behavior_dau, name="analytics-behavior-dau"),
    path("analytics/behavior/intents/", api_views.analytics_behavior_intents, name="analytics-behavior-intents"),
    path("analytics/behavior/conversion/", api_views.analytics_behavior_conversion, name="analytics-behavior-conversion"),
    path("analytics/cost/summary/", api_views.analytics_cost_summary, name="analytics-cost-summary"),
    path("analytics/cost/top-queries/", api_views.analytics_cost_top_queries, name="analytics-cost-top-queries"),
    path("analytics/cost/input-vs-tokens/", api_views.analytics_cost_input_vs_tokens, name="analytics-cost-input-vs-tokens"),

    path("export-meals/", views.ExportMealsView.as_view(), name="export_meals"),
    path("meal-reports/", views.MealReportsView.as_view(), name="meal_reports"),


    path("login/", views.LoginAPIView.as_view(), name = 'api-login'),
    path("register/", views.RegisterAPIView.as_view(), name = 'api-register'),

    path("google-login/", views.GoogleLogin.as_view(), name='api-google-login'),

    path("nutrition-estimate/", views.NutritionEstimateView.as_view(), name="nutrition_estimate"),

    path("daily-intake/", views.DailyIntakeView.as_view(), name="daily-intake"),
    path("daily-history/", views.DailyHistoryView.as_view(), name="daily-history"),
    path("ai-recommend/", views.AIRecommendView.as_view(), name="ai-recommend"),
    path("analytics/event/", views.AnalyticsEventView.as_view(), name="analytics-event"),

    path("semantic-search/", views.SemanticSearchView.as_view(), name="semantic_search"),

]
