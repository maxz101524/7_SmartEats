import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def add_id_as_pk(apps, schema_editor):
    if schema_editor.connection.vendor == 'postgresql':
        # PostgreSQL: properly swap primary key from netID → id
        schema_editor.execute(
            'ALTER TABLE "mealPlanning_userprofile" DROP CONSTRAINT "mealPlanning_userprofile_pkey"'
        )
        schema_editor.execute(
            'ALTER TABLE "mealPlanning_userprofile" ALTER COLUMN "netID" DROP NOT NULL'
        )
        schema_editor.execute(
            'ALTER TABLE "mealPlanning_userprofile" ADD CONSTRAINT '
            '"mealPlanning_userprofile_netID_ab5f1c7a_uniq" UNIQUE ("netID")'
        )
        schema_editor.execute(
            'ALTER TABLE "mealPlanning_userprofile" ADD COLUMN "id" bigserial PRIMARY KEY'
        )
    # SQLite: no-op — it already accepted the original AddField with primary_key=True
    # (SQLite silently keeps the first PK; Django state handles the rest)


def reverse_add_id_as_pk(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('mealPlanning', '0001_initial'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(add_id_as_pk, reverse_add_id_as_pk),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='userprofile',
                    name='id',
                    field=models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID'),
                ),
                migrations.AlterField(
                    model_name='userprofile',
                    name='netID',
                    field=models.CharField(blank=True, max_length=50, null=True, unique=True),
                ),
            ],
        ),
    ]
