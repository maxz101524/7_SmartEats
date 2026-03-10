import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config";
import { FoodIcon } from "../components/FoodIcon";
import type { FoodCategory } from "../components/FoodIcon";
import { FilterChip } from "../components/FilterChip";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import AddDish from "../components/AddDish";
import Skeleton from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { IconMapPin, IconSearch, IconClose } from "../components/Icons";
import { FLAG_COLORS, FLAG_FALLBACK } from "../utils/flagColors";

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

// ─── Constants ────────────────────────────────────────────────────────────────

const DIETARY_FILTERS = ["Vegetarian", "Vegan", "Halal", "Jain"];
const ALLERGEN_FILTERS = ["Gluten", "Milk", "Eggs", "Soy", "Corn", "Wheat", "Fish"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

// ─── DishCard ─────────────────────────────────────────────────────────────────

function DishCard({
  dish,
  station,
  onClick,
}: {
  dish: Dish;
  station: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "var(--se-bg-surface)",
        border: `1px solid ${hovered ? "var(--se-border-strong)" : "var(--se-border)"}`,
        borderRadius: "var(--se-radius-lg)",
        overflow: "hidden",
        cursor: "pointer",
        boxShadow: hovered ? "var(--se-shadow-md)" : "var(--se-shadow-sm)",
        transform: hovered ? "translateY(-2px)" : "none",
        transition: "all 150ms ease",
        padding: 0,
      }}
    >
      {/* Icon zone */}
      <div
        style={{
          height: 84,
          background: "var(--se-primary-dim)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: `1px solid ${hovered ? "var(--se-border)" : "var(--se-border-muted)"}`,
        }}
      >
        <FoodIcon
          dishName={dish.dish_name}
          category={dish.category as FoodCategory}
          size="lg"
        />
      </div>

      {/* Body */}
      <div style={{ padding: "12px 14px 14px" }}>
        <p
          style={{
            fontSize: "var(--se-text-sm)",
            fontWeight: "var(--se-weight-bold)",
            color: "var(--se-text-main)",
            margin: "0 0 2px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {dish.dish_name}
        </p>
        <p
          style={{
            fontSize: "var(--se-text-xs)",
            color: "var(--se-text-muted)",
            margin: "0 0 10px",
          }}
        >
          {station}
          {dish.serving_size && (
            <span style={{ color: "var(--se-text-faint)" }}> · {dish.serving_size}</span>
          )}
        </p>

        {/* Macro grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 4,
            marginBottom: 10,
          }}
        >
          {[
            { label: "Cal", value: dish.calories, unit: "", bg: "var(--se-primary-dim)", color: "var(--se-macro-cal)" },
            { label: "Pro", value: dish.protein, unit: "g", bg: "var(--se-info-dim)", color: "var(--se-macro-protein)" },
            { label: "Carb", value: dish.carbohydrates, unit: "g", bg: "var(--se-warning-dim)", color: "var(--se-macro-carbs)" },
            { label: "Fat", value: dish.fat, unit: "g", bg: "var(--se-primary-dim)", color: "var(--se-macro-fat)" },
          ].map(({ label, value, unit, bg, color }) =>
            value !== undefined ? (
              <div
                key={label}
                style={{
                  background: bg,
                  borderRadius: "var(--se-radius-sm)",
                  padding: "5px 4px",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color,
                    textTransform: "uppercase",
                    margin: "0 0 1px",
                    opacity: 0.65,
                    letterSpacing: "0.04em",
                  }}
                >
                  {label}
                </p>
                <p style={{ fontSize: 11, fontWeight: 700, color, margin: 0 }}>
                  {value}{unit}
                </p>
              </div>
            ) : null
          )}
        </div>

        {/* Dietary flags */}
        {dish.dietary_flags && dish.dietary_flags.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {dish.dietary_flags.map((flag) => {
              const colors = FLAG_COLORS[flag] || FLAG_FALLBACK;
              return (
                <span
                  key={flag}
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: "var(--se-radius-full)",
                    background: colors.bg,
                    color: colors.text,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {flag}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </button>
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
      if (search && !d.dish_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (activeMealPeriod !== "All" && d.meal_period !== activeMealPeriod) return false;
      for (const flag of activeDietary) {
        if (flag === "Gluten-Free") {
          if (d.allergens?.includes("Gluten")) return false;
        } else {
          if (!d.dietary_flags?.includes(flag)) return false;
        }
      }
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
            padding: "20px 16px 14px",
            borderBottom: "1px solid var(--se-border)",
          }}
        >
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--se-text-main)",
              margin: "0 0 2px",
            }}
          >
            Dining Halls
          </p>
          <p
            style={{
              fontSize: 11,
              color: "var(--se-text-faint)",
              margin: 0,
            }}
          >
            {loading
              ? "Loading…"
              : halls.length > 0
              ? `${halls.length} hall${halls.length !== 1 ? "s" : ""} · Today's menu`
              : "No halls found"}
          </p>
        </div>

        {/* Hall rows */}
        {loading ? (
          <div style={{ padding: "16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rect" height={60} />
            ))}
          </div>
        ) : hallsError ? (
          <div style={{ padding: "16px" }}>
            <Card padding="md">
              <div style={{ textAlign: "center", padding: "var(--se-space-6)" }}>
                <p style={{ color: "var(--se-error)", fontWeight: 600, fontSize: "var(--se-text-base)", margin: 0 }}>
                  Something went wrong
                </p>
                <p style={{ color: "var(--se-text-muted)", fontSize: "var(--se-text-sm)", margin: "4px 0 0" }}>
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
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 6 }}>
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
                    padding: "10px 12px",
                    borderRadius: "var(--se-radius-md)",
                    border: "1px solid transparent",
                    borderLeft: active
                      ? "3px solid var(--se-primary)"
                      : "3px solid transparent",
                    background: active ? "var(--se-primary-dim)" : "transparent",
                    cursor: "pointer",
                    transition: "background 0.12s, border-color 0.12s",
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
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: active ? 700 : 500,
                        color: active ? "var(--se-primary)" : "var(--se-text-main)",
                        margin: "0 0 3px",
                        lineHeight: 1.3,
                      }}
                    >
                      {hall.name}
                    </p>
                    {hall.dishes.length > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: active ? "var(--se-primary)" : "var(--se-text-faint)",
                          background: active ? "rgba(232,74,39,0.12)" : "var(--se-bg-subtle)",
                          padding: "2px 7px",
                          borderRadius: "var(--se-radius-full)",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                          marginTop: 1,
                        }}
                      >
                        {hall.dishes.length}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: "var(--se-text-faint)", margin: 0, display: "flex", alignItems: "center", gap: 3 }}>
                    <IconMapPin size={11} color="var(--se-text-faint)" />
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

        {/* ── No hall selected: rich hall-selection prompt ── */}
        {!selectedHall ? (
          <div style={{ padding: "40px 28px" }}>
            <div style={{ marginBottom: 28 }}>
              <h1
                style={{
                  fontSize: "var(--se-text-h2)",
                  fontWeight: "var(--se-weight-extrabold)",
                  color: "var(--se-text-main)",
                  margin: "0 0 6px",
                }}
              >
                Where are you eating today?
              </h1>
              <p style={{ fontSize: "var(--se-text-sm)", color: "var(--se-text-muted)", margin: 0 }}>
                Select a dining hall to browse today's menu.
              </p>
            </div>

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} variant="rect" height={72} />
                ))}
              </div>
            ) : hallsError ? (
              <Card padding="md">
                <div style={{ textAlign: "center", padding: "var(--se-space-6)" }}>
                  <p style={{ color: "var(--se-error)", fontWeight: 600, margin: 0 }}>Could not load dining halls</p>
                  <div style={{ marginTop: "var(--se-space-4)" }}>
                    <Button variant="secondary" size="sm" onClick={fetchHalls}>Try Again</Button>
                  </div>
                </div>
              </Card>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {halls.map((hall) => (
                  <button
                    key={hall.Dining_Hall_ID}
                    onClick={() => selectHall(hall)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      width: "100%",
                      textAlign: "left",
                      padding: "16px 20px",
                      borderRadius: "var(--se-radius-lg)",
                      border: "1px solid var(--se-border)",
                      background: "var(--se-bg-surface)",
                      cursor: "pointer",
                      boxShadow: "var(--se-shadow-sm)",
                      transition: "transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--se-primary)";
                      e.currentTarget.style.boxShadow = "var(--se-shadow-md)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--se-border)";
                      e.currentTarget.style.boxShadow = "var(--se-shadow-sm)";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    {/* Orange dot indicator */}
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "var(--se-success)",
                        flexShrink: 0,
                      }}
                    />

                    {/* Hall info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: "var(--se-text-base)",
                          fontWeight: "var(--se-weight-bold)",
                          color: "var(--se-text-main)",
                          margin: "0 0 2px",
                        }}
                      >
                        {hall.name}
                      </p>
                      <p
                        style={{
                          fontSize: "var(--se-text-xs)",
                          color: "var(--se-text-muted)",
                          margin: 0,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <IconMapPin size={12} color="var(--se-text-faint)" />
                        {hall.location}
                      </p>
                    </div>

                    {/* Dish count */}
                    <span
                      style={{
                        fontSize: "var(--se-text-xs)",
                        fontWeight: "var(--se-weight-semibold)",
                        color: "var(--se-text-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {hall.dishes.length} dishes
                    </span>

                    {/* Arrow */}
                    <span style={{ color: "var(--se-text-faint)", flexShrink: 0 }}>
                      <ChevronRight />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ── Hall selected: header zone ── */}
            <div
              style={{
                padding: "24px 24px 20px",
                background: "linear-gradient(180deg, var(--se-primary-dim) 0%, var(--se-bg-subtle) 100%)",
                borderBottom: "1px solid var(--se-border)",
              }}
            >
              {/* Orange accent bar */}
              <div
                style={{
                  width: 48,
                  height: 4,
                  background: "var(--se-primary)",
                  borderRadius: 99,
                  marginBottom: 14,
                }}
              />
              <h1
                style={{
                  fontSize: "var(--se-text-h1)",
                  fontWeight: "var(--se-weight-extrabold)",
                  color: "var(--se-text-main)",
                  margin: "0 0 5px",
                  lineHeight: 1.15,
                }}
              >
                {selectedHall.name}
              </h1>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--se-text-muted)",
                  margin: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <IconMapPin size={13} color="var(--se-text-faint)" />
                  {selectedHall.location}
                </span>
                <span style={{ color: "var(--se-border-strong)" }}>·</span>
                <span style={{ color: "var(--se-text-secondary)", fontWeight: 600 }}>
                  {filteredDishes.length}
                  {filteredDishes.length !== selectedHall.dishes.length && (
                    <span style={{ fontWeight: 400, color: "var(--se-text-faint)" }}>
                      {" "}/ {selectedHall.dishes.length}
                    </span>
                  )}{" "}
                  dishes
                </span>
              </p>
            </div>

            {/* ── Sticky search + meal period bar ── */}
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 10,
                background: "var(--se-bg-surface)",
                borderBottom: "1px solid var(--se-border)",
                padding: "10px 24px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {/* Search */}
              <div style={{ position: "relative", flex: "1 1 180px", minWidth: 0 }}>
                <div
                  style={{
                    position: "absolute",
                    left: 11,
                    top: "50%",
                    transform: "translateY(-50%)",
                    display: "flex",
                    alignItems: "center",
                    pointerEvents: "none",
                  }}
                >
                  <IconSearch size={15} color="var(--se-text-faint)" />
                </div>
                <input
                  type="text"
                  placeholder="Search dishes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search dishes"
                  style={{
                    width: "100%",
                    height: 36,
                    paddingLeft: 32,
                    paddingRight: search ? 36 : 12,
                    borderRadius: "var(--se-radius-full)",
                    border: "1.5px solid var(--se-border)",
                    background: "var(--se-bg-subtle)",
                    fontSize: 13,
                    color: "var(--se-text-main)",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--se-primary)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232, 74, 39, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--se-border)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    style={{
                      position: "absolute",
                      right: 6,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 24,
                      height: 24,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "var(--se-radius-full)",
                      border: "none",
                      background: "var(--se-bg-subtle)",
                      cursor: "pointer",
                    }}
                  >
                    <IconClose size={12} color="var(--se-text-muted)" />
                  </button>
                )}
              </div>

              {/* Meal period tabs */}
              {mealPeriods.length > 1 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
            </div>

            {/* ── Dietary + allergen chips ── */}
            <div
              style={{
                padding: "10px 24px 12px",
                borderBottom: "1px solid var(--se-border-muted)",
                display: "flex",
                gap: 20,
                flexWrap: "wrap",
                alignItems: "flex-start",
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--se-text-faint)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    margin: "0 0 5px",
                  }}
                >
                  Dietary
                </p>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
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
              <div>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--se-text-faint)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    margin: "0 0 5px",
                  }}
                >
                  Exclude Allergens
                </p>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
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
            </div>

            {/* ── Dish list ── */}
            <div style={{ padding: "20px 24px 48px" }}>
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
                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                  {stationGroups.map(([station, dishes]) => (
                    <div key={station}>
                      {/* Section header: title + horizontal rule */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                          marginBottom: 12,
                        }}
                      >
                        <h3
                          style={{
                            fontSize: "var(--se-text-base)",
                            fontWeight: "var(--se-weight-bold)",
                            color: "var(--se-text-main)",
                            margin: 0,
                            whiteSpace: "nowrap",
                            paddingLeft: 12,
                            borderLeft: "3px solid var(--se-primary)",
                          }}
                        >
                          {station}
                        </h3>
                        <div style={{ flex: 1, height: 1, background: "var(--se-border-strong)" }} />
                        <span style={{ fontSize: 11, color: "var(--se-text-faint)", flexShrink: 0 }}>
                          {dishes.length}
                        </span>
                      </div>

                      {/* Card grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {dishes.map((dish) => (
                          <DishCard
                            key={dish.dish_id}
                            dish={dish}
                            station={station}
                            onClick={() => navigate(`/dishes/${dish.dish_id}`)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 32 }}>
                <AddDish />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
