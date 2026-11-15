import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import embed from "vega-embed";
import { API_BASE, DATA_MODE } from "../config";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { MacroProgressBar } from "../components/MacroProgressBar";
import { IconDownload } from "../components/Icons";
import "../styles/profile.css";
import Skeleton from "../components/Skeleton";
import { useToast } from "../components/useToast";

/* ─── Types ─────────────────────────────────────────────────────────── */

interface UserProfile {
  user_id?: string;
  netID?: string;
  first_name: string;
  last_name: string;
  email?: string;
  sex?: string;
  age?: number;
  height_cm?: string | number | null;
  weight_kg?: string | number | null;
  goal?: string;
  activity_level?: string;
  daily_cal_goal?: number | null;
  daily_protein_goal?: number | null;
  daily_carbs_goal?: number | null;
  daily_fat_goal?: number | null;
  goals_source?: string | null;
  date_joined?: string;
}

interface ReportData {
  user_info: { netID: string; name: string };
  statistics: {
    total_count: number;
    macros: { labels: string[]; values: number[] };
    categories: { labels: string[]; values: number[] };
  };
  chart_base64: string;
}

interface HistoryEntry {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface ChartRow {
  date: string;
  macro: string;
  grams: number;
}

interface MealLogEntry {
  meal_id: number;
  category: string | null;
  total_calories: number;
  total_protein: number;
  total_carbohydrates: number;
  total_fat: number;
  date: string;
  dishes: {
    dish_id: number;
    dish_name: string;
    hall_name: string;
  }[];
}

/* ─── Vega-Lite specs (detailed charts) ────────────────────────────── */

const barSpec = {
  $schema: "https://vega.github.io/schema/vega-lite/v5.json",
  title: "Dishes by Category",
  width: "container" as const,
  height: 260,
  data: { url: `${API_BASE}/dishes-by-category/` },
  mark: "bar",
  encoding: {
    x: {
      field: "category",
      type: "nominal" as const,
      sort: "-y",
      title: "Category",
    },
    y: {
      field: "count",
      type: "quantitative" as const,
      title: "Number of Dishes",
    },
    color: {
      field: "category",
      type: "nominal" as const,
      legend: null,
    },
  },
};

const lineSpec = {
  $schema: "https://vega.github.io/schema/vega-lite/v5.json",
  title: "Meals Logged Per Day",
  width: "container" as const,
  height: 260,
  data: { url: `${API_BASE}/meals-per-day/` },
  mark: { type: "line" as const, point: true },
  encoding: {
    x: { field: "date", timeUnit: "utcyearmonthdate" as const, type: "temporal" as const, title: "Date" },
    y: { field: "count", type: "quantitative" as const, title: "Meals" },
  },
};

/* ─── Inline VegaChart component ────────────────────────────────────── */

function VegaChart({ spec, id }: { spec: object; id: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let view: { finalize: () => void } | null = null;

    // Resolve `data.url` through axios so API URLs work in static mode (served in-browser).
    const withData = async () => {
      const data = (spec as { data?: { url?: string } }).data;
      if (!data?.url) return spec;
      const token = localStorage.getItem("authToken");
      const res = await axios.get(data.url, {
        headers: token ? { Authorization: `Token ${token}` } : undefined,
      });
      return { ...spec, data: { values: res.data } };
    };

    withData()
      .then((resolved) =>
        cancelled
          ? null
          : embed(container, resolved as never, {
              actions: { export: true, source: false, compiled: false, editor: true },
            }),
      )
      .then((result) => {
        if (!result) return;
        if (cancelled) result.finalize();
        else view = result;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      view?.finalize();
    };
  }, [spec]);

  return <div id={id} ref={containerRef} className="w-full" style={{ maxWidth: "100%", overflow: "hidden" }} />;
}

/* ─── Stat tile helper ───────────────────────────────────────────────── */

function StatTile({ label, value }: { label: string; value: string | number | null | undefined }) {
  const display = value === null || value === undefined || value === "" ? "\u2014" : String(value);
  return (
    <div>
      <dt>{label}</dt>
      <dd>{display}</dd>
    </div>
  );
}

/* ─── Shared styles ─────────────────────────────────────────────────── */

/* ─── Activity level options ────────────────────────────────────────── */

const ACTIVITY_OPTIONS = [
  { value: "", label: "Select..." },
  { value: "sedentary", label: "Sedentary" },
  { value: "light", label: "Lightly Active" },
  { value: "moderate", label: "Moderately Active" },
  { value: "active", label: "Active" },
  { value: "very_active", label: "Very Active" },
];

const GOAL_LABELS: Record<string, string> = {
  fat_loss: "Fat Loss",
  muscle_gain: "Muscle Gain",
  maintain: "Maintain",
};

/* ─── Main component ─────────────────────────────────────────────────── */

function Profile() {
  const navigate = useNavigate();
  const toast = useToast();

  /* ── Profile state ── */
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  /* ── Identity edit state ── */
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [savingIdentity, setSavingIdentity] = useState(false);

  /* ── Goals edit state ── */
  const [editingGoals, setEditingGoals] = useState(false);
  const [goalCal, setGoalCal] = useState("");
  const [goalProtein, setGoalProtein] = useState("");
  const [goalCarbs, setGoalCarbs] = useState("");
  const [goalFat, setGoalFat] = useState("");
  const [goalActivity, setGoalActivity] = useState("");
  const [savingGoals, setSavingGoals] = useState(false);

  /* ── Report state ── */
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState<string | null>(null);

  /* ── Meal log state ── */
  const [mealLog, setMealLog] = useState<MealLogEntry[]>([]);
  const [mealLogLoading, setMealLogLoading] = useState(true);
  const [mealLogError, setMealLogError] = useState<string | null>(null);

  /* ── History state ── */
  const [historyData, setHistoryData] = useState<ChartRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyDays, setHistoryDays] = useState<number | null>(7);

  /* ── Detailed charts toggle ── */
  const [showDetailedCharts, setShowDetailedCharts] = useState(false);

  /* ── Auth header helper ── */
  const authHeaders = () => {
    const token = localStorage.getItem("authToken");
    return { Authorization: `Token ${token}` };
  };

  /* ── Data fetchers ── */

  const fetchProfile = () => {
    const token = localStorage.getItem("authToken");
    if (!token) return;
    setProfileError(null);
    setProfileLoading(true);
    axios
      .get(`${API_BASE}/profile/`, { headers: { Authorization: `Token ${token}` } })
      .then((res) => setProfile(res.data))
      .catch(() => {
        setProfileError("Could not load profile");
      })
      .finally(() => setProfileLoading(false));
  };

  const fetchReport = () => {
    const token = localStorage.getItem("authToken");
    if (!token) return;
    setReportError(null);
    setReportLoading(true);
    axios
      .get(`${API_BASE}/meal-reports/`, { headers: { Authorization: `Token ${token}` } })
      .then((res) => setReport(res.data))
      .catch((err) => {
        const status = err.response?.status;
        const message =
          status === 401
            ? "Please log in again."
            : status
              ? `Failed to load report data (${status}).`
              : "Failed to load report data. Check your connection.";
        setReportError(message);
      })
      .finally(() => setReportLoading(false));
  };

  const fetchMealLog = () => {
    const token = localStorage.getItem("authToken");
    if (!token) return;
    setMealLogError(null);
    setMealLogLoading(true);
    axios
      .get<MealLogEntry[]>(`${API_BASE}/meals/`, { headers: { Authorization: `Token ${token}` } })
      .then((res) => setMealLog(res.data))
      .catch((err) => {
        const status = err.response?.status;
        setMealLogError(
          status === 401
            ? "Please log in again."
            : "Could not load recent meal entries.",
        );
      })
      .finally(() => setMealLogLoading(false));
  };

  const fetchHistory = (days: number | null) => {
    const token = localStorage.getItem("authToken");
    if (!token) return;
    setHistoryLoading(true);
    const url = days != null
      ? `${API_BASE}/daily-history/?days=${days}`
      : `${API_BASE}/daily-history/`;
    axios
      .get<HistoryEntry[]>(url, { headers: { Authorization: `Token ${token}` } })
      .then((res) => {
        const rows: ChartRow[] = [];
        for (const entry of res.data) {
          rows.push({ date: entry.date, macro: "Protein", grams: entry.protein });
          rows.push({ date: entry.date, macro: "Carbs", grams: entry.carbs });
          rows.push({ date: entry.date, macro: "Fat", grams: entry.fat });
        }
        setHistoryData(rows);
      })
      .catch(() => {
        setHistoryData([]);
      })
      .finally(() => setHistoryLoading(false));
  };

  /* ── Auth guard + initial fetches ── */
  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      navigate("/login");
      return;
    }
    fetchProfile();
    fetchReport();
    fetchMealLog();
    fetchHistory(historyDays);
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Re-fetch history when range changes ── */
  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) return;
    fetchHistory(historyDays);
  }, [historyDays]);

  /* ── Export handler ── */
  const handleDownload = async (format: "csv" | "json") => {
    try {
      const response = await axios.get(
        `${API_BASE}/export-meals/?file_format=${format}`,
        {
          headers: authHeaders(),
          responseType: "blob",
        },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `meal_report.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      toast.error("Failed to download the export.");
    }
  };

  /* ── Identity save ── */
  const handleSaveIdentity = async () => {
    setSavingIdentity(true);
    try {
      await axios.put(
        `${API_BASE}/profile/`,
        { first_name: editFirstName, last_name: editLastName },
        { headers: authHeaders() },
      );
      setEditingIdentity(false);
      fetchProfile();
    } catch {
      toast.error("Failed to update profile.");
    } finally {
      setSavingIdentity(false);
    }
  };

  /* ── Goals save ── */
  const handleSaveGoals = async () => {
    setSavingGoals(true);
    try {
      await axios.put(
        `${API_BASE}/profile/`,
        {
          daily_cal_goal: goalCal ? Number(goalCal) : null,
          daily_protein_goal: goalProtein ? Number(goalProtein) : null,
          daily_carbs_goal: goalCarbs ? Number(goalCarbs) : null,
          daily_fat_goal: goalFat ? Number(goalFat) : null,
          activity_level: goalActivity || null,
          goals_source: "custom",
        },
        { headers: authHeaders() },
      );
      setEditingGoals(false);
      fetchProfile();
    } catch {
      toast.error("Failed to update goals.");
    } finally {
      setSavingGoals(false);
    }
  };

  /* ── Begin editing identity ── */
  const startEditIdentity = () => {
    if (!profile) return;
    setEditFirstName(profile.first_name || "");
    setEditLastName(profile.last_name || "");
    setEditingIdentity(true);
  };

  /* ── Begin editing goals ── */
  const startEditGoals = () => {
    if (!profile) return;
    setGoalCal(profile.daily_cal_goal != null ? String(profile.daily_cal_goal) : "");
    setGoalProtein(profile.daily_protein_goal != null ? String(profile.daily_protein_goal) : "");
    setGoalCarbs(profile.daily_carbs_goal != null ? String(profile.daily_carbs_goal) : "");
    setGoalFat(profile.daily_fat_goal != null ? String(profile.daily_fat_goal) : "");
    setGoalActivity(profile.activity_level || "");
    setEditingGoals(true);
  };

  /* ── Helpers ── */
  const hasGoals = profile?.daily_cal_goal != null;

  const formatMemberSince = (dateStr?: string) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  const activityLabel = (val?: string) => {
    if (!val) return null;
    const found = ACTIVITY_OPTIONS.find((o) => o.value === val);
    if (found) return found.label;

    const legacyLabels: Record<string, string> = {
      lightly_active: "Lightly Active",
      moderately_active: "Moderately Active",
      extra_active: "Extra Active",
    };

    return legacyLabels[val] || val;
  };

  const goalLabel = (val?: string) => {
    if (!val) return null;
    return GOAL_LABELS[val] || val;
  };

  /* ── Input style helper ── */
  const inputStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: "var(--se-radius-md)",
    border: "1.5px solid var(--se-border-strong)",
    background: "var(--se-bg-input)",
    fontSize: "var(--se-text-sm)",
    color: "var(--se-text-main)",
    width: "100%",
    outline: "none",
  };

  /* ── History Vega spec ── */
  const historySpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: "container" as const,
    height: 260,
    data: { values: historyData },
    mark: "bar",
    encoding: {
      // Dates are calendar days ("YYYY-MM-DD"); treat them as UTC days so they don't shift in US time zones.
      x: {
        field: "date",
        timeUnit: "utcyearmonthdate" as const,
        type: "ordinal" as const,
        title: "Date",
        axis: { format: "%a %d", labelAngle: 0 },
      },
      y: { field: "grams", type: "quantitative" as const, title: "Grams" },
      color: {
        field: "macro",
        type: "nominal" as const,
        scale: {
          domain: ["Protein", "Carbs", "Fat"],
          range: ["#3b82f6", "#d97706", "#f0784a"],
        },
        legend: { orient: "bottom" as const, title: null },
      },
      xOffset: { field: "macro", type: "nominal" as const },
    },
    config: { view: { stroke: null }, background: "transparent", font: "DM Sans" },
  };

  /* ── Range pill helper ── */
  const RangePill = ({ label, value }: { label: string; value: number | null }) => {
    const active = historyDays === value;
    return (
      <button
        onClick={() => setHistoryDays(value)}
        style={{
          padding: "4px 14px",
          borderRadius: "var(--se-radius-full)",
          border: active ? "1.5px solid var(--se-primary)" : "1.5px solid var(--se-border)",
          background: active ? "var(--se-primary-dim)" : "transparent",
          color: active ? "var(--se-text-accent)" : "var(--se-text-muted)",
          fontSize: "var(--se-text-xs)",
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 150ms ease",
        }}
      >
        {label}
      </button>
    );
  };

  /* ════════════════════════════════════════════════════════════════════ */
  /* ── Render                                                        ── */
  /* ════════════════════════════════════════════════════════════════════ */

  return (
    <div className="profile">

      {/* ════ Section 1 — Identity Header ════ */}
      <header className="profile-head">
        {profileLoading ? (
          <div style={{ display: "flex", gap: 16, alignItems: "center", flex: 1 }}>
            <Skeleton variant="circle" width={64} />
            <div style={{ flex: 1 }}>
              <Skeleton variant="rect" height={36} width="40%" />
            </div>
          </div>
        ) : profileError || !profile ? (
          <Card padding="md">
            <div style={{ textAlign: "center", padding: "var(--se-space-6)" }}>
              <p style={{ color: "var(--se-error)", fontWeight: 600, margin: 0 }}>Could not load your profile</p>
              <p style={{ color: "var(--se-text-muted)", fontSize: "var(--se-text-sm)", margin: "4px 0 0" }}>
                {profileError || "Please try again."}
              </p>
              <div style={{ marginTop: "var(--se-space-4)" }}>
                <Button variant="secondary" size="sm" onClick={fetchProfile}>
                  Try Again
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <>
            <div className="profile-head__id">
              <span className="profile-avatar" aria-hidden="true">
                {profile.first_name ? profile.first_name[0].toUpperCase() : "U"}
              </span>
              {editingIdentity ? (
                <div className="profile-edit">
                  <input
                    style={inputStyle}
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    placeholder="First name"
                    aria-label="First name"
                  />
                  <input
                    style={inputStyle}
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    placeholder="Last name"
                    aria-label="Last name"
                  />
                  <Button variant="primary" size="sm" loading={savingIdentity} onClick={handleSaveIdentity}>
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingIdentity(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div>
                  <h1>{[profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Your profile"}</h1>
                  <p className="profile-head__meta se-mono">
                    {profile.netID ? `netID ${profile.netID}` : profile.email}
                    {profile.date_joined ? ` · joined ${formatMemberSince(profile.date_joined)}` : ""}
                  </p>
                </div>
              )}
            </div>
            {!editingIdentity && (
              <button type="button" className="menu-btn" onClick={startEditIdentity}>
                Edit name
              </button>
            )}
          </>
        )}
      </header>

      <div className="profile-grid">
        <aside className="profile-side">
      {/* ════ Section 2 — My Goals ════ */}
      {profile && (
        <section className="profile-section">
          <h2 className="profile-h2">Daily targets</h2>

          {editingGoals ? (
            <Card padding="md">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-muted)", fontWeight: 600, marginBottom: 4, display: "block" }}>
                    Calories (kcal)
                  </label>
                  <input style={inputStyle} type="number" value={goalCal} onChange={(e) => setGoalCal(e.target.value)} placeholder="e.g. 2000" />
                </div>
                <div>
                  <label style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-muted)", fontWeight: 600, marginBottom: 4, display: "block" }}>
                    Protein (g)
                  </label>
                  <input style={inputStyle} type="number" value={goalProtein} onChange={(e) => setGoalProtein(e.target.value)} placeholder="e.g. 150" />
                </div>
                <div>
                  <label style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-muted)", fontWeight: 600, marginBottom: 4, display: "block" }}>
                    Carbs (g)
                  </label>
                  <input style={inputStyle} type="number" value={goalCarbs} onChange={(e) => setGoalCarbs(e.target.value)} placeholder="e.g. 250" />
                </div>
                <div>
                  <label style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-muted)", fontWeight: 600, marginBottom: 4, display: "block" }}>
                    Fat (g)
                  </label>
                  <input style={inputStyle} type="number" value={goalFat} onChange={(e) => setGoalFat(e.target.value)} placeholder="e.g. 65" />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-muted)", fontWeight: 600, marginBottom: 4, display: "block" }}>
                  Activity Level
                </label>
                <select
                  style={{ ...inputStyle, maxWidth: 240 }}
                  value={goalActivity}
                  onChange={(e) => setGoalActivity(e.target.value)}
                >
                  {ACTIVITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <Button variant="primary" size="sm" loading={savingGoals} onClick={handleSaveGoals}>
                  Save Goals
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingGoals(false)}>
                  Cancel
                </Button>
              </div>
            </Card>
          ) : hasGoals ? (
            <Card padding="md">
              <dl className="profile-targets">
                {([
                  { label: "Calories", value: profile.daily_cal_goal, unit: "kcal", color: "var(--se-macro-cal)" },
                  { label: "Protein", value: profile.daily_protein_goal, unit: "g", color: "var(--se-macro-protein)" },
                  { label: "Carbs", value: profile.daily_carbs_goal, unit: "g", color: "var(--se-macro-carbs)" },
                  { label: "Fat", value: profile.daily_fat_goal, unit: "g", color: "var(--se-macro-fat)" },
                ] as const).map((item) => (
                  <div key={item.label}>
                    <dt>
                      <span className="profile-swatch" style={{ background: item.color }} />
                      {item.label}
                    </dt>
                    <dd className="se-mono">
                      {item.value ?? "\u2014"}
                      <span>{item.unit}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="profile-note">
                {profile.goals_source === "ai" ? "Estimated from your body stats" : "Set manually"}
                {profile.activity_level ? ` · ${activityLabel(profile.activity_level)}` : ""}
              </p>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <Button variant="secondary" size="sm" onClick={startEditGoals}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/aimeals")}>
                  Use estimator
                </Button>
              </div>
            </Card>
          ) : (
            /* No goals set — prompt */
            <Card padding="md">
              <div>
                <p style={{ fontSize: "var(--se-text-base)", fontWeight: 600, color: "var(--se-text-main)", margin: "0 0 4px" }}>
                  No daily targets yet
                </p>
                <p style={{ fontSize: "var(--se-text-sm)", color: "var(--se-text-muted)", margin: "0 0 16px" }}>
                  Set calories and macros to see progress on the dashboard.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="secondary" size="sm" onClick={startEditGoals}>
                    Set targets
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => navigate("/aimeals")}>
                    Estimate in AI Meals
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </section>
      )}

      {/* ════ Section 3 — Body Stats ════ */}
      {profile && (
        <section className="profile-section">
          <h2 className="profile-h2">Body stats</h2>
          <dl className="profile-stats">
            <StatTile label="Sex" value={profile.sex} />
            <StatTile label="Age" value={profile.age != null ? `${profile.age} yrs` : null} />
            <StatTile
              label="Height"
              value={
                profile.height_cm != null && profile.height_cm !== ""
                  ? `${profile.height_cm} cm`
                  : null
              }
            />
            <StatTile
              label="Weight"
              value={
                profile.weight_kg != null && profile.weight_kg !== ""
                  ? `${profile.weight_kg} kg`
                  : null
              }
            />
            <StatTile label="Goal" value={goalLabel(profile.goal)} />
            <StatTile label="Activity" value={activityLabel(profile.activity_level)} />
          </dl>
        </section>
      )}

      {/* ════ Section 6 — Account ════ */}
      <section className="profile-section">
        <h2 className="profile-h2">Account</h2>
        <Card padding="md">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <p style={{ fontSize: "var(--se-text-sm)", color: "var(--se-text-secondary)", margin: 0 }}>
                Signed in as <strong>{profile?.email || profile?.netID || "you"}</strong>
              </p>
              {DATA_MODE === "static" && (
                <p style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-muted)", margin: "4px 0 0" }}>
                  Your account and meal log are saved in this browser only.
                </p>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                localStorage.removeItem("authToken");
                navigate("/login");
              }}
            >
              Log out
            </Button>
          </div>
        </Card>
      </section>
        </aside>
        <div className="profile-main">
      {/* ════ Section 4 — Nutrition History ════ */}
      <section className="profile-section">
        <div className="profile-section__head">
          <h2 className="profile-h2">Nutrition history</h2>
          <div style={{ display: "flex", gap: 6 }}>
            <RangePill label="7 days" value={7} />
            <RangePill label="30 days" value={30} />
            <RangePill label="All" value={null} />
          </div>
        </div>

        <Card padding="md">
          {historyLoading ? (
            <Skeleton variant="rect" height={260} />
          ) : historyData.length === 0 ? (
            <EmptyState
              message="No nutrition history yet"
              sub="Log meals to see your daily macro breakdown here."
            />
          ) : (
            <>
              <VegaChart spec={historySpec} id="profile-history-chart" />

              {/* Today's progress bars if goals are set */}
              {hasGoals && historyData.length > 0 && (() => {
                const dates = [...new Set(historyData.map((r) => r.date))].sort();
                const latestDate = dates[dates.length - 1];
                const latest = historyData.filter((r) => r.date === latestDate);
                const todayProtein = latest.find((r) => r.macro === "Protein")?.grams ?? 0;
                const todayCarbs = latest.find((r) => r.macro === "Carbs")?.grams ?? 0;
                const todayFat = latest.find((r) => r.macro === "Fat")?.grams ?? 0;
                return (
                  <div style={{ marginTop: 20 }}>
                    <p className="se-eyebrow" style={{ margin: "0 0 12px" }}>
                      Latest logged day vs targets
                    </p>
                    <MacroProgressBar label="Protein" current={todayProtein} max={profile!.daily_protein_goal ?? 150} color="var(--se-macro-protein)" />
                    <MacroProgressBar label="Carbs" current={todayCarbs} max={profile!.daily_carbs_goal ?? 250} color="var(--se-macro-carbs)" />
                    <MacroProgressBar label="Fat" current={todayFat} max={profile!.daily_fat_goal ?? 65} color="var(--se-macro-fat)" />
                  </div>
                );
              })()}
            </>
          )}
        </Card>

        {/* Collapsible detailed charts */}
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowDetailedCharts(!showDetailedCharts)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "var(--se-text-sm)",
              fontWeight: 600,
              color: "var(--se-text-main)",
              padding: "4px 0",
              textDecoration: "underline",
              textDecorationColor: "var(--se-primary)",
              textUnderlineOffset: 3,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {showDetailedCharts ? "Hide more charts" : "Show more charts"}
          </button>

          {showDetailedCharts && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ marginTop: 12 }}>
              <Card padding="md">
                <p style={{ fontSize: "var(--se-text-sm)", fontWeight: 600, color: "var(--se-text-secondary)", margin: "0 0 8px" }}>
                  Dishes by Category
                </p>
                <VegaChart spec={barSpec} id="profile-bar-chart" />
              </Card>
              <Card padding="md">
                <p style={{ fontSize: "var(--se-text-sm)", fontWeight: 600, color: "var(--se-text-secondary)", margin: "0 0 8px" }}>
                  Meals Logged Per Day
                </p>
                <VegaChart spec={lineSpec} id="profile-line-chart" />
              </Card>
            </div>
          )}
        </div>
      </section>

      {/* ════ Section 5 — Meal Log ════ */}
      <section className="profile-section">
        <div className="profile-section__head">
          <h2 className="profile-h2">Meal log</h2>
          {report && (
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={() => handleDownload("csv")}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <IconDownload size={14} /> CSV
                </span>
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleDownload("json")}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <IconDownload size={14} /> JSON
                </span>
              </Button>
            </div>
          )}
        </div>

        {mealLogLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
            {[1, 2].map((i) => (
              <Skeleton key={i} variant="rect" height={92} />
            ))}
          </div>
        ) : mealLogError ? (
          <Card padding="md" className="mb-4">
            <EmptyState
              message="Could not load recent meals"
              sub={mealLogError}
              action={<Button variant="secondary" size="sm" onClick={fetchMealLog}>Try Again</Button>}
            />
          </Card>
        ) : mealLog.length > 0 ? (
          <div className="profile-log">
            {mealLog.slice(0, 8).map((entry) => (
              <div key={entry.meal_id} className="profile-log__row">
                <div className="profile-log__when">
                  <span className="se-eyebrow">{entry.category || "Logged meal"}</span>
                  <span className="se-mono">
                    {new Date(`${entry.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
                <div className="profile-log__dishes">
                  {entry.dishes.map((dish, idx) => (
                    <span key={`${entry.meal_id}-${dish.dish_id}`}>
                      <button type="button" onClick={() => navigate(`/dishes/${dish.dish_id}`)}>
                        {dish.dish_name}
                      </button>
                      {idx < entry.dishes.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
                <div className="profile-log__macros se-mono">
                  <span>
                    <strong>{entry.total_calories}</strong> kcal
                  </span>
                  <span>
                    {entry.total_protein}P · {entry.total_carbohydrates}C · {entry.total_fat}F
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {reportLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton variant="rect" height={100} />
            <Skeleton variant="rect" height={200} />
          </div>
        ) : reportError || !report ? (
          <Card padding="md">
            <EmptyState
              message="Something went wrong"
              sub={reportError || "No report data available."}
              action={<Button variant="secondary" size="sm" onClick={fetchReport}>Try Again</Button>}
            />
          </Card>
        ) : report.statistics.total_count === 0 ? (
          <EmptyState
            message="No meals logged yet"
            sub="Start tracking from the Menu or Dish pages to see your history here."
          />
        ) : (
          <>
            {/* Summary stats row */}
            <Card padding="sm" className="mb-4">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
                  gap: 12,
                  textAlign: "center",
                }}
              >
                <div>
                  <p className="se-mono" style={{ fontSize: "1.4rem", fontWeight: 500, color: "var(--se-text-main)", margin: 0 }}>
                    {report.statistics.total_count}
                  </p>
                  <p style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-muted)", margin: "2px 0 0" }}>
                    Total Meals
                  </p>
                </div>
                {report.statistics.macros.labels.map((label, i) => (
                  <div key={label}>
                    <p className="se-mono" style={{ fontSize: "1.4rem", fontWeight: 500, color: "var(--se-text-main)", margin: 0 }}>
                      {report.statistics.macros.values[i] ?? 0}g
                    </p>
                    <p style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-muted)", margin: "2px 0 0" }}>
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Macros + Categories tables in 2-col grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Macronutrient Breakdown */}
              <Card padding="sm">
                <p className="se-eyebrow" style={{ margin: "0 0 8px" }}>Total macros logged</p>
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <table style={{ width: "100%", fontSize: "var(--se-text-sm)", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--se-border)", background: "var(--se-bg-elevated)" }}>
                        <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600, color: "var(--se-text-secondary)" }}>Nutrient</th>
                        <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600, color: "var(--se-text-secondary)" }}>Total (g)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.statistics.macros.labels.map((label, i) => (
                        <tr
                          key={label}
                          style={{
                            borderBottom: "1px solid var(--se-border-muted)",
                          }}
                        >
                          <td style={{ padding: "6px 10px", color: "var(--se-text-main)" }}>{label}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600, color: "var(--se-text-main)" }}>
                            {report.statistics.macros.values[i]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Meals by Category */}
              <Card padding="sm">
                <p className="se-eyebrow" style={{ margin: "0 0 8px" }}>Meals by category</p>
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <table style={{ width: "100%", fontSize: "var(--se-text-sm)", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--se-border)", background: "var(--se-bg-elevated)" }}>
                        <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600, color: "var(--se-text-secondary)" }}>Category</th>
                        <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600, color: "var(--se-text-secondary)" }}>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.statistics.categories.labels.map((label, i) => (
                        <tr
                          key={label}
                          style={{
                            borderBottom: "1px solid var(--se-border-muted)",
                          }}
                        >
                          <td style={{ padding: "6px 10px", color: "var(--se-text-main)" }}>{label}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600, color: "var(--se-macro-cal)" }}>
                            {report.statistics.categories.values[i]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )}
      </section>

        </div>
      </div>
    </div>
  );
}

export default Profile;
