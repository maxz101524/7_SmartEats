import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { IconClose, IconMapPin, IconSearch } from "../components/Icons";
import { FLAG_COLORS, FLAG_FALLBACK } from "../utils/flagColors";

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

const DIETARY_FILTERS = ["Vegetarian", "Vegan", "Halal", "Jain"];
const ALLERGEN_FILTERS = ["Gluten", "Milk", "Eggs", "Soy", "Corn", "Wheat", "Fish"];

const panelStyle: CSSProperties = {
  background: "var(--se-bg-surface)",
  border: "1px solid var(--se-border)",
  borderRadius: "var(--se-radius-xl)",
  boxShadow: "var(--se-shadow-sm)",
};

function formatStationAnchor(station: string) {
  return (
    station
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "other"
  );
}

function ChevronRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function HallSelectionCard({
  hall,
  selected,
  onClick,
}: {
  hall: DiningHall;
  selected?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      aria-label={hall.name}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...panelStyle,
        display: "flex",
        alignItems: "center",
        gap: 16,
        width: "100%",
        textAlign: "left",
        padding: "18px 20px",
        cursor: "pointer",
        borderColor: selected || hovered ? "var(--se-primary)" : "var(--se-border)",
        background: selected ? "var(--se-primary-dim)" : "var(--se-bg-surface)",
        boxShadow: hovered ? "var(--se-shadow-md)" : "var(--se-shadow-sm)",
        transform: hovered ? "translateY(-1px)" : "translateY(0)",
        transition: "transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease, background 140ms ease",
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          flexShrink: 0,
          background: selected ? "var(--se-primary)" : "var(--se-success)",
          boxShadow: selected ? "0 0 0 5px rgba(var(--se-primary-rgb), 0.12)" : "none",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: "0 0 4px",
            fontSize: "var(--se-text-base)",
            fontWeight: "var(--se-weight-bold)",
            color: "var(--se-text-main)",
          }}
        >
          {hall.name}
        </p>
        <p
          style={{
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: "var(--se-text-xs)",
            color: "var(--se-text-muted)",
          }}
        >
          <IconMapPin size={12} color="var(--se-text-faint)" />
          {hall.location}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <span
          style={{
            padding: "4px 10px",
            borderRadius: "var(--se-radius-full)",
            background: selected ? "rgba(var(--se-primary-rgb), 0.14)" : "var(--se-bg-subtle)",
            color: selected ? "var(--se-primary)" : "var(--se-text-muted)",
            fontSize: "var(--se-text-xs)",
            fontWeight: "var(--se-weight-semibold)",
            whiteSpace: "nowrap",
          }}
        >
          {hall.dishes.length} dishes
        </span>
        <span style={{ color: selected ? "var(--se-primary)" : "var(--se-text-faint)" }}>
          <ChevronRight />
        </span>
      </div>
    </button>
  );
}

function StationJumpLink({
  station,
  href,
}: {
  station: string;
  href: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <a
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: 36,
        padding: "0 16px",
        borderRadius: "var(--se-radius-full)",
        border: `1px solid ${hovered ? "var(--se-primary)" : "var(--se-border)"}`,
        background: hovered ? "var(--se-primary-dim)" : "var(--se-bg-surface)",
        color: hovered ? "var(--se-primary)" : "var(--se-text-secondary)",
        fontSize: "var(--se-text-sm)",
        fontWeight: "var(--se-weight-semibold)",
        textDecoration: "none",
        whiteSpace: "nowrap",
        transition: "all 140ms ease",
      }}
    >
      {station}
    </a>
  );
}

function CompactDishCard({
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
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...panelStyle,
        display: "flex",
        alignItems: "stretch",
        gap: 16,
        width: "100%",
        textAlign: "left",
        padding: 14,
        cursor: "pointer",
        borderColor: hovered ? "var(--se-border-strong)" : "var(--se-border)",
        boxShadow: hovered ? "var(--se-shadow-md)" : "var(--se-shadow-sm)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        transition: "transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease",
      }}
    >
      <div
        style={{
          width: 64,
          minWidth: 64,
          height: 64,
          borderRadius: "18px",
          background: "linear-gradient(180deg, var(--se-primary-dim) 0%, rgba(var(--se-primary-rgb), 0.08) 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid rgba(var(--se-primary-rgb), 0.14)",
        }}
      >
        <FoodIcon dishName={dish.dish_name} category={dish.category as FoodCategory} size="lg" />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h3
              style={{
                margin: 0,
                fontSize: "var(--se-text-base)",
                fontWeight: "var(--se-weight-bold)",
                color: "var(--se-text-main)",
                lineHeight: 1.2,
              }}
            >
              {dish.dish_name}
            </h3>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "var(--se-text-xs)",
                color: "var(--se-text-muted)",
              }}
            >
              {station}
              {dish.serving_size ? ` · ${dish.serving_size}` : ""}
            </p>
          </div>

          {dish.dietary_flags?.[0] && (() => {
            const colors = FLAG_COLORS[dish.dietary_flags[0]] || FLAG_FALLBACK;
            return (
              <span
                style={{
                  flexShrink: 0,
                  padding: "4px 8px",
                  borderRadius: "var(--se-radius-full)",
                  background: colors.bg,
                  color: colors.text,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {dish.dietary_flags[0]}
              </span>
            );
          })()}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <span
            style={{
              fontSize: "var(--se-text-xs)",
              color: "var(--se-text-muted)",
              fontWeight: "var(--se-weight-semibold)",
            }}
          >
            {dish.calories} kcal
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--se-macro-protein)" }}>
            {dish.protein}g P
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--se-macro-carbs)" }}>
            {dish.carbohydrates}g C
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--se-macro-fat)" }}>
            {dish.fat}g F
          </span>
        </div>

        {dish.dietary_flags && dish.dietary_flags.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {dish.dietary_flags.slice(1).map((flag) => {
              const colors = FLAG_COLORS[flag] || FLAG_FALLBACK;
              return (
                <span
                  key={flag}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "var(--se-radius-full)",
                    background: colors.bg,
                    color: colors.text,
                    fontSize: 10,
                    fontWeight: 700,
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

export default function Menu() {
  const { hallId } = useParams<{ hallId: string }>();
  const navigate = useNavigate();

  const [halls, setHalls] = useState<DiningHall[]>([]);
  const [selectedHall, setSelectedHall] = useState<DiningHall | null>(null);
  const [loading, setLoading] = useState(true);
  const [hallsError, setHallsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showHallPicker, setShowHallPicker] = useState(false);
  const [activeMealPeriod, setActiveMealPeriod] = useState("All");
  const [activeDietary, setActiveDietary] = useState<Set<string>>(new Set());
  const [excludedAllergens, setExcludedAllergens] = useState<Set<string>>(new Set());

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
          const found = data.find((hall) => String(hall.Dining_Hall_ID) === hallId);
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

  useEffect(() => {
    if (!hallId) {
      setSelectedHall(null);
      setShowHallPicker(false);
      return;
    }

    if (halls.length === 0) return;

    const found = halls.find((hall) => String(hall.Dining_Hall_ID) === hallId);
    if (found) {
      setSelectedHall(found);
      setShowHallPicker(false);
    } else {
      setSelectedHall(null);
      setShowHallPicker(false);
    }
  }, [hallId, halls]);

  const selectHall = (hall: DiningHall) => {
    setSelectedHall(hall);
    setSearch("");
    setShowHallPicker(false);
    setActiveMealPeriod("All");
    setActiveDietary(new Set());
    setExcludedAllergens(new Set());
    navigate(`/menu/${hall.Dining_Hall_ID}`);
  };

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

  const mealPeriods = useMemo(() => {
    if (!selectedHall) return ["All"];

    const periods = new Set(
      selectedHall.dishes
        .map((dish) => dish.meal_period)
        .filter((period): period is string => Boolean(period)),
    );

    return ["All", ...Array.from(periods).sort()];
  }, [selectedHall]);

  const filteredDishes = useMemo(() => {
    if (!selectedHall) return [];

    return selectedHall.dishes.filter((dish) => {
      if (
        search &&
        !dish.dish_name.toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }

      if (
        activeMealPeriod !== "All" &&
        dish.meal_period !== activeMealPeriod
      ) {
        return false;
      }

      for (const flag of activeDietary) {
        if (flag === "Gluten-Free") {
          if (dish.allergens?.includes("Gluten")) return false;
        } else if (!dish.dietary_flags?.includes(flag)) {
          return false;
        }
      }

      for (const allergen of excludedAllergens) {
        if (dish.allergens?.includes(allergen)) return false;
      }

      return true;
    });
  }, [selectedHall, search, activeMealPeriod, activeDietary, excludedAllergens]);

  const stationGroups = useMemo(() => {
    const groups: Record<string, Dish[]> = {};

    for (const dish of filteredDishes) {
      const station = dish.serving_unit || "Other";
      (groups[station] ??= []).push(dish);
    }

    return Object.entries(groups).sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [filteredDishes]);

  const stationSections = useMemo(
    () => {
      const anchorCounts = new Map<string, number>();

      return stationGroups.map(([station, dishes]) => {
        const baseAnchor = formatStationAnchor(station);
        const nextCount = (anchorCounts.get(baseAnchor) ?? 0) + 1;
        anchorCounts.set(baseAnchor, nextCount);

        return {
          station,
          dishes,
          anchor:
            nextCount === 1 ? baseAnchor : `${baseAnchor}-${nextCount}`,
        };
      });
    },
    [stationGroups],
  );

  const hasActiveFilters = Boolean(
    search ||
      activeMealPeriod !== "All" ||
      activeDietary.size > 0 ||
      excludedAllergens.size > 0,
  );

  if (!selectedHall) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>
        <section
          style={{
            ...panelStyle,
            padding: "28px 28px 24px",
            background:
              "linear-gradient(180deg, rgba(var(--se-primary-rgb), 0.12) 0%, var(--se-bg-surface) 100%)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 10px",
              borderRadius: "var(--se-radius-full)",
              background: "rgba(var(--se-primary-rgb), 0.10)",
              color: "var(--se-primary)",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Live dining menus
          </div>
          <h1
            style={{
              margin: "16px 0 8px",
              fontSize: "clamp(2rem, 4vw, 2.75rem)",
              lineHeight: 1,
              color: "var(--se-text-main)",
              fontWeight: "var(--se-weight-extrabold)",
              letterSpacing: "-0.04em",
            }}
          >
            Pick a dining hall and explore today&apos;s stations.
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: 620,
              fontSize: "var(--se-text-sm)",
              color: "var(--se-text-secondary)",
              lineHeight: 1.6,
            }}
          >
            SmartEats keeps the live hall menus, meal periods, nutrition stats,
            and dietary filters intact. Choose a hall to jump into the new
            browsing layout.
          </p>
        </section>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3].map((item) => (
              <Skeleton key={item} variant="rect" height={112} />
            ))}
          </div>
        ) : hallsError ? (
          <Card padding="md">
            <div style={{ textAlign: "center", padding: "var(--se-space-6)" }}>
              <p
                style={{
                  color: "var(--se-error)",
                  fontWeight: 600,
                  margin: 0,
                }}
              >
                Could not load dining halls
              </p>
              <div style={{ marginTop: "var(--se-space-4)" }}>
                <Button variant="secondary" size="sm" onClick={fetchHalls}>
                  Try Again
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {halls.map((hall) => (
              <HallSelectionCard
                key={hall.Dining_Hall_ID}
                hall={hall}
                onClick={() => selectHall(hall)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 48 }}>
      <section
        style={{
          ...panelStyle,
          padding: "28px",
          background:
            "linear-gradient(180deg, rgba(var(--se-primary-rgb), 0.14) 0%, var(--se-bg-surface) 58%, var(--se-bg-surface) 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 20,
            marginBottom: 22,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: "var(--se-radius-full)",
                background: "rgba(var(--se-primary-rgb), 0.10)",
                color: "var(--se-primary)",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              UIUC Dining
            </div>
            <h1
              style={{
                margin: "16px 0 10px",
                fontSize: "clamp(2rem, 4vw, 2.8rem)",
                lineHeight: 0.98,
                color: "var(--se-text-main)",
                fontWeight: "var(--se-weight-extrabold)",
                letterSpacing: "-0.05em",
              }}
            >
              {selectedHall.name}
            </h1>
            <p
              style={{
                margin: 0,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
                fontSize: "var(--se-text-sm)",
                color: "var(--se-text-secondary)",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <IconMapPin size={14} color="var(--se-text-faint)" />
                {selectedHall.location}
              </span>
              <span style={{ color: "var(--se-text-faint)" }}>·</span>
              <span>
                {filteredDishes.length}
                {filteredDishes.length !== selectedHall.dishes.length
                  ? ` / ${selectedHall.dishes.length}`
                  : ""}
                {" "}dishes visible
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowHallPicker((open) => !open)}
            aria-expanded={showHallPicker}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 42,
              padding: "0 16px",
              borderRadius: "var(--se-radius-full)",
              border: "1px solid var(--se-border)",
              background: showHallPicker
                ? "var(--se-primary)"
                : "var(--se-bg-surface)",
              color: showHallPicker
                ? "var(--se-text-inverted)"
                : "var(--se-text-main)",
              fontSize: "var(--se-text-sm)",
              fontWeight: "var(--se-weight-bold)",
              cursor: "pointer",
              boxShadow: "var(--se-shadow-sm)",
              transition: "all 140ms ease",
            }}
          >
            Change Hall
            <span
              style={{
                display: "inline-flex",
                transform: showHallPicker ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 140ms ease",
              }}
            >
              <ChevronRight />
            </span>
          </button>
        </div>

        {showHallPicker && (
          <div
            style={{
              ...panelStyle,
              padding: 18,
              marginBottom: 22,
              background: "rgba(255, 255, 255, 0.82)",
              backdropFilter: "blur(16px)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div>
                <p
                  style={{
                    margin: "0 0 2px",
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--se-text-faint)",
                  }}
                >
                  Switch hall
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--se-text-sm)",
                    color: "var(--se-text-secondary)",
                  }}
                >
                  Keep the same filters, but jump between live dining halls.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHallPicker(false)}
                aria-label="Close hall chooser"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  border: "1px solid var(--se-border)",
                  background: "var(--se-bg-surface)",
                  color: "var(--se-text-muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <IconClose size={14} color="currentColor" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {halls.map((hall) => (
                <HallSelectionCard
                  key={hall.Dining_Hall_ID}
                  hall={hall}
                  selected={hall.Dining_Hall_ID === selectedHall.Dining_Hall_ID}
                  onClick={() => selectHall(hall)}
                />
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              padding: 6,
              borderRadius: "var(--se-radius-full)",
              background: "rgba(255,255,255,0.72)",
              border: "1px solid rgba(var(--se-primary-rgb), 0.10)",
              width: "fit-content",
              maxWidth: "100%",
            }}
          >
            {mealPeriods.map((period) => {
              const active = activeMealPeriod === period;

              return (
                <button
                  key={period}
                  type="button"
                  onClick={() => setActiveMealPeriod(period)}
                  style={{
                    height: 40,
                    padding: "0 18px",
                    borderRadius: "var(--se-radius-full)",
                    border: "none",
                    background: active
                      ? "var(--se-bg-surface)"
                      : "transparent",
                    color: active
                      ? "var(--se-primary)"
                      : "var(--se-text-muted)",
                    fontSize: "var(--se-text-sm)",
                    fontWeight: "var(--se-weight-bold)",
                    boxShadow: active ? "var(--se-shadow-sm)" : "none",
                    cursor: "pointer",
                    transition: "all 140ms ease",
                  }}
                >
                  {period}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col lg:flex-row gap-4">
            <div style={{ position: "relative", flex: "1 1 260px", minWidth: 0 }}>
              <div
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <IconSearch size={16} color="var(--se-text-faint)" />
              </div>
              <input
                type="text"
                aria-label="Search dishes"
                placeholder="Search dishes"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                style={{
                  width: "100%",
                  height: 46,
                  borderRadius: "var(--se-radius-full)",
                  border: "1px solid var(--se-border)",
                  background: "rgba(255,255,255,0.82)",
                  paddingLeft: 40,
                  paddingRight: search ? 42 : 16,
                  fontSize: "var(--se-text-sm)",
                  color: "var(--se-text-main)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    border: "none",
                    background: "var(--se-bg-subtle)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <IconClose size={14} color="var(--se-text-muted)" />
                </button>
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                color: "var(--se-text-muted)",
                fontSize: "var(--se-text-xs)",
                fontWeight: "var(--se-weight-semibold)",
              }}
            >
              <span
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--se-radius-full)",
                  background: "rgba(255,255,255,0.78)",
                  border: "1px solid var(--se-border)",
                }}
              >
                {hasActiveFilters ? "Filters active" : "Browsing all dishes"}
              </span>
              <span>{stationGroups.length} station groups</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <p
                style={{
                  margin: "0 0 6px",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--se-text-faint)",
                }}
              >
                Dietary
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
                  margin: "0 0 6px",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--se-text-faint)",
                }}
              >
                Exclude Allergens
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
        </div>
      </section>

      {stationSections.length > 0 && (
        <div style={{ position: "sticky", top: 76, zIndex: 20 }}>
          <div
            style={{
              ...panelStyle,
              padding: 8,
              display: "flex",
              gap: 8,
              overflowX: "auto",
              background: "rgba(255,255,255,0.92)",
              backdropFilter: "blur(16px)",
            }}
          >
            {stationSections.map(({ station, anchor }) => (
              <StationJumpLink
                key={`${station}-${anchor}`}
                station={station}
                href={`#${anchor}`}
              />
            ))}
          </div>
        </div>
      )}

      {stationGroups.length === 0 ? (
        <section style={{ ...panelStyle, padding: 32 }}>
          <EmptyState
            message={hasActiveFilters ? "No dishes match" : "No dishes found"}
            sub={
              hasActiveFilters
                ? "Try adjusting the search term or filters."
                : "This dining hall has no dishes in the database yet."
            }
          />
        </section>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {stationSections.map(({ station, dishes, anchor }) => (
            <section
              key={station}
              id={anchor}
              className="scroll-mt-44"
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "space-between",
                  gap: 16,
                  paddingBottom: 12,
                  borderBottom: "1px solid var(--se-border)",
                }}
              >
                <div>
                  <p
                    style={{
                      margin: "0 0 6px",
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--se-text-faint)",
                    }}
                  >
                    Serving station
                  </p>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "var(--se-text-h3)",
                      fontWeight: "var(--se-weight-extrabold)",
                      color: "var(--se-text-main)",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {station}
                  </h2>
                </div>
                <span
                  style={{
                    padding: "6px 10px",
                    borderRadius: "var(--se-radius-full)",
                    background: "var(--se-bg-subtle)",
                    color: "var(--se-text-muted)",
                    fontSize: "var(--se-text-xs)",
                    fontWeight: "var(--se-weight-semibold)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {dishes.length} items
                </span>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {dishes.map((dish) => (
                  <CompactDishCard
                    key={dish.dish_id}
                    dish={dish}
                    station={station}
                    onClick={() => navigate(`/dishes/${dish.dish_id}`)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <section style={{ ...panelStyle, padding: 24 }}>
        <div style={{ marginBottom: 10 }}>
          <p
            style={{
              margin: "0 0 4px",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--se-text-faint)",
            }}
          >
            Dish management
          </p>
          <h2
            style={{
              margin: 0,
              fontSize: "var(--se-text-h3)",
              fontWeight: "var(--se-weight-bold)",
              color: "var(--se-text-main)",
            }}
          >
            Need something missing?
          </h2>
        </div>
        <AddDish />
      </section>
    </div>
  );
}
