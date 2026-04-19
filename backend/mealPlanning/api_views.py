from django.db.models import Avg, Count, Sum
from django.db.models.functions import TruncDate
from django.http import JsonResponse
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import AIAnalyticsEvent, Dish, Meal


def _analytics_base_qs():
    return AIAnalyticsEvent.objects.filter(event_type=AIAnalyticsEvent.EVENT_AI_CHAT_REQUEST)


def _percentile(sorted_values, percentile):
    if not sorted_values:
        return 0
    index = int(round((len(sorted_values) - 1) * percentile))
    return sorted_values[index]


def api_dishes_by_category(request):
    if request.method != "GET":
        return JsonResponse({"error": "GET only"}, status=405)

    qs = Dish.objects.values("category").annotate(count=Count("dish_id")).order_by("-count")
    return JsonResponse(list(qs), safe=False)


def api_meals_per_day(request):
    if request.method != "GET":
        return JsonResponse({"error": "GET only"}, status=405)

    qs = Meal.objects.values("date").annotate(count=Count("meal_id")).order_by("date")
    data = [{"date": r["date"].isoformat(), "count": r["count"]} for r in qs]
    return JsonResponse(data, safe=False)


BUCKET_ORDER = ["0-50", "51-150", "151-300", "301+"]


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def analytics_latency_by_bucket(request):
    qs = (
        _analytics_base_qs()
        .values("input_bucket")
        .annotate(avg_latency_ms=Avg("latency_ms"), count=Count("id"))
    )
    rows = {row["input_bucket"] or "unknown": row for row in qs}
    ordered = []
    for bucket in BUCKET_ORDER:
        row = rows.get(bucket)
        if not row or not row["count"]:
            continue
        ordered.append(
            {
                "bucket": bucket,
                "avg_latency_ms": round(row["avg_latency_ms"] or 0, 2),
                "count": row["count"],
            }
        )
    return Response(ordered)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def analytics_latency_distribution(request):
    latencies = list(
        _analytics_base_qs().values_list("latency_ms", flat=True).exclude(latency_ms=0)
    )
    if not latencies:
        return Response([])

    max_latency = max(latencies)
    bucket_size = max(100, (max_latency // 8) or 1)
    bins = {}
    for latency in latencies:
        start = (latency // bucket_size) * bucket_size
        end = start + bucket_size
        label = f"{start}-{end}"
        bins[label] = bins.get(label, 0) + 1

    ordered = sorted(bins.items(), key=lambda item: int(item[0].split("-")[0]))
    return Response([{"latency_range": label, "count": count} for label, count in ordered])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def analytics_latency_trend(request):
    days = max(1, min(int(request.query_params.get("days", 14)), 60))
    since = timezone.now() - timezone.timedelta(days=days)
    day_qs = (
        _analytics_base_qs()
        .filter(timestamp__gte=since)
        .annotate(day=TruncDate("timestamp"))
        .values("day")
        .annotate(avg_latency_ms=Avg("latency_ms"), count=Count("id"))
        .order_by("day")
    )
    latencies = sorted(
        _analytics_base_qs()
        .filter(timestamp__gte=since)
        .exclude(latency_ms=0)
        .values_list("latency_ms", flat=True)
    )
    return Response(
        {
            "series": [
                {
                    "date": row["day"].isoformat(),
                    "avg_latency_ms": round(row["avg_latency_ms"] or 0, 2),
                    "count": row["count"],
                }
                for row in day_qs
            ],
            "summary": {
                "p50_latency_ms": _percentile(latencies, 0.5),
                "p95_latency_ms": _percentile(latencies, 0.95),
                "request_count": len(latencies),
            },
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def analytics_behavior_dau(request):
    days = max(1, min(int(request.query_params.get("days", 14)), 60))
    since = timezone.now() - timezone.timedelta(days=days)
    qs = (
        _analytics_base_qs()
        .filter(timestamp__gte=since, user__isnull=False)
        .annotate(day=TruncDate("timestamp"))
        .values("day")
        .annotate(dau=Count("user", distinct=True))
        .order_by("day")
    )
    return Response([{"date": row["day"].isoformat(), "dau": row["dau"]} for row in qs])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def analytics_behavior_intents(request):
    qs = (
        _analytics_base_qs()
        .values("intent_label")
        .annotate(count=Count("id"))
        .order_by("-count")[:10]
    )
    return Response(
        [{"intent": row["intent_label"] or "general", "count": row["count"]} for row in qs]
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def analytics_behavior_conversion(request):
    # Session-level conversion is more meaningful than user-level because a single
    # user can have many AI sessions with different outcomes.
    query_sessions = set(
        _analytics_base_qs()
        .exclude(session_id="")
        .values_list("session_id", flat=True)
    )
    converted_sessions = set(
        AIAnalyticsEvent.objects.filter(
            event_type=AIAnalyticsEvent.EVENT_DISH_ADD,
        )
        .exclude(session_id="")
        .values_list("session_id", flat=True)
    )
    denominator = len(query_sessions)
    numerator = len(query_sessions & converted_sessions)
    follow_up_clicks = AIAnalyticsEvent.objects.filter(
        event_type=AIAnalyticsEvent.EVENT_FOLLOW_UP_CLICK
    ).count()
    total_requests = _analytics_base_qs().count()

    return Response(
        {
            "query_users": denominator,
            "converted_users": numerator,
            "conversion_rate": round((numerator / denominator), 4) if denominator else 0,
            "follow_up_rate": round((follow_up_clicks / total_requests), 4)
            if total_requests
            else 0,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def analytics_cost_summary(request):
    base_qs = _analytics_base_qs()
    request_count = base_qs.count()
    aggregates = base_qs.aggregate(
        sum_total_tokens=Sum("total_tokens"),
        avg_tokens=Avg("total_tokens"),
        total_cost=Sum("estimated_cost_usd"),
        avg_cost=Avg("estimated_cost_usd"),
    )
    session_qs = (
        base_qs.exclude(session_id="")
        .values("session_id")
        .annotate(session_cost=Sum("estimated_cost_usd"))
    )
    session_count = session_qs.count()
    total_session_cost = sum((row["session_cost"] or 0) for row in session_qs)
    avg_cost_session = (total_session_cost / session_count) if session_count else 0

    return Response(
        {
            "request_count": request_count,
            "session_count": session_count,
            "total_tokens": int(aggregates["sum_total_tokens"] or 0),
            "avg_tokens_per_request": round(float(aggregates["avg_tokens"] or 0), 2),
            "total_estimated_cost_usd": round(float(aggregates["total_cost"] or 0), 6),
            "avg_cost_per_request_usd": round(float(aggregates["avg_cost"] or 0), 6),
            "avg_cost_per_session_usd": round(float(avg_cost_session), 6),
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def analytics_cost_top_queries(request):
    qs = (
        _analytics_base_qs()
        .order_by("-total_tokens", "-timestamp")
        .values(
            "timestamp",
            "prompt_text_redacted",
            "prompt_chars",
            "total_tokens",
            "estimated_cost_usd",
            "intent_label",
        )[:5]
    )
    return Response(
        [
            {
                "timestamp": row["timestamp"].isoformat(),
                "prompt_preview": row["prompt_text_redacted"],
                "prompt_chars": row["prompt_chars"],
                "total_tokens": row["total_tokens"],
                "estimated_cost_usd": float(row["estimated_cost_usd"] or 0),
                "intent": row["intent_label"] or "general",
            }
            for row in qs
        ]
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def analytics_cost_input_vs_tokens(request):
    qs = (
        _analytics_base_qs()
        .values("prompt_chars", "total_tokens", "intent_label")
        .order_by("-timestamp")[:200]
    )
    return Response(
        [
            {
                "prompt_chars": row["prompt_chars"],
                "total_tokens": row["total_tokens"],
                "intent": row["intent_label"] or "general",
            }
            for row in qs
        ]
    )
