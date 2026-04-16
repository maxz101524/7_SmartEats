# SmartEats AI Chat Redesign — Design Doc

**Date:** 2026-04-16
**Status:** Approved, awaiting implementation plan
**Surface:** `/aimeals` route · `frontend/src/pages/AIMeals.tsx` + new backend models

---

## Goal

Transform the SmartEats AI chat page from a simple single-thread nutrition bot into a state-of-the-art AI chat interface — visually futuristic (CraftGPT-inspired centered empty state, smooth morph into chat, subtle animated AI-feel background) and functionally complete (persistent conversation history, slash commands, keyboard shortcuts, stop/regenerate, modern composer).

## Non-goals

- Streaming token responses (backend returns complete JSON today; streaming is a future upgrade).
- File/image attachments (scoped out of v1).
- Voice input.
- Cross-device sync for anonymous users (auth'd users get it automatically via backend persistence).

---

## User decisions locked in

| # | Question | Decision |
|---|---|---|
| 1 | Where does chat history live? | **Backend** — new `Conversation` + `ChatMessage` models |
| 2 | How is history exposed? | **Collapsible drawer** from the left (overlay, not persistent) |
| 3 | What happens to Nutrition Estimator tab? | Removed; invoked via **slash command** (`/estimate`) |
| 4 | How are chats titled? | **First user message, truncated** (zero extra LLM cost) |
| 5 | Centered→chat transition style | **Morph** — single composer element animates position/size |
| 6 | Background pattern | **Aurora mesh + orbiting glow** (CSS-only, reuses homepage keyframes) |

---

## Part 1 — UI / Visual Design

### 1.1 Shell structure

Three states live in one route:

| State | Trigger | Composer position | Visible content |
|---|---|---|---|
| `empty` | No messages in active thread | Centered at ~45% viewport height | Hero title, subtitle, 3 rotating suggestion chips |
| `chatting` | ≥1 message | Docked at bottom (720px wide) | Scrollable message list above composer |
| `drawer-open` | User opens history | Unchanged | Left-side overlay drawer with conversation list |

### 1.2 History drawer

- Trigger: `☰` icon button top-left of canvas (replaces old tab bar).
- Slides in from left, 280px wide, over translucent backdrop (`rgba(0,0,0,0.2)` + 8px blur).
- Backdrop click closes. Esc closes.
- Contents (top to bottom):
  1. Search input (client-side filter by title).
  2. `+ New chat` primary button.
  3. Flat list of conversations — title, relative time (e.g. "2h ago"), current convo highlighted.
  4. Per-row hover `…` menu → `Rename` · `Delete`.
- Shows last **20 conversations** (LRU-capped on the backend). Scrolls if overflow.
- Mobile (<768px): becomes full-screen drawer.

### 1.3 Empty state (CraftGPT-inspired)

- Vertical flex-column centering, composer at ~45%.
- Hero: `✦` icon (28px, `--se-primary-dim` bg) → `What can I help with?` (reuses `text-gradient-vivid` on "help") → subtitle: "Ask about dining options, nutrition, or meal ideas across all UIUC dining halls."
- Composer width: 560px max, 56px tall, pill (`border-radius: 22px`), white bg, soft elevated shadow, focus-ring border glow.
- 3 suggestion chips below composer. The set rotates every **8s** with 300ms crossfade (picks from `ALL_PROMPTS`).

### 1.4 Chat state (morph transition)

- On first message send:
  - Composer animates center → bottom dock over **550ms** with `cubic-bezier(0.32, 0.72, 0, 1)` (spring-out).
  - Hero + suggestion chips fade/scale out in parallel (opacity 1→0, scale 1→0.96, 250ms).
  - First user bubble enters via `bubbleRise` keyframe (translateY 12px→0, opacity 0→1, 350ms).
- Composer expands to 720px max width to match messages column.
- Message list uses existing bubble styling (already strong).
- **New** AI-message hover row with 4 icon buttons: `Copy`, `Regenerate`, `↑` thumbs-up, `↓` thumbs-down (feedback is UI-only for v1).
- **Stop** button replaces `Send` while `loading=true`; aborts request via `AbortController`. On abort, show an "aborted" caption in place of the AI response. The user message is preserved.

### 1.5 Background "AI pattern"

Two layered elements, fixed, behind the canvas (z-index 0):

1. **Aurora gradient layer** — reuses `@keyframes auroraShift` from `custom.css`. Opacity 0.35, duration 25s. Warm palette: `#fde8e2 → #fff7e6 → #f0e9fa → #fef3c7 → #fde8e2`. Masked with `linear-gradient(to bottom, black 60%, transparent 100%)`.
2. **Orbiting glow** — single 420px radial-gradient div (`var(--se-primary)` → transparent at 70%), position absolute. New keyframe `@keyframes aiOrbit` traces slow elliptical path (25s loop):
   - `0% { transform: translate(-30px, -20px); }`
   - `50% { transform: translate(40px, 30px); }`
   - `100% { transform: translate(-30px, -20px); }`
   - In **empty** state: anchored to viewport center.
   - In **chat** state: repositions (CSS class swap with 600ms transition) to hover behind the composer at bottom-center.

Both layers honor `@media (prefers-reduced-motion: reduce)` — animations paused, gradients static.

### 1.6 Composer (new)

- Upgraded from `<input>` → auto-resizing `<textarea>` (min 48px, max 200px). Single-line appearance until user adds newline.
- **Enter** = send · **Shift+Enter** = newline.
- Left toolbar: `+` icon (attach — placeholder, disabled), `/` icon (opens slash menu).
- Right: character counter appears when >240 chars; Send/Stop button.
- On focus: border transitions to `--se-border-strong`; soft primary-color glow shadow appears.

### 1.7 Slash command menu

- Opens when user types `/` as the first character of the composer, or clicks `/` icon.
- Floating popover above the composer, anchored left, max 320px wide.
- Keyboard: `↑/↓` navigate, `Enter` select, `Esc` close.
- Commands (v1):
  - `/estimate` — opens Nutrition Estimator as a centered modal dialog (reusing existing `NutritionEstimator` component).
  - `/new` — starts a fresh chat (clears active conversation).
  - `/clear` — clears current messages (with confirm toast).
  - `/menu <hall>` — placeholder, disabled, tooltip "coming soon".
- Typed text after `/` filters the menu live.

### 1.8 Keyboard shortcuts

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | New chat |
| `⌘/` / `Ctrl+/` | Toggle history drawer |
| `Esc` | Close drawer / close slash menu / close estimator modal |
| `↑` in empty composer | Populate last user message |

Small `?` button bottom-right of composer area shows a tooltip listing shortcuts.

### 1.9 Context strip (kept, restyled)

The existing "Logged today · Tray · Remaining" footer moves to a single muted caption directly below the composer (both states). Smaller font (11px), `--se-text-faint` color. Gives the AI real-time context and reminds users it's grounded in their data.

---

## Part 2 — Data Model & API

### 2.1 New Django models

**`Conversation`** in `mealPlanning/models.py`:

```python
class Conversation(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="conversations")
    title = models.CharField(max_length=80, default="New chat")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [models.Index(fields=["user", "-updated_at"])]
```

**`ChatMessage`**:

```python
class ChatMessage(models.Model):
    ROLE_CHOICES = [("user", "user"), ("assistant", "assistant")]

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=16, choices=ROLE_CHOICES)
    content = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)  # recommended_dishes, meal_plan, follow_up_suggestions
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
```

**LRU cap** enforced in `Conversation.save()` or at creation path: if the user already owns 20 conversations, delete the oldest by `updated_at` in the same transaction.

### 2.2 Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/conversations/` | required | List user's conversations — `[{id, title, updated_at, message_count}]` |
| `POST` | `/api/conversations/` | required | Create empty conversation — rarely used; most creation happens lazily on first `/ai-chat/` call |
| `GET` | `/api/conversations/<id>/` | required, owner-only | Full detail with messages |
| `PATCH` | `/api/conversations/<id>/` | required, owner-only | Rename — body `{title}` |
| `DELETE` | `/api/conversations/<id>/` | required, owner-only | Delete convo + cascade messages |
| `POST` | `/api/ai-chat/` **(modified)** | optional | Now accepts `conversation_id` (optional) + `regenerate` (bool). Behavior below. |

**`/api/ai-chat/` behavior (updated):**

1. If user is anonymous → stateless path (unchanged); returns response, no `conversation_id`.
2. If user is auth'd and no `conversation_id` → create new `Conversation` (title = first user msg, truncated to 80 chars; LRU-cap enforced), then proceed.
3. If `conversation_id` supplied → verify ownership (404 otherwise).
4. If `regenerate=true` → pop the most recent assistant message (if any) from this conversation before generating.
5. Append user message to conversation (unless regenerate is true and this is a re-run of the last user message).
6. Call LLM with full history from the conversation.
7. Append assistant message with metadata (dishes, meal plan, follow-ups).
8. Touch `updated_at` (auto_now handles this).
9. Return `{conversation_id, title, response, recommended_dishes, meal_plan, follow_up_suggestions}`.

### 2.3 Serializers

```python
class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ["id", "role", "content", "metadata", "created_at"]

class ConversationListSerializer(serializers.ModelSerializer):
    message_count = serializers.IntegerField(read_only=True)
    class Meta:
        model = Conversation
        fields = ["id", "title", "updated_at", "message_count"]

class ConversationDetailSerializer(serializers.ModelSerializer):
    messages = ChatMessageSerializer(many=True, read_only=True)
    class Meta:
        model = Conversation
        fields = ["id", "title", "updated_at", "messages"]
```

List view uses `annotate(message_count=Count("messages"))`.

### 2.4 Views

- `ConversationListCreateView(ListCreateAPIView)` — `IsAuthenticated`, `get_queryset` scoped to `self.request.user`.
- `ConversationDetailView(RetrieveUpdateDestroyAPIView)` — same scoping; returns 404 (not 403) for cross-user access.
- `ai_chat_view` — modify existing `@api_view(["POST"])`. Keep anonymous path intact. Add auth'd branch with conversation handling.

### 2.5 Tests (new)

- `test_conversation_list_only_returns_own`
- `test_conversation_detail_returns_404_for_other_user`
- `test_conversation_lru_cap_deletes_oldest_when_over_20`
- `test_ai_chat_creates_conversation_when_none_provided`
- `test_ai_chat_appends_to_existing_conversation`
- `test_ai_chat_regenerate_pops_last_assistant_message`
- `test_conversation_rename_updates_title`

---

## Part 3 — Frontend State & Data Flow

### 3.1 New state in `AIMeals.tsx`

```ts
conversations: ConvoSummary[]
activeConvoId: number | null
messages: Message[]
drawerOpen: boolean
slashMenuOpen: boolean
slashQuery: string
estimatorOpen: boolean
loading: boolean
abortRef: useRef<AbortController | null>
```

### 3.2 Flows

1. **Mount (auth'd)** — `GET /conversations/` populates drawer. Messages stay empty.
2. **Mount (anon)** — hydrate from `localStorage` (existing behavior). Drawer shows sign-in CTA.
3. **First send** — `POST /ai-chat/` with `conversation_id: null`. Server returns `{conversation_id, title, ...}`. Client prepends new convo to drawer list. Clip to 20 client-side too.
4. **Click drawer row** — `GET /conversations/<id>/`, replace messages, set `activeConvoId`. Desktop: drawer stays open; mobile: closes.
5. **New chat** — `setActiveConvoId(null); setMessages([])`. No backend call; creation is lazy.
6. **Rename / Delete** — optimistic update + `PATCH`/`DELETE`. Revert on failure with error toast.
7. **Stop generation** — `abortRef.current?.abort()`, render "aborted" caption where the assistant response would have been. User message preserved.
8. **Regenerate** — `POST /ai-chat/` with `regenerate: true`. Locally strip the last assistant message first (instant feedback) then fill from response.

### 3.3 Anonymous fallback

- No history list; drawer body shows "Sign in to save your chats" + sign-in button.
- `localStorage` persists the single active thread across refreshes (existing behavior preserved).
- On sign-in mid-session: drawer refreshes, but the anonymous thread is not migrated (documented caveat).

---

## Part 4 — Edge Cases & Non-functional

- **Token expired mid-request (401)** → toast "Sign in again to save progress" + render response locally.
- **Network failure saving** → message shown with inline "Retry" affordance; doesn't block input.
- **Two tabs open** → `visibilitychange` listener re-fetches `/conversations/` on focus.
- **Slash menu + loading** → slash menu disabled while loading, except `⌘K` still works (aborts).
- **Reduced motion** → aurora + orbit static; morph replaced with instant layout swap.
- **Mobile (<768px)** — drawer full-screen; hero title shrinks to `--se-text-h3`; composer full-bleed with 12px side padding.
- **Very long messages** (>2000 chars) — scrollable inside bubble with `max-height: 400px`.
- **Rate limit / 429 from LLM** → friendly error message bubble + retry button (re-sends same message).

---

## Part 5 — File Plan

### Backend
- `backend/mealPlanning/models.py` — add `Conversation`, `ChatMessage`.
- `backend/mealPlanning/migrations/0XXX_conversation_chatmessage.py` — new migration.
- `backend/mealPlanning/serializers.py` — create if missing; add 3 serializers.
- `backend/mealPlanning/views.py` — add 2 class-based views; modify `ai_chat_view`.
- `backend/mealPlanning/urls.py` — register `conversations/` + `conversations/<id>/`.
- `backend/mealPlanning/tests.py` — ~7 new tests.

### Frontend
- `frontend/src/pages/AIMeals.tsx` — shell rewrite; preserve dish/meal-plan card internals.
- `frontend/src/pages/aimeals/HistoryDrawer.tsx` — new.
- `frontend/src/pages/aimeals/ComposerBar.tsx` — new.
- `frontend/src/pages/aimeals/SlashMenu.tsx` — new.
- `frontend/src/pages/aimeals/EmptyHero.tsx` — new.
- `frontend/src/pages/aimeals/BackgroundOrb.tsx` — new.
- `frontend/src/pages/aimeals/MessageActions.tsx` — new.
- `frontend/src/pages/aimeals/useKeyboardShortcuts.ts` — new hook.
- `frontend/src/pages/aimeals/api.ts` — conversation API client wrappers.
- `frontend/src/static/css/custom.css` — add `@keyframes aiOrbit`, `@keyframes composerMorph`, `@keyframes bubbleRise`, reduced-motion overrides.

---

## Part 6 — Rollout & Compatibility

- Migration is additive; no data loss risk.
- `/api/ai-chat/` remains backward-compatible (new fields optional).
- Anonymous users retain existing LS-only experience.
- Ship behind no feature flag — it's a net upgrade and fully replaces the tabbed UI.

---

## Open questions (for implementer)

- Should `ChatMessage.metadata` enforce a schema via a Pydantic-style validator, or remain free-form JSON? Recommendation: free-form for v1, add validation only if we see bad data.
- Should we persist `follow_up_suggestions` in metadata, or regenerate on each list load? Recommendation: persist — zero marginal cost and keeps restored chats looking identical.
- Aurora palette exact values — will tune during implementation against the live page; design spec is a starting point.
