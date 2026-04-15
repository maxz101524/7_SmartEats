import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config";
import { getMealTrayDishIds, useMealTray } from "../mealTray";
import { Button } from "./Button";
import { Card } from "./Card";
import { FoodIcon } from "./FoodIcon";
import { useToast } from "./useToast";

interface DailyIntake {
  consumed: { calories: number; protein: number; carbs: number; fat: number };
  goals: { calories: number; protein: number; carbs: number; fat: number } | null;
  goals_set: boolean;
}

const MACRO_COLORS = {
  protein: "var(--se-macro-protein)",
  carbs: "var(--se-macro-carbs)",
  fat: "var(--se-macro-fat)",
};

function MacroPieChart({
  protein,
  carbs,
  fat,
  size = 120,
  totalCalories,
}: {
  protein: number;
  carbs: number;
  fat: number;
  size?: number;
  totalCalories: number;
}) {
  const proteinCal = protein * 4;
  const carbsCal = carbs * 4;
  const fatCal = fat * 9;
  const total = proteinCal + carbsCal + fatCal;

  const radius = size / 2;
  const inner = radius * 0.62;
  const center = radius;

  const segments = useMemo(() => {
    if (total === 0) return [];
    const data = [
      { value: proteinCal, color: MACRO_COLORS.protein, key: "p" },
      { value: carbsCal, color: MACRO_COLORS.carbs, key: "c" },
      { value: fatCal, color: MACRO_COLORS.fat, key: "f" },
    ].filter((d) => d.value > 0);

    let cumulative = 0;
    return data.map((d) => {
      const start = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
      cumulative += d.value;
      const end = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
      const largeArc = end - start > Math.PI ? 1 : 0;
      const x1 = center + radius * Math.cos(start);
      const y1 = center + radius * Math.sin(start);
      const x2 = center + radius * Math.cos(end);
      const y2 = center + radius * Math.sin(end);
      const ix1 = center + inner * Math.cos(end);
      const iy1 = center + inner * Math.sin(end);
      const ix2 = center + inner * Math.cos(start);
      const iy2 = center + inner * Math.sin(start);
      // If single segment (full circle), draw a donut shape directly
      if (data.length === 1) {
        return {
          key: d.key,
          color: d.color,
          path: `
            M ${center - radius} ${center}
            A ${radius} ${radius} 0 1 1 ${center + radius} ${center}
            A ${radius} ${radius} 0 1 1 ${center - radius} ${center}
            M ${center - inner} ${center}
            A ${inner} ${inner} 0 1 0 ${center + inner} ${center}
            A ${inner} ${inner} 0 1 0 ${center - inner} ${center}
            Z
          `,
        };
      }
      return {
        key: d.key,
        color: d.color,
        path: `
          M ${x1} ${y1}
          A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}
          L ${ix1} ${iy1}
          A ${inner} ${inner} 0 ${largeArc} 0 ${ix2} ${iy2}
          Z
        `,
      };
    });
  }, [proteinCal, carbsCal, fatCal, total, radius, inner, center]);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius - 1}
          fill="none"
          stroke="var(--se-bg-subtle)"
          strokeWidth={size - inner * 2 - 2}
        />
        {segments.length === 0 ? (
          <circle
            cx={center}
            cy={center}
            r={(radius + inner) / 2}
            fill="none"
            stroke="var(--se-bg-subtle)"
            strokeWidth={radius - inner}
          />
        ) : (
          segments.map((s) => (
            <path key={s.key} d={s.path} fill={s.color} stroke="var(--se-bg-surface)" strokeWidth={1.5} />
          ))
        )}
      </svg>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontSize: size > 100 ? "1.5rem" : "1.15rem",
            fontWeight: 900,
            color: "var(--se-text-main)",
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          {totalCalories}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--se-text-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginTop: 2,
          }}
        >
          kcal
        </span>
      </div>
    </div>
  );
}

function MacroLegendRow({
  label,
  grams,
  color,
  percent,
}: {
  label: string;
  grams: number;
  color: string;
  percent: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: "var(--se-text-xs)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1, color: "var(--se-text-secondary)", fontWeight: 600 }}>{label}</span>
      <span style={{ color: "var(--se-text-main)", fontWeight: 800 }}>{grams}g</span>
      <span style={{ color: "var(--se-text-faint)", fontWeight: 600, minWidth: 32, textAlign: "right" }}>
        {percent}%
      </span>
    </div>
  );
}

function StackedFoodIcons({
  items,
}: {
  items: { dish_id: number; dish_name: string; quantity: number }[];
}) {
  const visible = items.slice(0, 5);
  const overflow = Math.max(0, items.length - visible.length);

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {visible.map((item, idx) => (
        <div
          key={item.dish_id}
          title={`${item.dish_name} ×${item.quantity}`}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--se-bg-surface)",
            border: "2px solid var(--se-bg-elevated)",
            boxShadow: "var(--se-shadow-sm)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginLeft: idx === 0 ? 0 : -10,
            zIndex: visible.length - idx,
            position: "relative",
          }}
        >
          <FoodIcon dishName={item.dish_name} size="sm" />
          {item.quantity > 1 && (
            <span
              style={{
                position: "absolute",
                bottom: -3,
                right: -3,
                background: "var(--se-primary)",
                color: "var(--se-text-inverted)",
                fontSize: 9,
                fontWeight: 800,
                borderRadius: "9999px",
                padding: "1px 5px",
                lineHeight: 1.2,
                border: "1.5px solid var(--se-bg-surface)",
              }}
            >
              ×{item.quantity}
            </span>
          )}
        </div>
      ))}
      {overflow > 0 && (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--se-bg-elevated)",
            border: "2px solid var(--se-bg-elevated)",
            boxShadow: "var(--se-shadow-sm)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginLeft: -10,
            color: "var(--se-text-secondary)",
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          +{overflow}
        </div>
      )}
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

  const macroBreakdown = useMemo(() => {
    const pCal = totals.protein * 4;
    const cCal = totals.carbohydrates * 4;
    const fCal = totals.fat * 9;
    const sum = pCal + cCal + fCal || 1;
    return {
      protein: Math.round((pCal / sum) * 100),
      carbs: Math.round((cCal / sum) * 100),
      fat: Math.round((fCal / sum) * 100),
    };
  }, [totals]);

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
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: "0 0 4px",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--se-text-faint)",
              }}
            >
              Current meal tray
            </p>
            <h2
              style={{
                margin: 0,
                fontSize: "1.05rem",
                fontWeight: 800,
                color: "var(--se-text-main)",
                letterSpacing: "-0.02em",
              }}
            >
              {count === 0 ? "Build your meal" : `${servingsLabel}`}
            </h2>
            {count > 0 && (
              <p style={{ margin: "2px 0 0", fontSize: "var(--se-text-xs)", color: "var(--se-text-muted)" }}>
                {dishesLabel} ready to log
              </p>
            )}
          </div>

          {count > 0 && (
            <button
              type="button"
              onClick={clear}
              style={{
                border: "1px solid var(--se-border)",
                background: "var(--se-bg-surface)",
                color: "var(--se-text-muted)",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                padding: "4px 10px",
                borderRadius: "9999px",
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Pie + Macro legend */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "14px",
            borderRadius: "var(--se-radius-lg)",
            background: "var(--se-bg-elevated)",
            border: "1px solid var(--se-border)",
          }}
        >
          <MacroPieChart
            protein={totals.protein}
            carbs={totals.carbohydrates}
            fat={totals.fat}
            totalCalories={totals.calories}
            size={108}
          />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <MacroLegendRow
              label="Protein"
              grams={totals.protein}
              color={MACRO_COLORS.protein}
              percent={macroBreakdown.protein}
            />
            <MacroLegendRow
              label="Carbs"
              grams={totals.carbohydrates}
              color={MACRO_COLORS.carbs}
              percent={macroBreakdown.carbs}
            />
            <MacroLegendRow label="Fat" grams={totals.fat} color={MACRO_COLORS.fat} percent={macroBreakdown.fat} />
          </div>
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
            Add dishes from the menu or AI recommendations to build your meal, then log them together.
          </p>
        ) : (
          <>
            {/* Stacked food icons */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <StackedFoodIcons items={items} />
              <span style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-muted)", fontWeight: 600 }}>
                in your tray
              </span>
            </div>

            {/* Item list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((item) => (
                <div
                  key={item.dish_id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: "var(--se-radius-md)",
                    background: "var(--se-bg-elevated)",
                    border: "1px solid var(--se-border)",
                  }}
                >
                  <div style={{ flexShrink: 0 }}>
                    <FoodIcon dishName={item.dish_name} size="md" />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "var(--se-text-sm)",
                        fontWeight: 700,
                        color: "var(--se-text-main)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.dish_name}
                    </p>
                    <p
                      style={{
                        margin: "1px 0 0",
                        fontSize: 11,
                        color: "var(--se-text-muted)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.calories * item.quantity} kcal · {item.hall}
                    </p>
                  </div>

                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: 2,
                      borderRadius: "9999px",
                      background: "var(--se-bg-surface)",
                      border: "1px solid var(--se-border)",
                      flexShrink: 0,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        item.quantity === 1 ? removeItem(item.dish_id) : decrementItem(item.dish_id)
                      }
                      aria-label={`Decrease ${item.dish_name}`}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        border: "none",
                        background: "transparent",
                        color: "var(--se-text-secondary)",
                        fontWeight: 800,
                        cursor: "pointer",
                        fontSize: 13,
                        lineHeight: 1,
                      }}
                    >
                      −
                    </button>
                    <span
                      style={{
                        minWidth: 18,
                        textAlign: "center",
                        fontSize: 12,
                        fontWeight: 800,
                        color: "var(--se-text-main)",
                      }}
                    >
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => incrementItem(item.dish_id)}
                      aria-label={`Increase ${item.dish_name}`}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        border: "none",
                        background: "var(--se-primary)",
                        color: "var(--se-text-inverted)",
                        fontWeight: 800,
                        cursor: "pointer",
                        fontSize: 13,
                        lineHeight: 1,
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {!compact && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--se-radius-md)",
                  background: "var(--se-bg-elevated)",
                  border: "1px dashed var(--se-border)",
                }}
              >
                {token ? (
                  intakeLoading ? (
                    <p style={{ margin: 0, fontSize: 12, color: "var(--se-text-muted)" }}>
                      Refreshing today&apos;s totals…
                    </p>
                  ) : projected ? (
                    <>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--se-text-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        After logging this tray
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--se-text-secondary)" }}>
                        <strong style={{ color: "var(--se-text-main)" }}>{projected.calories} kcal</strong>
                        {projectedGoalSuffix}
                        {" · "}
                        {projected.protein}P / {projected.carbs}C / {projected.fat}F
                      </p>
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: 12, color: "var(--se-text-muted)" }}>
                      Your tray totals are ready to log.
                    </p>
                  )
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--se-text-secondary)" }}>
                    Saved locally. Sign in when you&apos;re ready to log.
                  </p>
                )}
              </div>
            )}

            <Button
              variant="primary"
              size="md"
              loading={loggingMeal}
              onClick={handlePrimaryAction}
            >
              {token ? "Log tray as meal" : "Sign in to log meal"}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
