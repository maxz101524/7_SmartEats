import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { API_BASE } from "../config";

interface DishStats {
  total_dishes?: number;
  total_halls?: number;
}

export default function Home() {
  const navigate = useNavigate();
  const isLoggedIn = Boolean(localStorage.getItem("authToken"));
  const [stats, setStats] = useState<DishStats | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    const token = localStorage.getItem("authToken");
    axios
      .get(`${API_BASE}/dish-stats/`, {
        headers: { Authorization: `Token ${token}` },
      })
      .then((res) => {
        setStats(res.data);
      })
      .catch(() => {
        // silently skip
      });
  }, [isLoggedIn]);

  const featureCards = [
    {
      icon: "🍽",
      title: "Browse Menu",
      desc: "Search dishes across all UIUC dining halls by category, calories, and nutrition.",
      route: "/menu",
    },
    {
      icon: "✦",
      title: "AI Meal Planner",
      desc: "Generate personalized meal plans based on your dietary goals and nutrition targets.",
      route: "/aimeals",
    },
    {
      icon: "◎",
      title: "My Profile",
      desc: "Track your meals, view nutrition charts, and export your dining history.",
      route: "/profile",
    },
  ];

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px" }}>
      {/* ── Section 1: Hero ── */}
      <section
        style={{
          padding: "80px 24px 60px",
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
          <Button variant="primary" size="lg" onClick={() => navigate("/menu")}>
            Browse Menu →
          </Button>
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

      {/* ── Section 2: Quick stats (logged-in only) ── */}
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
                  width: 36,
                  height: 36,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                }}
              >
                {card.icon}
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
