# AI Meal & Summary Features
## Overview

This branch introduces two new views:

1.AIMealView
  
2.MealSummaryView

It also includes updates to the data model to better support AI integration and historical tracking.

# AIMealView

AIMealView is for the Meal Recommendation Page. It provides AI-generated meal combinations for users, including: Meal name, Contained dishes and Nutritional information (calories, protein, carbohydrates, fat)

<img width="2940" height="644" alt="image" src="https://github.com/user-attachments/assets/5c8ad9cb-4595-4601-bd9a-1fd719add7e5" />


At this stage, AI-generated meals are simulated using hard-coded temporary models:

TempMeal

TempMealItem

These simulate:

AI-generated dish combinations

The quantity of each dish included (since dishes are served buffet-style)

🔹 Future Development

In future iterations:

AI-generated combinations will be dynamically created

A dedicated ai_models.py module will store AI-related models

Temporary tables will be regenerated each time AI logic is triggered

2️⃣ MealSummaryView

MealSummaryView provides a historical summary for each user.

It supports:

Filtering meals by date range

Returning total consumed meal count

Aggregating total nutritional intake

Generating a nutrition percentage pie chart

This enables users to:

Track historical intake

Understand macronutrient distribution

Monitor dietary balance over time

3️⃣ Data Model Design Updates

The data model has been refined to reflect system behavior and data lifecycle:

🔹 Dish Table (Fast-Changing Table)

Frequently updated

Refreshed bi-weekly via web scraping

Represents the current dining hall offerings

🔹 Meal Table (Slow-Changing Table)

Stores users’ historical consumption records

Represents past meals

Should never be overwritten

This separation ensures:

Stability of historical records

Flexibility for dynamic menu updates

Clear distinction between system-generated data and user history

🔹 AI-Generated Tables (Temporary)

AI will generate temporary tables containing combinations of dishes.

These tables:

Are transient

Refresh every time AI logic is triggered

Will later be managed via a dedicated ai_models.py

Currently simulated using:

TempMeal

TempMealItem

🔹 User Profile Extension

We extend Django’s built-in User model via a UserProfile model to store personalized health-related data.

This approach:

Avoids redefining built-in fields (e.g., email)

Prevents redundant code

Keeps authentication clean and maintainable

Supports future personalization features
