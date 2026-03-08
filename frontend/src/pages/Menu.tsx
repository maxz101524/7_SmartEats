import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config";
import { FoodListItem } from "../components/FoodListItem";
import { FilterChip } from "../components/FilterChip";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import AddDish from "../components/AddDish";
import Skeleton from "../components/Skeleton";
import { IconMapPin, IconSearch } from "../components/Icons";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Dish {
  dish_id: number;
  dish_name: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber?: number;
  sodium?: number;
  category?: string;
  allergens?: string[];
  dietary_flags?: string[];
  serving_unit?: string;
  serving_size?: string;
  course?: string;
  meal_period?: string;
  nutrition_source?: string;
  ai_confidence?: string;
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

// ─── Constants ────────────────────────────────────────────────────────────────

const DIETARY_FILTERS = ["Vegetarian", "Vegan", "Halal", "Jain"];
const ALLERGEN_FILTERS = ["Gluten", "Milk", "Eggs", "Soy", "Corn", "Wheat", "Fish"];

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
  const [hallsError, setHallsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<DishStats | null>(null);

  // Filter state
  const [activeMealPeriod, setActiveMealPeriod] = useState("All");
  const [activeDietary, setActiveDietary] = useState<Set<string>>(new Set());
  const [excludedAllergens, setExcludedAllergens] = useState<Set<string>>(new Set());

  // ── Fetch halls ───────────────────────────────────────────────────────────
  const fetchHalls = () => {
    setHallsError(null);
    setLoading(true);
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
      .catch(() => {
        setHallsError("Could not load dining halls");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchHalls();
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
    setActiveMealPeriod("All");
    setActiveDietary(new Set());
    setExcludedAllergens(new Set());
    navigate(`/menu/${hall.Dining_Hall_ID}`);
  };

  // ── Toggle helpers ────────────────────────────────────────────────────────
  const toggleDietary = (flag: string) => {
    setActiveDietary((prev) => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
  };

  const toggleAllergen = (allergen: string) => {
    setExcludedAllergens((prev) => {
      const next = new Set(prev);
      if (next.has(allergen)) next.delete(allergen);
      else next.add(allergen);
      return next;
    });
  };

  // ── Derived: available meal periods ────────────────────────────────────────
  const mealPeriods = useMemo(() => {
    if (!selectedHall) return ["All"];
    const periods = new Set(
      selectedHall.dishes
        .map((d) => d.meal_period)
        .filter((p): p is string => Boolean(p))
    );
    return ["All", ...Array.from(periods).sort()];
  }, [selectedHall]);

  // ── Derived: filtered dishes ──────────────────────────────────────────────
  const filteredDishes = useMemo(() => {
    if (!selectedHall) return [];
    return selectedHall.dishes.filter((d) => {
      // Text search
      if (search && !d.dish_name.toLowerCase().includes(search.toLowerCase())) return false;
      // Meal period
      if (activeMealPeriod !== "All" && d.meal_period !== activeMealPeriod) return false;
      // Dietary flags: dish must have ALL selected flags
      for (const flag of activeDietary) {
        if (flag === "Gluten-Free") {
          if (d.allergens?.includes("Gluten")) return false;
        } else {
          if (!d.dietary_flags?.includes(flag)) return false;
        }
      }
      // Allergen exclusions: dish must NOT have any excluded allergen
      for (const allergen of excludedAllergens) {
        if (d.allergens?.includes(allergen)) return false;
      }
      return true;
    });
  }, [selectedHall, search, activeMealPeriod, activeDietary, excludedAllergens]);

  // ── Derived: group by station (serving_unit) ──────────────────────────────
  const stationGroups = useMemo(() => {
    const groups: Record<string, Dish[]> = {};
    for (const dish of filteredDishes) {
      const station = dish.serving_unit || "Other";
      (groups[station] ??= []).push(dish);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredDishes]);

  const hasActiveFilters =
    search || activeMealPeriod !== "All" || activeDietary.size > 0 || excludedAllergens.size > 0;

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
          <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rect" height={52} />
            ))}
          </div>
        ) : hallsError ? (
          <div style={{ padding: "16px" }}>
            <Card padding="md">
              <div style={{ textAlign: "center", padding: "var(--se-space-6)" }}>
                <p style={{ color: "var(--se-error)", fontWeight: 600, fontSize: "var(--se-text-base)", margin: 0 }}>
                  Something went wrong
                </p>
                <p style={{ color: "var(--se-text-muted)", fontSize: "var(--se-text-sm)", marginTop: 4, margin: "4px 0 0" }}>
                  {hallsError}
                </p>
                <div style={{ marginTop: "var(--se-space-4)" }}>
                  <Button variant="secondary" size="sm" onClick={fetchHalls}>
                    Try Again
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <div style={{ padding: "12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {halls.map((hall) => {
              const active = selectedHall?.Dining_Hall_ID === hall.Dining_Hall_ID;
              return (
                <button
                  key={hall.Dining_Hall_ID}
                  onClick={() => selectHall(hall)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    borderRadius: "var(--se-radius-md)",
                    border: active
                      ? "1px solid var(--se-primary)"
                      : "1px solid var(--se-border)",
                    borderLeft: active
                      ? "3px solid var(--se-primary)"
                      : "1px solid var(--se-border)",
                    background: active ? "var(--se-primary-dim)" : "var(--se-bg-surface)",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!active)
                      e.currentTarget.style.background = "var(--se-bg-subtle)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active)
                      e.currentTarget.style.background = active ? "var(--se-primary-dim)" : "var(--se-bg-surface)";
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
                  <p style={{ fontSize: 11, color: "var(--se-text-faint)", margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
                    <IconMapPin size={14} color="var(--se-text-faint)" />
                    {hall.location}
                  </p>
                </button>
              );
            })}
          </div>
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
                  {filteredDishes.length} of {selectedHall.dishes.length} dishes
                </span>
              </p>
            </div>

            {/* Search input */}
            <div style={{ position: "relative", marginBottom: 12 }}>
              <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", pointerEvents: "none" }}>
                <IconSearch size={16} color="var(--se-text-faint)" />
              </div>
              <input
                type="text"
                placeholder="Search dishes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  height: 40,
                  paddingLeft: 36,
                  paddingRight: 14,
                  paddingTop: 0,
                  paddingBottom: 0,
                  borderRadius: "var(--se-radius-lg)",
                  border: "1.5px solid var(--se-border)",
                  background: "var(--se-bg-input)",
                  fontSize: 14,
                  color: "var(--se-text-main)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "var(--se-primary)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "var(--se-border)")
                }
              />
            </div>

            {/* Meal period tabs */}
            {mealPeriods.length > 1 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {mealPeriods.map((period) => (
                  <FilterChip
                    key={period}
                    label={period}
                    active={activeMealPeriod === period}
                    onClick={() => setActiveMealPeriod(period)}
                    tint="primary"
                  />
                ))}
              </div>
            )}

            {/* Dietary preference chips */}
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--se-text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>
                Dietary
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {DIETARY_FILTERS.map((flag) => (
                  <FilterChip
                    key={flag}
                    label={flag}
                    active={activeDietary.has(flag)}
                    onClick={() => toggleDietary(flag)}
                    tint="success"
                  />
                ))}
              </div>
            </div>

            {/* Allergen exclusion chips */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--se-text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>
                Exclude Allergens
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ALLERGEN_FILTERS.map((allergen) => (
                  <FilterChip
                    key={allergen}
                    label={allergen}
                    active={excludedAllergens.has(allergen)}
                    onClick={() => toggleAllergen(allergen)}
                    tint="error"
                  />
                ))}
              </div>
            </div>

            {/* Dish list grouped by station */}
            {stationGroups.length === 0 ? (
              <EmptyState
                message={hasActiveFilters ? "No dishes match" : "No dishes found"}
                sub={
                  hasActiveFilters
                    ? "Try adjusting your filters or search term."
                    : "This hall has no dishes in the database."
                }
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {stationGroups.map(([station, dishes]) => (
                  <div key={station}>
                    {/* Station header */}
                    <div
                      style={{
                        background: "var(--se-bg-subtle)",
                        borderRadius: "var(--se-radius-sm)",
                        padding: "6px 12px",
                        marginBottom: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <p
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--se-text-faint)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          margin: 0,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {station}
                      </p>
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--se-text-faint)",
                          flexShrink: 0,
                        }}
                      >
                        {dishes.length}
                      </span>
                    </div>

                    {/* Dishes in this station */}
                    <Card padding="none">
                      {dishes.map((dish) => (
                        <div
                          key={dish.dish_id}
                          onClick={() => navigate(`/dishes/${dish.dish_id}`)}
                          style={{ cursor: "pointer" }}
                        >
                          <FoodListItem
                            dishName={dish.dish_name}
                            category={dish.category}
                            servingUnit={station}
                            servingSize={dish.serving_size}
                            calories={dish.calories}
                            protein={dish.protein}
                            carbohydrates={dish.carbohydrates}
                            fat={dish.fat}
                            dietaryFlags={dish.dietary_flags}
                          />
                        </div>
                      ))}
                    </Card>
                  </div>
                ))}
              </div>
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
