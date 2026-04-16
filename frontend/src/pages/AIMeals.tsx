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
import { NutritionEstimator } from "./aimeals/NutritionEstimator";
import { BackgroundOrb } from "./aimeals/BackgroundOrb";
import { EmptyHero } from "./aimeals/EmptyHero";
import { getDishHall, hasDishNutrition } from "./aimeals/dishHelpers";
import type { RecommendedDish, MealPlan, Message, MessageRole } from "./aimeals/types";

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

// ─── Tab type ─────────────────────────────────────────────────────────────────

type ActiveTab = "chat" | "estimator";

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
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dailyIntake, setDailyIntake] = useState<DailyIntake | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

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

    try {
      const token = localStorage.getItem("authToken");
      const res = await axios.post(`${API_BASE}/ai-chat/`, {
        message: trimmed,
        history,
        tray_context: trayContext,
      }, token ? { headers: { Authorization: `Token ${token}` } } : undefined);

      const data = res.data;

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { id: nextId.current++, role: "ai", text: data.error, error: true },
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
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId.current++,
          role: "ai",
          text: "Something went wrong reaching the server. Make sure the backend is running.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
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
        {/* ── Tab bar ──────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            paddingBottom: 16,
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          <div style={{
            display: "inline-flex",
            background: "var(--se-bg-subtle)",
            borderRadius: "var(--se-radius-full)",
            padding: 3,
            gap: 2,
          }}>
            {[{ key: "chat", label: "AI Chat" }, { key: "estimator", label: "Nutrition Estimator" }].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as ActiveTab)}
                style={{
                  padding: "8px 20px",
                  borderRadius: "var(--se-radius-full)",
                  border: "none",
                  fontSize: "var(--se-text-sm)",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 150ms ease",
                  background: activeTab === tab.key ? "var(--se-bg-surface)" : "transparent",
                  color: activeTab === tab.key ? "var(--se-text-main)" : "var(--se-text-muted)",
                  boxShadow: activeTab === tab.key ? "var(--se-shadow-sm)" : "none",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "chat" && !isEmpty && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                nextId.current = 1;
                sessionStorage.removeItem(CHAT_STORAGE_KEY);
              }}
              style={{
                border: "1px solid var(--se-border)",
                background: "var(--se-bg-surface)",
                color: "var(--se-text-muted)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                padding: "8px 12px",
                borderRadius: "var(--se-radius-full)",
                boxShadow: "var(--se-shadow-sm)",
              }}
            >
              New chat
            </button>
          )}
        </div>

        {/* ── Estimator tab ──────────────────────────────────── */}
        {activeTab === "estimator" ? (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 0 16px" }}>
            <NutritionEstimator />
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              position: "relative",
            }}
          >
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
              <form
                onSubmit={handleSubmit}
                className="ai-chatbox-form"
                style={{
                  background: "var(--se-bg-surface)",
                  border: "1px solid var(--se-border)",
                  borderRadius: 22,
                  padding: "14px 16px 10px",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)",
                  transition: "border-color 150ms ease, box-shadow 150ms ease",
                  outline: "none",
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ask about dining halls, dishes, or nutrition…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                  className="ai-chatbox-input"
                  style={{
                    width: "100%",
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontSize: 14,
                    color: "var(--se-text-main)",
                    padding: "4px 0 10px",
                  }}
                  onFocus={(e) => {
                    const form = e.currentTarget.form;
                    if (form) form.style.borderColor = "var(--se-border-strong)";
                  }}
                  onBlur={(e) => {
                    const form = e.currentTarget.form;
                    if (form) form.style.borderColor = "var(--se-border)";
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      color: "var(--se-text-faint)",
                    }}
                  >
                    {[
                      { d: "M12 5v14M5 12h14", label: "Add" },
                      { d: "M9 11.5V14a2 2 0 0 0 4 0V8a4 4 0 0 0-8 0v8a6 6 0 0 0 12 0V9", label: "Attach" },
                      { d: "M4 4h16v6H4zM4 14h16v6H4z", label: "Saved" },
                    ].map((icon) => (
                      <button
                        key={icon.label}
                        type="button"
                        aria-label={icon.label}
                        style={{
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
                          transition: "background 0.15s, color 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--se-bg-elevated)";
                          e.currentTarget.style.color = "var(--se-text-secondary)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "var(--se-text-faint)";
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d={icon.d} />
                        </svg>
                      </button>
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={!input.trim() || loading}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 14px 7px 16px",
                      borderRadius: "9999px",
                      border: "none",
                      background:
                        input.trim() && !loading
                          ? "var(--se-text-main)"
                          : "var(--se-bg-subtle)",
                      color:
                        input.trim() && !loading
                          ? "var(--se-text-inverted)"
                          : "var(--se-text-faint)",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: input.trim() && !loading ? "pointer" : "default",
                      transition: "all 0.15s",
                    }}
                    aria-label="Send"
                  >
                    Send
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </button>
                </div>
              </form>

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
        )}
        </div>
      </div>
    </>
  );
}
