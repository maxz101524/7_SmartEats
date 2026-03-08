import { useState, useEffect, ComponentType } from "react";
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

export default function Home() {
  const navigate = useNavigate();
  const isLoggedIn = Boolean(localStorage.getItem("authToken"));
  const [stats, setStats] = useState<DishStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

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

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px" }}>
      {/* ── Section 1: Hero ── */}
      <div
        style={{
          background:
            "linear-gradient(180deg, var(--se-bg-base) 0%, #f0ece4 50%, var(--se-bg-base) 100%)",
          margin: "0 -24px",
          padding: "0 24px",
        }}
      >
      <section
        style={{
          padding: "80px 24px 72px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            color: "var(--se-text-faint)",
            fontSize: "var(--se-text-xs)",
            fontWeight: "var(--se-weight-semibold)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 16,
          }}
        >
          UIUC · Illinois Street · PAR · Allen · FAR
        </p>

        <h1
          style={{
            fontSize: "3rem",
            fontWeight: "var(--se-weight-extrabold)",
            color: "var(--se-text-main)",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            margin: 0,
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
          }}
        >
          <span style={{ boxShadow: "0 4px 14px rgba(232, 74, 39, 0.25)", borderRadius: 12, display: "inline-block" }}>
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
              <p style={{ color: "var(--se-error)", fontWeight: 600, fontSize: "var(--se-text-base)", margin: 0 }}>
                Something went wrong
              </p>
              <p style={{ color: "var(--se-text-muted)", fontSize: "var(--se-text-sm)", marginTop: 4, margin: "4px 0 0" }}>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5" style={{ marginTop: "var(--se-space-6)" }}>
          {[1, 2, 3].map((i) => (
            <Card key={i} padding="md">
              <Skeleton variant="rect" height={24} width="40%" />
              <div style={{ marginTop: 8 }}><Skeleton variant="text" lines={1} /></div>
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
            <div style={{ borderLeft: "3px solid var(--se-primary)", borderRadius: "var(--se-radius-lg)" }}>
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
            </div>

            <div style={{ borderLeft: "3px solid var(--se-primary)", borderRadius: "var(--se-radius-lg)" }}>
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
            </div>

            <div style={{ borderLeft: "3px solid var(--se-primary)", borderRadius: "var(--se-radius-lg)" }}>
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
          </div>
        </section>
      )}

      {/* ── Section 3: Feature cards ── */}
      <section style={{ marginBottom: 64 }}>
        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-5"
          style={{ maxWidth: 720, margin: "0 auto" }}
        >
          {featureCards.map((card) => (
            <Card
              key={card.route}
              hover
              padding="md"
              onClick={() => navigate(card.route)}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "var(--se-primary-dim)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <card.icon size={24} color="var(--se-primary)" />
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
          ))}
        </div>
      </section>
    </div>
  );
}
