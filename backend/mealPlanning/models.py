from django.db import models
from django.urls import reverse

class DiningHall(models.Model):

    """
    This represents dining halls in university 

    This model exists to organize menu items by their specific location, allowing students 
    to filter and compare nutritional options across dining halls university
    """
    Dining_Hall_ID = models.AutoField(primary_key=True)
    name = models.CharField(max_length=200)
    location =  models.CharField(max_length=300)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['name'], name = 'uniqueHall'
            )
        ]
        ordering = ["name"]

    def __str__(self):
        return self.name

    
class Dish(models.Model):
    dish_id = models.AutoField(primary_key=True)

    dish_name = models.CharField(max_length=200)
    

   
    category = models.CharField(max_length=50)

    calories = models.PositiveIntegerField(default=0)
    protein = models.PositiveIntegerField(default=0)
    carbohydrates = models.PositiveIntegerField(default=0)
    fat = models.PositiveIntegerField(default=0)

    def get_absolute_url(self):
        return reverse('dish_detail', kwargs={'dish_id': self.dish_id})

   

    dining_hall = models.ForeignKey(
        DiningHall,
        on_delete= models.CASCADE,
        related_name="dish"
    )

    class Meta:
        unique_together = ("dish_name", "dining_hall")
        ordering = ["dining_hall", "dish_name"]

    def __str__(self):
        return f"{self.dish_name} ({self.dining_hall})"
    
class UserProfile(models.Model):

    """
    Represents a student user of the SmartEats application. 
    
    It exists to store personalized health data (height, weight, age) and track 
    consumed meals, enabling the application to calculate cumulative daily intake 
    and provide progress tracking toward health goals. 

    """
    netID = models.CharField(max_length=50, primary_key=True)
    name = models.CharField(max_length=100)
    lastName = models.CharField(max_length=100)


    sex = models.CharField(
        max_length=10,
        choices=[("male", "Male"), ("female", "Female")],
        blank=True,
        null=True,
        help_text="User gender, used for calculating BMR"
    )
    age = models.PositiveIntegerField(
        blank=True,
        null=True,
        help_text="User age in years"
    )
    height_cm = models.DecimalField(
        max_digits=5, decimal_places=2,
        blank=True, null=True,
        help_text="User height in centimeters"
    )
    weight_kg = models.DecimalField(
        max_digits=5, decimal_places=2,
        blank=True, null=True,
        help_text="User weight in kilograms"
    )

  
    goal = models.CharField(
        max_length=20,
        choices=[("fat_loss", "Fat Loss"), ("muscle_gain", "Muscle Gain")],
        blank=True,
        null=True,
        help_text="User fitness goal, e.g., fat loss or muscle gain"
    )

    
    
  
    

    class Meta:

        ordering = ["netID", "name" , "lastName"]


    def __str__(self):
        return f"{self.name} {self.lastName}: ({self.netID})"

    def get_absolute_url(self):
        return reverse('user_profile_detail', kwargs={'netID': self.netID})
    



    

class Meal(models.Model):

    """
    Represents an individual food item or dish served within a dining hall. 
    
    This model is the core of the system's analytics; it stores AI-enriched macronutrient 
    data (protein, carbs, fats) and calorie counts to eliminate the "information gap" 
    students face when making dietary choices. . It also includes a date field for tracking each student’s macronutrient intake per day.
    """

    meal_id = models.AutoField(primary_key=True)
    
    category = models.CharField(blank=True, null=True)

    total_calories = models.PositiveIntegerField(default=0)
    total_protein = models.PositiveIntegerField(default=0)
    total_carbohydrates = models.PositiveIntegerField(default=0)
    total_fat = models.PositiveIntegerField(default=0)

    # This table should not be linked to the Dish table.
    # The Dish table is updated bi-weekly, whereas this Meal table stores historical records.
    contain_dish = models.CharField(blank=True)

    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name="meals")
    date = models.DateField(auto_now_add=True) 

    class Meta:


        ordering = ["meal_id"] 

    def __str__(self):
         return f"{self.meal_id}"


class TempMeal(models.Model):
    """
    Temporary model to simulate AI-generated meal.

    Notes:
    - After AI integration, this model can be replaced by a memory-based model in ai_models.py
    """

    meal_id = models.AutoField(primary_key=True)
    meal_name = models.CharField(max_length=100)


    class Meta:
        ordering = ["meal_id"]

    def __str__(self):
        return f"{self.meal_name}"




class TempMealItem(models.Model):
    """
    Temporary model to simulate AI-generated meal items.
    Each record represents a Dish with a specific portion weight in a Meal.

    Notes:
    - After AI integration, this model can be replaced by a memory-based model in ai_models.py
    - Nutritional calculations will be done in the view using the dish nutrition and weight_in_grams
    """
    meal = models.ForeignKey(
        TempMeal,
        on_delete=models.CASCADE,
        related_name="items"
    )

    dish = models.ForeignKey(
        Dish,
        on_delete=models.CASCADE
    )

    weight_in_grams = models.FloatField()

    class Meta:
        verbose_name = "Temporary Meal Item"
        verbose_name_plural = "Temporary Meal Items"

    def __str__(self):
        return f"{self.dish.dish_name} - {self.weight_in_grams}g"
