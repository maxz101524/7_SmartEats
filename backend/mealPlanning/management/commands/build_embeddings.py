from django.core.management.base import BaseCommand

from mealPlanning.models import Dish
from mealPlanning.services import semantic_search


class Command(BaseCommand):
    help = "Compute and store embeddings for dishes that are missing them."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Re-embed all dishes, even those with existing embeddings.",
        )

    def handle(self, *args, **options):
        qs = Dish.objects.all() if options["force"] else Dish.objects.filter(embedding=None)
        total = qs.count()
        self.stdout.write(f"Embedding {total} dishes...")

        success = 0
        for i, dish in enumerate(qs, 1):
            try:
                text = semantic_search.dish_text(dish)
                dish.embedding = semantic_search.encode_to_bytes(text)
                dish.save(update_fields=["embedding"])
                success += 1
            except Exception as exc:
                self.stderr.write(f"  Failed: {dish.dish_name} — {exc}")

            if i % 20 == 0:
                self.stdout.write(f"  {i}/{total}")

        self.stdout.write(self.style.SUCCESS(f"Done. {success}/{total} dishes embedded."))
