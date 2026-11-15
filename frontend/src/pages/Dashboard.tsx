import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config";
import { MealTrayCard } from "../components/MealTrayCard";
import { FoodIcon } from "../components/FoodIcon";
import { useToast } from "../components/useToast";
import { useMealTray } from "../mealTray";
import Skeleton from "../components/Skeleton";
import { statusFor, statusLabel, type HallStatusMap } from "../utils/halls";
import "../styles/dashboard.css";

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface DiningHall {
  Dining_Hall_ID: number;
  name: string;
  location: string;
  dishes: unknown[];
}

interface DailyIntake {
  consumed: { calories: number; protein: number; carbs: number; fat: number };
  goals: { calories: number; protein: number; carbs: number; fat: number } | null;
  goals_set: boolean;
}

interface Recommendation {
  dish_id: number;
  dish_name: string;
  hall_name: string;
  reason: string;
  calories: number;
  meal_period: string;
}

interface DishDetailPayload {
  dish_id: number;
  dish_name: string;
  dining_hall__name: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  serving_size?: string;
}

interface RecommendationResponse {
  recommendations: Recommendation[];
  tip: string;
  cached?: boolean;
  snapshot_date?: string;
  generated_at?: string;
}


/* ── Shared section-label style ─────────────────────────────────────────────── */

/* ── Formatted date ─────────────────────────────────────────────────────────── */

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function getLocalDateKey(): string {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRecommendationCacheKey(token: string): string {
  return `smarteats_dashboard_recommendations:${token.slice(0, 12)}`;
}

function readRecommendationCache(token: string): RecommendationResponse | null {
  try {
    const raw = localStorage.getItem(getRecommendationCacheKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecommendationResponse;
    if (!parsed?.snapshot_date || parsed.snapshot_date !== getLocalDateKey()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeRecommendationCache(token: string, data: RecommendationResponse) {
  localStorage.setItem(getRecommendationCacheKey(token), JSON.stringify(data));
}

function formatRecommendationTimestamp(timestamp?: string): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ── Component ──────────────────────────────────────────────────────────────── */

export default function Dashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const { addItem, getItemQuantity } = useMealTray();

  /* Auth guard */
  useEffect(() => {
    if (!localStorage.getItem("authToken")) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  /* State */
  const [halls, setHalls] = useState<DiningHall[]>([]);
  const [hallStatus, setHallStatus] = useState<HallStatusMap>({});
  const [hallsLoading, setHallsLoading] = useState(true);

  const [intake, setIntake] = useState<DailyIntake | null>(null);
  const [intakeLoading, setIntakeLoading] = useState(true);

  const [recData, setRecData] = useState<RecommendationResponse | null>(null);
  const [recLoading, setRecLoading] = useState(true);
  const [recError, setRecError] = useState(false);
  const [recRefreshing, setRecRefreshing] = useState(false);
  const [addingDishId, setAddingDishId] = useState<number | null>(null);

  const firstName = localStorage.getItem("userFirstName") ?? "";
  const recUpdatedLabel = formatRecommendationTimestamp(recData?.generated_at);

  /* Fetch dining halls */
  useEffect(() => {
    axios
      .get<DiningHall[]>(`${API_BASE}/halls/`)
      .then((res) => setHalls(res.data))
      .catch(() => {
        /* halls are non-critical — silently degrade */
      })
      .finally(() => setHallsLoading(false));
    axios
      .get<HallStatusMap>(`${API_BASE}/hall-status/`)
      .then((res) => setHallStatus(res.data ?? {}))
      .catch(() => setHallStatus({}));
  }, []);

  /* Fetch daily intake (auth required) */
  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) return;
    axios
      .get<DailyIntake>(`${API_BASE}/daily-intake/`, {
        headers: { Authorization: `Token ${token}` },
      })
      .then((res) => setIntake(res.data))
      .catch(() => {
        /* intake fetch failed — degrade gracefully */
      })
      .finally(() => setIntakeLoading(false));
  }, []);

  /* Fetch AI recommendations */
  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      setRecLoading(false);
      return;
    }

    const cached = readRecommendationCache(token);
    if (cached) {
      setRecData(cached);
      setRecError(false);
      setRecLoading(false);
      return;
    }

    axios
      .post<RecommendationResponse>(
        `${API_BASE}/ai-recommend/`,
        {},
        { headers: { Authorization: `Token ${token}` } },
      )
      .then((res) => {
        setRecData(res.data);
        setRecError(false);
        writeRecommendationCache(token, res.data);
      })
      .catch(() => setRecError(true))
      .finally(() => setRecLoading(false));
  }, []);

  const refreshRecommendations = async () => {
    const token = localStorage.getItem("authToken");
    if (!token || recRefreshing) return;

    setRecRefreshing(true);
    try {
      const res = await axios.post<RecommendationResponse>(
        `${API_BASE}/ai-recommend/`,
        { force: true },
        { headers: { Authorization: `Token ${token}` } },
      );
      setRecData(res.data);
      setRecError(false);
      writeRecommendationCache(token, res.data);
      toast.success("Recommendations refreshed.");
    } catch {
      toast.error("Could not refresh recommendations.");
      if (!recData) setRecError(true);
    } finally {
      setRecRefreshing(false);
      setRecLoading(false);
    }
  };

  const handleAddRecommendationToTray = async (
    event: React.MouseEvent<HTMLButtonElement>,
    rec: Recommendation,
  ) => {
    event.stopPropagation();
    if (addingDishId === rec.dish_id) return;

    setAddingDishId(rec.dish_id);
    try {
      const { data } = await axios.get<DishDetailPayload>(
        `${API_BASE}/dishes/${rec.dish_id}`,
      );
      const result = addItem({
        dish_id: data.dish_id,
        dish_name: data.dish_name,
        hall: data.dining_hall__name || rec.hall_name,
        calories: data.calories,
        protein: data.protein,
        carbohydrates: data.carbohydrates,
        fat: data.fat,
        serving_size: data.serving_size,
      });
      const quantity =
        result.items.find((item) => item.dish_id === rec.dish_id)?.quantity || 1;

      if (result.added || quantity === 1) {
        toast.success(`${rec.dish_name} added to your tray.`);
      } else {
        toast.info(`${rec.dish_name} now has ${quantity} servings in your tray.`);
      }
    } catch {
      toast.error("Could not add this dish to the tray.");
    } finally {
      setAddingDishId(null);
    }
  };

  /* ── Render ─────────────────────────────────────────────────────────────── */

  const servingHalls = halls
    .filter((h) => h.dishes.length > 0)
    .map((h) => ({ ...h, status: statusFor(h.name, hallStatus) }))
    .sort((a, b) => Number(b.status?.is_open ?? false) - Number(a.status?.is_open ?? false));

  const goals = intake?.goals_set ? intake.goals : null;
  const consumed = intake?.consumed;
  const pct = (value: number, goal: number) => (goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0);

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <p className="se-eyebrow">{formatDate()}</p>
          <h1>{firstName ? `${firstName}'s day` : "Your day"}</h1>
        </div>
        <div className="dash-head__actions">
          <Link to="/menu" className="menu-btn">Browse menus</Link>
          <Link to="/aimeals" className="menu-btn">Plan with AI</Link>
        </div>
      </header>

      {/* ── Today's intake ── */}
      <section className="dash-today" aria-label="Today's intake">
        {intakeLoading ? (
          <Skeleton variant="rect" height={120} />
        ) : goals && consumed ? (
          <>
            <div className="dash-today__kcal">
              <span className="se-eyebrow">Calories today</span>
              <div className="dash-today__big">
                <span className="se-mono">{consumed.calories.toLocaleString()}</span>
                <span className="dash-today__of">/ {goals.calories.toLocaleString()} kcal</span>
              </div>
              <div className="dash-meter dash-meter--lg">
                <span style={{ width: `${pct(consumed.calories, goals.calories)}%`, background: "var(--se-macro-cal)" }} />
              </div>
              <p className="dash-today__left">
                {goals.calories - consumed.calories > 0
                  ? `${(goals.calories - consumed.calories).toLocaleString()} kcal left today`
                  : "Calorie target reached"}
              </p>
            </div>
            <div className="dash-today__macros">
              {(
                [
                  ["Protein", consumed.protein, goals.protein, "var(--se-macro-protein)"],
                  ["Carbs", consumed.carbs, goals.carbs, "var(--se-macro-carbs)"],
                  ["Fat", consumed.fat, goals.fat, "var(--se-macro-fat)"],
                ] as const
              ).map(([label, value, goal, color]) => (
                <div key={label} className="dash-macro">
                  <span className="dash-macro__label">{label}</span>
                  <span className="se-mono dash-macro__value">
                    {value}
                    <span>/{goal}g</span>
                  </span>
                  <div className="dash-meter">
                    <span style={{ width: `${pct(value, goal)}%`, background: color }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : intake && !intake.goals_set ? (
          <div className="dash-today__empty">
            <p>Set daily targets to see your intake against them.</p>
            <Link to="/profile" className="menu-btn">Set targets</Link>
          </div>
        ) : (
          <div className="dash-today__empty">
            <p>Nothing logged yet today. Add dishes to your tray and log them as a meal.</p>
          </div>
        )}
      </section>

      <div className="dash-grid">
        <div className="dash-main">
          {/* ── Suggestions ── */}
          <section>
            <header className="dash-section__head">
              <div>
                <h2>Suggested for today</h2>
                <p className="dash-sub">
                  Ranked from today&apos;s menu for your goal
                  {recUpdatedLabel ? ` · updated ${recUpdatedLabel}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="menu-btn"
                onClick={refreshRecommendations}
                disabled={recRefreshing}
              >
                {recRefreshing ? "Refreshing…" : "Refresh"}
              </button>
            </header>

            {recLoading ? (
              <Skeleton variant="rect" height={210} />
            ) : recError ? (
              <p className="dash-sub">Could not load suggestions.</p>
            ) : (
              <div className="dash-table">
                {recData?.recommendations.map((rec) => {
                  const inTray = getItemQuantity(rec.dish_id) > 0;
                  return (
                    <div
                      key={rec.dish_id}
                      role="button"
                      tabIndex={0}
                      className="dash-rec"
                      onClick={() => navigate(`/dishes/${rec.dish_id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") navigate(`/dishes/${rec.dish_id}`);
                      }}
                    >
                      <span className="menu-row__icon">
                        <FoodIcon dishName={rec.dish_name} size="sm" />
                      </span>
                      <span className="dash-rec__main">
                        <span className="dash-rec__name">{rec.dish_name}</span>
                        <span className="dash-rec__meta">
                          {rec.hall_name}
                          {rec.meal_period ? ` · ${rec.meal_period}` : ""}
                        </span>
                        <span className="dash-rec__reason se-mono">{rec.reason}</span>
                      </span>
                      <span className="dash-rec__kcal se-mono">
                        {rec.calories}
                        <small> kcal</small>
                      </span>
                      <button
                        type="button"
                        className={`dash-rec__add${inTray ? " is-in-tray" : ""}`}
                        disabled={addingDishId === rec.dish_id}
                        onClick={(event) => handleAddRecommendationToTray(event, rec)}
                      >
                        {inTray ? "Add another" : "Add to tray"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {recData?.tip && !recLoading && <p className="dash-tip">{recData.tip}</p>}
          </section>

          {/* ── Dining halls ── */}
          <section>
            <header className="dash-section__head">
              <h2>Dining halls</h2>
              <Link to="/menu" className="home-link">All menus →</Link>
            </header>
            {hallsLoading ? (
              <Skeleton variant="rect" height={160} />
            ) : (
              <div className="dash-table">
                {servingHalls.map((hall) => (
                  <Link key={hall.Dining_Hall_ID} to={`/menu/${hall.Dining_Hall_ID}`} className="dash-hall">
                    <span className={`menu-status${hall.status?.is_open ? " is-open" : ""}`}>
                      <span className="menu-status__dot" />
                    </span>
                    <span className="dash-hall__name">{hall.name}</span>
                    <span className="dash-hall__status">{statusLabel(hall.status)}</span>
                    <span className="se-mono dash-hall__count">{hall.dishes.length} dishes</span>
                    <span aria-hidden="true" className="dash-hall__arrow">→</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="dash-side">
          <MealTrayCard onMealLogged={setIntake} />
        </aside>
      </div>
    </div>
  );
}
