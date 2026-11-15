import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE, DATA_MODE } from "../config";
import MenuDateBadge from "../components/MenuDateBadge";
import NutritionLabel from "../components/NutritionLabel";
import { IconSparkle } from "../components/Icons";
import { useToast } from "../components/useToast";
import { hallVisual, statusFor, statusLabel, type HallStatusMap } from "../utils/halls";
import "../styles/home.css";

interface HomeDish {
  dish_id: number;
  dish_name: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber?: number | null;
  sodium?: number | null;
  serving_size?: string;
  serving_unit?: string;
  meal_period?: string;
  dietary_flags?: string[];
  nutrition_source?: string;
}

interface HomeHall {
  Dining_Hall_ID: number;
  name: string;
  location: string;
  dishes: HomeDish[];
}

type HallDish = HomeDish & { hall: string; hallId: number };

const PIPELINE = [
  { step: "01", title: "UIUC Dining", body: "A scheduled GitHub Action pulls the menu for every hall from UIUC Dining." },
  { step: "02", title: "Gemini", body: "New dishes get nutrition estimates: calories, macros, fiber, sodium, serving size." },
  { step: "03", title: "MiniLM", body: "Each dish is embedded into a 384-dim vector for plain-English search." },
  { step: "04", title: "Static JSON", body: "Results are committed as data files and deployed to the edge on Vercel." },
  { step: "05", title: "Your browser", body: "Search, tracking and planning run client-side, plus one serverless call for AI chat." },
];

function MacroMeter({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  return (
    <div className="home-meter">
      <div className="home-meter__head">
        <span>{label}</span>
        <span className="se-mono">
          {value}
          <span className="home-meter__goal">/{goal}</span>
        </span>
      </div>
      <div className="home-meter__track">
        <span style={{ width: `${Math.min(100, (value / goal) * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const toast = useToast();
  const isLoggedIn = Boolean(localStorage.getItem("authToken"));
  const [halls, setHalls] = useState<HomeHall[]>([]);
  const [statusMap, setStatusMap] = useState<HallStatusMap>({});
  const [catalogSize, setCatalogSize] = useState<number | null>(null);

  useEffect(() => {
    axios
      .get<HomeHall[]>(`${API_BASE}/halls/`)
      .then((res) => setHalls(Array.isArray(res.data) ? res.data : []))
      .catch(() => setHalls([]));
    axios
      .get<HallStatusMap>(`${API_BASE}/hall-status/`)
      .then((res) => setStatusMap(res.data ?? {}))
      .catch(() => setStatusMap({}));
    axios
      .get<{ total_dishes?: number }>(`${API_BASE}/dish-stats/`)
      .then((res) => setCatalogSize(res.data.total_dishes ?? null))
      .catch(() => setCatalogSize(null));
  }, []);

  const servingHalls = useMemo(
    () =>
      halls
        .filter((h) => h.dishes.length > 0)
        .map((h) => ({ ...h, status: statusFor(h.name, statusMap) }))
        .sort(
          (a, b) =>
            Number(b.status?.is_open ?? false) - Number(a.status?.is_open ?? false) ||
            b.dishes.length - a.dishes.length,
        ),
    [halls, statusMap],
  );

  const todaysDishes: HallDish[] = useMemo(
    () => servingHalls.flatMap((h) => h.dishes.map((d) => ({ ...d, hall: h.name, hallId: h.Dining_Hall_ID }))),
    [servingHalls],
  );

  const openCount = servingHalls.filter((h) => h.status?.is_open).length;

  const featured = useMemo(() => {
    const candidates = todaysDishes.filter((d) => d.calories > 0 && d.protein >= 20 && d.nutrition_source);
    return [...candidates].sort((a, b) => b.protein / b.calories - a.protein / a.calories)[0] ?? null;
  }, [todaysDishes]);

  const picks = useMemo(() => {
    const pool = todaysDishes.filter((d) => d.calories > 0 && d.nutrition_source);
    const used = new Set<number>(featured ? [featured.dish_id] : []);
    const usedHalls = new Set<string>();
    // Highest score, preferring a hall that hasn't been featured yet so picks span campus.
    const best = (items: HallDish[], score: (d: HallDish) => number) => {
      const ranked = [...items].filter((d) => !used.has(d.dish_id)).sort((a, b) => score(b) - score(a));
      const top = ranked.slice(0, 8);
      const winner = top.find((d) => !usedHalls.has(d.hall)) ?? ranked[0];
      if (winner) {
        used.add(winner.dish_id);
        usedHalls.add(winner.hall);
      }
      return winner;
    };
    type Metric = "kcal" | "protein" | "fiber";
    const candidates: [string, Metric, HallDish | undefined][] = [
      ["Most protein", "protein", best(pool, (d) => d.protein)],
      ["Lean, under 350 kcal", "kcal", best(pool.filter((d) => d.calories <= 350), (d) => d.protein / d.calories)],
      ["Best vegan option", "protein", best(pool.filter((d) => d.dietary_flags?.includes("Vegan")), (d) => d.protein)],
      ["Most fiber", "fiber", best(pool, (d) => Number(d.fiber ?? 0))],
    ];
    return candidates
      .filter((c): c is [string, Metric, HallDish] => Boolean(c[2]))
      .map(([label, metric, dish]) => ({ label, metric, dish }));
  }, [todaysDishes, featured]);

  const previewRows = useMemo(
    () => [...todaysDishes].filter((d) => d.calories > 0).sort((a, b) => b.protein - a.protein).slice(0, 3),
    [todaysDishes],
  );

  const startDemo = async () => {
    try {
      const { data } = await axios.post(`${API_BASE}/demo-login/`);
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("userFirstName", data.first_name);
      navigate("/dashboard");
    } catch {
      toast.error("Couldn't open the demo account. Please try again.");
    }
  };

  return (
    <div className="home">
      {/* ── Hero ── */}
      <section className="home-hero">
        <div className="home-hero__copy">
          <div className="reveal" style={{ ["--d" as string]: "0ms" }}>
            <MenuDateBadge />
          </div>
          <h1 className="home-hero__title reveal" style={{ ["--d" as string]: "60ms" }}>
            Eat smarter at <em>Illinois</em>.
          </h1>
          <p className="home-hero__lede reveal" style={{ ["--d" as string]: "120ms" }}>
            Every UIUC dining hall menu with nutrition for every dish, an AI meal planner that only
            recommends what&apos;s actually being served, and a tracker for what you eat.
          </p>
          <div className="home-hero__actions reveal" style={{ ["--d" as string]: "180ms" }}>
            <Link to="/menu" className="home-btn home-btn--primary">
              Browse today&apos;s menus <span aria-hidden="true">→</span>
            </Link>
            <Link to="/aimeals" className="home-btn home-btn--ghost">
              <IconSparkle size={15} /> Plan a meal with AI
            </Link>
          </div>
          <dl className="home-hero__stats reveal" style={{ ["--d" as string]: "240ms" }}>
            <div>
              <dt className="se-eyebrow">Open now</dt>
              <dd className="se-mono">
                {servingHalls.length ? `${openCount}/${servingHalls.length}` : "—"}
                <span> halls</span>
              </dd>
            </div>
            <div>
              <dt className="se-eyebrow">On the menu</dt>
              <dd className="se-mono">
                {todaysDishes.length || "—"}
                <span> dishes</span>
              </dd>
            </div>
            <div>
              <dt className="se-eyebrow">Catalogued</dt>
              <dd className="se-mono">
                {catalogSize ?? "—"}
                <span> total</span>
              </dd>
            </div>
          </dl>
        </div>

        <div className="home-hero__stage reveal" style={{ ["--d" as string]: "160ms" }} aria-hidden={!featured}>
          {featured ? (
            <>
              <div className="home-stage__chip">
                <span className="home-dot" />
                Top protein pick today
              </div>
              <Link to={`/dishes/${featured.dish_id}`} className="home-stage__label" aria-label={`View ${featured.dish_name}`}>
                <NutritionLabel
                  dish={featured}
                  footnote={`${featured.hall}${featured.serving_unit ? ` · ${featured.serving_unit}` : ""}${featured.meal_period ? ` · ${featured.meal_period}` : ""}`}
                />
              </Link>
              <div className="home-stage__chat">
                <div className="home-bubble home-bubble--user">High protein, under 600 kcal?</div>
                <div className="home-bubble home-bubble--ai">
                  <IconSparkle size={13} color="var(--se-primary)" />
                  <span>
                    Try the <strong>{featured.dish_name}</strong> at {featured.hall.replace(/ Dining (Center|Hall)$/, "")}:{" "}
                    <span className="se-mono">{featured.protein}g</span> protein for{" "}
                    <span className="se-mono">{featured.calories}</span> kcal.
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="home-stage__placeholder" />
          )}
        </div>
      </section>

      {/* ── Picks from today's menu ── */}
      {picks.length > 0 && (
        <section className="home-section home-section--tight">
          <header className="home-section__head">
            <div>
              <p className="se-eyebrow">From today&apos;s menu</p>
              <h2>A few good places to start</h2>
            </div>
          </header>
          <div className="home-picks">
            {picks.map(({ label, metric, dish }) => (
              <Link key={label} to={`/dishes/${dish.dish_id}`} className="home-pick">
                <span className="home-pick__label se-eyebrow">{label}</span>
                <h3 className="home-pick__name">{dish.dish_name}</h3>
                <p className="home-pick__where">
                  {dish.hall}
                  {dish.meal_period ? ` · ${dish.meal_period}` : ""}
                </p>
                <dl className="home-pick__macros">
                  {(
                    [
                      ["kcal", dish.calories],
                      ["protein", `${dish.protein}g`],
                      metric === "fiber" ? ["fiber", `${Math.round(Number(dish.fiber ?? 0))}g`] : ["carbs", `${dish.carbohydrates}g`],
                      ["fat", `${dish.fat}g`],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className={k === metric ? "is-key" : undefined}>
                      <dd className="se-mono">{v}</dd>
                      <dt>{k}</dt>
                    </div>
                  ))}
                </dl>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Halls ── */}
      {servingHalls.length > 0 && (
        <section className="home-section">
          <header className="home-section__head">
            <div>
              <p className="se-eyebrow">Dining halls</p>
              <h2>Where to eat right now</h2>
            </div>
            <Link to="/menu" className="home-link">
              All menus →
            </Link>
          </header>
          <div className="home-halls">
            {servingHalls.map((hall) => {
              const visual = hallVisual(hall.name, hall.location);
              const open = hall.status?.is_open;
              const stations = new Set(hall.dishes.map((d) => d.serving_unit || "Other")).size;
              return (
                <Link key={hall.Dining_Hall_ID} to={`/menu/${hall.Dining_Hall_ID}`} className="home-hall">
                  <div className="home-hall__photo">
                    {visual.src && <img src={visual.src} alt="" loading="lazy" />}
                  </div>
                  <div className="home-hall__body">
                    <span className={`home-hall__status${open ? " is-open" : ""}`}>
                      <span className="home-hall__dot" />
                      {statusLabel(hall.status)}
                    </span>
                    <h3 className="home-hall__name">{hall.name}</h3>
                    <p className="home-hall__meta se-mono">
                      {hall.dishes.length} dishes · {stations} stations
                    </p>
                  </div>
                  <span className="home-hall__arrow" aria-hidden="true">→</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── How it works ── */}
      <section className="home-section">
        <header className="home-section__head">
          <div>
            <p className="se-eyebrow">How it works</p>
            <h2>What you can do</h2>
          </div>
        </header>
        <div className="home-features">
          <Link to="/menu" className="home-feature">
            <div className="home-feature__preview">
              {previewRows.map((d) => {
                const total = d.protein * 4 + d.carbohydrates * 4 + d.fat * 9 || 1;
                return (
                  <div key={d.dish_id} className="home-mini-row">
                    <div className="home-mini-row__name">{d.dish_name}</div>
                    <div className="home-mini-row__bar">
                      <span style={{ width: `${(d.protein * 400) / total}%`, background: "var(--se-macro-protein)" }} />
                      <span style={{ width: `${(d.carbohydrates * 400) / total}%`, background: "var(--se-macro-carbs)" }} />
                      <span style={{ width: `${(d.fat * 900) / total}%`, background: "var(--se-macro-fat)" }} />
                    </div>
                    <div className="se-mono home-mini-row__kcal">{d.calories}</div>
                  </div>
                );
              })}
            </div>
            <div className="home-feature__body">
              <span className="se-mono home-feature__num">01</span>
              <h3>Browse every station</h3>
              <p>
                Live menus for each hall, grouped by station, with calories and macros on every dish. Search in plain
                English: &ldquo;vegan dinner under 500 calories&rdquo;.
              </p>
            </div>
          </Link>

          <Link to="/aimeals" className="home-feature">
            <div className="home-feature__preview home-feature__preview--chat">
              <div className="home-bubble home-bubble--user">Help me hit my protein goal</div>
              <div className="home-bubble home-bubble--ai">
                <IconSparkle size={13} color="var(--se-primary)" />
                <span>Here&apos;s a plan from today&apos;s menu: 2 lean entrées, 106g protein, 560 kcal.</span>
              </div>
            </div>
            <div className="home-feature__body">
              <span className="se-mono home-feature__num">02</span>
              <h3>Ask the planner</h3>
              <p>
                Ask for a meal in plain language. Suggestions come only from today&apos;s menu, with nutrition copied
                from the dish records and checked against your daily targets.
              </p>
            </div>
          </Link>

          <Link to={isLoggedIn ? "/dashboard" : "/login"} className="home-feature">
            <div className="home-feature__preview">
              <MacroMeter label="Calories" value={1840} goal={2600} color="var(--se-macro-cal)" />
              <MacroMeter label="Protein" value={118} goal={150} color="var(--se-macro-protein)" />
              <MacroMeter label="Carbs" value={204} goal={320} color="var(--se-macro-carbs)" />
            </div>
            <div className="home-feature__body">
              <span className="se-mono home-feature__num">03</span>
              <h3>Track your tray</h3>
              <p>Add dishes to a tray, log it as a meal, and watch daily progress against your own targets.</p>
            </div>
          </Link>
        </div>
      </section>

      {/* ── Pipeline (ink band) ── */}
      <section className="home-pipeline se-bleed">
        <div className="home-pipeline__inner">
          <header className="home-pipeline__head">
            <p className="se-eyebrow">Under the hood</p>
            <h2>How the menu data stays current</h2>
            <p>
              Menus are re-scraped twice a day and published as static files. There is no always-on server: the
              site is static hosting plus one serverless function for the AI chat.
            </p>
          </header>
          <ol className="home-pipeline__steps">
            {PIPELINE.map((item) => (
              <li key={item.step}>
                <span className="se-mono home-pipeline__step">{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="home-cta">
        <h2>Start with today&apos;s menu</h2>
        <p>
          {isLoggedIn
            ? "Pick a hall, add dishes to your tray, and log the meal to your dashboard."
            : "Or open the demo account to see the dashboard and meal log filled in with two weeks of sample meals."}
        </p>
        <div className="home-hero__actions home-cta__actions">
          <Link to="/menu" className="home-btn home-btn--primary">
            Open today&apos;s menus <span aria-hidden="true">→</span>
          </Link>
          {isLoggedIn ? (
            <Link to="/dashboard" className="home-btn home-btn--ghost">
              Go to your dashboard
            </Link>
          ) : DATA_MODE === "static" ? (
            <button type="button" className="home-btn home-btn--ghost" onClick={startDemo}>
              Try the demo account
            </button>
          ) : (
            <Link to="/register" className="home-btn home-btn--ghost">
              Create an account
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
