# AI Chat Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform `/aimeals` into a state-of-the-art AI chat interface: CraftGPT-inspired centered empty state with morph transition to docked chat, aurora + orbiting-glow background, backend-persisted conversation history exposed via a drawer, slash commands replacing the estimator tab, keyboard shortcuts, stop/regenerate, and a modern auto-resizing composer.

**Architecture:** Two new Django models (`Conversation`, `ChatMessage`) with LRU-cap of 20 per user. `AIChatView` extended to persist conversations for auth'd users while preserving stateless fallback for anonymous users. Three new REST endpoints for list/detail/rename/delete. Frontend rewrites `AIMeals.tsx` shell; dish/meal-plan card internals preserved and extracted to subfiles. Pure CSS animations reuse homepage `auroraShift`.

**Tech Stack:** Django 5.1.6 `View` + `JsonResponse` (matches existing `AIChatView` pattern, not DRF), React 19 + TypeScript, CSS custom properties from `tokens.css`, `AbortController` for request cancellation.

**Design doc:** `docs/plans/2026-04-16-ai-chat-redesign-design.md` (read this first for full context).

---

## Conventions

- Backend tests live in `backend/mealPlanning/tests.py`.
- Run tests with:
  ```bash
  cd backend && python manage.py test mealPlanning --settings=SmartEats_config.settings.development -v 2
  ```
- Run a single test:
  ```bash
  cd backend && python manage.py test mealPlanning.tests.ConversationModelTest.test_lru_cap --settings=SmartEats_config.settings.development -v 2
  ```
- Frontend type-check:
  ```bash
  cd frontend && npx tsc --noEmit
  ```
- Frontend lint:
  ```bash
  cd frontend && npm run lint
  ```
- Dev servers (keep in background terminals during iteration):
  - Backend: `cd backend && python manage.py runserver --settings=SmartEats_config.settings.development`
  - Frontend: `cd frontend && npm run dev`
- **Never commit `.env` or `db.sqlite3` changes.** They're already tracked or gitignored appropriately.
- Frontend UI work is not strictly TDD — each task ends with a **visual verification** step: reload `http://localhost:5173/aimeals` and confirm the described behavior. Commit only after visual verification.
- After substantive edits, call `ReadLints` on touched files and fix any issues you introduced.

---

## Phase 1 — Backend: Models + Migration (TDD)

### Task 1: Add `Conversation` and `ChatMessage` models with a failing test

**Files:**
- Modify: `backend/mealPlanning/models.py` (append new models to bottom of file)
- Modify: `backend/mealPlanning/tests.py` (append new test class)

**Step 1: Add the failing test first**

Append to `backend/mealPlanning/tests.py` (at bottom):

```python
from mealPlanning.models import Conversation, ChatMessage  # move import up later


class ConversationModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="pw")

    def test_conversation_defaults_and_fields(self):
        convo = Conversation.objects.create(user=self.user)
        convo.refresh_from_db()
        self.assertEqual(convo.title, "New chat")
        self.assertEqual(convo.user, self.user)
        self.assertIsNotNone(convo.created_at)
        self.assertIsNotNone(convo.updated_at)

    def test_conversation_ordered_by_updated_at_desc(self):
        c1 = Conversation.objects.create(user=self.user, title="first")
        c2 = Conversation.objects.create(user=self.user, title="second")
        c1.title = "touched"
        c1.save()  # updated_at bumps
        ordered = list(Conversation.objects.filter(user=self.user))
        self.assertEqual(ordered[0].id, c1.id)
        self.assertEqual(ordered[1].id, c2.id)


class ChatMessageModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="bob", password="pw")
        self.convo = Conversation.objects.create(user=self.user)

    def test_chat_message_fields(self):
        msg = ChatMessage.objects.create(
            conversation=self.convo,
            role="user",
            content="Hello",
            metadata={"foo": "bar"},
        )
        msg.refresh_from_db()
        self.assertEqual(msg.role, "user")
        self.assertEqual(msg.content, "Hello")
        self.assertEqual(msg.metadata, {"foo": "bar"})
        self.assertIsNotNone(msg.created_at)

    def test_messages_ordered_by_created_at(self):
        m1 = ChatMessage.objects.create(conversation=self.convo, role="user", content="a")
        m2 = ChatMessage.objects.create(conversation=self.convo, role="assistant", content="b")
        msgs = list(self.convo.messages.all())
        self.assertEqual(msgs[0].id, m1.id)
        self.assertEqual(msgs[1].id, m2.id)

    def test_metadata_defaults_to_empty_dict(self):
        msg = ChatMessage.objects.create(
            conversation=self.convo,
            role="assistant",
            content="x",
        )
        self.assertEqual(msg.metadata, {})

    def test_cascade_delete_removes_messages(self):
        ChatMessage.objects.create(conversation=self.convo, role="user", content="a")
        ChatMessage.objects.create(conversation=self.convo, role="assistant", content="b")
        self.assertEqual(ChatMessage.objects.count(), 2)
        self.convo.delete()
        self.assertEqual(ChatMessage.objects.count(), 0)
```

**Step 2: Run the tests and verify they fail**

```bash
cd backend && python manage.py test mealPlanning.tests.ConversationModelTest mealPlanning.tests.ChatMessageModelTest --settings=SmartEats_config.settings.development -v 2
```

Expected: `ImportError` or `AttributeError` because `Conversation` / `ChatMessage` don't exist yet.

**Step 3: Add the models**

Append to `backend/mealPlanning/models.py` (at the bottom, after the last model):

```python
class Conversation(models.Model):
    """
    A persisted AI-chat conversation belonging to a single user.

    LRU-capped to 20 per user (enforced in AIChatView.post). Title defaults to
    "New chat" and is replaced with the first user message (truncated) when the
    first message is persisted.
    """

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="conversations",
    )
    title = models.CharField(max_length=80, default="New chat")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [models.Index(fields=["user", "-updated_at"])]

    def __str__(self) -> str:
        return f"Conversation({self.id}, user={self.user_id}, title={self.title!r})"


class ChatMessage(models.Model):
    """
    A single turn (user or assistant) within a Conversation.

    metadata stores optional structured payloads for assistant messages:
    recommended_dishes, meal_plan, follow_up_suggestions.
    """

    ROLE_CHOICES = [("user", "user"), ("assistant", "assistant")]

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role = models.CharField(max_length=16, choices=ROLE_CHOICES)
    content = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"ChatMessage({self.id}, role={self.role}, convo={self.conversation_id})"
```

Also move the `from mealPlanning.models import Conversation, ChatMessage` import in `tests.py` up into the existing multi-line `from mealPlanning.models import (...)` block at the top of the file, for cleanliness.

**Step 4: Generate and apply migration**

```bash
cd backend && python manage.py makemigrations mealPlanning --settings=SmartEats_config.settings.development
cd backend && python manage.py migrate --settings=SmartEats_config.settings.development
```

Expected output: a new file `backend/mealPlanning/migrations/00XX_conversation_chatmessage.py` and "OK" from migrate.

**Step 5: Run the tests and verify they pass**

```bash
cd backend && python manage.py test mealPlanning.tests.ConversationModelTest mealPlanning.tests.ChatMessageModelTest --settings=SmartEats_config.settings.development -v 2
```

Expected: 6 tests pass.

**Step 6: Run the full test suite to catch regressions**

```bash
cd backend && python manage.py test mealPlanning --settings=SmartEats_config.settings.development -v 1
```

Expected: all previously passing tests still pass.

**Step 7: Commit**

```bash
git add backend/mealPlanning/models.py backend/mealPlanning/tests.py backend/mealPlanning/migrations/
git commit -m "feat(models): add Conversation and ChatMessage models with cascade delete and LRU-friendly ordering"
```

---

## Phase 2 — Backend: LRU cap helper (TDD)

### Task 2: Add `Conversation.enforce_lru_cap_for_user` classmethod with test

**Files:**
- Modify: `backend/mealPlanning/models.py` (add classmethod to `Conversation`)
- Modify: `backend/mealPlanning/tests.py` (add test)

**Step 1: Add failing test**

Append to the existing `ConversationModelTest` class in `tests.py`:

```python
    def test_enforce_lru_cap_deletes_oldest_when_over_limit(self):
        from django.utils import timezone
        from datetime import timedelta

        base = timezone.now()
        # Create 21 conversations, each older than the next
        convos = []
        for i in range(21):
            c = Conversation.objects.create(user=self.user, title=f"c{i}")
            Conversation.objects.filter(pk=c.pk).update(
                updated_at=base - timedelta(minutes=21 - i)
            )
            convos.append(c)

        Conversation.enforce_lru_cap_for_user(self.user, cap=20)

        remaining = Conversation.objects.filter(user=self.user).count()
        self.assertEqual(remaining, 20)
        # The oldest (first created, smallest updated_at) should be gone
        self.assertFalse(Conversation.objects.filter(pk=convos[0].pk).exists())
        # The newest should remain
        self.assertTrue(Conversation.objects.filter(pk=convos[-1].pk).exists())

    def test_enforce_lru_cap_noop_when_under_limit(self):
        for i in range(5):
            Conversation.objects.create(user=self.user, title=f"c{i}")
        Conversation.enforce_lru_cap_for_user(self.user, cap=20)
        self.assertEqual(Conversation.objects.filter(user=self.user).count(), 5)

    def test_enforce_lru_cap_only_affects_target_user(self):
        other = User.objects.create_user(username="other", password="pw")
        for i in range(21):
            Conversation.objects.create(user=self.user, title=f"mine{i}")
        Conversation.objects.create(user=other, title="theirs")

        Conversation.enforce_lru_cap_for_user(self.user, cap=20)
        self.assertEqual(Conversation.objects.filter(user=self.user).count(), 20)
        self.assertEqual(Conversation.objects.filter(user=other).count(), 1)
```

**Step 2: Run tests and verify failure**

```bash
cd backend && python manage.py test mealPlanning.tests.ConversationModelTest.test_enforce_lru_cap_deletes_oldest_when_over_limit --settings=SmartEats_config.settings.development -v 2
```

Expected: `AttributeError: type object 'Conversation' has no attribute 'enforce_lru_cap_for_user'`.

**Step 3: Add the classmethod**

In `backend/mealPlanning/models.py`, add to `Conversation` (before `__str__`):

```python
    @classmethod
    def enforce_lru_cap_for_user(cls, user, cap: int = 20) -> int:
        """
        Delete the user's oldest conversations (by updated_at ASC) until they
        own at most `cap` conversations. Returns the number deleted.
        """
        qs = cls.objects.filter(user=user).order_by("-updated_at")
        ids_to_keep = list(qs.values_list("id", flat=True)[:cap])
        deleted, _ = cls.objects.filter(user=user).exclude(id__in=ids_to_keep).delete()
        return deleted
```

**Step 4: Run tests and verify pass**

```bash
cd backend && python manage.py test mealPlanning.tests.ConversationModelTest --settings=SmartEats_config.settings.development -v 2
```

Expected: all `ConversationModelTest` tests pass.

**Step 5: Commit**

```bash
git add backend/mealPlanning/models.py backend/mealPlanning/tests.py
git commit -m "feat(models): add Conversation.enforce_lru_cap_for_user classmethod"
```

---

## Phase 3 — Backend: Conversation endpoints (TDD)

### Task 3: Add `ConversationsView` (list + create) with tests

**Files:**
- Modify: `backend/mealPlanning/views.py` (add new class near other class-based views)
- Modify: `backend/mealPlanning/urls.py` (register route)
- Modify: `backend/mealPlanning/tests.py` (add test class)

**Step 1: Add failing tests**

Append to `tests.py`:

```python
class ConversationsEndpointTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.token.key}"}

    def test_get_returns_401_when_unauthenticated(self):
        resp = self.client.get("/api/conversations/")
        self.assertEqual(resp.status_code, 401)

    def test_get_returns_empty_list_initially(self):
        resp = self.client.get("/api/conversations/", **self.auth)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), [])

    def test_get_returns_user_conversations_with_message_count(self):
        c1 = Conversation.objects.create(user=self.user, title="One")
        ChatMessage.objects.create(conversation=c1, role="user", content="hi")
        ChatMessage.objects.create(conversation=c1, role="assistant", content="hello")
        Conversation.objects.create(user=self.user, title="Two")

        resp = self.client.get("/api/conversations/", **self.auth)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 2)
        titles = [c["title"] for c in data]
        self.assertIn("One", titles)
        self.assertIn("Two", titles)
        one = next(c for c in data if c["title"] == "One")
        self.assertEqual(one["message_count"], 2)
        self.assertIn("updated_at", one)
        self.assertIn("id", one)

    def test_get_does_not_leak_other_users_conversations(self):
        other = User.objects.create_user(username="eve", password="pw")
        Conversation.objects.create(user=other, title="Secret")
        Conversation.objects.create(user=self.user, title="Mine")

        resp = self.client.get("/api/conversations/", **self.auth)
        titles = [c["title"] for c in resp.json()]
        self.assertEqual(titles, ["Mine"])

    def test_post_creates_empty_conversation(self):
        resp = self.client.post(
            "/api/conversations/",
            data=json.dumps({}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertIn("id", data)
        self.assertEqual(data["title"], "New chat")
        self.assertEqual(Conversation.objects.filter(user=self.user).count(), 1)
```

**Step 2: Run tests and verify failure**

```bash
cd backend && python manage.py test mealPlanning.tests.ConversationsEndpointTest --settings=SmartEats_config.settings.development -v 2
```

Expected: 404 (URL not registered).

**Step 3: Add the view**

Find a good location in `backend/mealPlanning/views.py` — right before the existing `AIChatView` class is a natural home. Add:

```python
class ConversationsView(View):
    """
    GET  /api/conversations/   -> list user's conversations with message_count
    POST /api/conversations/   -> create an empty conversation (lazy creation
                                  is preferred via AIChatView; this endpoint
                                  exists for explicit New-chat flows)
    """

    @method_decorator(csrf_exempt)
    def dispatch(self, request, *args, **kwargs):
        return super().dispatch(request, *args, **kwargs)

    def _authenticate(self, request):
        from rest_framework.authtoken.models import Token
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Token "):
            return None
        key = auth_header.split(" ", 1)[1].strip()
        try:
            return Token.objects.select_related("user").get(key=key).user
        except Token.DoesNotExist:
            return None

    def get(self, request, *args, **kwargs):
        from django.db.models import Count
        from mealPlanning.models import Conversation

        user = self._authenticate(request)
        if user is None:
            return JsonResponse({"error": "Authentication required"}, status=401)

        qs = (
            Conversation.objects.filter(user=user)
            .annotate(message_count=Count("messages"))
            .order_by("-updated_at")
        )
        data = [
            {
                "id": c.id,
                "title": c.title,
                "updated_at": c.updated_at.isoformat(),
                "message_count": c.message_count,
            }
            for c in qs
        ]
        return JsonResponse(data, safe=False)

    def post(self, request, *args, **kwargs):
        from mealPlanning.models import Conversation

        user = self._authenticate(request)
        if user is None:
            return JsonResponse({"error": "Authentication required"}, status=401)

        convo = Conversation.objects.create(user=user)
        Conversation.enforce_lru_cap_for_user(user, cap=20)
        return JsonResponse(
            {
                "id": convo.id,
                "title": convo.title,
                "updated_at": convo.updated_at.isoformat(),
                "message_count": 0,
            },
            status=201,
        )
```

Make sure these imports exist at the top of `views.py`: `from django.views import View`, `from django.http import JsonResponse`, `from django.utils.decorators import method_decorator`, `from django.views.decorators.csrf import csrf_exempt`. They already do (used by `AIChatView`).

**Step 4: Register the URL**

In `backend/mealPlanning/urls.py`, add a line below the `ai-chat/` route:

```python
    path('conversations/', views.ConversationsView.as_view(), name='conversations_list'),
```

**Step 5: Run tests and verify pass**

```bash
cd backend && python manage.py test mealPlanning.tests.ConversationsEndpointTest --settings=SmartEats_config.settings.development -v 2
```

Expected: all 5 tests pass.

**Step 6: Commit**

```bash
git add backend/mealPlanning/views.py backend/mealPlanning/urls.py backend/mealPlanning/tests.py
git commit -m "feat(api): add GET/POST /api/conversations/ endpoint with auth and LRU cap"
```

---

### Task 4: Add `ConversationDetailView` (detail + rename + delete) with tests

**Files:**
- Modify: `backend/mealPlanning/views.py`
- Modify: `backend/mealPlanning/urls.py`
- Modify: `backend/mealPlanning/tests.py`

**Step 1: Add failing tests**

Append to `tests.py`:

```python
class ConversationDetailEndpointTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.token.key}"}
        self.convo = Conversation.objects.create(user=self.user, title="Test convo")
        ChatMessage.objects.create(conversation=self.convo, role="user", content="Hi")
        ChatMessage.objects.create(
            conversation=self.convo,
            role="assistant",
            content="Hello back",
            metadata={"follow_up_suggestions": ["more?"]},
        )

    def test_get_returns_conversation_with_messages(self):
        resp = self.client.get(f"/api/conversations/{self.convo.id}/", **self.auth)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["id"], self.convo.id)
        self.assertEqual(data["title"], "Test convo")
        self.assertEqual(len(data["messages"]), 2)
        self.assertEqual(data["messages"][0]["role"], "user")
        self.assertEqual(data["messages"][0]["content"], "Hi")
        self.assertEqual(data["messages"][1]["role"], "assistant")
        self.assertEqual(data["messages"][1]["metadata"], {"follow_up_suggestions": ["more?"]})

    def test_get_returns_404_for_other_users_conversation(self):
        other = User.objects.create_user(username="eve", password="pw")
        other_convo = Conversation.objects.create(user=other, title="Theirs")
        resp = self.client.get(f"/api/conversations/{other_convo.id}/", **self.auth)
        self.assertEqual(resp.status_code, 404)

    def test_get_returns_401_when_unauthenticated(self):
        resp = self.client.get(f"/api/conversations/{self.convo.id}/")
        self.assertEqual(resp.status_code, 401)

    def test_patch_renames_conversation(self):
        resp = self.client.patch(
            f"/api/conversations/{self.convo.id}/",
            data=json.dumps({"title": "Renamed"}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(resp.status_code, 200)
        self.convo.refresh_from_db()
        self.assertEqual(self.convo.title, "Renamed")

    def test_patch_truncates_title_to_80_chars(self):
        long_title = "x" * 200
        resp = self.client.patch(
            f"/api/conversations/{self.convo.id}/",
            data=json.dumps({"title": long_title}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(resp.status_code, 200)
        self.convo.refresh_from_db()
        self.assertEqual(len(self.convo.title), 80)

    def test_patch_rejects_empty_title(self):
        resp = self.client.patch(
            f"/api/conversations/{self.convo.id}/",
            data=json.dumps({"title": "   "}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(resp.status_code, 400)

    def test_delete_removes_conversation_and_cascades_messages(self):
        convo_id = self.convo.id
        resp = self.client.delete(f"/api/conversations/{convo_id}/", **self.auth)
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Conversation.objects.filter(id=convo_id).exists())
        self.assertEqual(ChatMessage.objects.filter(conversation_id=convo_id).count(), 0)
```

**Step 2: Run tests and verify failure**

```bash
cd backend && python manage.py test mealPlanning.tests.ConversationDetailEndpointTest --settings=SmartEats_config.settings.development -v 2
```

Expected: all fail with 404.

**Step 3: Add the view**

In `backend/mealPlanning/views.py`, below `ConversationsView`:

```python
class ConversationDetailView(View):
    """
    GET    /api/conversations/<id>/   -> full conversation + messages
    PATCH  /api/conversations/<id>/   -> rename (body: {"title": "..."})
    DELETE /api/conversations/<id>/   -> delete (cascades messages)
    """

    @method_decorator(csrf_exempt)
    def dispatch(self, request, *args, **kwargs):
        return super().dispatch(request, *args, **kwargs)

    def _authenticate(self, request):
        from rest_framework.authtoken.models import Token
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Token "):
            return None
        key = auth_header.split(" ", 1)[1].strip()
        try:
            return Token.objects.select_related("user").get(key=key).user
        except Token.DoesNotExist:
            return None

    def _get_convo_or_404(self, user, convo_id):
        from mealPlanning.models import Conversation
        try:
            return Conversation.objects.get(id=convo_id, user=user)
        except Conversation.DoesNotExist:
            return None

    def get(self, request, convo_id, *args, **kwargs):
        user = self._authenticate(request)
        if user is None:
            return JsonResponse({"error": "Authentication required"}, status=401)

        convo = self._get_convo_or_404(user, convo_id)
        if convo is None:
            return JsonResponse({"error": "Not found"}, status=404)

        messages = [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "metadata": m.metadata or {},
                "created_at": m.created_at.isoformat(),
            }
            for m in convo.messages.all()
        ]
        return JsonResponse(
            {
                "id": convo.id,
                "title": convo.title,
                "updated_at": convo.updated_at.isoformat(),
                "messages": messages,
            }
        )

    def patch(self, request, convo_id, *args, **kwargs):
        user = self._authenticate(request)
        if user is None:
            return JsonResponse({"error": "Authentication required"}, status=401)

        convo = self._get_convo_or_404(user, convo_id)
        if convo is None:
            return JsonResponse({"error": "Not found"}, status=404)

        try:
            body = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        title = str(body.get("title", "")).strip()
        if not title:
            return JsonResponse({"error": "Title cannot be empty"}, status=400)

        convo.title = title[:80]
        convo.save(update_fields=["title", "updated_at"])

        return JsonResponse(
            {
                "id": convo.id,
                "title": convo.title,
                "updated_at": convo.updated_at.isoformat(),
            }
        )

    def delete(self, request, convo_id, *args, **kwargs):
        user = self._authenticate(request)
        if user is None:
            return JsonResponse({"error": "Authentication required"}, status=401)

        convo = self._get_convo_or_404(user, convo_id)
        if convo is None:
            return JsonResponse({"error": "Not found"}, status=404)

        convo.delete()
        return JsonResponse({}, status=204)
```

**Step 4: Register URL**

In `backend/mealPlanning/urls.py`, below the `conversations/` line:

```python
    path('conversations/<int:convo_id>/', views.ConversationDetailView.as_view(), name='conversation_detail'),
```

**Step 5: Run tests and verify pass**

```bash
cd backend && python manage.py test mealPlanning.tests.ConversationDetailEndpointTest --settings=SmartEats_config.settings.development -v 2
```

Expected: all 7 tests pass.

**Step 6: Refactor — extract the `_authenticate` helper**

Both views duplicate `_authenticate`. Extract to a module-level function at the top of `views.py` (below the imports):

```python
def _get_user_from_token(request):
    """
    Extract authenticated User from `Authorization: Token <key>` header.
    Returns None if missing/invalid. Used by plain Django Views that don't
    have DRF's authentication plumbing.
    """
    from rest_framework.authtoken.models import Token
    auth_header = request.META.get("HTTP_AUTHORIZATION", "")
    if not auth_header.startswith("Token "):
        return None
    key = auth_header.split(" ", 1)[1].strip()
    try:
        return Token.objects.select_related("user").get(key=key).user
    except Token.DoesNotExist:
        return None
```

Replace both `_authenticate` methods with calls to `_get_user_from_token(request)`. Remove the now-unused `_authenticate` methods.

**Step 7: Re-run tests**

```bash
cd backend && python manage.py test mealPlanning.tests.ConversationsEndpointTest mealPlanning.tests.ConversationDetailEndpointTest --settings=SmartEats_config.settings.development -v 2
```

Expected: all still pass.

**Step 8: Commit**

```bash
git add backend/mealPlanning/views.py backend/mealPlanning/urls.py backend/mealPlanning/tests.py
git commit -m "feat(api): add GET/PATCH/DELETE /api/conversations/<id>/ with ownership enforcement"
```

---

## Phase 4 — Backend: Extend AIChatView for persistence (TDD)

### Task 5: Persist messages for auth'd users; preserve anonymous fallback

**Files:**
- Modify: `backend/mealPlanning/views.py` (update `AIChatView.post`)
- Modify: `backend/mealPlanning/tests.py`

**Step 1: Add failing tests**

```python
class AIChatPersistenceTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.auth = {"HTTP_AUTHORIZATION": f"Token {self.token.key}"}

    @patch("mealPlanning.services.ai_chat.get_response")
    def test_creates_conversation_when_none_provided(self, mock_llm):
        mock_llm.return_value = {"response": "Hi!", "recommended_dishes": []}
        resp = self.client.post(
            "/api/ai-chat/",
            data=json.dumps({"message": "What's good for dinner?"}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("conversation_id", data)
        self.assertEqual(data["response"], "Hi!")

        convo = Conversation.objects.get(id=data["conversation_id"])
        self.assertEqual(convo.user, self.user)
        # Title set from first user message (truncated)
        self.assertEqual(convo.title, "What's good for dinner?")
        # Two messages persisted
        self.assertEqual(convo.messages.count(), 2)
        self.assertEqual(convo.messages.first().role, "user")
        self.assertEqual(convo.messages.last().role, "assistant")

    @patch("mealPlanning.services.ai_chat.get_response")
    def test_appends_to_existing_conversation(self, mock_llm):
        mock_llm.return_value = {"response": "Noted!", "recommended_dishes": []}
        convo = Conversation.objects.create(user=self.user, title="Existing")
        ChatMessage.objects.create(conversation=convo, role="user", content="first")
        ChatMessage.objects.create(conversation=convo, role="assistant", content="reply")

        resp = self.client.post(
            "/api/ai-chat/",
            data=json.dumps({"message": "follow up", "conversation_id": convo.id}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["conversation_id"], convo.id)

        convo.refresh_from_db()
        self.assertEqual(convo.messages.count(), 4)
        self.assertEqual(convo.messages.last().role, "assistant")
        # Title NOT overwritten
        self.assertEqual(convo.title, "Existing")

    @patch("mealPlanning.services.ai_chat.get_response")
    def test_rejects_other_users_conversation_id(self, mock_llm):
        mock_llm.return_value = {"response": "Hi!", "recommended_dishes": []}
        other = User.objects.create_user(username="eve", password="pw")
        other_convo = Conversation.objects.create(user=other, title="Theirs")

        resp = self.client.post(
            "/api/ai-chat/",
            data=json.dumps({"message": "x", "conversation_id": other_convo.id}),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(resp.status_code, 404)

    @patch("mealPlanning.services.ai_chat.get_response")
    def test_regenerate_pops_last_assistant_message(self, mock_llm):
        mock_llm.return_value = {"response": "New answer", "recommended_dishes": []}
        convo = Conversation.objects.create(user=self.user, title="x")
        ChatMessage.objects.create(conversation=convo, role="user", content="q1")
        ChatMessage.objects.create(conversation=convo, role="assistant", content="old answer")

        resp = self.client.post(
            "/api/ai-chat/",
            data=json.dumps({
                "message": "q1",
                "conversation_id": convo.id,
                "regenerate": True,
            }),
            content_type="application/json",
            **self.auth,
        )
        self.assertEqual(resp.status_code, 200)

        contents = list(convo.messages.values_list("content", flat=True))
        # regenerate: old assistant dropped, no new user msg added, new assistant added
        self.assertEqual(contents, ["q1", "New answer"])

    @patch("mealPlanning.services.ai_chat.get_response")
    def test_anonymous_request_still_works_without_persistence(self, mock_llm):
        mock_llm.return_value = {"response": "Hi!", "recommended_dishes": []}
        resp = self.client.post(
            "/api/ai-chat/",
            data=json.dumps({"message": "hi"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # No conversation_id in anonymous response
        self.assertNotIn("conversation_id", data)
        self.assertEqual(Conversation.objects.count(), 0)

    @patch("mealPlanning.services.ai_chat.get_response")
    def test_lru_cap_enforced_on_new_conversation(self, mock_llm):
        mock_llm.return_value = {"response": "ok", "recommended_dishes": []}
        from django.utils import timezone
        from datetime import timedelta

        # Pre-seed 20 conversations with staggered old updated_at
        base = timezone.now()
        for i in range(20):
            c = Conversation.objects.create(user=self.user, title=f"old{i}")
            Conversation.objects.filter(pk=c.pk).update(
                updated_at=base - timedelta(hours=20 - i)
            )

        self.client.post(
            "/api/ai-chat/",
            data=json.dumps({"message": "new one"}),
            content_type="application/json",
            **self.auth,
        )
        # Still 20 total — oldest one dropped
        self.assertEqual(Conversation.objects.filter(user=self.user).count(), 20)
        self.assertFalse(Conversation.objects.filter(user=self.user, title="old0").exists())
        self.assertTrue(Conversation.objects.filter(user=self.user, title="new one").exists())

    @patch("mealPlanning.services.ai_chat.get_response")
    def test_assistant_metadata_persisted(self, mock_llm):
        mock_llm.return_value = {
            "response": "Try these!",
            "recommended_dishes": [{"dish_id": 1, "dish_name": "Tofu", "reason": "high protein"}],
            "follow_up_suggestions": ["add to tray?"],
        }
        resp = self.client.post(
            "/api/ai-chat/",
            data=json.dumps({"message": "protein ideas"}),
            content_type="application/json",
            **self.auth,
        )
        convo_id = resp.json()["conversation_id"]
        assistant_msg = ChatMessage.objects.get(conversation_id=convo_id, role="assistant")
        self.assertEqual(
            assistant_msg.metadata.get("recommended_dishes"),
            [{"dish_id": 1, "dish_name": "Tofu", "reason": "high protein"}],
        )
        self.assertEqual(assistant_msg.metadata.get("follow_up_suggestions"), ["add to tray?"])
```

**Step 2: Run tests and verify failure**

```bash
cd backend && python manage.py test mealPlanning.tests.AIChatPersistenceTest --settings=SmartEats_config.settings.development -v 2
```

Expected: several failures (no `conversation_id` in response, convo not created, etc.).

**Step 3: Update `AIChatView.post`**

Locate `AIChatView.post` in `views.py`. Replace its body with:

```python
    def post(self, request, *args, **kwargs):
        from mealPlanning.services import ai_chat
        from mealPlanning.models import Conversation, ChatMessage

        try:
            body = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        message = body.get("message", "").strip()
        if not message:
            return JsonResponse({"error": "Message is required"}, status=400)

        raw_history = body.get("history", [])
        history = raw_history if isinstance(raw_history, list) else []
        conversation_id = body.get("conversation_id")
        regenerate = bool(body.get("regenerate"))

        user = _get_user_from_token(request)
        convo = None

        if user is not None:
            # Resolve or create the conversation
            if conversation_id is not None:
                try:
                    convo = Conversation.objects.get(id=conversation_id, user=user)
                except Conversation.DoesNotExist:
                    return JsonResponse({"error": "Conversation not found"}, status=404)
            else:
                convo = Conversation.objects.create(user=user)
                Conversation.enforce_lru_cap_for_user(user, cap=20)

            if regenerate:
                # Drop last assistant message so the new response replaces it
                last_assistant = convo.messages.filter(role="assistant").order_by("-created_at").first()
                if last_assistant is not None:
                    last_assistant.delete()
            else:
                ChatMessage.objects.create(conversation=convo, role="user", content=message)

            # Rebuild history from the persisted conversation so regenerate/append
            # behaviors share one source of truth.
            history = [
                {"role": m.role if m.role == "user" else "assistant", "content": m.content}
                for m in convo.messages.all()
            ]

            # Set title from first user message if still default
            if convo.title == "New chat":
                first_user_msg = convo.messages.filter(role="user").order_by("created_at").first()
                if first_user_msg is not None:
                    convo.title = first_user_msg.content[:80]
                    convo.save(update_fields=["title", "updated_at"])

        user_context = self._extract_user_context(
            request,
            tray_context=body.get("tray_context"),
        )

        result = ai_chat.get_response(
            message,
            history=history,
            user_context=user_context,
        )
        if result is None:
            return JsonResponse(
                {"error": "AI service unavailable. Please try again later."},
                status=503,
            )

        if convo is not None:
            metadata = {
                k: result[k]
                for k in ("recommended_dishes", "meal_plan", "follow_up_suggestions")
                if k in result and result[k] is not None
            }
            ChatMessage.objects.create(
                conversation=convo,
                role="assistant",
                content=result.get("response", ""),
                metadata=metadata,
            )
            # Bump updated_at explicitly so drawer ordering reflects activity
            convo.save(update_fields=["updated_at"])

            result = {**result, "conversation_id": convo.id, "title": convo.title}

        return JsonResponse(result)
```

**Step 4: Run tests and verify pass**

```bash
cd backend && python manage.py test mealPlanning.tests.AIChatPersistenceTest --settings=SmartEats_config.settings.development -v 2
```

Expected: all 7 tests pass.

**Step 5: Run the full backend test suite**

```bash
cd backend && python manage.py test mealPlanning --settings=SmartEats_config.settings.development -v 1
```

Expected: no regressions.

**Step 6: Commit**

```bash
git add backend/mealPlanning/views.py backend/mealPlanning/tests.py
git commit -m "feat(ai-chat): persist conversations + messages for auth'd users; support regenerate"
```

---

## Phase 5 — Frontend: API client wrappers + types

### Task 6: Create conversation API client and types

**Files:**
- Create: `frontend/src/pages/aimeals/api.ts`
- Create: `frontend/src/pages/aimeals/types.ts`

**Step 1: Create `types.ts`**

```ts
export type MessageRole = "user" | "ai";

export interface RecommendedDish {
  dish_id: number;
  dish_name: string;
  reason: string;
  dining_hall_name?: string;
  hall_name?: string;
  serving_unit?: string;
  serving_size?: string;
  meal_period?: string;
  calories?: number;
  protein?: number;
  carbohydrates?: number;
  fat?: number;
  quantity?: number;
}

export interface MealPlan {
  title: string;
  summary?: string;
  note?: string;
  action_label?: string;
  items: RecommendedDish[];
  totals?: { calories: number; protein: number; carbohydrates: number; fat: number };
  remaining_after?: { calories: number; protein: number; carbohydrates: number; fat: number };
}

export interface Message {
  id: number;
  role: MessageRole;
  text: string;
  recommendedDishes?: RecommendedDish[];
  mealPlan?: MealPlan;
  followUpSuggestions?: string[];
  error?: boolean;
  aborted?: boolean;
}

export interface ConvoSummary {
  id: number;
  title: string;
  updated_at: string;
  message_count: number;
}

export interface ConvoDetail {
  id: number;
  title: string;
  updated_at: string;
  messages: ServerMessage[];
}

export interface ServerMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  metadata: {
    recommended_dishes?: RecommendedDish[];
    meal_plan?: MealPlan;
    follow_up_suggestions?: string[];
  };
  created_at: string;
}

export interface AiChatRequest {
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
  tray_context?: unknown;
  conversation_id?: number | null;
  regenerate?: boolean;
}

export interface AiChatResponse {
  response: string;
  recommended_dishes?: RecommendedDish[];
  meal_plan?: MealPlan;
  follow_up_suggestions?: string[];
  conversation_id?: number;
  title?: string;
  error?: string;
}
```

**Step 2: Create `api.ts`**

```ts
import axios, { type AxiosRequestConfig } from "axios";
import { API_BASE } from "../../config";
import type {
  AiChatRequest,
  AiChatResponse,
  ConvoDetail,
  ConvoSummary,
} from "./types";

function authHeaders(): Record<string, string> | undefined {
  const token = localStorage.getItem("authToken");
  return token ? { Authorization: `Token ${token}` } : undefined;
}

export async function listConversations(): Promise<ConvoSummary[]> {
  const headers = authHeaders();
  if (!headers) return [];
  const { data } = await axios.get<ConvoSummary[]>(`${API_BASE}/conversations/`, { headers });
  return data;
}

export async function getConversation(id: number): Promise<ConvoDetail> {
  const { data } = await axios.get<ConvoDetail>(`${API_BASE}/conversations/${id}/`, {
    headers: authHeaders(),
  });
  return data;
}

export async function renameConversation(id: number, title: string): Promise<ConvoSummary> {
  const { data } = await axios.patch<ConvoSummary>(
    `${API_BASE}/conversations/${id}/`,
    { title },
    { headers: authHeaders() },
  );
  return data;
}

export async function deleteConversation(id: number): Promise<void> {
  await axios.delete(`${API_BASE}/conversations/${id}/`, { headers: authHeaders() });
}

export async function sendChatMessage(
  body: AiChatRequest,
  signal?: AbortSignal,
): Promise<AiChatResponse> {
  const config: AxiosRequestConfig = { signal };
  const headers = authHeaders();
  if (headers) config.headers = headers;
  const { data } = await axios.post<AiChatResponse>(`${API_BASE}/ai-chat/`, body, config);
  return data;
}
```

**Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors. (This adds files but doesn't import them yet — good checkpoint.)

**Step 4: Commit**

```bash
git add frontend/src/pages/aimeals/
git commit -m "feat(frontend): add aimeals API client and shared types"
```

---

## Phase 6 — Frontend: Pure refactor — extract existing sub-components (no behavior change)

### Task 7: Extract `DishRecommendationCard`, `MealPlanCard`, `ThinkingIndicator`, `NutritionEstimator`, `FormattedMessageText`, `MacroPill` from `AIMeals.tsx`

**Files:**
- Create: `frontend/src/pages/aimeals/DishRecommendationCard.tsx`
- Create: `frontend/src/pages/aimeals/MealPlanCard.tsx`
- Create: `frontend/src/pages/aimeals/ThinkingIndicator.tsx`
- Create: `frontend/src/pages/aimeals/NutritionEstimator.tsx`
- Create: `frontend/src/pages/aimeals/FormattedMessageText.tsx`
- Create: `frontend/src/pages/aimeals/MacroPill.tsx`
- Modify: `frontend/src/pages/AIMeals.tsx` (remove the moved code, add imports)

**Step 1: Move `MacroPill` and `FormattedMessageText` first** (smallest, no deps)

Copy the `MacroPill` function (lines ~233-254 in current `AIMeals.tsx`) to `MacroPill.tsx`, wrap as default export or named export. Do the same for `FormattedMessageText`. Import them back.

`MacroPill.tsx`:
```tsx
export function MacroPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 24,
        padding: "0 8px",
        borderRadius: "var(--se-radius-full)",
        background: "var(--se-bg-subtle)",
        color,
        fontSize: 11,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {value}
      <span style={{ color: "var(--se-text-muted)", fontWeight: 700 }}>{label}</span>
    </span>
  );
}
```

`FormattedMessageText.tsx`:
```tsx
export function FormattedMessageText({ text }: { text: string }) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const blocks: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        {bulletBuffer.map((line) => (
          <li key={line} style={{ marginTop: 4 }}>{line.replace(/^[-*]\s*/, "")}</li>
        ))}
      </ul>,
    );
    bulletBuffer = [];
  };

  lines.forEach((line) => {
    if (/^[-*]\s+/.test(line)) {
      bulletBuffer.push(line);
      return;
    }
    flushBullets();
    blocks.push(
      <p key={`p-${blocks.length}`} style={{ margin: blocks.length === 0 ? 0 : "8px 0 0" }}>
        {line}
      </p>,
    );
  });
  flushBullets();

  return <>{blocks}</>;
}
```

Import React at the top of `FormattedMessageText.tsx` if needed (`import React from "react";`).

**Step 2: Move `DishRecommendationCard`** (depends on `MacroPill`)

Copy to `DishRecommendationCard.tsx`. Its imports:
```tsx
import { MacroPill } from "./MacroPill";
import type { RecommendedDish } from "./types";
```
Export the helpers it uses: `getDishHall` and `hasDishNutrition` — put these in a new file `frontend/src/pages/aimeals/dishHelpers.ts`:
```ts
import type { RecommendedDish } from "./types";

export function getDishHall(dish: RecommendedDish): string {
  return dish.hall_name || dish.dining_hall_name || "";
}

export function hasDishNutrition(dish: RecommendedDish): boolean {
  return (["calories", "protein", "carbohydrates", "fat"] as const).every(
    (field) => Number.isFinite(Number(dish[field])),
  );
}
```

**Step 3: Move `MealPlanCard`** — same pattern; imports `MacroPill`, `getDishHall`, `hasDishNutrition`, `RecommendedDish`, `MealPlan`.

**Step 4: Move `ThinkingIndicator`** — self-contained; move as is.

**Step 5: Move `NutritionEstimator`** — self-contained; move as is. Keep axios import.

**Step 6: Update `AIMeals.tsx` to import from new files**

Remove the corresponding inline definitions and replace with:

```tsx
import { MacroPill } from "./aimeals/MacroPill";
import { FormattedMessageText } from "./aimeals/FormattedMessageText";
import { DishRecommendationCard } from "./aimeals/DishRecommendationCard";
import { MealPlanCard } from "./aimeals/MealPlanCard";
import { ThinkingIndicator } from "./aimeals/ThinkingIndicator";
import { NutritionEstimator } from "./aimeals/NutritionEstimator";
import { getDishHall, hasDishNutrition } from "./aimeals/dishHelpers";
import type { RecommendedDish, MealPlan, Message, MessageRole } from "./aimeals/types";
```

Remove local type definitions that now live in `types.ts` (`RecommendedDish`, `MealPlan`, `Message`, `MessageRole`, `ChatHistoryItem`).

**Step 7: Verify the app still works identically**

```bash
cd frontend && npx tsc --noEmit
```

Then reload `http://localhost:5173/aimeals`. Send a message. Verify:
- Empty state unchanged
- Message flow unchanged
- Estimator tab unchanged
- Thinking indicator appears

**Step 8: Commit**

```bash
git add frontend/src/pages/AIMeals.tsx frontend/src/pages/aimeals/
git commit -m "refactor(aimeals): extract sub-components to pages/aimeals/ subfolder (no behavior change)"
```

---

## Phase 7 — Frontend: CSS animations + reduced-motion

### Task 8: Add new keyframes to `custom.css`

**Files:**
- Modify: `frontend/src/static/css/custom.css`

**Step 1: Add the new keyframes**

Append to the animations section of `custom.css`:

```css
/* ── AI chat page animations ───────────────────── */

@keyframes aiOrbit {
  0%   { transform: translate(-30px, -20px) scale(1); }
  50%  { transform: translate(40px, 30px) scale(1.1); }
  100% { transform: translate(-30px, -20px) scale(1); }
}

@keyframes composerMorph {
  from { transform: translateY(calc(45vh - 50%)) scale(1); }
  to   { transform: translateY(0) scale(1); }
}

@keyframes bubbleRise {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes heroFadeOut {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.96); visibility: hidden; }
}

@keyframes drawerSlideIn {
  from { transform: translateX(-100%); }
  to   { transform: translateX(0); }
}

@keyframes suggestionCrossfade {
  0%   { opacity: 0; transform: translateY(4px); }
  100% { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .ai-aurora-layer,
  .ai-orb-layer {
    animation: none !important;
  }
  .ai-composer-morph {
    animation: none !important;
  }
}
```

**Step 2: Verify CSS loads and no syntax errors**

Reload the browser; open DevTools → no CSS parse errors.

**Step 3: Commit**

```bash
git add frontend/src/static/css/custom.css
git commit -m "feat(styles): add keyframes for AI chat orbit, composer morph, and bubble rise"
```

---

## Phase 8 — Frontend: Background visuals (`BackgroundOrb`)

### Task 9: Create `BackgroundOrb` component and wire it into the shell

**Files:**
- Create: `frontend/src/pages/aimeals/BackgroundOrb.tsx`
- Modify: `frontend/src/pages/AIMeals.tsx` (render it inside the shell)

**Step 1: Create the component**

```tsx
import React from "react";

export type OrbMode = "centered" | "docked";

export function BackgroundOrb({ mode }: { mode: OrbMode }) {
  return (
    <>
      <div
        className="ai-aurora-layer"
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(135deg, #fde8e2 0%, #fff7e6 25%, #f0e9fa 50%, #fef3c7 75%, #fde8e2 100%)",
          backgroundSize: "400% 400%",
          animation: "auroraShift 25s ease infinite",
          opacity: 0.35,
          maskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div
        className="ai-orb-layer"
        aria-hidden="true"
        style={{
          position: "absolute",
          width: 520,
          height: 520,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--se-primary) 28%, transparent) 0%, transparent 70%)",
          filter: "blur(40px)",
          top: mode === "centered" ? "38%" : "auto",
          bottom: mode === "centered" ? "auto" : "8%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          animation: "aiOrbit 25s ease-in-out infinite",
          transition: "top 600ms ease, bottom 600ms ease",
          pointerEvents: "none",
          opacity: 0.7,
          zIndex: 0,
        }}
      />
    </>
  );
}
```

**Step 2: Render inside the AIMeals shell**

In `AIMeals.tsx`, inside the outer fixed container, add as first child (just inside the `<div style={{ position: "fixed", ... }}>`):

```tsx
<BackgroundOrb mode={isEmpty ? "centered" : "docked"} />
```

Ensure the inner content container has `position: relative` and `zIndex: 1` so it stays above the orb.

**Step 3: Visual verify**

Reload `http://localhost:5173/aimeals`. Confirm:
- Subtle gradient washes behind the canvas.
- A soft primary-colored glow drifts slowly behind the center of the page.
- On having a chat, the glow repositions lower (anchored near composer).
- No JS console errors.

If the orb feels too intense, reduce the inline `opacity: 0.7` to `0.5`. If too weak, raise to `0.85`. Tune until subtle-but-present.

**Step 4: Commit**

```bash
git add frontend/src/pages/AIMeals.tsx frontend/src/pages/aimeals/BackgroundOrb.tsx
git commit -m "feat(aimeals): add aurora + orbiting glow background layer"
```

---

## Phase 9 — Frontend: Empty hero state

### Task 10: Create `EmptyHero` component with rotating suggestions

**Files:**
- Create: `frontend/src/pages/aimeals/EmptyHero.tsx`
- Modify: `frontend/src/pages/AIMeals.tsx` (replace inline empty-state markup)

**Step 1: Create the component**

```tsx
import { useEffect, useState } from "react";

const ALL_PROMPTS = [
  "What's healthy at ISR today?",
  "High protein lunch ideas",
  "I want something under 400 calories",
  "What vegetarian options are there?",
  "Help me hit my macro goals",
  "Find me a light dinner option",
  "What can I eat before a workout?",
  "What's good at Ikenberry?",
  "I need gluten-free options",
  "Best post-workout meal at PAR?",
  "Compare protein options across halls",
  "Low carb dinner suggestions",
];

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export function EmptyHero({ onPick }: { onPick: (prompt: string) => void }) {
  const [suggestions, setSuggestions] = useState(() => pickRandom(ALL_PROMPTS, 3));
  const [key, setKey] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSuggestions(pickRandom(ALL_PROMPTS, 3));
      setKey((k) => k + 1);
    }, 8000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        textAlign: "center",
        padding: "0 16px",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--se-primary-dim)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          color: "var(--se-primary)",
          fontWeight: 900,
        }}
      >
        ✦
      </div>
      <div>
        <h1
          style={{
            fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
            fontWeight: 800,
            color: "var(--se-text-main)",
            margin: "0 0 8px",
            letterSpacing: "-0.02em",
          }}
        >
          What can I <span className="text-gradient-vivid">help</span> with?
        </h1>
        <p style={{ fontSize: 14, color: "var(--se-text-muted)", margin: 0, maxWidth: 360 }}>
          Ask about dining options, nutrition, or meal ideas across all UIUC dining halls.
        </p>
      </div>
      <div
        key={key}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
          maxWidth: 560,
          animation: "suggestionCrossfade 300ms ease-out",
        }}
      >
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            style={{
              padding: "10px 16px",
              borderRadius: "var(--se-radius-full)",
              border: "1px solid var(--se-border)",
              background: "var(--se-bg-surface)",
              color: "var(--se-text-secondary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "var(--se-shadow-sm)",
              transition: "border-color 120ms, color 120ms, transform 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--se-primary)";
              e.currentTarget.style.color = "var(--se-text-main)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--se-border)";
              e.currentTarget.style.color = "var(--se-text-secondary)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            {s} →
          </button>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Wire into `AIMeals.tsx`**

Replace the `isEmpty` branch of the chat messages area with just `<EmptyHero onPick={sendMessage} />`. Importantly: **do not** render the composer inside the empty-state div anymore — the composer will live in a wrapper that morphs position. See Task 11.

For now, remove the old inline empty state and render `<EmptyHero />` above the existing composer. The composer will be repositioned in the next task.

**Step 3: Visual verify**

Reload — confirm the new hero with "What can I help with?" appears centered with 3 rotating chips. Every 8s the chips crossfade.

**Step 4: Commit**

```bash
git add frontend/src/pages/aimeals/EmptyHero.tsx frontend/src/pages/AIMeals.tsx
git commit -m "feat(aimeals): add rotating-suggestion empty hero component"
```

---

## Phase 10 — Frontend: Morph transition + composer position

### Task 11: Reposition composer by state (centered vs docked) with morph animation

**Files:**
- Modify: `frontend/src/pages/AIMeals.tsx`

**Step 1: Restructure the layout**

The canvas is a fixed full-height column. When `isEmpty`, the composer + hero cluster should be vertically centered. When not, the composer docks at the bottom and the scrollable messages area fills above it.

Change the chat-tab render tree to:

```tsx
<div
  style={{
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    position: "relative",
  }}
>
  {/* Messages scroll region (only when chatting) */}
  {!isEmpty && (
    <div
      ref={messagesContainerRef}
      style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 0 16px" }}
    >
      {/* existing messages map + ThinkingIndicator */}
    </div>
  )}

  {/* Composer cluster: centered when empty, docked when chatting */}
  <div
    className="ai-composer-cluster"
    style={{
      position: isEmpty ? "absolute" : "relative",
      top: isEmpty ? "38%" : "auto",
      left: isEmpty ? 0 : "auto",
      right: isEmpty ? 0 : "auto",
      transform: isEmpty ? "translateY(-50%)" : "none",
      padding: isEmpty ? "0 16px" : "12px 0",
      display: "flex",
      flexDirection: "column",
      gap: 20,
      background: isEmpty ? "transparent" : "var(--se-bg-base)",
      transition: "top 550ms cubic-bezier(0.32, 0.72, 0, 1)",
    }}
  >
    {isEmpty && <EmptyHero onPick={sendMessage} />}
    <ComposerBar {/* see Task 12 */} />
    {/* existing context strip stays below composer */}
  </div>
</div>
```

(Full code for this block provided in the task below — the abbreviated markup above is for orientation.)

**Step 2: Keep the composer JSX inline for this task**

Don't extract to `ComposerBar` yet. Just reposition the existing form. Purpose of this task is to validate the morph visually.

**Step 3: Visual verify**

- Load the page with no messages → composer + hero centered vertically.
- Send a message → composer slides down to bottom dock; hero fades out; messages appear above.
- Click "New chat" → composer re-centers with hero. The transition should feel smooth (~0.5s).

Possible issue: the transition from `position: absolute` → `position: relative` is not animatable. Fix by keeping the cluster `position: relative` always, and instead animate `transform` + `margin-top`. Implementation detail:

```tsx
<div
  className="ai-composer-cluster"
  style={{
    marginTop: isEmpty ? "calc(38vh - 120px)" : 0,
    transition: "margin-top 550ms cubic-bezier(0.32, 0.72, 0, 1)",
  }}
>
```

This gives a smooth morph. Tune the `120px` offset empirically.

**Step 4: Commit**

```bash
git add frontend/src/pages/AIMeals.tsx
git commit -m "feat(aimeals): morph composer from centered to docked on first message"
```

---

## Phase 11 — Frontend: ComposerBar (textarea, Stop, AbortController)

### Task 12: Extract and upgrade the composer to `ComposerBar`

**Files:**
- Create: `frontend/src/pages/aimeals/ComposerBar.tsx`
- Modify: `frontend/src/pages/AIMeals.tsx`

**Step 1: Create `ComposerBar.tsx`**

```tsx
import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onSlashTrigger: () => void;
  loading: boolean;
  autoFocus?: boolean;
  compact?: boolean; // narrower width for centered state
}

export function ComposerBar({
  value,
  onChange,
  onSubmit,
  onStop,
  onSlashTrigger,
  loading,
  autoFocus,
  compact = false,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading && value.trim()) onSubmit();
    }
  };

  const canSend = !loading && value.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
      className="ai-chatbox-form"
      style={{
        background: "var(--se-bg-surface)",
        border: "1px solid var(--se-border)",
        borderRadius: 22,
        padding: "12px 14px 8px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        transition: "border-color 150ms ease, box-shadow 150ms ease",
        maxWidth: compact ? 560 : 720,
        margin: "0 auto",
        width: "100%",
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        placeholder="Ask about dining halls, dishes, or nutrition…  type / for commands"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          if (next === "/") onSlashTrigger();
        }}
        onKeyDown={handleKeyDown}
        disabled={loading}
        className="ai-chatbox-input"
        style={{
          width: "100%",
          border: "none",
          outline: "none",
          background: "transparent",
          fontSize: 14,
          lineHeight: 1.5,
          color: "var(--se-text-main)",
          resize: "none",
          padding: "6px 0 10px",
          fontFamily: "inherit",
          minHeight: 24,
          maxHeight: 200,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            aria-label="Slash commands"
            onClick={onSlashTrigger}
            style={iconBtn}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M7 20l10-16" />
            </svg>
          </button>
          {value.length > 240 && (
            <span style={{ fontSize: 11, color: "var(--se-text-faint)" }}>{value.length}</span>
          )}
        </div>
        {loading ? (
          <button
            type="button"
            onClick={onStop}
            style={{ ...sendBtn, background: "var(--se-text-main)", color: "var(--se-text-inverted)" }}
            aria-label="Stop"
          >
            <span style={{
              display: "inline-block", width: 10, height: 10, background: "currentColor", borderRadius: 2,
            }} />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            style={{
              ...sendBtn,
              background: canSend ? "var(--se-text-main)" : "var(--se-bg-subtle)",
              color: canSend ? "var(--se-text-inverted)" : "var(--se-text-faint)",
              cursor: canSend ? "pointer" : "default",
            }}
            aria-label="Send"
          >
            Send
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        )}
      </div>
    </form>
  );
}

const iconBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  border: "none",
  background: "transparent",
  color: "var(--se-text-faint)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const sendBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 14px 7px 16px",
  borderRadius: 9999,
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  transition: "all 150ms",
};
```

**Step 2: Wire into `AIMeals.tsx`**

Replace the existing inline form with `<ComposerBar ... />`. Stash `abortRef`:

```tsx
const abortRef = useRef<AbortController | null>(null);

const sendMessage = async (text: string) => {
  if (!text.trim() || loading) return;
  // …existing setup…

  const controller = new AbortController();
  abortRef.current = controller;

  try {
    const data = await sendChatMessage({
      message: trimmed,
      history,
      tray_context: trayContext,
      conversation_id: activeConvoId,
    }, controller.signal);
    // …existing response handling, plus:
    if (data.conversation_id) setActiveConvoId(data.conversation_id);
  } catch (err) {
    if (axios.isCancel(err) || (err as Error).name === "CanceledError") {
      setMessages((prev) => [
        ...prev,
        { id: nextId.current++, role: "ai", text: "Generation stopped.", aborted: true },
      ]);
    } else {
      // …existing error fallback…
    }
  } finally {
    setLoading(false);
    abortRef.current = null;
  }
};

const stopGeneration = () => {
  abortRef.current?.abort();
};
```

**Step 3: Visual verify**

- Composer is now a textarea. Shift+Enter inserts a newline. Enter sends.
- Send a long message. Observe auto-resize.
- While thinking, Send turns into Stop. Click Stop → request cancels, "Generation stopped." appears.
- 240+ char counter appears.

**Step 4: Commit**

```bash
git add frontend/src/pages/AIMeals.tsx frontend/src/pages/aimeals/ComposerBar.tsx
git commit -m "feat(aimeals): upgrade composer to textarea with auto-grow, Stop button, and AbortController"
```

---

## Phase 12 — Frontend: Slash menu + Estimator modal

### Task 13: Create `SlashMenu` component and `/estimate` inline modal

**Files:**
- Create: `frontend/src/pages/aimeals/SlashMenu.tsx`
- Create: `frontend/src/pages/aimeals/EstimatorModal.tsx`
- Modify: `frontend/src/pages/AIMeals.tsx`

**Step 1: Create `SlashMenu.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from "react";

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  hint?: string;
  disabled?: boolean;
  onRun: () => void;
}

interface Props {
  open: boolean;
  query: string; // text after "/"
  commands: SlashCommand[];
  onClose: () => void;
}

export function SlashMenu({ open, query, commands, onClose }: Props) {
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return commands;
    return commands.filter((c) => c.id.includes(q) || c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
      } else if (e.key === "Enter") {
        const cmd = filtered[highlight];
        if (cmd && !cmd.disabled) {
          e.preventDefault();
          cmd.onRun();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, highlight, onClose]);

  if (!open || filtered.length === 0) return null;

  return (
    <div
      ref={ref}
      role="listbox"
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left: 0,
        minWidth: 280,
        maxWidth: 360,
        background: "var(--se-bg-surface)",
        border: "1px solid var(--se-border)",
        borderRadius: 12,
        boxShadow: "var(--se-shadow-lg)",
        padding: 6,
        zIndex: 40,
      }}
    >
      {filtered.map((cmd, idx) => (
        <button
          key={cmd.id}
          type="button"
          role="option"
          aria-selected={idx === highlight}
          disabled={cmd.disabled}
          onClick={() => {
            if (!cmd.disabled) {
              cmd.onRun();
              onClose();
            }
          }}
          onMouseEnter={() => setHighlight(idx)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            padding: "8px 10px",
            borderRadius: 8,
            border: "none",
            background: idx === highlight ? "var(--se-bg-subtle)" : "transparent",
            color: cmd.disabled ? "var(--se-text-faint)" : "var(--se-text-main)",
            textAlign: "left",
            cursor: cmd.disabled ? "not-allowed" : "pointer",
            fontSize: 13,
          }}
        >
          <span style={{
            fontFamily: "monospace",
            fontSize: 12,
            color: "var(--se-primary)",
            fontWeight: 700,
            minWidth: 72,
          }}>
            /{cmd.id}
          </span>
          <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span style={{ fontWeight: 600 }}>{cmd.label}</span>
            <span style={{ fontSize: 11, color: "var(--se-text-muted)" }}>{cmd.description}</span>
          </span>
          {cmd.hint && (
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--se-text-faint)" }}>
              {cmd.hint}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Create `EstimatorModal.tsx`**

```tsx
import { useEffect } from "react";
import { NutritionEstimator } from "./NutritionEstimator";

export function EstimatorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--se-bg-surface)",
          borderRadius: 16,
          maxWidth: 560,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "28px 24px",
          boxShadow: "var(--se-shadow-xl)",
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: "none",
            background: "var(--se-bg-subtle)",
            color: "var(--se-text-secondary)",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ×
        </button>
        <NutritionEstimator />
      </div>
    </div>
  );
}
```

**Step 3: Wire into `AIMeals.tsx`**

Add state:
```tsx
const [slashMenuOpen, setSlashMenuOpen] = useState(false);
const [estimatorOpen, setEstimatorOpen] = useState(false);
```

Compute slash query from input:
```tsx
const slashQuery = input.startsWith("/") ? input.slice(1) : "";
```

Open slash menu when input becomes `/` (via `onSlashTrigger` on `ComposerBar`, plus also when user types starting with `/`). Auto-close when input no longer starts with `/`.

Commands:
```tsx
const slashCommands: SlashCommand[] = [
  {
    id: "estimate",
    label: "Nutrition Estimator",
    description: "Calculate daily calories and macros",
    onRun: () => { setInput(""); setEstimatorOpen(true); },
  },
  {
    id: "new",
    label: "New chat",
    description: "Start a fresh conversation",
    hint: "⌘K",
    onRun: () => { setInput(""); handleNewChat(); },
  },
  {
    id: "clear",
    label: "Clear this chat",
    description: "Remove all messages in the current thread",
    onRun: () => { setInput(""); handleClearCurrent(); },
  },
  {
    id: "menu",
    label: "Browse menu",
    description: "Coming soon — /menu <hall>",
    disabled: true,
    onRun: () => {},
  },
];
```

Render below the composer (inside the composer wrapper, `position: relative` so the popover anchors correctly):

```tsx
<SlashMenu
  open={slashMenuOpen}
  query={slashQuery}
  commands={slashCommands}
  onClose={() => setSlashMenuOpen(false)}
/>
```

Remove the legacy tab bar (AI Chat / Nutrition Estimator toggle). The top now shows just `History` + `New chat` buttons — to be added in Task 14.

Render the modal at the end of the component:
```tsx
<EstimatorModal open={estimatorOpen} onClose={() => setEstimatorOpen(false)} />
```

**Step 4: Visual verify**

- Type `/` → slash menu appears above the composer.
- ↑/↓ navigates, Enter runs, Esc closes.
- `/estimate` opens the estimator modal. Close with backdrop click, X, or Esc.
- `/new` clears and resets. `/clear` clears current messages.
- `/menu` appears disabled.

**Step 5: Commit**

```bash
git add frontend/src/pages/aimeals/SlashMenu.tsx frontend/src/pages/aimeals/EstimatorModal.tsx frontend/src/pages/AIMeals.tsx
git commit -m "feat(aimeals): add slash command menu and inline estimator modal (replaces tab bar)"
```

---

## Phase 13 — Frontend: History drawer + API wiring

### Task 14: Create `HistoryDrawer` and wire conversation list / load / rename / delete

**Files:**
- Create: `frontend/src/pages/aimeals/HistoryDrawer.tsx`
- Modify: `frontend/src/pages/AIMeals.tsx`

**Step 1: Create `HistoryDrawer.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import type { ConvoSummary } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  conversations: ConvoSummary[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNewChat: () => void;
  onRename: (id: number, newTitle: string) => void;
  onDelete: (id: number) => void;
  isAuthenticated: boolean;
  onSignIn: () => void;
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString();
}

export function HistoryDrawer({
  open, onClose, conversations, activeId, onSelect, onNewChat,
  onRename, onDelete, isAuthenticated, onSignIn,
}: Props) {
  const [search, setSearch] = useState("");
  const [menuOpenFor, setMenuOpenFor] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.2)",
          backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
          zIndex: 60,
        }}
      />
      <aside
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0,
          width: "min(320px, 100vw)",
          background: "var(--se-bg-surface)",
          borderRight: "1px solid var(--se-border)",
          zIndex: 61,
          animation: "drawerSlideIn 260ms cubic-bezier(0.32, 0.72, 0, 1)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--se-shadow-lg)",
        }}
      >
        <div style={{ padding: "18px 18px 12px", borderBottom: "1px solid var(--se-border-muted)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--se-text-main)" }}>
              Recent chats
            </h3>
            <button type="button" onClick={onClose} aria-label="Close" style={{
              width: 28, height: 28, border: "none", borderRadius: 6, background: "transparent",
              color: "var(--se-text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1,
            }}>×</button>
          </div>
          <button
            type="button"
            onClick={() => { onNewChat(); onClose(); }}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 10,
              border: "1px solid var(--se-border)", background: "var(--se-bg-elevated)",
              color: "var(--se-text-main)", fontSize: 13, fontWeight: 700,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <span style={{ fontSize: 16, color: "var(--se-primary)" }}>+</span>
            New chat
          </button>
          <input
            type="text"
            placeholder="Search chats…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", marginTop: 10, padding: "8px 12px",
              borderRadius: 8, border: "1px solid var(--se-border)",
              background: "var(--se-bg-base)", fontSize: 13, outline: "none",
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
          {!isAuthenticated ? (
            <div style={{ textAlign: "center", padding: "40px 16px" }}>
              <p style={{ fontSize: 13, color: "var(--se-text-muted)", margin: "0 0 12px" }}>
                Sign in to save your chats and access them across devices.
              </p>
              <button
                type="button"
                onClick={onSignIn}
                style={{
                  padding: "8px 16px", borderRadius: 9999, border: "none",
                  background: "var(--se-primary)", color: "white",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}
              >
                Sign in
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--se-text-faint)", textAlign: "center", padding: 24 }}>
              {search ? "No matches." : "No chats yet — ask something to begin."}
            </p>
          ) : (
            filtered.map((c) => {
              const isActive = c.id === activeId;
              const isRenaming = renamingId === c.id;
              return (
                <div
                  key={c.id}
                  style={{
                    position: "relative",
                    borderRadius: 8,
                    background: isActive ? "var(--se-bg-subtle)" : "transparent",
                    marginBottom: 2,
                  }}
                >
                  {isRenaming ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (renameValue.trim()) onRename(c.id, renameValue.trim());
                        setRenamingId(null);
                      }}
                      style={{ padding: "6px 10px" }}
                    >
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => setRenamingId(null)}
                        onKeyDown={(e) => { if (e.key === "Escape") setRenamingId(null); }}
                        style={{
                          width: "100%", padding: "6px 8px", borderRadius: 6,
                          border: "1px solid var(--se-border-strong)",
                          fontSize: 13, outline: "none",
                        }}
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { onSelect(c.id); }}
                      style={{
                        display: "block", width: "100%", padding: "10px 12px",
                        textAlign: "left", background: "transparent", border: "none",
                        cursor: "pointer", borderRadius: 8,
                      }}
                    >
                      <div style={{
                        fontSize: 13, fontWeight: 600,
                        color: "var(--se-text-main)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {c.title}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--se-text-faint)", marginTop: 2 }}>
                        {relativeTime(c.updated_at)} · {c.message_count} msg
                      </div>
                    </button>
                  )}
                  {!isRenaming && (
                    <button
                      type="button"
                      aria-label="More"
                      onClick={(e) => { e.stopPropagation(); setMenuOpenFor(menuOpenFor === c.id ? null : c.id); }}
                      style={{
                        position: "absolute", top: 8, right: 8,
                        width: 24, height: 24, borderRadius: 6,
                        border: "none", background: "transparent",
                        color: "var(--se-text-muted)", cursor: "pointer",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      ⋯
                    </button>
                  )}
                  {menuOpenFor === c.id && (
                    <div style={{
                      position: "absolute", top: 28, right: 8,
                      background: "var(--se-bg-surface)",
                      border: "1px solid var(--se-border)",
                      borderRadius: 8, boxShadow: "var(--se-shadow-md)",
                      padding: 4, zIndex: 5, minWidth: 120,
                    }}>
                      <button
                        type="button"
                        onClick={() => { setMenuOpenFor(null); setRenamingId(c.id); setRenameValue(c.title); }}
                        style={menuItem}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => { setMenuOpenFor(null); onDelete(c.id); }}
                        style={{ ...menuItem, color: "var(--se-error)" }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}

const menuItem: React.CSSProperties = {
  display: "block", width: "100%", padding: "6px 10px",
  textAlign: "left", background: "transparent", border: "none",
  cursor: "pointer", fontSize: 12, borderRadius: 4,
  color: "var(--se-text-secondary)",
};
```

**Step 2: Wire into `AIMeals.tsx`**

Add state + effects:
```tsx
const [drawerOpen, setDrawerOpen] = useState(false);
const [conversations, setConversations] = useState<ConvoSummary[]>([]);
const [activeConvoId, setActiveConvoId] = useState<number | null>(null);
const isAuthenticated = Boolean(localStorage.getItem("authToken"));

useEffect(() => {
  if (!isAuthenticated) return;
  listConversations().then(setConversations).catch(() => {});
}, [isAuthenticated]);
```

Update `sendMessage` so the response's `conversation_id` updates the list:
```tsx
if (data.conversation_id) {
  setActiveConvoId(data.conversation_id);
  // Refresh or optimistically upsert conversation list
  setConversations((prev) => {
    const existing = prev.find((c) => c.id === data.conversation_id);
    if (existing) {
      return [
        { ...existing, title: data.title ?? existing.title, updated_at: new Date().toISOString(), message_count: existing.message_count + 2 },
        ...prev.filter((c) => c.id !== data.conversation_id),
      ];
    }
    return [
      { id: data.conversation_id!, title: data.title ?? trimmed.slice(0, 80), updated_at: new Date().toISOString(), message_count: 2 },
      ...prev,
    ].slice(0, 20);
  });
}
```

Handlers:
```tsx
const handleSelectConvo = async (id: number) => {
  try {
    const detail = await getConversation(id);
    const hydrated: Message[] = detail.messages.map((m) => ({
      id: m.id,
      role: m.role === "assistant" ? "ai" : "user",
      text: m.content,
      recommendedDishes: sanitizeRecommendedDishes(m.metadata?.recommended_dishes),
      mealPlan: sanitizeMealPlan(m.metadata?.meal_plan),
      followUpSuggestions: sanitizeFollowUpSuggestions(m.metadata?.follow_up_suggestions),
    }));
    setMessages(hydrated);
    setActiveConvoId(id);
    nextId.current = hydrated.length > 0 ? Math.max(...hydrated.map(m => m.id)) + 1 : 1;
    setDrawerOpen(false);
  } catch {
    toast.error("Couldn't load that chat.");
  }
};

const handleNewChat = () => {
  setMessages([]);
  setActiveConvoId(null);
  nextId.current = 1;
};

const handleRename = async (id: number, newTitle: string) => {
  const prev = conversations;
  setConversations((list) => list.map((c) => c.id === id ? { ...c, title: newTitle } : c));
  try { await renameConversation(id, newTitle); }
  catch {
    setConversations(prev);
    toast.error("Rename failed.");
  }
};

const handleDelete = async (id: number) => {
  const prev = conversations;
  setConversations((list) => list.filter((c) => c.id !== id));
  if (activeConvoId === id) handleNewChat();
  try { await deleteConversation(id); }
  catch {
    setConversations(prev);
    toast.error("Delete failed.");
  }
};
```

Add the drawer + top button row to JSX. Replace old tab bar with:

```tsx
<div style={{
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "8px 0 4px",
}}>
  <button type="button" onClick={() => setDrawerOpen(true)} style={topBtn}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
    History
  </button>
  {!isEmpty && (
    <button type="button" onClick={handleNewChat} style={topBtn}>
      + New chat
    </button>
  )}
</div>
```

Render drawer:
```tsx
<HistoryDrawer
  open={drawerOpen}
  onClose={() => setDrawerOpen(false)}
  conversations={conversations}
  activeId={activeConvoId}
  onSelect={handleSelectConvo}
  onNewChat={handleNewChat}
  onRename={handleRename}
  onDelete={handleDelete}
  isAuthenticated={isAuthenticated}
  onSignIn={() => navigate("/login")}
/>
```

**Step 3: Visual verify (logged in)**

- Send a couple of messages → new conversation appears in the drawer.
- Open drawer → click a chat → messages hydrate.
- Rename a chat → title updates.
- Delete a chat → removed.

**Step 4: Visual verify (logged out)**

- Open drawer → "Sign in to save your chats" message with Sign in button.
- Chat still works (anonymous path, LS persistence still intact).

**Step 5: Commit**

```bash
git add frontend/src/pages/aimeals/HistoryDrawer.tsx frontend/src/pages/AIMeals.tsx
git commit -m "feat(aimeals): add history drawer with backend persistence for auth'd users"
```

---

## Phase 14 — Frontend: Keyboard shortcuts

### Task 15: Add `useKeyboardShortcuts` hook

**Files:**
- Create: `frontend/src/pages/aimeals/useKeyboardShortcuts.ts`
- Modify: `frontend/src/pages/AIMeals.tsx`

**Step 1: Create the hook**

```ts
import { useEffect } from "react";

interface Bindings {
  onNewChat: () => void;
  onToggleDrawer: () => void;
}

export function useKeyboardShortcuts({ onNewChat, onToggleDrawer }: Bindings) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Ignore when user is typing in form inputs (except ⌘K which works globally)
      const target = e.target as HTMLElement | null;
      const inField = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        onNewChat();
      } else if (e.key === "/" && !inField) {
        e.preventDefault();
        onToggleDrawer();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNewChat, onToggleDrawer]);
}
```

**Step 2: Use in `AIMeals.tsx`**

```tsx
useKeyboardShortcuts({
  onNewChat: handleNewChat,
  onToggleDrawer: () => setDrawerOpen((v) => !v),
});
```

**Step 3: Visual verify**

- ⌘K / Ctrl+K → new chat
- ⌘/ / Ctrl+/ (outside the composer) → toggle drawer
- Esc closes drawer, slash menu, modal

**Step 4: Commit**

```bash
git add frontend/src/pages/aimeals/useKeyboardShortcuts.ts frontend/src/pages/AIMeals.tsx
git commit -m "feat(aimeals): add keyboard shortcuts for new chat and drawer toggle"
```

---

## Phase 15 — Frontend: Message actions (hover copy / regenerate / thumbs)

### Task 16: Create `MessageActions` and wire regenerate

**Files:**
- Create: `frontend/src/pages/aimeals/MessageActions.tsx`
- Modify: `frontend/src/pages/AIMeals.tsx`

**Step 1: Create component**

```tsx
import { useState } from "react";

interface Props {
  text: string;
  onRegenerate: () => void;
  canRegenerate: boolean;
}

export function MessageActions({ text, onRegenerate, canRegenerate }: Props) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <div style={{
      display: "flex", gap: 4, marginTop: 6,
      opacity: 0, transition: "opacity 150ms",
      color: "var(--se-text-faint)",
    }} className="ai-message-actions">
      <IconBtn label={copied ? "Copied" : "Copy"} onClick={copy}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      </IconBtn>
      {canRegenerate && (
        <IconBtn label="Regenerate" onClick={onRegenerate}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" />
          </svg>
        </IconBtn>
      )}
      <IconBtn
        label="Helpful"
        active={feedback === "up"}
        onClick={() => setFeedback(feedback === "up" ? null : "up")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 10v12M15 5.88l-1 5.12h6.83a2 2 0 0 1 2 2.37l-1.3 7A2 2 0 0 1 19.57 22H7V10L14 3" />
        </svg>
      </IconBtn>
      <IconBtn
        label="Not helpful"
        active={feedback === "down"}
        onClick={() => setFeedback(feedback === "down" ? null : "down")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 14V2M9 18.12l1-5.12H3.17a2 2 0 0 1-2-2.37l1.3-7A2 2 0 0 1 4.43 2H17v12L10 21" />
        </svg>
      </IconBtn>
    </div>
  );
}

function IconBtn({
  label, onClick, children, active,
}: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 26, height: 26, borderRadius: 6,
        border: "none", background: "transparent",
        color: active ? "var(--se-primary)" : "inherit",
        cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}
```

Add CSS for the hover reveal. In `custom.css`:
```css
.ai-message-actions-wrap:hover .ai-message-actions {
  opacity: 1;
}
```

**Step 2: Wire regenerate**

In `AIMeals.tsx`, add:
```tsx
const regenerate = async (fromMessageId: number) => {
  // Find the user message immediately before this AI message
  const idx = messages.findIndex((m) => m.id === fromMessageId);
  if (idx <= 0) return;
  const userMsg = messages[idx - 1];
  if (userMsg.role !== "user") return;

  // Drop the target AI message locally
  setMessages((prev) => prev.filter((m) => m.id !== fromMessageId));
  setLoading(true);

  const controller = new AbortController();
  abortRef.current = controller;

  try {
    const data = await sendChatMessage({
      message: userMsg.text,
      history: toHistory(messages.slice(0, idx - 1)),
      tray_context: trayContext,
      conversation_id: activeConvoId,
      regenerate: true,
    }, controller.signal);

    const aiMsg: Message = {
      id: nextId.current++,
      role: "ai",
      text: data.response || "I'm not sure how to help with that.",
      recommendedDishes: sanitizeRecommendedDishes(data.recommended_dishes),
      mealPlan: sanitizeMealPlan(data.meal_plan),
      followUpSuggestions: sanitizeFollowUpSuggestions(data.follow_up_suggestions),
    };
    setMessages((prev) => [...prev, aiMsg]);
  } catch {
    toast.error("Couldn't regenerate.");
  } finally {
    setLoading(false);
    abortRef.current = null;
  }
};
```

Wrap each AI message bubble in a `<div className="ai-message-actions-wrap">` and render `<MessageActions ... />` below the bubble body.

**Step 3: Visual verify**

- Hover AI message → icons appear.
- Copy → copies text.
- Regenerate → last AI response regenerates. Backend replaces the old assistant message.
- Thumbs → toggle state.

**Step 4: Commit**

```bash
git add frontend/src/pages/aimeals/MessageActions.tsx frontend/src/pages/AIMeals.tsx frontend/src/static/css/custom.css
git commit -m "feat(aimeals): add hover message actions (copy/regenerate/feedback)"
```

---

## Phase 16 — Polish + mobile + reduced-motion

### Task 17: Responsive tweaks and reduced-motion audit

**Files:**
- Modify: `frontend/src/pages/AIMeals.tsx`
- Modify: `frontend/src/pages/aimeals/ComposerBar.tsx`
- Modify: `frontend/src/static/css/custom.css`

**Steps:**

1. Add media-query breakpoint handling in `ComposerBar.tsx` — at `<768px`, reduce padding and ensure `maxWidth: 100%`.
2. Drawer becomes full-width at `<500px` (`width: 100vw`).
3. Hero title font-size uses `clamp()` already — verify it scales down to 1.5rem on small screens.
4. In `custom.css`, confirm the `prefers-reduced-motion` block disables `aiOrbit`, `auroraShift`, and `composerMorph`. Also disable the 8s suggestion rotation effect when reduced-motion (guard the `setInterval` in `EmptyHero`):

```tsx
const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
useEffect(() => {
  if (prefersReducedMotion) return;
  const timer = window.setInterval(() => { /* ... */ }, 8000);
  return () => window.clearInterval(timer);
}, [prefersReducedMotion]);
```

5. Manual test:
   - Resize browser to 360px → drawer, composer, hero all usable.
   - OS preference "Reduce Motion" → animations freeze.
   - Run `ReadLints` on touched files; fix anything introduced.

6. Run full frontend checks:
   ```bash
   cd frontend && npx tsc --noEmit && npm run lint
   ```

7. Commit:
   ```bash
   git add -A
   git commit -m "polish(aimeals): responsive + reduced-motion compliance"
   ```

---

## Phase 17 — Integration sanity check

### Task 18: End-to-end manual QA and fix regressions

**Checklist (run through on http://localhost:5173/aimeals):**

- [ ] Anonymous user: empty state centered, composer works, messages persist via LS across refresh, drawer shows sign-in CTA.
- [ ] Auth'd user: drawer lists conversations, oldest kept ≤20, selecting hydrates.
- [ ] New chat button resets active thread.
- [ ] Rename + Delete work; optimistic + rollback on error.
- [ ] Slash menu: `/estimate`, `/new`, `/clear` all functional. `/menu` disabled.
- [ ] Keyboard: ⌘K, ⌘/, Esc all work.
- [ ] Composer: textarea autogrows, Shift+Enter newline, Enter send.
- [ ] Stop button cancels in-flight request.
- [ ] Regenerate replaces last AI response.
- [ ] Message actions hover reveals.
- [ ] Aurora + orbiting glow visible, subtle, no perf hiccup.
- [ ] Morph transition smooth on first send.
- [ ] Dish recommendation cards still add to tray correctly.
- [ ] Meal plan cards still work.
- [ ] Follow-up suggestions still appear.
- [ ] Daily intake / tray context strip still shows under composer.
- [ ] No console errors. No hydration warnings.
- [ ] `prefers-reduced-motion: reduce` honored.

Run backend tests one more time:
```bash
cd backend && python manage.py test mealPlanning --settings=SmartEats_config.settings.development -v 1
```

Run frontend checks:
```bash
cd frontend && npx tsc --noEmit && npm run lint
```

Final commit only if more changes are needed:
```bash
git add -A
git commit -m "chore(aimeals): final integration polish"
```

---

## Roll-back plan

All changes are additive to the backend; migration adds two new tables with no impact on existing data. The frontend replaces `/aimeals` entirely — to roll back, revert the relevant frontend commits and run:

```bash
cd backend && python manage.py migrate mealPlanning <previous_migration_number> --settings=SmartEats_config.settings.development
```

---

## Out of scope (future)

- Streaming responses (would require SSE endpoint + EventSource client).
- Token-level typing animation.
- File attachments.
- Voice input.
- Migrating anonymous LS chats into backend on sign-in.
- Server-side title auto-summary via a short LLM call.
- Sharing conversations via public link.
