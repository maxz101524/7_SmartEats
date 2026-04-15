import { useState, useEffect } from "react";
import type { ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import Skeleton from "../components/Skeleton";
import { IconUtensils, IconSparkle, IconChartPie } from "../components/Icons";
import { API_BASE } from "../config";
import { FoodIcon } from "../components/FoodIcon";
import type { FoodCategory } from "../components/FoodIcon";
import { FLAG_COLORS, FLAG_FALLBACK } from "../utils/flagColors";

interface DishStats {
  total_dishes?: number;
  total_halls?: number;
}

function AnimatedCounter({ target, duration = 1500 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const [ref, setRef] = useState<HTMLSpanElement | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!ref) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(ref);
    return () => observer.disconnect();
  }, [ref, started]);

  useEffect(() => {
    if (!started || target <= 0) return;
    const start = performance.now();
    let raf: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, target, duration]);

  return <span ref={setRef}>{started ? count.toLocaleString() : "0"}</span>;
}

export default function Home() {
  const navigate = useNavigate();
  const isLoggedIn = Boolean(localStorage.getItem("authToken"));
  const [stats, setStats] = useState<DishStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [tickerDishes, setTickerDishes] = useState<{ dish_id: number; dish_name: string; calories: number; dietary_flags?: string[]; category?: string }[]>([]);

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
    if (!isLoggedIn) return;
    const token = localStorage.getItem("authToken");
    axios
      .get(`${API_BASE}/dish-stats/`, {
        headers: { Authorization: `Token ${token}` },
      })
      .then((res) => {
        setStats(res.data);
        setStatsError(null);
      })
      .catch(() => {
        setStatsError("Could not load stats");
      });
  }, [isLoggedIn]);

  useEffect(() => {
    axios
      .get(`${API_BASE}/dishes/`, { params: { limit: 16 } })
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : (res.data.results ?? []);
        setTickerDishes(data.slice(0, 16));
      })
      .catch(() => {
        // Ticker is decorative — silent fail is fine
      });
  }, []);

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

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px" }}>
      {/* ── Section 1: Hero ── */}
      <div
        style={{
          margin: "0 -24px",
          padding: "0 24px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Aurora gradient background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, #fde8e2 0%, #f5f3f0 25%, #e8e0f0 50%, #fef9c3 75%, #fde8e2 100%)",
            backgroundSize: "400% 400%",
            animation: "auroraShift 15s ease infinite",
            opacity: 0.7,
          }}
        />
        <div style={{ position: "relative", zIndex: 1 }}>
        <section
          className="hero-stagger"
          style={{ padding: "48px 24px 40px", textAlign: "center" }}
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
              marginBottom: 16,
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
              margin: "12px auto 24px",
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
      </div>

      {/* ── Section 2: Quick stats (logged-in only) ── */}
      {isLoggedIn && statsError && (
        <section style={{ marginBottom: 32 }}>
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
        <section style={{ marginBottom: 32 }}>
          <div className="grid grid-cols-3 gap-4">
            <Card padding="md">
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "var(--se-text-display)",
                    fontWeight: "var(--se-weight-extrabold)",
                    color: "var(--se-text-main)",
                  }}
                >
                  {stats.total_dishes ? <AnimatedCounter target={stats.total_dishes} /> : "—"}
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
                  {stats.total_halls ? <AnimatedCounter target={stats.total_halls} duration={800} /> : "—"}
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

      {/* ── Serving Right Now ticker ── */}
      {tickerDishes.length > 0 && (
        <section style={{ marginBottom: 32, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
              <span
                className="animate-ping"
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background: "var(--se-success)",
                  opacity: 0.6,
                }}
              />
              <span
                style={{
                  position: "relative",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--se-success)",
                  display: "block",
                }}
              />
            </span>
            <span
              style={{
                fontSize: "var(--se-text-xs)",
                fontWeight: "var(--se-weight-bold)",
                color: "var(--se-text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Serving right now
            </span>
          </div>
          <div
            style={{
              display: "flex",
              width: "max-content",
              animation: "tickerScroll 30s linear infinite",
              gap: 12,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.animationPlayState = "paused"; }}
            onMouseLeave={(e) => { e.currentTarget.style.animationPlayState = "running"; }}
          >
            {[...tickerDishes, ...tickerDishes].map((dish, i) => (
              <button
                key={`${dish.dish_id}-${i}`}
                type="button"
                onClick={() => navigate(`/dishes/${dish.dish_id}`)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 16px",
                  borderRadius: "var(--se-radius-full)",
                  background: "var(--se-bg-surface)",
                  border: "1px solid var(--se-border)",
                  boxShadow: "var(--se-shadow-sm)",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  transition: "box-shadow 120ms ease, border-color 120ms ease",
                  fontSize: "var(--se-text-sm)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--se-primary)";
                  e.currentTarget.style.boxShadow = "var(--se-shadow-md)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--se-border)";
                  e.currentTarget.style.boxShadow = "var(--se-shadow-sm)";
                }}
              >
                <FoodIcon dishName={dish.dish_name} category={dish.category as FoodCategory} size="sm" />
                <span style={{ fontWeight: "var(--se-weight-semibold)", color: "var(--se-text-main)" }}>
                  {dish.dish_name}
                </span>
                <span style={{ color: "var(--se-text-muted)", fontSize: 12 }}>
                  {dish.calories} kcal
                </span>
                {dish.dietary_flags?.[0] && (
                  <span
                    style={{
                      padding: "2px 6px",
                      borderRadius: "var(--se-radius-full)",
                      background: (FLAG_COLORS[dish.dietary_flags[0]] || FLAG_FALLBACK).bg,
                      color: (FLAG_COLORS[dish.dietary_flags[0]] || FLAG_FALLBACK).text,
                      fontSize: 9,
                      fontWeight: 800,
                      textTransform: "uppercase",
                    }}
                  >
                    {dish.dietary_flags[0]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Section 3: Feature cards with elevated panel ── */}
      <div
        style={{
          padding: "32px 0 36px",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "32px 24px",
            borderRadius: "var(--se-radius-xl)",
            background: "var(--se-bg-surface)",
            border: "1px solid var(--se-border-muted)",
            boxShadow: "var(--se-shadow-md)",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 24 }}>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
            {featureCards.map((card) => (
              <div
                key={card.route}
                onMouseEnter={() => setHoveredCard(card.route)}
                onMouseLeave={() => setHoveredCard(null)}
                className="h-full"
              >
                <Card
                  hover
                  padding="md"
                  onClick={() => navigate(card.route)}
                  className="h-full flex flex-col"
                >
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

    </div>
  );
}
