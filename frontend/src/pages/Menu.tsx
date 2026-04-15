import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config";
import { FoodIcon } from "../components/FoodIcon";
import type { FoodCategory } from "../components/FoodIcon";
import { FilterChip } from "../components/FilterChip";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import Skeleton from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { IconClose, IconMapPin, IconSearch } from "../components/Icons";
import { FLAG_COLORS, FLAG_FALLBACK } from "../utils/flagColors";
import { useMealTray } from "../mealTray";

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

type HallStatus = {
  is_open: boolean;
  meal_label: string | null;
  closes_at: string | null;
};

type HallStatusMap = Record<string, HallStatus>;

const DIETARY_FILTERS = ["Vegetarian", "Vegan", "Halal", "Jain"];
const ALLERGEN_FILTERS = ["Gluten", "Milk", "Eggs", "Soy", "Corn", "Wheat", "Fish"];
const HALL_THUMBNAIL_BASE = "/dininghall_thumbnails/";

const HALL_VISUALS = [
  {
    matcher: /field\s+of\s+greens/i,
    src: `${HALL_THUMBNAIL_BASE}field-of-greens.png`,
    accent: "#16a34a",
  },
  {
    matcher: /ikenberry/i,
    src: `${HALL_THUMBNAIL_BASE}Ikenberry.png`,
    accent: "#dc2626",
  },
  {
    matcher: /illinois\s+street|isr/i,
    src: `${HALL_THUMBNAIL_BASE}ISR.png`,
    accent: "#2563eb",
  },
  {
    matcher: /kosher/i,
    src: `${HALL_THUMBNAIL_BASE}kosher-kitchen.png`,
    accent: "#7c3aed",
  },
  {
    matcher: /lincoln|allen/i,
    src: `${HALL_THUMBNAIL_BASE}Allen-hall.png`,
    accent: "#ea580c",
  },
  {
    matcher: /pennsylvania|par/i,
    src: `${HALL_THUMBNAIL_BASE}PAR.png`,
    accent: "#0891b2",
  },
];

function getHallVisual(hall: DiningHall) {
  const searchableText = `${hall.name} ${hall.location}`;

  return (
    HALL_VISUALS.find((visual) => visual.matcher.test(searchableText)) ?? {
      src: "",
      accent: "var(--se-primary)",
    }
  );
}

function getAiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const apiError =
      typeof error.response?.data?.error === "string" ? error.response.data.error : null;

    if (error.response?.status === 400 && apiError) {
      return apiError;
    }
    if (error.response?.status === 503) {
      return apiError ?? "AI search unavailable — try Filter mode instead.";
    }
    if (!error.response) {
      return "Could not reach AI search. Check the backend and try again.";
    }
    return apiError ?? "AI search failed. Try Filter mode instead.";
  }

  return "AI search unavailable — try Filter mode instead.";
}

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
  hallStatus,
  selected,
  compact = false,
  onClick,
}: {
  hall: DiningHall;
  hallStatus?: HallStatus;
  selected?: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const visual = getHallVisual(hall);
  const statusKnown = Boolean(hallStatus);
  const isOpen = hallStatus?.is_open ?? false;
  const statusDot = isOpen ? "var(--se-success)" : "var(--se-text-faint)";
  const statusText = !statusKnown
    ? "Hours unavailable"
    : isOpen
      ? `Open${hallStatus?.meal_label ? ` · ${hallStatus.meal_label}` : ""}${hallStatus?.closes_at ? ` until ${hallStatus.closes_at}` : ""}`
      : "Closed";

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
        flexDirection: "column",
        width: "100%",
        textAlign: "left",
        padding: 0,
        overflow: "hidden",
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
          position: "relative",
          width: "100%",
          height: compact ? 116 : 164,
          overflow: "hidden",
          background: "var(--se-bg-subtle)",
        }}
      >
        {visual.src ? (
          <img
            src={visual.src}
            alt=""
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
              transform: hovered ? "scale(1.095)" : "scale(1.06)",
              transition: "transform 180ms ease",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--se-text-inverted)",
              fontSize: compact ? 32 : 44,
              fontWeight: "var(--se-weight-extrabold)",
              background: visual.accent,
            }}
          >
            {hall.name.slice(0, 1)}
          </div>
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.52) 100%)",
          }}
        />
        <span
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "5px 9px",
            borderRadius: "var(--se-radius-full)",
            background: isOpen ? "rgba(236, 253, 245, 0.92)" : "rgba(255, 255, 255, 0.9)",
            color: "var(--se-text-main)",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.04em",
            boxShadow: "0 6px 18px rgba(0, 0, 0, 0.12)",
            border: isOpen ? "1px solid rgba(16, 185, 129, 0.28)" : "1px solid rgba(0, 0, 0, 0.06)",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: selected ? "var(--se-primary)" : statusDot,
              boxShadow: selected ? "0 0 0 4px rgba(var(--se-primary-rgb), 0.14)" : "none",
            }}
          />
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: compact ? 175 : 220,
            }}
            title={statusText}
          >
            {statusText}
          </span>
        </span>
        <span
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            padding: "5px 10px",
            borderRadius: "var(--se-radius-full)",
            background: "rgba(255, 255, 255, 0.92)",
            color: "var(--se-text-main)",
            fontSize: "var(--se-text-xs)",
            fontWeight: "var(--se-weight-bold)",
            whiteSpace: "nowrap",
          }}
        >
          {hall.dishes.length} dishes
        </span>
      </div>

      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: compact ? "14px 16px" : "17px 18px 18px",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: "0 0 5px",
              fontSize: compact ? "var(--se-text-sm)" : "var(--se-text-base)",
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
              lineHeight: 1.35,
            }}
          >
            <IconMapPin size={12} color="var(--se-text-faint)" />
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {hall.location}
            </span>
          </p>
        </div>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: selected ? "var(--se-primary)" : "var(--se-bg-subtle)",
            color: selected ? "var(--se-text-inverted)" : "var(--se-text-faint)",
            transition: "background 140ms ease, color 140ms ease",
          }}
        >
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

function MacroBar({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const pCal = protein * 4;
  const cCal = carbs * 4;
  const fCal = fat * 9;
  const total = pCal + cCal + fCal || 1;

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        maxWidth: 160,
        height: 4,
        borderRadius: 2,
        overflow: "hidden",
        background: "var(--se-bg-subtle)",
      }}
    >
      <div style={{ width: `${(pCal / total) * 100}%`, background: "var(--se-macro-protein)" }} />
      <div style={{ width: `${(cCal / total) * 100}%`, background: "var(--se-macro-carbs)" }} />
      <div style={{ width: `${(fCal / total) * 100}%`, background: "var(--se-macro-fat)" }} />
    </div>
  );
}

function DishRow({
  dish,
  station,
  trayQuantity,
  index,
  onClick,
  onAddToTray,
}: {
  dish: Dish;
  station: string;
  trayQuantity: number;
  index: number;
  onClick: () => void;
  onAddToTray: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const inTray = trayQuantity > 0;

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToTray();
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 600);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        borderRadius: "var(--se-radius-md)",
        background: inTray
          ? "rgba(var(--se-primary-rgb), 0.04)"
          : hovered
            ? "var(--se-bg-elevated)"
            : "transparent",
        borderLeft: "none",
        cursor: "pointer",
        transition: "background 120ms ease, border-color 120ms ease",
        animation: "slideInRow 150ms ease both",
        animationDelay: `${Math.min(index, 15) * 30}ms`,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 44,
          minWidth: 44,
          height: 44,
          borderRadius: 12,
          background: "var(--se-bg-elevated)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid var(--se-border)",
          flexShrink: 0,
        }}
      >
        <FoodIcon dishName={dish.dish_name} category={dish.category as FoodCategory} size="md" />
      </div>

      {/* Name + serving + MacroBar */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            margin: 0,
            fontSize: "var(--se-text-sm)",
            fontWeight: "var(--se-weight-bold)",
            color: "var(--se-text-main)",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {dish.dish_name}
        </span>
        <span
          style={{
            fontSize: "var(--se-text-xs)",
            color: "var(--se-text-muted)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {dish.serving_size || "Serving size unavailable"}
          {dish.meal_period ? ` · ${dish.meal_period}` : ""}
          {station ? ` · ${station}` : ""}
        </span>
        <MacroBar protein={dish.protein} carbs={dish.carbohydrates} fat={dish.fat} />
      </div>

      {/* Macro text pills — hidden on mobile */}
      <div
        className="hidden md:flex"
        style={{
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--se-macro-cal)" }}>
          {dish.calories}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--se-macro-protein)" }}>
          {dish.protein}P
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--se-macro-carbs)" }}>
          {dish.carbohydrates}C
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--se-macro-fat)" }}>
          {dish.fat}F
        </span>
      </div>

      {/* Dietary badge — first flag only, hidden on very small screens */}
      {dish.dietary_flags?.[0] && (() => {
        const colors = FLAG_COLORS[dish.dietary_flags[0]] || FLAG_FALLBACK;
        return (
          <span
            className="hidden sm:inline-flex"
            style={{
              flexShrink: 0,
              padding: "3px 7px",
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

      {/* Tray quantity badge */}
      {inTray && (
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "rgba(var(--se-primary-rgb), 0.12)",
            color: "var(--se-primary)",
            fontSize: 11,
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {trayQuantity}
        </span>
      )}

      {/* Add button */}
      <button
        type="button"
        onClick={handleAdd}
        style={{
          width: justAdded || hovered ? "auto" : 32,
          minWidth: 32,
          height: 32,
          borderRadius: "var(--se-radius-full)",
          border: "1.5px solid var(--se-border)",
          background: justAdded
            ? "var(--se-success)"
            : "var(--se-bg-surface)",
          color: justAdded
            ? "var(--se-text-inverted)"
            : "var(--se-text-main)",
          fontSize: "var(--se-text-sm)",
          fontWeight: "var(--se-weight-bold)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          padding: justAdded ? "0 12px" : hovered ? "0 14px" : 0,
          transition: "all 120ms ease",
          animation: justAdded ? "addBounce 200ms ease" : "none",
        }}
      >
        {justAdded ? "\u2713" : hovered ? "Add" : "+"}
      </button>
    </div>
  );
}

export default function Menu() {
  const { hallId } = useParams<{ hallId: string }>();
  const navigate = useNavigate();
  const { addItem, getItemQuantity } = useMealTray();

  const [halls, setHalls] = useState<DiningHall[]>([]);
  const [selectedHall, setSelectedHall] = useState<DiningHall | null>(null);
  const [loading, setLoading] = useState(true);
  const [hallsError, setHallsError] = useState<string | null>(null);
  const [hallStatusMap, setHallStatusMap] = useState<HallStatusMap>({});
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState<"filter" | "ai">("filter");
  const [aiResults, setAiResults] = useState<Dish[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showHallPicker, setShowHallPicker] = useState(false);
  const [activeMealPeriod, setActiveMealPeriod] = useState("All");
  const [activeDietary, setActiveDietary] = useState<Set<string>>(new Set());
  const [excludedAllergens, setExcludedAllergens] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);

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
    axios
      .get<HallStatusMap>(`${API_BASE}/hall-status/`)
      .then((res) => setHallStatusMap(res.data ?? {}))
      .catch(() => setHallStatusMap({}));
  }, []);

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
    setAiResults(null);
    setAiError(null);
    setShowHallPicker(false);
    setAiLoading(false);
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

  const handleAddDishToTray = (dish: Dish) => {
    if (!selectedHall) return;

    addItem({
      dish_id: dish.dish_id,
      dish_name: dish.dish_name,
      hall: selectedHall.name,
      calories: dish.calories,
      protein: dish.protein,
      carbohydrates: dish.carbohydrates,
      fat: dish.fat,
      serving_size: dish.serving_size,
    });
  };

  useEffect(() => {
    if (searchMode !== "ai" || !search.trim()) {
      setAiResults(null);
      setAiLoading(false);
      setAiError(null);
      return;
    }
    setAiLoading(true);
    setAiError(null);
    const timer = setTimeout(async () => {
      try {
        const params: Record<string, string | number> = { q: search };
        if (selectedHall) params.hall = selectedHall.Dining_Hall_ID;
        const { data } = await axios.get(`${API_BASE}/semantic-search/`, { params });
        setAiResults(data.results);
      } catch (error) {
        setAiError(getAiErrorMessage(error));
        setAiResults([]);
      } finally {
        setAiLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [search, searchMode, selectedHall]);
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
    const sourceDishes = searchMode === "ai" ? (aiResults ?? selectedHall.dishes) : selectedHall.dishes;
    return sourceDishes.filter((d) => {
      if (searchMode === "filter" && search && !d.dish_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (activeMealPeriod !== "All" && d.meal_period !== activeMealPeriod) return false;
      for (const flag of activeDietary) {
        if (flag === "Gluten-Free") {
          if (d.allergens?.includes("Gluten")) return false;
        } else if (!d.dietary_flags?.includes(flag)) {
          return false;
        }
      }

      for (const allergen of excludedAllergens) {
        if (d.allergens?.includes(allergen)) return false;
      }

      return true;
    });
  }, [selectedHall, search, searchMode, aiResults, activeMealPeriod, activeDietary, excludedAllergens]);

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
      <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 100 }}>
        <section
          style={{
            padding: "10px 4px 0",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 10px",
              borderRadius: "var(--se-radius-full)",
              background: "var(--se-bg-elevated)",
              color: "var(--se-text-secondary)",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              border: "1px solid var(--se-border)",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--se-success)", marginRight: 8 }} />
            Live dining menus
          </div>
          <h1
            style={{
              margin: "18px 0 0",
              maxWidth: 760,
              fontSize: "clamp(2rem, 4vw, 2.75rem)",
              lineHeight: 1,
              color: "var(--se-text-main)",
              fontWeight: "var(--se-weight-extrabold)",
              letterSpacing: "-0.04em",
            }}
          >
            Pick a dining hall and explore today&apos;s stations.
          </h1>
        </section>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <Skeleton key={item} variant="rect" height={246} />
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {halls.map((hall) => (
              // UIUC DiningOptionIDs (hours endpoint) don’t necessarily equal DB IDs.
              // We map by name to the known UIUC option IDs used for menus.
              <HallSelectionCard
                key={hall.Dining_Hall_ID}
                hall={hall}
                hallStatus={(() => {
                  const name = hall.name.toLowerCase();
                  const optionId =
                    name.includes("ikenberry") ? "1"
                      : name.includes("pennsylvania") || name.includes("par") ? "2"
                        : name.includes("illinois street") || name.includes("isr") ? "3"
                          : name.includes("lincoln") || name.includes("allen") ? "5"
                            : name.includes("field of greens") ? "12"
                              : name.includes("kosher") ? "23"
                                : null;
                  return optionId ? hallStatusMap[optionId] : undefined;
                })()}
                onClick={() => selectHall(hall)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 100 }}>
      <section
        style={{
          ...panelStyle,
          padding: "26px 28px 24px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 20,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                borderRadius: "var(--se-radius-full)",
                background: "var(--se-bg-elevated)",
                color: "var(--se-text-secondary)",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                border: "1px solid var(--se-border)",
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--se-primary)" }} />
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
                  hallStatus={(() => {
                    const name = hall.name.toLowerCase();
                    const optionId =
                      name.includes("ikenberry") ? "1"
                        : name.includes("pennsylvania") || name.includes("par") ? "2"
                          : name.includes("illinois street") || name.includes("isr") ? "3"
                            : name.includes("lincoln") || name.includes("allen") ? "5"
                              : name.includes("field of greens") ? "12"
                                : name.includes("kosher") ? "23"
                                  : null;
                    return optionId ? hallStatusMap[optionId] : undefined;
                  })()}
                  selected={hall.Dining_Hall_ID === selectedHall.Dining_Hall_ID}
                  compact
                  onClick={() => selectHall(hall)}
                />
              ))}
            </div>
          </div>
        )}

      </section>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
            <section
              style={{
                ...panelStyle,
                padding: 22,
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
                  background: "var(--se-bg-elevated)",
                  border: "1px solid var(--se-border)",
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flex: "1 1 340px",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      padding: 4,
                      borderRadius: "var(--se-radius-full)",
                      background: "rgba(255,255,255,0.82)",
                      border: "1px solid var(--se-border)",
                      boxShadow: "var(--se-shadow-sm)",
                      flexShrink: 0,
                    }}
                  >
                    {(["filter", "ai"] as const).map((mode) => {
                      const active = searchMode === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            setSearchMode(mode);
                            setSearch("");
                            setAiResults(null);
                            setAiLoading(false);
                            setAiError(null);
                          }}
                          style={{
                            height: 38,
                            padding: "0 14px",
                            borderRadius: "var(--se-radius-full)",
                            border: "none",
                            background: active ? "var(--se-primary)" : "transparent",
                            color: active
                              ? "var(--se-text-inverted)"
                              : "var(--se-text-muted)",
                            fontSize: "var(--se-text-sm)",
                            fontWeight: "var(--se-weight-bold)",
                            cursor: "pointer",
                            transition: "all 140ms ease",
                          }}
                        >
                          {mode === "ai" ? "✦ AI" : "Filter"}
                        </button>
                      );
                    })}
                  </div>

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
                      {searchMode === "ai" && aiLoading ? (
                        <span style={{ fontSize: 13, color: "var(--se-primary)" }}>
                          ⏳
                        </span>
                      ) : (
                        <IconSearch size={16} color="var(--se-text-faint)" />
                      )}
                    </div>
                    <input
                      type="text"
                      aria-label={
                        searchMode === "ai" ? "AI semantic search" : "Search dishes"
                      }
                      placeholder={
                        searchMode === "ai"
                          ? "Try: high protein breakfast, light vegetarian..."
                          : "Search dishes"
                      }
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      style={{
                        width: "100%",
                        height: 46,
                        borderRadius: "var(--se-radius-full)",
                        border:
                          searchMode === "ai"
                            ? "1.5px solid rgba(var(--se-primary-rgb), 0.35)"
                            : "1px solid var(--se-border)",
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
                        onClick={() => {
                          setSearch("");
                          setAiResults(null);
                          setAiLoading(false);
                          setAiError(null);
                        }}
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
                    {searchMode === "ai"
                      ? aiLoading
                        ? "Searching with AI"
                        : hasActiveFilters
                          ? "AI + filters active"
                          : "AI search ready"
                      : hasActiveFilters
                        ? "Filters active"
                        : "Browsing all dishes"}
                  </span>
                  {searchMode === "ai" && !aiLoading && aiResults && !aiError && (
                    <span>{aiResults.length} AI matches</span>
                  )}
                  <span>{stationGroups.length} station groups</span>
                </div>
              </div>

              {searchMode === "ai" && aiError && (
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--se-text-sm)",
                    fontWeight: "var(--se-weight-semibold)",
                    color: "var(--se-error)",
                  }}
                >
                  {aiError}
                </p>
              )}

              {searchMode === "ai" && !aiError && aiResults && aiResults.length > 0 && (
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--se-text-xs)",
                    fontWeight: "var(--se-weight-semibold)",
                    color: "var(--se-text-faint)",
                  }}
                >
                  ✦ AI results for "{search}"
                </p>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => setFiltersOpen((o) => !o)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 14px",
                    borderRadius: "var(--se-radius-full)",
                    border: "1px solid var(--se-border)",
                    background: "var(--se-bg-surface)",
                    color: "var(--se-text-secondary)",
                    fontSize: "var(--se-text-sm)",
                    fontWeight: "var(--se-weight-semibold)",
                    cursor: "pointer",
                    transition: "all 140ms ease",
                  }}
                >
                  Dietary &amp; Allergens
                  <span style={{
                    display: "inline-flex",
                    transition: "transform 200ms ease",
                    transform: filtersOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}>
                    &#9662;
                  </span>
                  {(activeDietary.size + excludedAllergens.size) > 0 && (
                    <span
                      style={{
                        minWidth: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "var(--se-primary)",
                        color: "var(--se-text-inverted)",
                        fontSize: 11,
                        fontWeight: 800,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {activeDietary.size + excludedAllergens.size}
                    </span>
                  )}
                </button>

                <div
                  style={{
                    display: "grid",
                    gridTemplateRows: filtersOpen ? "1fr" : "0fr",
                    transition: "grid-template-rows 200ms ease",
                  }}
                >
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 14 }}>
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
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 16,
                        paddingLeft: 14,
                        borderLeft: "4px solid var(--se-primary)",
                      }}
                    >
                      <h2
                        style={{
                          margin: 0,
                          fontSize: "var(--se-text-base)",
                          fontWeight: "var(--se-weight-extrabold)",
                          color: "var(--se-text-main)",
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {station}
                      </h2>
                      <span
                        style={{
                          padding: "4px 10px",
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

                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {dishes.map((dish, i) => (
                        <DishRow
                          key={dish.dish_id}
                          dish={dish}
                          station={station}
                          index={i}
                          trayQuantity={getItemQuantity(dish.dish_id)}
                          onClick={() => navigate(`/dishes/${dish.dish_id}`)}
                          onAddToTray={() => handleAddDishToTray(dish)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
      </div>
    </div>
  );
}
