from django.shortcuts import render

def template_test_full(request):
    return render(request, "mealPlanning/list.html", {
"page_title": "Section 3 - Normal List",
"items": ["Apple", "Banana", "Carrot"],
})

def template_test_empty(request):
    return render(request, "mealPlanning/list.html", {
"page_title": "Section 3 - Empty List",
"items": [],
})
