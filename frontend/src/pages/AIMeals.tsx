import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config";
import { useMealTray } from "../mealTray";
import { useToast } from "../components/useToast";
import { FormattedMessageText } from "./aimeals/FormattedMessageText";
import { DishRecommendationCard } from "./aimeals/DishRecommendationCard";
import { MealPlanCard } from "./aimeals/MealPlanCard";
import { ThinkingIndicator } from "./aimeals/ThinkingIndicator";
import { BackgroundOrb } from "./aimeals/BackgroundOrb";
import { EmptyHero } from "./aimeals/EmptyHero";
import { ComposerBar } from "./aimeals/ComposerBar";
import { SlashMenu, type SlashCommand } from "./aimeals/SlashMenu";
import { EstimatorModal } from "./aimeals/EstimatorModal";
import { HistoryDrawer } from "./aimeals/HistoryDrawer";
import { useKeyboardShortcuts } from "./aimeals/useKeyboardShortcuts";
import {
  sendChatMessage,
  listConversations,
  getConversation,
  renameConversation,
  deleteConversation,
} from "./aimeals/api";
import { getDishHall, hasDishNutrition } from "./aimeals/dishHelpers";
import type { RecommendedDish, MealPlan, Message, MessageRole, ConvoSummary } from "./aimeals/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

interface DailyIntake {
  consumed: { calories: number; protein: number; carbs: number; fat: number };
  goals: { calories: number; protein: number; carbs: number; fat: number } | null;
  goals_set: boolean;
}

const CHAT_STORAGE_KEY = "smarteats_ai_chat_v1";
const ASSISTANT_STYLE_PREFIXES = [
  "are you",
  "do you",
  "would you",
  "could you",
  "can you",
  "what kind of",
  "which kind of",
] as const;

function sanitizeFollowUpSuggestions(rawSuggestions: unknown): string[] | undefined {
  if (!Array.isArray(rawSuggestions)) return undefined;

  const cleaned = rawSuggestions
    .map((item) => String(item || "").trim())
    .filter((item) => item.length > 0 && item.length <= 80)
    .filter((item) => {
      const normalized = item.toLowerCase();
      return !ASSISTANT_STYLE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
    })
    .filter((item, index, arr) => arr.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, 3);

  return cleaned.length > 0 ? cleaned : undefined;
}

function sanitizeRecommendedDishes(rawDishes: unknown): RecommendedDish[] | undefined {
  if (!Array.isArray(rawDishes)) return undefined;

  const dishes = rawDishes
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const item = raw as Record<string, unknown>;
      const dishId = Number(item.dish_id);
      const dishName = String(item.dish_name || "").trim();
      const reason = String(item.reason || "").trim();
      if (!Number.isInteger(dishId) || dishId <= 0 || !dishName) return null;

      const dish: RecommendedDish = {
        dish_id: dishId,
        dish_name: dishName,
        reason,
      };

      const stringFields = [
        "dining_hall_name",
        "hall_name",
        "serving_unit",
        "serving_size",
        "meal_period",
      ] as const;
      stringFields.forEach((field) => {
        const value = item[field];
        if (typeof value === "string" && value.trim()) {
          dish[field] = value.trim();
        }
      });

      const numberFields = ["calories", "protein", "carbohydrates", "fat", "quantity"] as const;
      numberFields.forEach((field) => {
        const value = Number(item[field]);
        if (Number.isFinite(value)) {
          dish[field] = value;
        }
      });

      return dish;
    })
    .filter((dish): dish is RecommendedDish => dish !== null);

  return dishes.length > 0 ? dishes : undefined;
}

function sanitizeMealPlan(rawPlan: unknown): MealPlan | undefined {
  if (!rawPlan || typeof rawPlan !== "object") return undefined;

  const plan = rawPlan as Record<string, unknown>;
  const title = String(plan.title || "Suggested meal plan").trim();
  const items = sanitizeRecommendedDishes(plan.items);
  if (!items?.length) return undefined;

  const totals =
    plan.totals && typeof plan.totals === "object"
      ? (plan.totals as Record<string, unknown>)
      : null;
  const remainingAfter =
    plan.remaining_after && typeof plan.remaining_after === "object"
      ? (plan.remaining_after as Record<string, unknown>)
      : null;

  return {
    title,
    summary: typeof plan.summary === "string" ? plan.summary : undefined,
    note: typeof plan.note === "string" ? plan.note : undefined,
    action_label: typeof plan.action_label === "string" ? plan.action_label : undefined,
    items,
    totals: totals
      ? {
          calories: Number(totals.calories) || 0,
          protein: Number(totals.protein) || 0,
          carbohydrates: Number(totals.carbohydrates) || 0,
          fat: Number(totals.fat) || 0,
        }
      : undefined,
    remaining_after: remainingAfter
      ? {
          calories: Number(remainingAfter.calories) || 0,
          protein: Number(remainingAfter.protein) || 0,
          carbohydrates: Number(remainingAfter.carbohydrates) || 0,
          fat: Number(remainingAfter.fat) || 0,
        }
      : undefined,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AIMeals() {
  const navigate = useNavigate();
  const toast = useToast();
  const {
    items: trayItems,
    totals: trayTotals,
    count: trayCount,
    uniqueCount,
    addItem,
  } = useMealTray();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dailyIntake, setDailyIntake] = useState<DailyIntake | null>(null);
  const [activeConvoId, setActiveConvoId] = useState<number | null>(null);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [estimatorOpen, setEstimatorOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [conversations, setConversations] = useState<ConvoSummary[]>([]);
  const isAuthenticated = Boolean(localStorage.getItem("authToken"));
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    if (!isAuthenticated) return;
    listConversations().then(setConversations).catch(() => {});
  }, [isAuthenticated]);

  const slashQuery = input.startsWith("/") ? input.slice(1) : "";

  useEffect(() => {
    if (input.startsWith("/")) setSlashMenuOpen(true);
    else setSlashMenuOpen(false);
  }, [input]);

  const handleNewChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setActiveConvoId(null);
    nextId.current = 1;
    sessionStorage.removeItem(CHAT_STORAGE_KEY);
  };

  const handleClearCurrent = () => {
    abortRef.current?.abort();
    setMessages([]);
    nextId.current = 1;
    sessionStorage.removeItem(CHAT_STORAGE_KEY);
  };

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
      nextId.current = hydrated.length > 0 ? Math.max(...hydrated.map((m) => m.id)) + 1 : 1;
      setDrawerOpen(false);
    } catch (err) {
      console.error("Couldn't load chat", err);
    }
  };

  const handleRename = async (id: number, newTitle: string) => {
    const prev = conversations;
    setConversations((list) => list.map((c) => (c.id === id ? { ...c, title: newTitle } : c)));
    try {
      await renameConversation(id, newTitle);
    } catch (err) {
      setConversations(prev);
      console.error("Rename failed", err);
    }
  };

  const handleDelete = async (id: number) => {
    const prev = conversations;
    setConversations((list) => list.filter((c) => c.id !== id));
    if (activeConvoId === id) handleNewChat();
    try {
      await deleteConversation(id);
    } catch (err) {
      setConversations(prev);
      console.error("Delete failed", err);
    }
  };

  useKeyboardShortcuts({
    onNewChat: handleNewChat,
    onToggleDrawer: () => setDrawerOpen((v) => !v),
  });

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

  // Route-scoped scroll lock so the AI chat behaves like modern chat UIs:
  // the shell owns scrolling, not the whole page (prevents reaching footer).
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const restored: Message[] = parsed
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const role: MessageRole = item.role === "user" ? "user" : "ai";
          return {
            id: Number(item.id) || 0,
            role,
            text: String(item.text || ""),
            recommendedDishes: Array.isArray(item.recommendedDishes)
              ? sanitizeRecommendedDishes(item.recommendedDishes)
              : undefined,
            mealPlan: sanitizeMealPlan(item.mealPlan),
            followUpSuggestions: sanitizeFollowUpSuggestions(item.followUpSuggestions),
            error: Boolean(item.error),
          };
        })
        .filter((item) => item.id > 0 && item.text.trim().length > 0)
        .map((item) => ({
          ...item,
          recommendedDishes: Array.isArray(item.recommendedDishes)
            ? sanitizeRecommendedDishes(item.recommendedDishes)
            : undefined,
          mealPlan: sanitizeMealPlan(item.mealPlan),
          followUpSuggestions: sanitizeFollowUpSuggestions(item.followUpSuggestions),
        }));

      if (restored.length > 0) {
        setMessages(restored);
        nextId.current = Math.max(...restored.map((m) => m.id)) + 1;
      }
    } catch (err) {
      console.error("Failed to restore AI chat session", err);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      setDailyIntake(null);
      return;
    }

    let cancelled = false;
    axios
      .get<DailyIntake>(`${API_BASE}/daily-intake/`, {
        headers: { Authorization: `Token ${token}` },
      })
      .then((res) => {
        if (!cancelled) {
          setDailyIntake(res.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDailyIntake(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      sessionStorage.removeItem(CHAT_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  const toHistory = (existingMessages: Message[]): ChatHistoryItem[] =>
    existingMessages
      .filter((m) => !m.error)
      .map((m) => ({
        role: m.role === "ai" ? "assistant" : "user",
        content: m.text,
      }));

  const trayContext = useMemo(() => ({
    item_count: trayCount,
    unique_dishes: uniqueCount,
    totals: trayTotals,
    items: trayItems.slice(0, 8).map((item) => ({
      dish_id: item.dish_id,
      dish_name: item.dish_name,
      hall: item.hall,
      quantity: item.quantity,
      calories: item.calories,
      protein: item.protein,
      carbohydrates: item.carbohydrates,
      fat: item.fat,
      serving_size: item.serving_size,
    })),
  }), [trayCount, trayItems, trayTotals, uniqueCount]);

  const remainingSummary = useMemo(() => {
    if (!dailyIntake?.goals_set || !dailyIntake.goals) {
      return null;
    }

    return {
      calories: Math.max(0, dailyIntake.goals.calories - dailyIntake.consumed.calories),
      protein: Math.max(0, dailyIntake.goals.protein - dailyIntake.consumed.protein),
      carbs: Math.max(0, dailyIntake.goals.carbs - dailyIntake.consumed.carbs),
      fat: Math.max(0, dailyIntake.goals.fat - dailyIntake.consumed.fat),
    };
  }, [dailyIntake]);

  const viewDish = (dishId: number) => {
    navigate(`/dishes/${dishId}`, {
      state: { from: "/aimeals" },
    });
  };

  const addDishToTray = (dish: RecommendedDish, notify = true, fallbackToView = true) => {
    const hall = getDishHall(dish);
    if (!hall || !hasDishNutrition(dish)) {
      if (fallbackToView) {
        viewDish(dish.dish_id);
      }
      return 0;
    }

    const quantity = Math.max(1, Math.round(Number(dish.quantity) || 1));
    addItem({
      dish_id: dish.dish_id,
      dish_name: dish.dish_name,
      hall,
      calories: Number(dish.calories) || 0,
      protein: Number(dish.protein) || 0,
      carbohydrates: Number(dish.carbohydrates) || 0,
      fat: Number(dish.fat) || 0,
      serving_size: dish.serving_size,
    }, quantity);

    if (notify) {
      toast.success(
        quantity > 1
          ? `${quantity} servings of ${dish.dish_name} added to your tray.`
          : `${dish.dish_name} added to your tray.`,
      );
    }

    return quantity;
  };

  const addMealPlanToTray = (plan: MealPlan) => {
    const addedServings = plan.items.reduce(
      (count, dish) => count + addDishToTray(dish, false, false),
      0,
    );

    if (addedServings > 0) {
      toast.success(`${addedServings} planned serving${addedServings === 1 ? "" : "s"} added to your tray.`);
    } else {
      toast.info("Open a dish first to add it to your tray.");
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const trimmed = text.trim();
    const userMsg: Message = { id: nextId.current++, role: "user", text: trimmed };
    const history = toHistory(messages);
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const data = await sendChatMessage(
        {
          message: trimmed,
          history,
          tray_context: trayContext,
          conversation_id: activeConvoId,
        },
        controller.signal,
      );

      if (data.conversation_id) {
        setActiveConvoId(data.conversation_id);
        setConversations((prev) => {
          const existing = prev.find((c) => c.id === data.conversation_id);
          if (existing) {
            return [
              {
                ...existing,
                title: data.title ?? existing.title,
                updated_at: new Date().toISOString(),
                message_count: existing.message_count + 2,
              },
              ...prev.filter((c) => c.id !== data.conversation_id),
            ];
          }
          return [
            {
              id: data.conversation_id!,
              title: data.title ?? trimmed.slice(0, 80),
              updated_at: new Date().toISOString(),
              message_count: 2,
            },
            ...prev,
          ].slice(0, 20);
        });
      }

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { id: nextId.current++, role: "ai", text: data.error as string, error: true },
        ]);
      } else {
        const aiMsg: Message = {
          id: nextId.current++,
          role: "ai",
          text: data.response || "I'm not sure how to help with that.",
          recommendedDishes: sanitizeRecommendedDishes(data.recommended_dishes),
          mealPlan: sanitizeMealPlan(data.meal_plan),
          followUpSuggestions: sanitizeFollowUpSuggestions(data.follow_up_suggestions),
        };
        setMessages((prev) => [...prev, aiMsg]);
      }
    } catch (err) {
      if (axios.isCancel(err) || (err as Error).name === "CanceledError") {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId.current++,
            role: "ai",
            text: "Generation stopped.",
            aborted: true,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId.current++,
            role: "ai",
            text: "Something went wrong reaching the server. Make sure the backend is running.",
            error: true,
          },
        ]);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
  };

  const isEmpty = messages.length === 0;

  return (
    <>
      <style>{`
        @keyframes dot-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%            { transform: translateY(-6px); opacity: 1; }
        }

        @keyframes ai-thinking-pulse {
          0%, 100% { transform: scale(1); opacity: 0.82; }
          50%      { transform: scale(1.08); opacity: 1; }
        }

        @keyframes ai-thinking-sweep {
          0%   { transform: translateX(-100%); opacity: 0; }
          20%  { opacity: 1; }
          100% { transform: translateX(100%); opacity: 0; }
        }

        /* Remove browser/Tailwind focus rings on the AI chatbox only */
        .ai-chatbox-input:focus,
        .ai-chatbox-input:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }

        .ai-chatbox-form:focus,
        .ai-chatbox-form:focus-visible,
        .ai-chatbox-form:focus-within {
          outline: none !important;
          box-shadow: 0 4px 14px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04) !important;
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          top: 76,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          background: "var(--se-bg-base)",
          overflow: "hidden",
        }}
      >
        <BackgroundOrb mode={isEmpty ? "centered" : "docked"} />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            height: "100%",
            maxWidth: 720,
            margin: "0 auto",
            padding: "0 16px",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
            {/* ── Top action row: history + new chat ───────────────────── */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 0 4px",
              }}
            >
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

            {/* ── Chat messages area (ONLY scroll region, chat state only) ── */}
            {!isEmpty && (
              <div
                ref={messagesContainerRef}
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  padding: "8px 0 16px",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        flexDirection: msg.role === "user" ? "row-reverse" : "row",
                        alignItems: "flex-end",
                        gap: 10,
                      }}
                    >
                      {msg.role === "ai" && (
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: "var(--se-primary-dim)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 13,
                            flexShrink: 0,
                            color: "var(--se-primary)",
                            fontWeight: 900,
                          }}
                        >
                          ✦
                        </div>
                      )}

                      <div
                        style={{
                          maxWidth: "75%",
                          padding: "11px 15px",
                          borderRadius:
                            msg.role === "user"
                              ? "var(--se-radius-xl) var(--se-radius-xl) var(--se-radius-sm) var(--se-radius-xl)"
                              : "18px 18px 18px 4px",
                          background:
                            msg.role === "user"
                              ? "var(--se-primary)"
                              : msg.error
                                ? "var(--se-error-dim)"
                                : "var(--se-bg-surface)",
                          border:
                            msg.role === "user"
                              ? "none"
                              : `1px solid ${msg.error ? "var(--se-error)" : "var(--se-border)"}`,
                          boxShadow:
                            msg.role === "ai" ? "var(--se-shadow-sm)" : "none",
                          color:
                            msg.role === "user"
                              ? "white"
                              : msg.error
                                ? "var(--se-error)"
                                : "var(--se-text-main)",
                          fontSize: 14,
                          lineHeight: 1.5,
                        }}
                      >
                        <FormattedMessageText text={msg.text} />
                        {msg.mealPlan ? (
                          <MealPlanCard
                            plan={msg.mealPlan}
                            onAddPlan={() => addMealPlanToTray(msg.mealPlan as MealPlan)}
                            onAddDish={(dish) => addDishToTray(dish)}
                            onViewDish={viewDish}
                          />
                        ) : (
                          msg.recommendedDishes?.map((dish) => (
                            <DishRecommendationCard
                              key={dish.dish_id}
                              dish={dish}
                              onView={() => viewDish(dish.dish_id)}
                              onAdd={() => addDishToTray(dish)}
                            />
                          ))
                        )}
                        {msg.followUpSuggestions && msg.followUpSuggestions.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                            {msg.followUpSuggestions.map((suggestion) => (
                              <button
                                key={`${msg.id}-${suggestion}`}
                                type="button"
                                disabled={loading}
                                onClick={() => sendMessage(suggestion)}
                                style={{
                                  fontSize: "var(--se-text-sm)",
                                  borderRadius: "var(--se-radius-full)",
                                  border: "1px solid var(--se-border)",
                                  background: "var(--se-bg-elevated)",
                                  color: "var(--se-text-secondary)",
                                  padding: "6px 14px",
                                  cursor: loading ? "default" : "pointer",
                                }}
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {loading && <ThinkingIndicator />}
                </div>
              </div>
            )}

            {/* ── Composer cluster (morphs from centered to docked) ─────── */}
            <div
              className="ai-composer-cluster"
              style={{
                marginTop: isEmpty ? "calc(38vh - 120px)" : 0,
                padding: isEmpty ? "0 16px" : "12px 0",
                display: "flex",
                flexDirection: "column",
                gap: 20,
                background: isEmpty ? "transparent" : "var(--se-bg-base)",
                transition: "margin-top 550ms cubic-bezier(0.32, 0.72, 0, 1)",
              }}
            >
              {isEmpty && <EmptyHero onPick={sendMessage} />}
              <div style={{ position: "relative" }}>
                <ComposerBar
                  value={input}
                  onChange={setInput}
                  onSubmit={() => sendMessage(input)}
                  onStop={stopGeneration}
                  onSlashTrigger={() => setSlashMenuOpen(true)}
                  loading={loading}
                  autoFocus={isEmpty}
                  compact={isEmpty}
                />
                <SlashMenu
                  open={slashMenuOpen}
                  query={slashQuery}
                  commands={slashCommands}
                  onClose={() => setSlashMenuOpen(false)}
                />
              </div>

              {/* AI Context strip */}
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "var(--se-text-muted)",
                  fontWeight: 600,
                }}
              >
                <span>
                  Logged today:{" "}
                  <strong style={{ color: "var(--se-text-secondary)" }}>
                    {dailyIntake ? `${dailyIntake.consumed.calories} kcal` : "sign in"}
                  </strong>
                </span>
                <span style={{ color: "var(--se-text-faint)" }}>·</span>
                <span>
                  Tray:{" "}
                  <strong style={{ color: "var(--se-text-secondary)" }}>
                    {trayCount === 0 ? "empty" : `${trayCount} item${trayCount === 1 ? "" : "s"}`}
                  </strong>
                </span>
                {remainingSummary && (
                  <>
                    <span style={{ color: "var(--se-text-faint)" }}>·</span>
                    <span style={{ color: "var(--se-primary)", fontWeight: 700 }}>
                      Remaining: {remainingSummary.calories} kcal
                    </span>
                  </>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
      <EstimatorModal open={estimatorOpen} onClose={() => setEstimatorOpen(false)} />
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
    </>
  );
}

const topBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 9999,
  border: "1px solid var(--se-border)",
  background: "var(--se-bg-surface)",
  color: "var(--se-text-secondary)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
