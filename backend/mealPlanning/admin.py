from django.contrib import admin

from .models import DiningHall, Meal, UserProfile

admin.site.register(DiningHall)
admin.site.register(Meal)
admin.site.register(UserProfile)

