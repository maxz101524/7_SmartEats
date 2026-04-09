from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("mealPlanning", "0008_dish_embedding"),
    ]

    operations = [
        migrations.AlterField(
            model_name="dish",
            name="embedding",
            field=models.BinaryField(
                blank=True,
                help_text="Pickled embedding payload with a normalized 384-dim all-MiniLM-L6-v2 vector",
                null=True,
            ),
        ),
    ]
