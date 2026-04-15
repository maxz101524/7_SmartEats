import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config";
import { getMealTrayDishIds, useMealTray } from "../mealTray";
import { Button } from "./Button";
import { Card } from "./Card";
import { useToast } from "./useToast";

interface DailyIntake {
  consumed: { calories: number; protein: number; carbs: number; fat: number };
  goals: { calories: number; protein: number; carbs: number; fat: number } | null;
  goals_set: boolean;
}

function MacroChip({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        padding: "10px 12px",
        borderRadius: "var(--se-radius-md)",
        background: "var(--se-bg-subtle)",
        border: "1px solid var(--se-border)",
      }}
    >
      <p
        style={{
          margin: "0 0 2px",
          fontSize: "var(--se-text-xs)",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--se-text-faint)",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: "var(--se-text-sm)",
          fontWeight: "var(--se-weight-bold)",
          color,
        }}
      >
        {value}
      </p>
    </div>
  );
}

export function MealTrayStatusPill() {
  const { count, totals } = useMealTray();

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: "var(--se-radius-full)",
        background: "var(--se-bg-surface)",
        border: "1px solid var(--se-border)",
        boxShadow: "var(--se-shadow-sm)",
        fontSize: "var(--se-text-xs)",
        color: "var(--se-text-secondary)",
        fontWeight: 600,
      }}
    >
      <span>Meal tray</span>
      <span style={{ color: "var(--se-text-faint)" }}>·</span>
      <span>{count === 0 ? "empty" : `${count} item${count === 1 ? "" : "s"}`}</span>
      {count > 0 && (
        <>
          <span style={{ color: "var(--se-text-faint)" }}>·</span>
          <span>{totals.calories} kcal</span>
        </>
      )}
    </div>
  );
}

export function MealTrayCard({
  compact = false,
  onMealLogged,
}: {
  compact?: boolean;
  onMealLogged?: (intake: DailyIntake | null) => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const {
    items,
    totals,
    count,
    uniqueCount,
    incrementItem,
    decrementItem,
    removeItem,
    clear,
  } = useMealTray();
  const token = localStorage.getItem("authToken");

  const [intake, setIntake] = useState<DailyIntake | null>(null);
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [loggingMeal, setLoggingMeal] = useState(false);

  useEffect(() => {
    if (!token) {
      setIntake(null);
      setIntakeLoading(false);
      return;
    }

    let cancelled = false;
    setIntakeLoading(true);

    axios
      .get<DailyIntake>(`${API_BASE}/daily-intake/`, {
        headers: { Authorization: `Token ${token}` },
      })
      .then((res) => {
        if (!cancelled) setIntake(res.data);
      })
      .catch(() => {
        if (!cancelled) setIntake(null);
      })
      .finally(() => {
        if (!cancelled) setIntakeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const projected = useMemo(() => {
    if (!intake) return null;

    return {
      calories: intake.consumed.calories + totals.calories,
      protein: intake.consumed.protein + totals.protein,
      carbs: intake.consumed.carbs + totals.carbohydrates,
      fat: intake.consumed.fat + totals.fat,
    };
  }, [intake, totals]);

  const projectedGoalSuffix =
    intake?.goals_set && intake.goals
      ? ` / ${intake.goals.calories} goal`
      : "";

  const visibleItems = compact ? items.slice(0, 2) : items;
  const servingsLabel = `${count} serving${count === 1 ? "" : "s"}`;
  const dishesLabel = `${uniqueCount} dish${uniqueCount === 1 ? "" : "es"}`;

  const handlePrimaryAction = async () => {
    if (count === 0 || loggingMeal) return;

    if (!token) {
      toast.info("Your tray is saved. Sign in to log it as a meal.");
      navigate("/login");
      return;
    }

    setLoggingMeal(true);
    try {
      await axios.post(
        `${API_BASE}/meals/`,
        { dish_ids: getMealTrayDishIds(items) },
        { headers: { Authorization: `Token ${token}` } },
      );

      clear();
      toast.success("Meal logged from your tray.");

      const res = await axios.get<DailyIntake>(`${API_BASE}/daily-intake/`, {
        headers: { Authorization: `Token ${token}` },
      });
      setIntake(res.data);
      onMealLogged?.(res.data);
    } catch {
      toast.error("Could not log the meal tray. Please try again.");
    } finally {
      setLoggingMeal(false);
    }
  };

  return (
    <Card padding={compact ? "sm" : "md"}>
      <div style={{ display: "flex", flexDirection: "column", gap: compact ? 12 : 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <p
              style={{
                margin: "0 0 4px",
                fontSize: "var(--se-text-xs)",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--se-text-faint)",
              }}
            >
              Current meal tray
            </p>
            <h2
              style={{
                margin: 0,
                fontSize: compact ? "var(--se-text-base)" : "var(--se-text-h3)",
                fontWeight: "var(--se-weight-bold)",
                color: "var(--se-text-main)",
              }}
            >
              {count === 0
                ? "Start building your meal"
                : `${servingsLabel} ready to log`}
            </h2>
            {count > 0 && (
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: "var(--se-text-xs)",
                  color: "var(--se-text-muted)",
                }}
              >
                {dishesLabel} in your tray
              </p>
            )}
          </div>

          {count > 0 && (
            <button
              type="button"
              onClick={clear}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--se-text-faint)",
                fontSize: "var(--se-text-xs)",
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Clear tray
            </button>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: compact ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
            gap: 8,
          }}
        >
          <MacroChip label="Calories" value={`${totals.calories} kcal`} color="var(--se-macro-cal)" />
          <MacroChip label="Protein" value={`${totals.protein}g`} color="var(--se-macro-protein)" />
          <MacroChip label="Carbs" value={`${totals.carbohydrates}g`} color="var(--se-macro-carbs)" />
          <MacroChip label="Fat" value={`${totals.fat}g`} color="var(--se-macro-fat)" />
        </div>

        {count === 0 ? (
          <p
            style={{
              margin: 0,
              fontSize: "var(--se-text-sm)",
              color: "var(--se-text-muted)",
              lineHeight: 1.5,
            }}
          >
            Add dishes from the menu or AI recommendations, then log them together as one meal.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {visibleItems.map((item) => (
                <div
                  key={item.dish_id}
                  style={{
                    display: "flex",
                    flexDirection: compact ? "column" : "row",
                    alignItems: compact ? "stretch" : "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: "var(--se-radius-md)",
                    background: "var(--se-bg-subtle)",
                    border: "1px solid var(--se-border)",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 2,
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: "var(--se-text-sm)",
                          fontWeight: "var(--se-weight-semibold)",
                          color: "var(--se-text-main)",
                        }}
                      >
                        {item.dish_name}
                      </p>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "var(--se-radius-full)",
                          background: "rgba(var(--se-primary-rgb), 0.12)",
                          color: "var(--se-primary)",
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                        }}
                      >
                        x{item.quantity}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: "0 0 8px",
                        fontSize: "var(--se-text-xs)",
                        color: "var(--se-text-muted)",
                      }}
                    >
                      {item.hall}
                      {item.serving_size ? ` · ${item.serving_size}` : ""}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "var(--se-text-xs)",
                        fontWeight: 700,
                        color: "var(--se-text-secondary)",
                      }}
                    >
                      {item.calories * item.quantity} kcal
                      {" · "}
                      {item.protein * item.quantity}P / {item.carbohydrates * item.quantity}C / {item.fat * item.quantity}F
                    </p>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: compact ? "space-between" : "flex-end",
                      gap: 8,
                      flexShrink: 0,
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px",
                        borderRadius: "var(--se-radius-full)",
                        background: "var(--se-bg-surface)",
                        border: "1px solid var(--se-border)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => decrementItem(item.dish_id)}
                        aria-label={`Decrease ${item.dish_name} quantity`}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          border: "none",
                          background: "var(--se-bg-subtle)",
                          color: "var(--se-text-main)",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        -
                      </button>
                      <span
                        style={{
                          minWidth: 18,
                          textAlign: "center",
                          fontSize: "var(--se-text-xs)",
                          fontWeight: 800,
                          color: "var(--se-text-main)",
                        }}
                      >
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => incrementItem(item.dish_id)}
                        aria-label={`Increase ${item.dish_name} quantity`}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          border: "none",
                          background: "var(--se-primary)",
                          color: "var(--se-text-inverted)",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.dish_id)}
                      aria-label={`Remove ${item.dish_name} from tray`}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "var(--se-error)",
                        fontSize: "var(--se-text-xs)",
                        fontWeight: 700,
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              {compact && uniqueCount > visibleItems.length && (
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--se-text-xs)",
                    color: "var(--se-text-muted)",
                  }}
                >
                  +{uniqueCount - visibleItems.length} more dish
                  {uniqueCount - visibleItems.length === 1 ? "" : "es"} in your tray
                </p>
              )}
            </div>

            {!compact && (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "var(--se-radius-md)",
                  background: "var(--se-primary-dim)",
                  border: "1px solid rgba(232, 74, 39, 0.14)",
                }}
              >
                {token ? (
                  intakeLoading ? (
                    <p style={{ margin: 0, fontSize: "var(--se-text-sm)", color: "var(--se-text-muted)" }}>
                      Refreshing today&apos;s macro totals…
                    </p>
                  ) : projected ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "var(--se-text-sm)",
                          fontWeight: "var(--se-weight-semibold)",
                          color: "var(--se-primary)",
                        }}
                      >
                        Projected daily totals after logging this tray
                      </p>
                      <p style={{ margin: 0, fontSize: "var(--se-text-xs)", color: "var(--se-text-secondary)" }}>
                        {projected.calories} kcal
                        {projectedGoalSuffix}
                        {" · "}
                        {projected.protein}P / {projected.carbs}C / {projected.fat}F
                      </p>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: "var(--se-text-sm)", color: "var(--se-text-muted)" }}>
                      Your tray totals are ready to log.
                    </p>
                  )
                ) : (
                  <p style={{ margin: 0, fontSize: "var(--se-text-sm)", color: "var(--se-text-secondary)" }}>
                    Your tray is saved locally. Sign in when you&apos;re ready to log it.
                  </p>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                variant="primary"
                size="sm"
                loading={loggingMeal}
                onClick={handlePrimaryAction}
              >
                {token ? "Log tray as meal" : "Sign in to log meal"}
              </Button>
              {!compact && (
                <Button variant="secondary" size="sm" onClick={() => navigate("/menu")}>
                  Browse more dishes
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
