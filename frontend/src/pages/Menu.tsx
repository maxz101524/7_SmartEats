import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config";
import { FoodListItem } from "../components/FoodListItem";
import { FilterChip } from "../components/FilterChip";
import { Card } from "../components/Card";
import AddDish from "../components/AddDish";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Dish {
  dish_id: number;
  dish_name: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  category?: string;
}

interface DiningHall {
  Dining_Hall_ID: number;
  name: string;
  location: string;
  dishes: Dish[];
}

interface DishStats {
  total_dishes: number;
  total_halls: number;
  dishes_by_category: { category: string; count: number }[];
  dishes_by_hall: { dining_hall__name: string; count: number }[];
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 24px",
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 32, marginBottom: 12, lineHeight: 1 }}>🍽</p>
      <p
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--se-text-main)",
          marginBottom: 4,
        }}
      >
        {message}
      </p>
      {sub && (
        <p style={{ fontSize: 13, color: "var(--se-text-faint)", maxWidth: 280 }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Menu() {
  const { hallId } = useParams<{ hallId: string }>();
  const navigate = useNavigate();

  const [halls, setHalls] = useState<DiningHall[]>([]);
  const [selectedHall, setSelectedHall] = useState<DiningHall | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [stats, setStats] = useState<DishStats | null>(null);

  // ── Fetch halls ───────────────────────────────────────────────────────────
  useEffect(() => {
    axios
      .get(`${API_BASE}/halls/`)
      .then((res) => {
        const data: DiningHall[] = Array.isArray(res.data)
          ? res.data
          : (res.data.results ?? []);
        setHalls(data);
        if (hallId) {
          const found = data.find((h) => String(h.Dining_Hall_ID) === hallId);
          if (found) setSelectedHall(found);
        }
      })
      .catch((err) => console.error("Failed to load halls:", err))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch dish stats ──────────────────────────────────────────────────────
  useEffect(() => {
    axios
      .get(`${API_BASE}/dish-stats/`)
      .then((res) => setStats(res.data))
      .catch((err) => console.error("Failed to load stats:", err));
  }, []);

  // ── URL param → selected hall (back/forward) ──────────────────────────────
  useEffect(() => {
    if (!hallId) { setSelectedHall(null); return; }
    if (halls.length === 0) return;
    const found = halls.find((h) => String(h.Dining_Hall_ID) === hallId);
    if (found) setSelectedHall(found);
  }, [hallId, halls]);

  // ── Select a hall ─────────────────────────────────────────────────────────
  const selectHall = (hall: DiningHall) => {
    setSelectedHall(hall);
    setSearch("");
    setActiveCategory("All");
    navigate(`/menu/${hall.Dining_Hall_ID}`);
  };

  // ── Derived: unique categories for filter chips ───────────────────────────
  const categories: string[] = selectedHall
    ? [
        "All",
        ...Array.from(
          new Set(
            selectedHall.dishes
              .map((d) => d.category)
              .filter((c): c is string => Boolean(c))
          )
        ).sort(),
      ]
    : ["All"];

  // ── Derived: filtered dishes ──────────────────────────────────────────────
  const filteredDishes: Dish[] = selectedHall
    ? selectedHall.dishes.filter((d) => {
        const matchSearch = d.dish_name
          .toLowerCase()
          .includes(search.toLowerCase());
        const matchCat =
          activeCategory === "All" || d.category === activeCategory;
        return matchSearch && matchCat;
      })
    : [];

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        minHeight: "calc(100vh - 76px)",
        marginLeft: -16,
        marginRight: -16,
      }}
      className="sm:-mx-6 lg:-mx-8"
    >
      {/* ── Mobile: fixed chip bar (md:hidden) ──────────────────── */}
      <div
        className="flex md:hidden"
        style={{
          position: "fixed",
          top: 76,
          left: 0,
          right: 0,
          zIndex: 40,
          background: "var(--se-bg-surface)",
          borderBottom: "1px solid var(--se-border)",
          padding: "8px 16px",
          gap: 8,
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {halls.map((hall) => (
          <FilterChip
            key={hall.Dining_Hall_ID}
            label={hall.name}
            active={selectedHall?.Dining_Hall_ID === hall.Dining_Hall_ID}
            onClick={() => selectHall(hall)}
          />
        ))}
      </div>

      {/* ── Desktop: left sidebar rail (hidden on mobile) ───────── */}
      <div
        className="hidden md:flex flex-col flex-shrink-0"
        style={{
          width: 260,
          borderRight: "1px solid var(--se-border)",
          background: "var(--se-bg-surface)",
          position: "sticky",
          top: 76,
          height: "calc(100vh - 76px)",
          overflowY: "auto",
        }}
      >
        {/* Rail header */}
        <div
          style={{
            padding: "20px 16px 12px",
            borderBottom: "1px solid var(--se-border)",
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--se-text-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              margin: 0,
            }}
          >
            Dining Halls
          </p>
        </div>

        {/* Hall rows */}
        {loading ? (
          <p style={{ padding: "20px 16px", color: "var(--se-text-faint)", fontSize: 13 }}>
            Loading…
          </p>
        ) : (
          halls.map((hall) => {
            const active = selectedHall?.Dining_Hall_ID === hall.Dining_Hall_ID;
            return (
              <button
                key={hall.Dining_Hall_ID}
                onClick={() => selectHall(hall)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 16px 12px 13px",
                  borderTop: "none",
                  borderRight: "none",
                  borderBottom: "none",
                  borderLeft: active
                    ? "3px solid var(--se-primary)"
                    : "3px solid transparent",
                  background: active ? "var(--se-primary-dim)" : "transparent",
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!active)
                    e.currentTarget.style.background = "var(--se-bg-subtle)";
                }}
                onMouseLeave={(e) => {
                  if (!active)
                    e.currentTarget.style.background = "transparent";
                }}
              >
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    color: active ? "var(--se-primary)" : "var(--se-text-main)",
                    margin: "0 0 2px",
                  }}
                >
                  {hall.name}
                </p>
                <p style={{ fontSize: 11, color: "var(--se-text-faint)", margin: 0 }}>
                  {hall.location}
                </p>
              </button>
            );
          })
        )}
      </div>

      {/* ── Right panel ─────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Spacer for mobile fixed chip bar */}
        <div className="md:hidden" style={{ height: 52 }} />

        {!selectedHall ? (
          <div style={{ padding: 24 }}>
            {stats && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
                <div style={{ background: "var(--se-bg-surface)", borderRadius: "var(--se-radius-lg)", border: "1px solid var(--se-border)", padding: "16px 20px" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--se-text-faint)", marginBottom: 8 }}>Totals</p>
                  <p style={{ fontSize: 28, fontWeight: 800, color: "var(--se-text-main)", margin: 0 }}>{stats.total_dishes} <span style={{ fontSize: 14, fontWeight: 400, color: "var(--se-text-muted)" }}>dishes</span></p>
                  <p style={{ fontSize: 16, fontWeight: 600, color: "var(--se-text-secondary)", margin: "4px 0 0" }}>{stats.total_halls} <span style={{ fontSize: 12, fontWeight: 400, color: "var(--se-text-faint)" }}>dining halls</span></p>
                </div>
                <div style={{ background: "var(--se-bg-surface)", borderRadius: "var(--se-radius-lg)", border: "1px solid var(--se-border)", padding: "16px 20px" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--se-text-faint)", marginBottom: 8 }}>By Category</p>
                  {stats.dishes_by_category.map((cat) => (
                    <div key={cat.category} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: "var(--se-text-main)" }}>{cat.category || "Uncategorized"}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--se-text-main)" }}>{cat.count}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: "var(--se-bg-surface)", borderRadius: "var(--se-radius-lg)", border: "1px solid var(--se-border)", padding: "16px 20px" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--se-text-faint)", marginBottom: 8 }}>By Dining Hall</p>
                  {stats.dishes_by_hall.map((hall) => (
                    <div key={hall.dining_hall__name} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: "var(--se-text-main)" }}>{hall.dining_hall__name}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--se-text-main)" }}>{hall.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <EmptyState
              message="Select a dining hall"
              sub="Choose a hall from the left to browse its menu items."
            />
          </div>
        ) : (
          <div style={{ padding: 24 }}>
            {/* Hall header */}
            <div style={{ marginBottom: 20 }}>
              <h1
                style={{
                  fontSize: "var(--se-text-h1)",
                  fontWeight: "var(--se-weight-extrabold)",
                  color: "var(--se-text-main)",
                  margin: "0 0 4px",
                  lineHeight: 1.2,
                }}
              >
                {selectedHall.name}
              </h1>
              <p style={{ fontSize: 13, color: "var(--se-text-muted)", margin: 0 }}>
                {selectedHall.location}
                {" · "}
                <span style={{ color: "var(--se-text-secondary)", fontWeight: 600 }}>
                  {selectedHall.dishes.length} dishes
                </span>
              </p>
            </div>

            {/* Search input */}
            <input
              type="text"
              placeholder="Search dishes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                height: 40,
                padding: "0 14px",
                borderRadius: "var(--se-radius-md)",
                border: "1.5px solid var(--se-border)",
                background: "var(--se-bg-input)",
                fontSize: 14,
                color: "var(--se-text-main)",
                outline: "none",
                marginBottom: 12,
                boxSizing: "border-box",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "var(--se-primary)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--se-border)")
              }
            />

            {/* Category filter chips */}
            {categories.length > 1 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {categories.map((cat) => (
                  <FilterChip
                    key={cat}
                    label={cat}
                    active={activeCategory === cat}
                    onClick={() => setActiveCategory(cat)}
                  />
                ))}
              </div>
            )}

            {/* Dish list */}
            {filteredDishes.length === 0 ? (
              <EmptyState
                message={
                  search || activeCategory !== "All"
                    ? "No dishes match"
                    : "No dishes found"
                }
                sub={
                  search || activeCategory !== "All"
                    ? "Try a different search term or category."
                    : "This hall has no dishes in the database."
                }
              />
            ) : (
              <Card padding="none">
                {filteredDishes.map((dish) => (
                  <div
                    key={dish.dish_id}
                    onClick={() => navigate(`/dishes/${dish.dish_id}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <FoodListItem
                      dishName={dish.dish_name}
                      category={dish.category}
                      hallName={selectedHall.name}
                      calories={dish.calories}
                      protein={dish.protein}
                    />
                  </div>
                ))}
              </Card>
            )}
            <div style={{ marginTop: 32 }}>
              <AddDish />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
