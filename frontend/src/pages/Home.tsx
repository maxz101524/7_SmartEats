import { useState, useEffect } from "react";
import type { ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import Skeleton from "../components/Skeleton";
import { IconUtensils, IconSparkle, IconChartPie } from "../components/Icons";
import { API_BASE } from "../config";

interface DishStats {
  total_dishes?: number;
  total_halls?: number;
}

function MacroBar({
  label,
  current,
  max,
  color,
}: {
  label: string;
  current: number;
  max: number;
  color: string;
}) {
  const pct = Math.min(100, Math.round((current / max) * 100));
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span
          style={{
            fontSize: "var(--se-text-xs)",
            fontWeight: "var(--se-weight-semibold)",
            color: "var(--se-text-secondary)",
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-muted)" }}>
          {current}g / {max}g
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 99,
          background: "var(--se-bg-subtle)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 99,
            background: color,
          }}
        />
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const isLoggedIn = Boolean(localStorage.getItem("authToken"));
  const [stats, setStats] = useState<DishStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const fetchStats = () => {
    if (!isLoggedIn) return;
    setStatsError(null);
    const token = localStorage.getItem("authToken");
    axios
      .get(`${API_BASE}/dish-stats/`, {
        headers: { Authorization: `Token ${token}` },
      })
      .then((res) => {
        setStats(res.data);
      })
      .catch(() => {
        setStatsError("Could not load stats");
      });
  };

  useEffect(() => {
    fetchStats();
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const featureCards: {
    icon: ComponentType<{ size?: number; color?: string }>;
    title: string;
    desc: string;
    route: string;
  }[] = [
    {
      icon: IconUtensils,
      title: "Browse Menu",
      desc: "Search dishes across all UIUC dining halls by category, calories, and nutrition.",
      route: "/menu",
    },
    {
      icon: IconSparkle,
      title: "AI Meal Planner",
      desc: "Generate personalized meal plans based on your dietary goals and nutrition targets.",
      route: "/aimeals",
    },
    {
      icon: IconChartPie,
      title: "My Profile",
      desc: "Track your meals, view nutrition charts, and export your dining history.",
      route: "/profile",
    },
  ];

  const mockHalls = [
    { name: "Ikenberry", status: "Open", crowd: "Busy" },
    { name: "PAR", status: "Open", crowd: "Quiet" },
    { name: "ISR", status: "Closed", crowd: "" },
  ];

  const mockDishes = [
    { name: "Mediterranean Quinoa Bowl", hall: "Ikenberry", cal: 420, period: "Lunch", tag: "High Protein" },
    { name: "Avocado Toast Bar", hall: "PAR", cal: 310, period: "Breakfast", tag: "Vegetarian" },
  ];

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px" }}>
      {/* ── Section 1: Hero ── */}
      <div style={{ margin: "0 -24px", padding: "0 24px", background: "var(--se-bg-base)" }}>
        <section
          className="hero-stagger"
          style={{ padding: "80px 24px 72px", textAlign: "center" }}
        >
          {/* Animated badge pill */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "var(--se-primary-dim)",
              borderRadius: "var(--se-radius-full)",
              padding: "6px 14px",
              marginBottom: 20,
              animation: "fadeIn 300ms ease-out both",
              animationDelay: "0ms",
            }}
          >
            <span
              style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}
            >
              <span
                className="animate-ping"
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background: "var(--se-primary)",
                  opacity: 0.6,
                }}
              />
              <span
                style={{
                  position: "relative",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--se-primary)",
                  display: "block",
                }}
              />
            </span>
            <span
              style={{
                fontSize: "var(--se-text-xs)",
                fontWeight: "var(--se-weight-semibold)",
                color: "var(--se-primary)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Built by students, for students.
            </span>
          </div>

          <h1
            style={{
              fontSize: "3rem",
              fontWeight: "var(--se-weight-extrabold)",
              color: "var(--se-text-main)",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              margin: 0,
              animation: "fadeIn 300ms ease-out both",
              animationDelay: "80ms",
            }}
          >
            Eat Smarter at <span className="text-gradient-vivid">UIUC</span>
          </h1>

          <p
            style={{
              fontSize: "var(--se-text-base)",
              color: "var(--se-text-secondary)",
              textAlign: "center",
              maxWidth: 480,
              margin: "16px auto 32px",
              animation: "fadeIn 300ms ease-out both",
              animationDelay: "160ms",
            }}
          >
            Explore dining hall menus, log meals, and plan your nutrition with AI.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 12,
              flexWrap: "wrap",
              animation: "fadeIn 300ms ease-out both",
              animationDelay: "240ms",
            }}
          >
            <span
              style={{
                boxShadow: "0 4px 14px rgba(232, 74, 39, 0.25)",
                borderRadius: 12,
                display: "inline-block",
              }}
            >
              <Button variant="primary" size="lg" onClick={() => navigate("/menu")}>
                Browse Menu →
              </Button>
            </span>
            {isLoggedIn ? (
              <Button variant="ghost" size="lg" onClick={() => navigate("/profile")}>
                My Profile
              </Button>
            ) : (
              <Button variant="ghost" size="lg" onClick={() => navigate("/aimeals")}>
                Try AI Meals
              </Button>
            )}
          </div>
        </section>
      </div>

      {/* ── Section 2: Quick stats (logged-in only) ── */}
      {isLoggedIn && statsError && (
        <section style={{ marginBottom: 48 }}>
          <Card padding="md">
            <div style={{ textAlign: "center", padding: "var(--se-space-6)" }}>
              <p
                style={{
                  color: "var(--se-error)",
                  fontWeight: 600,
                  fontSize: "var(--se-text-base)",
                  margin: 0,
                }}
              >
                Something went wrong
              </p>
              <p
                style={{
                  color: "var(--se-text-muted)",
                  fontSize: "var(--se-text-sm)",
                  margin: "4px 0 0",
                }}
              >
                {statsError}
              </p>
              <div style={{ marginTop: "var(--se-space-4)" }}>
                <Button variant="secondary" size="sm" onClick={fetchStats}>
                  Try Again
                </Button>
              </div>
            </div>
          </Card>
        </section>
      )}
      {isLoggedIn && !statsError && !stats && (
        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-5"
          style={{ marginTop: "var(--se-space-6)" }}
        >
          {[1, 2, 3].map((i) => (
            <Card key={i} padding="md">
              <Skeleton variant="rect" height={24} width="40%" />
              <div style={{ marginTop: 8 }}>
                <Skeleton variant="text" lines={1} />
              </div>
            </Card>
          ))}
        </div>
      )}
      {isLoggedIn && stats && (
        <section style={{ marginBottom: 48 }}>
          <div
            className="grid grid-cols-3 gap-4"
            style={{ maxWidth: "32rem", margin: "0 auto" }}
          >
            <Card padding="md">
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "var(--se-text-display)",
                    fontWeight: "var(--se-weight-extrabold)",
                    color: "var(--se-text-main)",
                  }}
                >
                  {stats.total_dishes ?? "—"}
                </div>
                <div
                  style={{
                    fontSize: "var(--se-text-xs)",
                    color: "var(--se-text-muted)",
                    marginTop: 4,
                  }}
                >
                  dishes in database
                </div>
              </div>
            </Card>
            <Card padding="md">
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "var(--se-text-display)",
                    fontWeight: "var(--se-weight-extrabold)",
                    color: "var(--se-text-main)",
                  }}
                >
                  {stats.total_halls ?? "—"}
                </div>
                <div
                  style={{
                    fontSize: "var(--se-text-xs)",
                    color: "var(--se-text-muted)",
                    marginTop: 4,
                  }}
                >
                  dining halls
                </div>
              </div>
            </Card>
            <Card padding="md">
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "var(--se-text-display)",
                    fontWeight: "var(--se-weight-extrabold)",
                    color: "var(--se-text-main)",
                  }}
                >
                  ✦
                </div>
                <div
                  style={{
                    fontSize: "var(--se-text-xs)",
                    color: "var(--se-text-muted)",
                    marginTop: 4,
                  }}
                >
                  AI meal planner available
                </div>
              </div>
            </Card>
          </div>
        </section>
      )}

      {/* ── Section 3: Feature cards with tinted background ── */}
      <div
        style={{
          margin: "0 -24px",
          background: "var(--se-bg-subtle)",
          padding: "52px 24px 56px",
        }}
      >
        <div style={{ maxWidth: 672, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <h2
              style={{
                fontSize: "var(--se-text-h2)",
                fontWeight: "var(--se-weight-extrabold)",
                color: "var(--se-text-main)",
                margin: "0 0 8px",
              }}
            >
              Built for your campus lifestyle
            </h2>
            <p
              style={{
                fontSize: "var(--se-text-sm)",
                color: "var(--se-text-muted)",
                margin: 0,
              }}
            >
              Everything you need to navigate dining halls and stay on top of your goals.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {featureCards.map((card) => (
              <div
                key={card.route}
                onMouseEnter={() => setHoveredCard(card.route)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <Card hover padding="md" onClick={() => navigate(card.route)}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      background:
                        hoveredCard === card.route
                          ? "var(--se-primary)"
                          : "var(--se-primary-dim)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "background 200ms ease",
                    }}
                  >
                    <card.icon
                      size={24}
                      color={
                        hoveredCard === card.route ? "#ffffff" : "var(--se-primary)"
                      }
                    />
                  </div>
                  <h3
                    style={{
                      fontWeight: "var(--se-weight-bold)",
                      color: "var(--se-text-main)",
                      marginTop: 12,
                      marginBottom: 4,
                      fontSize: "var(--se-text-base)",
                    }}
                  >
                    {card.title}
                  </h3>
                  <p
                    style={{
                      fontSize: "var(--se-text-sm)",
                      color: "var(--se-text-muted)",
                      margin: 0,
                    }}
                  >
                    {card.desc}
                  </p>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section 4: Dashboard teaser ── */}
      <section style={{ padding: "64px 0 72px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 20,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h2
            style={{
              fontSize: "var(--se-text-h2)",
              fontWeight: "var(--se-weight-extrabold)",
              color: "var(--se-text-main)",
              margin: 0,
            }}
          >
            Your Personal Dashboard
          </h2>
          <span
            style={{
              fontSize: "var(--se-text-xs)",
              fontWeight: "var(--se-weight-semibold)",
              background: "var(--se-warning-dim)",
              color: "var(--se-warning)",
              padding: "4px 12px",
              borderRadius: "var(--se-radius-full)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            Coming Soon
          </span>
        </div>

        {/* Mock dashboard card */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: "var(--se-radius-xl)",
            border: "1px solid var(--se-border)",
            boxShadow: "var(--se-shadow-lg)",
            background: "var(--se-bg-surface)",
          }}
        >
          {/* Greeting bar */}
          <div
            style={{
              padding: "18px 24px",
              borderBottom: "1px solid var(--se-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <p
                style={{
                  fontSize: "var(--se-text-h3)",
                  fontWeight: "var(--se-weight-bold)",
                  color: "var(--se-text-main)",
                  margin: 0,
                }}
              >
                Good afternoon, Alex
              </p>
              <p
                style={{
                  fontSize: "var(--se-text-sm)",
                  color: "var(--se-text-muted)",
                  margin: "2px 0 0",
                }}
              >
                Ready to fuel your study session?
              </p>
            </div>
            <span
              style={{
                fontSize: "var(--se-text-xs)",
                fontWeight: "var(--se-weight-semibold)",
                background: "var(--se-primary)",
                color: "var(--se-text-inverted)",
                padding: "8px 16px",
                borderRadius: "var(--se-radius-md)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              Browse Menus →
            </span>
          </div>

          {/* Dashboard body: two-column */}
          <div style={{ display: "flex" }}>
            {/* Left: Dining status + Recommended */}
            <div
              style={{
                flex: "1 1 0",
                padding: "20px 24px",
                borderRight: "1px solid var(--se-border)",
                minWidth: 0,
              }}
            >
              <p
                style={{
                  fontSize: "var(--se-text-xs)",
                  fontWeight: "var(--se-weight-semibold)",
                  color: "var(--se-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: "0 0 10px",
                }}
              >
                Dining Hall Status
              </p>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
                {mockHalls.map((hall) => (
                  <div
                    key={hall.name}
                    style={{
                      padding: "7px 11px",
                      borderRadius: "var(--se-radius-md)",
                      border: "1px solid var(--se-border)",
                      background: "var(--se-bg-elevated)",
                      fontSize: "var(--se-text-xs)",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background:
                          hall.status === "Open"
                            ? "var(--se-success)"
                            : "var(--se-text-faint)",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontWeight: "var(--se-weight-semibold)",
                        color: "var(--se-text-main)",
                      }}
                    >
                      {hall.name}
                    </span>
                    {hall.crowd && (
                      <>
                        <span style={{ color: "var(--se-border-strong)" }}>·</span>
                        <span style={{ color: "var(--se-text-muted)" }}>{hall.crowd}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <p
                style={{
                  fontSize: "var(--se-text-xs)",
                  fontWeight: "var(--se-weight-semibold)",
                  color: "var(--se-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: "0 0 10px",
                }}
              >
                ✦ Recommended for You
              </p>

              {mockDishes.map((dish) => (
                <div
                  key={dish.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderRadius: "var(--se-radius-md)",
                    background: "var(--se-bg-elevated)",
                    border: "1px solid var(--se-border)",
                    marginBottom: 8,
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: "var(--se-text-sm)",
                        fontWeight: "var(--se-weight-semibold)",
                        color: "var(--se-text-main)",
                        margin: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {dish.name}
                    </p>
                    <p
                      style={{
                        fontSize: "var(--se-text-xs)",
                        color: "var(--se-text-muted)",
                        margin: "2px 0 0",
                      }}
                    >
                      {dish.hall} · {dish.tag}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p
                      style={{
                        fontSize: "var(--se-text-xs)",
                        fontWeight: "var(--se-weight-semibold)",
                        color: "var(--se-text-accent)",
                        margin: 0,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {dish.period}
                    </p>
                    <p
                      style={{
                        fontSize: "var(--se-text-sm)",
                        fontWeight: "var(--se-weight-bold)",
                        color: "var(--se-text-main)",
                        margin: 0,
                      }}
                    >
                      {dish.cal} cal
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Right: Daily Macros */}
            <div style={{ width: 220, flexShrink: 0, padding: "20px 20px" }}>
              <p
                style={{
                  fontSize: "var(--se-text-xs)",
                  fontWeight: "var(--se-weight-semibold)",
                  color: "var(--se-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: "0 0 16px",
                }}
              >
                Daily Macros
              </p>

              <MacroBar label="Protein" current={92} max={120} color="var(--se-macro-protein)" />
              <MacroBar label="Carbs" current={145} max={200} color="var(--se-macro-carbs)" />
              <MacroBar label="Fats" current={42} max={65} color="var(--se-macro-fat)" />

              <div
                style={{
                  marginTop: 14,
                  padding: "10px 12px",
                  borderRadius: "var(--se-radius-md)",
                  background: "var(--se-primary-dim)",
                  border: "1px solid rgba(232,74,39,0.15)",
                }}
              >
                <p
                  style={{
                    fontSize: "var(--se-text-xs)",
                    color: "var(--se-primary)",
                    margin: 0,
                    fontWeight: "var(--se-weight-medium)",
                    lineHeight: 1.5,
                  }}
                >
                  ✦ <strong>Pro tip:</strong> You're close to your protein goal! Try the grilled salmon at ISR tonight.
                </p>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <div
                  style={{
                    flex: 1,
                    padding: "10px 8px",
                    borderRadius: "var(--se-radius-md)",
                    border: "1px solid var(--se-border)",
                    textAlign: "center",
                    background: "var(--se-bg-elevated)",
                  }}
                >
                  <p
                    style={{
                      fontSize: "var(--se-text-xs)",
                      fontWeight: "var(--se-weight-semibold)",
                      color: "var(--se-text-secondary)",
                      margin: 0,
                    }}
                  >
                    Log Meal
                  </p>
                </div>
                <div
                  style={{
                    flex: 1,
                    padding: "10px 8px",
                    borderRadius: "var(--se-radius-md)",
                    border: "1px solid var(--se-border)",
                    textAlign: "center",
                    background: "var(--se-bg-elevated)",
                  }}
                >
                  <p
                    style={{
                      fontSize: "var(--se-text-xs)",
                      fontWeight: "var(--se-weight-semibold)",
                      color: "var(--se-text-secondary)",
                      margin: 0,
                    }}
                  >
                    My Profile
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Gradient fade-out overlay — teases what's coming */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 100,
              background:
                "linear-gradient(to bottom, transparent, var(--se-bg-base))",
              pointerEvents: "none",
            }}
          />
        </div>

        <p
          style={{
            textAlign: "center",
            fontSize: "var(--se-text-sm)",
            color: "var(--se-text-faint)",
            marginTop: 16,
          }}
        >
          Sign in to unlock your personalized nutrition dashboard.
        </p>
      </section>
    </div>
  );
}
