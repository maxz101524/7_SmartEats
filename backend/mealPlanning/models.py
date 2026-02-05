from django.db import models

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

    

class Meal(models.Model):

    """
    Represents an individual food item or dish served within a dining hall. 
    
    This model is the core of the system's analytics; it stores AI-enriched macronutrient 
    data (protein, carbs, fats) and calorie counts to eliminate the "information gap" 
    students face when making dietary choices. . It also includes a date field for tracking each student’s macronutrient intake per day.
    """

    Meal_ID = models.AutoField(primary_key=True)
 
    name = models.CharField(max_length=200)

    calories = models.PositiveIntegerField(default=0)

    protein = models.PositiveIntegerField(default=0)
    carbohydrate = models.PositiveIntegerField(default=0)
    fat = models.PositiveIntegerField(default =0)

    date =models.DateField(auto_now_add=True)


    diningHall = models.ForeignKey(
        DiningHall,
        on_delete= models.CASCADE,
        related_name="meals"


    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['name','diningHall'], name = 'uniqueMeal'
            )
        ]

        ordering = ["diningHall", "name"] #sort dining hall first then name

    def __str__(self):
         return f"{self.name}: {self.diningHall}"


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
    age = models.PositiveIntegerField(default=0)
   
    height = models.DecimalField(max_digits=5, decimal_places=2)
    weight = models.DecimalField(max_digits=5, decimal_places=2)
    
  
    meals = models.ManyToManyField(Meal, related_name="users", blank= True)

    class Meta:

        ordering = ["netID", "name" , "lastName"]


    def __str__(self):
        return f"{self.name} {self.lastName}: ({self.netID})"
    


