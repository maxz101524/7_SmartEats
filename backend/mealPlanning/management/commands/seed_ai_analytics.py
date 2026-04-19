import random
from decimal import Decimal
from uuid import uuid4

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.utils import timezone

from mealPlanning.models import AIAnalyticsEvent


INTENTS = [
    "high_protein",
    "vegetarian",
    "allergy",
    "low_carb",
    "calorie_control",
    "general",
]

PROMPT_SNIPPETS = {
    "high_protein": [
        "High protein meal?",
        "High protein lunch ideas at ISR today under 30 minutes",
        "I'm trying to hit 150g of protein a day, can you build me a high protein lunch plan using Ikenberry options right now?",
        "Build me a high protein meal plan for today covering breakfast, lunch, and dinner across Ikenberry and PAR so I get at least 160g protein without going over 2400 calories",
    ],
    "vegetarian": [
        "Vegetarian meals?",
        "What vegetarian options are there today at PAR?",
        "I'm vegetarian and lactose intolerant, what can I eat for dinner tonight at Ikenberry that still hits 80g of protein?",
        "Plan me a full vegetarian day across ISR and Ikenberry that covers at least 2000 calories, 90g protein, and avoids any dairy or eggs since I'm trying to go closer to vegan this week",
    ],
    "allergy": [
        "Peanut-free meals?",
        "I need peanut-free meal options tonight",
        "I have a tree nut allergy and also need gluten-free dishes, what's safe for me tonight at Ikenberry under 700 calories?",
        "My partner has a severe peanut and tree nut allergy, plus shellfish, we're eating at Ikenberry and PAR this week, can you plan 4 safe dinners that hit 2200 calories and 100g protein each?",
    ],
    "low_carb": [
        "Low carb dinner?",
        "Low carb dinner suggestions for tonight",
        "I'm doing keto and want a lunch under 25g of net carbs with at least 40g protein, what should I pick at ISR today?",
        "Plan me a strict low carb week across all three dining halls, each day under 60g net carbs, above 130g protein, and include macros so I can log everything in my tracker",
    ],
    "calorie_control": [
        "Meal under 450 cal?",
        "Find me a meal under 450 calories for lunch",
        "I'm cutting and want three meals today totaling under 1500 calories but still hitting 130g of protein, what should I pick at PAR and Ikenberry?",
        "Design a 7 day cut plan for me using SmartEats, each day under 1800 kcal, 180g protein, 150g carbs max, fiber at least 30g, using Ikenberry, ISR and PAR and varying the protein sources",
    ],
    "general": [
        "What's good?",
        "What is good at PAR today?",
        "I'm not sure what to eat, can you surprise me with a balanced lunch at Ikenberry that's satisfying but not super heavy?",
        "I'm new to SmartEats and not sure how to use this, can you just show me what's popular today across all dining halls and explain how to add a meal to my tray so I can try it out?",
    ],
}


class Command(BaseCommand):
    help = "Seed AI analytics dashboard data with realistic synthetic events."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=14)
        parser.add_argument("--events-per-day", type=int, default=24)
        parser.add_argument("--reset", action="store_true")

    def handle(self, *args, **options):
        days = max(1, options["days"])
        events_per_day = max(5, options["events_per_day"])
        should_reset = options["reset"]

        users = list(User.objects.all()[:20])
        if not users:
            self.stdout.write(self.style.ERROR("No users found. Create users before seeding analytics."))
            return

        if should_reset:
            deleted, _ = AIAnalyticsEvent.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Deleted {deleted} existing analytics events."))

        created = 0
        now = timezone.now()

        for day_offset in range(days):
            base_day = now - timezone.timedelta(days=day_offset)
            for _ in range(events_per_day):
                user = random.choice(users)
                session_id = f"sess_{uuid4().hex[:12]}"
                request_id = f"req_{uuid4().hex[:12]}"
                intent = random.choices(INTENTS, weights=[22, 12, 10, 10, 12, 34], k=1)[0]
                # Weight toward shorter prompts but with a long tail for realism.
                prompt_variants = PROMPT_SNIPPETS[intent]
                prompt = random.choices(
                    prompt_variants,
                    weights=[35, 40, 18, 7][: len(prompt_variants)],
                    k=1,
                )[0]
                prompt_chars = len(prompt)
                prompt_tokens = max(6, round(prompt_chars / 4))
                # Completion scales loosely with prompt complexity.
                completion_tokens = random.randint(80, 260) + (prompt_chars // 6)
                total_tokens = prompt_tokens + completion_tokens

                # Latency scales loosely with prompt length and completion size.
                base_latency = random.randint(650, 1600)
                base_latency += min(1200, prompt_chars * 2)
                base_latency += completion_tokens // 2
                if intent in {"allergy", "high_protein"}:
                    base_latency += random.randint(100, 260)
                if random.random() < 0.08:
                    base_latency += random.randint(650, 1800)

                estimated_cost = (
                    Decimal(prompt_tokens) / Decimal("1000000") * Decimal("0.15")
                    + Decimal(completion_tokens) / Decimal("1000000") * Decimal("0.60")
                )

                event = AIAnalyticsEvent.objects.create(
                    event_type=AIAnalyticsEvent.EVENT_AI_CHAT_REQUEST,
                    user=user,
                    session_id=session_id,
                    request_id=request_id,
                    prompt_chars=prompt_chars,
                    prompt_text_redacted=prompt,
                    input_bucket=(
                        "0-50"
                        if prompt_chars <= 50
                        else "51-150"
                        if prompt_chars <= 150
                        else "151-300"
                        if prompt_chars <= 300
                        else "301+"
                    ),
                    intent_label=intent,
                    latency_ms=base_latency,
                    success=random.random() > 0.04,
                    error_type="timeout" if random.random() < 0.03 else "",
                    model_name="gemini-3-flash-preview",
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=total_tokens,
                    estimated_cost_usd=estimated_cost,
                )
                event.timestamp = base_day - timezone.timedelta(minutes=random.randint(0, 1400))
                event.save(update_fields=["timestamp"])
                created += 1

                if random.random() < 0.32:
                    follow_up = AIAnalyticsEvent.objects.create(
                        event_type=AIAnalyticsEvent.EVENT_FOLLOW_UP_CLICK,
                        user=user,
                        session_id=session_id,
                        request_id=request_id,
                        prompt_text_redacted="Follow up clicked",
                        follow_up_clicked=True,
                        model_name="client_event",
                    )
                    follow_up.timestamp = event.timestamp + timezone.timedelta(minutes=random.randint(1, 10))
                    follow_up.save(update_fields=["timestamp"])
                    created += 1

                if random.random() < 0.41:
                    dish_add = AIAnalyticsEvent.objects.create(
                        event_type=AIAnalyticsEvent.EVENT_DISH_ADD,
                        user=user,
                        session_id=session_id,
                        request_id=request_id,
                        prompt_text_redacted="Dish added from AI",
                        dish_added_from_ai=True,
                        model_name="client_event",
                    )
                    dish_add.timestamp = event.timestamp + timezone.timedelta(minutes=random.randint(2, 20))
                    dish_add.save(update_fields=["timestamp"])
                    created += 1

        self.stdout.write(self.style.SUCCESS(f"Created {created} synthetic analytics events."))
