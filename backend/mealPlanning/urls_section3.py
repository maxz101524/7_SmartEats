from django.urls import path
from . import views_section3

urlpatterns = [
path("template-test/full/", views_section3.template_test_full, 
name="section3_full"),
path("template-test/empty/", views_section3.template_test_empty, 
name="section3_empty"),
]
