# AI Meal & Summary Features
## Overview

This branch introduces two new views:

1.AIMealView
  
2.MealSummaryView

It also includes updates to the data model to better support AI integration and historical tracking.

# AIMealView

AIMealView is for the Meal Recommendation Page. It provides AI-generated meal combinations for users, including: Meal name, Contained dishes and Nutritional information (calories, protein, carbohydrates, fat)

<img width="2940" height="644" alt="image" src="https://github.com/user-attachments/assets/5c8ad9cb-4595-4601-bd9a-1fd719add7e5" />


At this stage, AI-generated meals are simulated using hard-coded temporary models (TempMeal and TempMealItem) to simulate AI-generated dish combinations

After we incorporated AI model, a dedicated ai_models.py module will store AI-related temperory models

# MealSummaryView

MealSummaryView provides a historical summary for each user.

It supports: Filtering meals by date range, Returning total consumed meal count, Aggregating total nutritional intake, and Generating a nutrition percentage pie chart

<img width="2940" height="1912" alt="image" src="https://github.com/user-attachments/assets/4bfbaead-864d-472a-8412-d465fa5a64f9" />

# Data Model Design Updates

We extend Django’s built-in User model via a UserProfile model to store personalized health-related data to avoid redefining built-in fields (e.g., email)
