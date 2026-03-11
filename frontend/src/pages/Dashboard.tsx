import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { MacroProgressBar } from "../components/MacroProgressBar";
import { FoodIcon } from "../components/FoodIcon";
import Skeleton from "../components/Skeleton";
import { IconMapPin, IconSparkle, IconPlus, IconGrid } from "../components/Icons";

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface DiningHall {
  Dining_Hall_ID: number;
  name: string;
  location: string;
  dishes: unknown[];
}

interface DailyIntake {
  consumed: { calories: number; protein: number; carbs: number; fat: number };
  goals: { calories: number; protein: number; carbs: number; fat: number } | null;
  goals_set: boolean;
}

interface Recommendation {
  dish_id: number;
  dish_name: string;
  hall_name: string;
  reason: string;
  calories: number;
  meal_period: string;
}

interface RecommendationResponse {
  recommendations: Recommendation[];
  tip: string;
}

/* ── Hall hours (static) ────────────────────────────────────────────────────── */

const HALL_HOURS: Record<string, { open: number; close: number }> = {
  "Ikenberry Dining Center": { open: 7, close: 21 },
  "Pennsylvania Avenue Dining Hall": { open: 7, close: 21 },
  "ISR Dining Center": { open: 7, close: 20 },
};

function isHallOpen(hallName: string): boolean {
  const hours = HALL_HOURS[hallName];
  if (!hours) return false;
  const hour = new Date().getHours();
  return hour >= hours.open && hour < hours.close;
}

/* ── Time-of-day greeting ───────────────────────────────────────────────────── */

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour <= 11) return "Good morning";
  if (hour >= 12 && hour <= 16) return "Good afternoon";
  if (hour >= 17 && hour <= 20) return "Good evening";
  return "Good night";
}

/* ── Shared section-label style ─────────────────────────────────────────────── */

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "var(--se-text-xs)",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--se-text-faint)",
  marginBottom: 12,
  margin: 0,
  paddingBottom: 12,
};

/* ── Formatted date ─────────────────────────────────────────────────────────── */

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/* ── Component ──────────────────────────────────────────────────────────────── */

export default function Dashboard() {
  const navigate = useNavigate();

  /* Auth guard */
  useEffect(() => {
    if (!localStorage.getItem("authToken")) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  /* State */
  const [halls, setHalls] = useState<DiningHall[]>([]);
  const [hallsLoading, setHallsLoading] = useState(true);

  const [intake, setIntake] = useState<DailyIntake | null>(null);
  const [intakeLoading, setIntakeLoading] = useState(true);

  const [recData, setRecData] = useState<RecommendationResponse | null>(null);
  const [recLoading, setRecLoading] = useState(true);
  const [recError, setRecError] = useState(false);

  const firstName = localStorage.getItem("userFirstName") ?? "";

  /* Fetch dining halls */
  useEffect(() => {
    axios
      .get<DiningHall[]>(`${API_BASE}/halls/`)
      .then((res) => setHalls(res.data))
      .catch(() => {
        /* halls are non-critical — silently degrade */
      })
      .finally(() => setHallsLoading(false));
  }, []);

  /* Fetch daily intake (auth required) */
  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) return;
    axios
      .get<DailyIntake>(`${API_BASE}/daily-intake/`, {
        headers: { Authorization: `Token ${token}` },
      })
      .then((res) => setIntake(res.data))
      .catch(() => {
        /* intake fetch failed — degrade gracefully */
      })
      .finally(() => setIntakeLoading(false));
  }, []);

  /* Fetch AI recommendations */
  useEffect(() => {
    const token = localStorage.getItem("authToken");
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Token ${token}`;
    axios
      .post<RecommendationResponse>(`${API_BASE}/ai-recommend/`, {}, { headers })
      .then((res) => setRecData(res.data))
      .catch(() => setRecError(true))
      .finally(() => setRecLoading(false));
  }, []);

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div style={{ padding: "0 24px" }}>
      {/* Grid: main (2/3) + sidebar (1/3) */}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24 }}
        className="lg:grid-cols-[2fr_1fr]"
      >
        {/* ═══════════════════════ MAIN COLUMN ═══════════════════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* ── 1. Welcome Header ── */}
          <section>
            <h1
              style={{
                fontSize: "var(--se-text-h1)",
                fontWeight: "var(--se-weight-extrabold)",
                color: "var(--se-text-main)",
                margin: 0,
                lineHeight: "var(--se-leading-tight)",
              }}
            >
              {getGreeting()}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p
              style={{
                fontSize: "var(--se-text-base)",
                color: "var(--se-text-secondary)",
                margin: "6px 0 0",
              }}
            >
              Here's your nutrition snapshot for today.
            </p>
            <p
              style={{
                fontSize: "var(--se-text-sm)",
                color: "var(--se-text-muted)",
                margin: "4px 0 0",
              }}
            >
              {formatDate()}
            </p>
          </section>

          {/* ── 2. Dining Hall Status ── */}
          <section>
            <p style={sectionLabelStyle}>Dining Halls</p>

            {hallsLoading ? (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} variant="rect" width={200} height={90} />
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {halls.map((hall) => {
                  const open = isHallOpen(hall.name);
                  return (
                    <Card
                      key={hall.Dining_Hall_ID}
                      hover
                      padding="sm"
                      onClick={() => navigate(`/menu/${hall.Dining_Hall_ID}`)}
                    >
                      <div style={{ minWidth: 160 }}>
                        <p
                          style={{
                            fontSize: "var(--se-text-sm)",
                            fontWeight: "var(--se-weight-bold)",
                            color: "var(--se-text-main)",
                            margin: 0,
                          }}
                        >
                          {hall.name}
                        </p>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            marginTop: 4,
                          }}
                        >
                          <IconMapPin size={12} color="var(--se-text-muted)" />
                          <span
                            style={{
                              fontSize: "var(--se-text-xs)",
                              color: "var(--se-text-muted)",
                            }}
                          >
                            {hall.location}
                          </span>
                        </div>
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            marginTop: 8,
                            padding: "3px 10px",
                            borderRadius: "var(--se-radius-full)",
                            background: open
                              ? "var(--se-success-dim)"
                              : "var(--se-bg-subtle)",
                            fontSize: "var(--se-text-xs)",
                            fontWeight: "var(--se-weight-semibold)",
                            color: open
                              ? "var(--se-success)"
                              : "var(--se-text-faint)",
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: open
                                ? "var(--se-success)"
                                : "var(--se-text-faint)",
                              flexShrink: 0,
                            }}
                          />
                          {open ? "Open" : "Closed"}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── 3. Recommended for You ── */}
          <section>
            <p
              style={{
                ...sectionLabelStyle,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <IconSparkle size={14} color="var(--se-text-faint)" />
              Recommended for You
            </p>

            {recLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} variant="rect" height={72} />
                ))}
              </div>
            ) : recError ? (
              <Card padding="md">
                <p
                  style={{
                    fontSize: "var(--se-text-sm)",
                    color: "var(--se-text-muted)",
                    margin: 0,
                    textAlign: "center",
                    padding: "8px 0",
                  }}
                >
                  Could not load recommendations
                </p>
              </Card>
            ) : (
              <>
                {/* Recommendation cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {recData?.recommendations.map((rec) => (
                    <Card
                      key={rec.dish_id}
                      hover
                      padding="sm"
                      onClick={() => navigate(`/dishes/${rec.dish_id}`)}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <FoodIcon dishName={rec.dish_name} size="md" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p
                            style={{
                              fontSize: "var(--se-text-sm)",
                              fontWeight: "var(--se-weight-bold)",
                              color: "var(--se-text-main)",
                              margin: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {rec.dish_name}
                          </p>
                          <p
                            style={{
                              fontSize: "var(--se-text-xs)",
                              color: "var(--se-text-muted)",
                              margin: "2px 0 0",
                            }}
                          >
                            {rec.hall_name}
                            {rec.meal_period ? ` · ${rec.meal_period}` : ""}
                          </p>
                          <p
                            style={{
                              fontSize: "var(--se-text-xs)",
                              color: "var(--se-text-secondary)",
                              fontStyle: "italic",
                              margin: "2px 0 0",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {rec.reason}
                          </p>
                        </div>
                        <div
                          style={{
                            flexShrink: 0,
                            textAlign: "right",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "var(--se-text-sm)",
                              fontWeight: "var(--se-weight-bold)",
                              color: "var(--se-text-main)",
                            }}
                          >
                            {rec.calories}
                          </span>
                          <span
                            style={{
                              fontSize: "var(--se-text-xs)",
                              color: "var(--se-text-muted)",
                              marginLeft: 2,
                            }}
                          >
                            cal
                          </span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* AI tip card */}
                {recData?.tip && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: "12px 16px",
                      borderRadius: "var(--se-radius-md)",
                      background: "var(--se-primary-dim)",
                      border: "1px solid rgba(232, 74, 39, 0.15)",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "var(--se-text-sm)",
                        color: "var(--se-primary)",
                        margin: 0,
                        fontWeight: "var(--se-weight-medium)",
                        lineHeight: "var(--se-leading-body)",
                      }}
                    >
                      <IconSparkle
                        size={13}
                        color="var(--se-primary)"
                      />{" "}
                      {recData.tip}
                    </p>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        {/* ═══════════════════════ SIDEBAR ═══════════════════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* ── 4. Daily Macros ── */}
          <section>
            <p style={sectionLabelStyle}>Today's Macros</p>

            {intakeLoading ? (
              <Card padding="md">
                <Skeleton variant="rect" height={24} width="50%" />
                <div style={{ marginTop: 16 }}>
                  <Skeleton variant="text" lines={3} />
                </div>
              </Card>
            ) : intake && !intake.goals_set ? (
              /* Goals not set — prompt */
              <Card padding="md">
                <p
                  style={{
                    fontSize: "var(--se-text-sm)",
                    color: "var(--se-text-secondary)",
                    margin: "0 0 12px",
                    textAlign: "center",
                  }}
                >
                  Set your daily goals to track macros
                </p>
                <div style={{ textAlign: "center" }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate("/profile")}
                  >
                    Set Goals
                  </Button>
                </div>
              </Card>
            ) : intake && intake.goals_set && intake.goals ? (
              /* Goals set — show macros */
              <Card padding="md">
                {/* Calorie summary */}
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div
                    style={{
                      fontSize: "var(--se-text-display)",
                      fontWeight: "var(--se-weight-extrabold)",
                      color: "var(--se-macro-cal)",
                      lineHeight: 1,
                    }}
                  >
                    {intake.consumed.calories}
                  </div>
                  <p
                    style={{
                      fontSize: "var(--se-text-sm)",
                      color: "var(--se-text-muted)",
                      margin: "4px 0 0",
                    }}
                  >
                    of {intake.goals.calories} cal goal
                  </p>
                  {/* Simple progress arc representation */}
                  <div
                    style={{
                      height: 6,
                      borderRadius: 9999,
                      background: "var(--se-bg-subtle)",
                      overflow: "hidden",
                      marginTop: 12,
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, Math.round((intake.consumed.calories / intake.goals.calories) * 100))}%`,
                        height: "100%",
                        borderRadius: 9999,
                        background: "var(--se-macro-cal)",
                        transition: "width 600ms ease-out",
                      }}
                    />
                  </div>
                </div>

                {/* Macro bars */}
                <MacroProgressBar
                  label="Protein"
                  current={intake.consumed.protein}
                  max={intake.goals.protein}
                  color="var(--se-macro-protein)"
                  animate
                />
                <MacroProgressBar
                  label="Carbs"
                  current={intake.consumed.carbs}
                  max={intake.goals.carbs}
                  color="var(--se-macro-carbs)"
                  animate
                />
                <MacroProgressBar
                  label="Fat"
                  current={intake.consumed.fat}
                  max={intake.goals.fat}
                  color="var(--se-macro-fat)"
                  animate
                />
              </Card>
            ) : (
              /* No intake data at all — subtle fallback */
              <Card padding="md">
                <p
                  style={{
                    fontSize: "var(--se-text-sm)",
                    color: "var(--se-text-muted)",
                    margin: 0,
                    textAlign: "center",
                    padding: "12px 0",
                  }}
                >
                  No nutrition data available yet. Log a meal to get started.
                </p>
              </Card>
            )}
          </section>

          {/* ── 5. Quick Actions ── */}
          <section>
            <p style={sectionLabelStyle}>Quick Actions</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Card hover padding="sm" onClick={() => navigate("/menu")}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "var(--se-radius-md)",
                      background: "var(--se-primary-dim)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <IconPlus size={18} color="var(--se-primary)" />
                  </div>
                  <span
                    style={{
                      fontSize: "var(--se-text-sm)",
                      fontWeight: "var(--se-weight-semibold)",
                      color: "var(--se-text-main)",
                    }}
                  >
                    Browse Menu
                  </span>
                </div>
              </Card>

              <Card hover padding="sm" onClick={() => navigate("/aimeals")}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "var(--se-radius-md)",
                      background: "var(--se-primary-dim)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <IconSparkle size={18} color="var(--se-primary)" />
                  </div>
                  <span
                    style={{
                      fontSize: "var(--se-text-sm)",
                      fontWeight: "var(--se-weight-semibold)",
                      color: "var(--se-text-main)",
                    }}
                  >
                    AI Meal Plan
                  </span>
                </div>
              </Card>

              <Card hover padding="sm" onClick={() => navigate("/profile")}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "var(--se-radius-md)",
                      background: "var(--se-primary-dim)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <IconGrid size={18} color="var(--se-primary)" />
                  </div>
                  <span
                    style={{
                      fontSize: "var(--se-text-sm)",
                      fontWeight: "var(--se-weight-semibold)",
                      color: "var(--se-text-main)",
                    }}
                  >
                    My Profile
                  </span>
                </div>
              </Card>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
