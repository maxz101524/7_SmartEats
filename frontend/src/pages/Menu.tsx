import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config";
import { FoodIcon } from "../components/FoodIcon";
import type { FoodCategory } from "../components/FoodIcon";
import { FilterChip } from "../components/FilterChip";
import { Button } from "../components/Button";
import Skeleton from "../components/Skeleton";
import MenuDateBadge from "../components/MenuDateBadge";
import { EmptyState } from "../components/EmptyState";
import { IconClose, IconMapPin, IconSearch } from "../components/Icons";
import { FLAG_COLORS, FLAG_FALLBACK } from "../utils/flagColors";
import { hallVisual, statusFor, statusLabel, type HallStatus, type HallStatusMap } from "../utils/halls";
import { useMealTray } from "../mealTray";
import "../styles/menu.css";

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

function getAiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const apiError =
      typeof error.response?.data?.error === "string" ? error.response.data.error : null;

    if (error.response?.status === 400 && apiError) {
      return apiError;
    }
    if (error.response?.status === 503) {
      return apiError ?? "Semantic search is unavailable. Try keyword search instead.";
    }
    if (!error.response) {
      return "Could not reach semantic search. Try keyword search instead.";
    }
    return apiError ?? "Semantic search failed. Try keyword search instead.";
  }

  return "Semantic search is unavailable. Try keyword search instead.";
}

function formatStationAnchor(station: string) {
  return (
    station
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "other"
  );
}

function stationCount(hall: DiningHall) {
  return new Set(hall.dishes.map((d) => d.serving_unit || "Other")).size;
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function StatusPill({ status }: { status?: HallStatus }) {
  return (
    <span className={`menu-status${status?.is_open ? " is-open" : ""}`} title={statusLabel(status)}>
      <span className="menu-status__dot" />
      {statusLabel(status)}
    </span>
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
  const visual = hallVisual(hall.name, hall.location);
  const empty = hall.dishes.length === 0;
  return (
    <button
      type="button"
      aria-label={hall.name}
      onClick={onClick}
      className={`menu-hall${compact ? " menu-hall--compact" : ""}${selected ? " is-selected" : ""}${empty ? " is-empty" : ""}`}
    >
      <div className="menu-hall__photo">
        {visual.src ? (
          <img src={visual.src} alt="" loading="lazy" />
        ) : (
          <span className="menu-hall__fallback">{hall.name.slice(0, 1)}</span>
        )}
        <StatusPill status={hallStatus} />
      </div>
      <div className="menu-hall__body">
        <span className="menu-hall__name">{hall.name}</span>
        <span className="menu-hall__meta se-mono">
          {empty ? "No menu posted" : `${hall.dishes.length} dishes · ${stationCount(hall)} stations`}
        </span>
      </div>
    </button>
  );
}

function MacroBar({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const total = protein * 4 + carbs * 4 + fat * 9 || 1;
  return (
    <span className="menu-row__bar" aria-hidden="true">
      <span style={{ width: `${(protein * 400) / total}%`, background: "var(--se-macro-protein)" }} />
      <span style={{ width: `${(carbs * 400) / total}%`, background: "var(--se-macro-carbs)" }} />
      <span style={{ width: `${(fat * 900) / total}%`, background: "var(--se-macro-fat)" }} />
    </span>
  );
}

function DishRow({
  dish,
  trayQuantity,
  onClick,
  onAddToTray,
}: {
  dish: Dish;
  trayQuantity: number;
  onClick: () => void;
  onAddToTray: () => void;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const inTray = trayQuantity > 0;
  const flag = dish.dietary_flags?.[0];
  const flagColors = flag ? FLAG_COLORS[flag] || FLAG_FALLBACK : null;

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToTray();
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 700);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
      className={`menu-row${inTray ? " is-in-tray" : ""}`}
    >
      <div className="menu-row__icon">
        <FoodIcon dishName={dish.dish_name} category={dish.category as FoodCategory} size="sm" />
      </div>
      <div className="menu-row__main">
        <span className="menu-row__name">{dish.dish_name}</span>
        <span className="menu-row__sub">
          <span>
            {dish.serving_size || "Serving size unavailable"}
            {dish.meal_period ? ` · ${dish.meal_period}` : ""}
          </span>
          <MacroBar protein={dish.protein} carbs={dish.carbohydrates} fat={dish.fat} />
        </span>
        <span className="menu-row__mobile-macros">
          {dish.calories} kcal · {dish.protein}P · {dish.carbohydrates}C · {dish.fat}F
        </span>
      </div>
      <span className="menu-row__num menu-row__num--kcal">{dish.calories}</span>
      <span className="menu-row__num">{dish.protein}<small>g</small></span>
      <span className="menu-row__num">{dish.carbohydrates}<small>g</small></span>
      <span className="menu-row__num">{dish.fat}<small>g</small></span>
      <span className="menu-row__flag">
        {flag && flagColors && (
          <span className="menu-flag" style={{ background: flagColors.bg, color: flagColors.text }}>
            {flag}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={handleAdd}
        aria-label="Add"
        title={inTray ? `${trayQuantity} in tray. Add another` : "Add to tray"}
        className={`menu-add${inTray ? " is-in-tray" : ""}${justAdded ? " just-added" : ""}`}
      >
        {justAdded ? "\u2713" : inTray ? trayQuantity : "+"}
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

  const activeAnchor = useActiveAnchor(stationSections.map((s) => s.anchor));

  const sortedHalls = useMemo(
    () =>
      [...halls].sort((a, b) => {
        const emptyDiff = Number(a.dishes.length === 0) - Number(b.dishes.length === 0);
        if (emptyDiff) return emptyDiff;
        const openA = statusFor(a.name, hallStatusMap)?.is_open ? 1 : 0;
        const openB = statusFor(b.name, hallStatusMap)?.is_open ? 1 : 0;
        return openB - openA || b.dishes.length - a.dishes.length;
      }),
    [halls, hallStatusMap],
  );

  const resetFilters = () => {
    setSearch("");
    setAiResults(null);
    setAiError(null);
    setActiveMealPeriod("All");
    setActiveDietary(new Set());
    setExcludedAllergens(new Set());
  };

  if (!selectedHall) {
    return (
      <div className="menu-page">
        <header className="menu-head">
          <div>
            <MenuDateBadge />
          </div>
          <h1>Pick a dining hall</h1>
          <p>
            Each menu is grouped by station, with calories and macros for every dish. Halls that are open right now
            are listed first.
          </p>
        </header>

        {loading ? (
          <div className="menu-hallgrid">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <Skeleton key={item} variant="rect" height={240} />
            ))}
          </div>
        ) : hallsError ? (
          <div className="menu-empty" style={{ textAlign: "center" }}>
            <p style={{ color: "var(--se-error)", fontWeight: 600, margin: 0 }}>Could not load dining halls</p>
            <div style={{ marginTop: "var(--se-space-4)" }}>
              <Button variant="secondary" size="sm" onClick={fetchHalls}>
                Try Again
              </Button>
            </div>
          </div>
        ) : (
          <div className="menu-hallgrid">
            {sortedHalls.map((hall) => (
              <HallSelectionCard
                key={hall.Dining_Hall_ID}
                hall={hall}
                hallStatus={statusFor(hall.name, hallStatusMap)}
                onClick={() => selectHall(hall)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const visual = hallVisual(selectedHall.name, selectedHall.location);
  const filterCount = activeDietary.size + excludedAllergens.size;
  const isSemantic = searchMode === "ai";

  return (
    <div className="menu-page">
      <section className="menu-hallhead">
        <div className="menu-hallhead__photo">{visual.src && <img src={visual.src} alt="" />}</div>
        <div style={{ minWidth: 0 }}>
          <StatusPill status={statusFor(selectedHall.name, hallStatusMap)} />
          <h1>{selectedHall.name}</h1>
          <p className="menu-hallhead__facts">
            <span>
              <IconMapPin size={14} color="var(--se-text-faint)" />
              {selectedHall.location}
            </span>
            <span>
              <span className="se-mono">{selectedHall.dishes.length}</span> dishes
            </span>
            <span>
              <span className="se-mono">{stationCount(selectedHall)}</span> stations
            </span>
          </p>
        </div>
        <button
          type="button"
          className="menu-btn"
          onClick={() => setShowHallPicker((open) => !open)}
          aria-expanded={showHallPicker}
        >
          Change hall
          <span className="menu-btn__chev">
            <ChevronRight />
          </span>
        </button>
      </section>

      {showHallPicker && (
        <section className="menu-picker">
          <div className="menu-picker__head">
            <span className="se-eyebrow">Switch hall · filters are kept</span>
            <button
              type="button"
              className="menu-search__clear"
              style={{ position: "static", transform: "none" }}
              onClick={() => setShowHallPicker(false)}
              aria-label="Close hall chooser"
            >
              <IconClose size={14} color="var(--se-text-muted)" />
            </button>
          </div>
          <div className="menu-hallgrid menu-hallgrid--compact">
            {sortedHalls.map((hall) => (
              <HallSelectionCard
                key={hall.Dining_Hall_ID}
                hall={hall}
                hallStatus={statusFor(hall.name, hallStatusMap)}
                selected={hall.Dining_Hall_ID === selectedHall.Dining_Hall_ID}
                compact
                onClick={() => selectHall(hall)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="menu-toolbar" aria-label="Search and filters">
        {mealPeriods.length > 2 && (
          <div className="menu-toolbar__row">
            <div className="menu-seg se-no-scrollbar" role="group" aria-label="Meal period">
              {mealPeriods.map((period) => (
                <button
                  key={period}
                  type="button"
                  aria-pressed={activeMealPeriod === period}
                  onClick={() => setActiveMealPeriod(period)}
                >
                  {period === "All" ? "All day" : period}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="menu-toolbar__row menu-toolbar__row--search">
          <div className="menu-seg menu-seg--ink" role="group" aria-label="Search mode">
            {(["filter", "ai"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={searchMode === mode}
                title={mode === "ai" ? "Plain-English search ranked by an embedding model" : "Match dish names"}
                onClick={() => {
                  setSearchMode(mode);
                  setSearch("");
                  setAiResults(null);
                  setAiLoading(false);
                  setAiError(null);
                }}
              >
                {mode === "ai" ? "Semantic" : "Keyword"}
              </button>
            ))}
          </div>

          <div className={`menu-search${isSemantic ? " is-semantic" : ""}`}>
            <span className="menu-search__icon">
              {isSemantic && aiLoading ? <span className="menu-spinner" /> : <IconSearch size={16} color="currentColor" />}
            </span>
            <input
              type="text"
              aria-label={isSemantic ? "AI semantic search" : "Search dishes"}
              placeholder={isSemantic ? "e.g. high-protein breakfast without eggs" : "Search dishes by name"}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                type="button"
                className="menu-search__clear"
                onClick={() => {
                  setSearch("");
                  setAiResults(null);
                  setAiLoading(false);
                  setAiError(null);
                }}
                aria-label="Clear search"
              >
                <IconClose size={13} color="var(--se-text-muted)" />
              </button>
            )}
          </div>

          <button
            type="button"
            className="menu-btn menu-filterbtn"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <span className="menu-filterbtn__long">Diet &amp; allergens</span>
            <span className="menu-filterbtn__short">Filters</span>
            {filterCount > 0 && <span className="menu-filterbtn__count se-mono">{filterCount}</span>}
          </button>
        </div>

        <div className={`menu-filters${filtersOpen ? " is-open" : ""}`}>
          <div className="menu-filters__inner">
            <div className="menu-filters__groups">
              <div>
                <span className="se-eyebrow">Dietary</span>
                <div className="menu-filters__chips">
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
                <span className="se-eyebrow">Exclude allergens</span>
                <div className="menu-filters__chips">
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
      </section>

      <div className="menu-summary" aria-live="polite">
        <span>
          {isSemantic && aiError ? (
            <span className="menu-summary__error">{aiError}</span>
          ) : isSemantic && aiLoading ? (
            "Searching…"
          ) : (
            <>
              Showing <strong className="se-mono">{filteredDishes.length}</strong>
              {filteredDishes.length !== selectedHall.dishes.length && (
                <> of <span className="se-mono">{selectedHall.dishes.length}</span></>
              )}{" "}
              dishes across <strong className="se-mono">{stationGroups.length}</strong> stations
              {isSemantic && aiResults && search ? <> · best semantic matches for &ldquo;{search}&rdquo;</> : null}
            </>
          )}
        </span>
        {hasActiveFilters && (
          <button type="button" className="menu-summary__reset" onClick={resetFilters}>
            Clear search &amp; filters
          </button>
        )}
      </div>

      {stationGroups.length === 0 ? (
        <section className="menu-empty">
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
        <div className="menu-layout">
          <nav className="menu-rail se-no-scrollbar" aria-label="Stations">
            <span className="menu-rail__title se-eyebrow">Stations</span>
            {stationSections.map(({ station, dishes, anchor }) => (
              <a
                key={anchor}
                href={`#${anchor}`}
                aria-label={station}
                className={activeAnchor === anchor ? "is-active" : undefined}
              >
                <span>{station}</span>
                <span className="menu-rail__count se-mono" aria-hidden="true">
                  {dishes.length}
                </span>
              </a>
            ))}
          </nav>

          <div className="menu-sections">
            {stationSections.map(({ station, dishes, anchor }) => (
              <section key={anchor} id={anchor} className="menu-station">
                <header className="menu-station__head">
                  <h2>{station}</h2>
                  <span className="menu-station__count se-mono">
                    {dishes.length} {dishes.length === 1 ? "dish" : "dishes"}
                  </span>
                </header>
                <div className="menu-table">
                  <div className="menu-colhead" aria-hidden="true">
                    <span />
                    <span>Dish</span>
                    <span>kcal</span>
                    <span>Prot</span>
                    <span>Carb</span>
                    <span>Fat</span>
                    <span className="menu-colhead__flag" />
                    <span />
                  </div>
                  {dishes.map((dish) => (
                    <DishRow
                      key={dish.dish_id}
                      dish={dish}
                      trayQuantity={getItemQuantity(dish.dish_id)}
                      onClick={() => navigate(`/dishes/${dish.dish_id}`)}
                      onAddToTray={() => handleAddDishToTray(dish)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Scroll-spy: the station section currently nearest the top of the viewport. */
function useActiveAnchor(anchors: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = anchors.join("|");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !anchors.length) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        const first = anchors.find((a) => visible.has(a));
        if (first) setActive(first);
      },
      { rootMargin: "-90px 0px -55% 0px" },
    );
    for (const anchor of anchors) {
      const el = document.getElementById(anchor);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return active ?? anchors[0] ?? null;
}
