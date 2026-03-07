import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import embed from "vega-embed";
import { API_BASE } from "../config";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import Skeleton from "../components/Skeleton";

/* ─── Types ─────────────────────────────────────────────────────────── */

interface UserProfile {
  user_id: string;
  netID?: string;
  first_name: string;
  last_name: string;
  sex?: string;
  age?: number;
  height_cm?: string | number | null;
  weight_kg?: string | number | null;
  goal?: string;
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

/* ─── Vega-Lite specs (no dark theme) ───────────────────────────────── */

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
    x: { field: "date", type: "temporal" as const, title: "Date" },
    y: { field: "count", type: "quantitative" as const, title: "Meals" },
  },
};

/* ─── Inline VegaChart component ────────────────────────────────────── */

function VegaChart({ spec, id }: { spec: object; id: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const result = embed(containerRef.current, spec as never, {
      actions: { export: true, source: false, compiled: false, editor: true },
    });
    return () => {
      result.then((r) => r.finalize());
    };
  }, [spec]);

  return <div id={id} ref={containerRef} className="w-full" style={{ maxWidth: "100%", overflow: "hidden" }} />;
}

/* ─── Stat tile helper ───────────────────────────────────────────────── */

function StatTile({ label, value }: { label: string; value: string | number | null | undefined }) {
  const display =
    value === null || value === undefined || value === ""
      ? "—"
      : String(value);

  return (
    <div
      style={{
        background: "var(--se-bg-subtle)",
        borderRadius: "var(--se-radius-md)",
        padding: "10px 14px",
      }}
    >
      <p
        style={{
          fontSize: "var(--se-text-xs)",
          fontWeight: "var(--se-weight-semibold)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--se-text-faint)",
          marginBottom: 4,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: "var(--se-text-sm)",
          fontWeight: "var(--se-weight-semibold)",
          color: "var(--se-text-main)",
        }}
      >
        {display}
      </p>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */

function Profile() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [report, setReport] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState<string | null>(null);

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

  /* ── Auth guard + data fetches ── */
  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      navigate("/login");
      return;
    }
    fetchProfile();
    fetchReport();
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Export handler ── */
  const handleDownload = async (format: "csv" | "json") => {
    const token = localStorage.getItem("authToken");
    try {
      const response = await axios.get(
        `${API_BASE}/export-meals/?file_format=${format}`,
        {
          headers: { Authorization: `Token ${token}` },
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
      alert("Failed to download file.");
    }
  };

  /* ── Page wrapper styles ── */
  const pageStyle: React.CSSProperties = {
    maxWidth: 720,
    margin: "0 auto",
    padding: "0 24px",
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: 48,
  };

  const sectionHeadingStyle: React.CSSProperties = {
    fontSize: "var(--se-text-base)",
    fontWeight: "var(--se-weight-bold)",
    color: "var(--se-text-main)",
    marginBottom: 16,
    marginTop: 0,
  };

  /* ── Render ── */
  return (
    <div style={pageStyle}>

      {/* ════ Section 1 — Identity card ════ */}
      <section style={sectionStyle}>
        {profileLoading ? (
          <Card padding="md">
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <Skeleton variant="circle" width={64} />
              <div style={{ flex: 1 }}>
                <Skeleton variant="rect" height={24} width="50%" />
                <div style={{ marginTop: 8 }}><Skeleton variant="text" lines={2} /></div>
              </div>
            </div>
          </Card>
        ) : profileError || !profile ? (
          <Card padding="md">
            <div style={{ textAlign: "center", padding: "var(--se-space-6)" }}>
              <p style={{ color: "var(--se-error)", fontWeight: 600, fontSize: "var(--se-text-base)", margin: 0 }}>
                Something went wrong
              </p>
              <p style={{ color: "var(--se-text-muted)", fontSize: "var(--se-text-sm)", marginTop: 4, margin: "4px 0 0" }}>
                {profileError || "Could not load profile."}
              </p>
              <div style={{ marginTop: "var(--se-space-4)" }}>
                <Button variant="secondary" size="sm" onClick={fetchProfile}>
                  Try Again
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card padding="md">
            {/* Top row — avatar + name block */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* Avatar circle */}
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "var(--se-radius-full)",
                  background: "var(--se-primary-dim)",
                  color: "var(--se-primary)",
                  fontSize: 22,
                  fontWeight: 900,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  userSelect: "none",
                }}
              >
                {profile.first_name ? profile.first_name[0].toUpperCase() : "U"}
              </div>

              {/* Name block */}
              <div>
                <h1
                  style={{
                    fontSize: "var(--se-text-h3)",
                    fontWeight: "var(--se-weight-extrabold)",
                    color: "var(--se-text-main)",
                    margin: 0,
                    lineHeight: "var(--se-leading-tight)",
                  }}
                >
                  {profile.first_name || ""} {profile.last_name || ""}
                </h1>
                {profile.netID && (
                  <p
                    style={{
                      fontSize: "var(--se-text-sm)",
                      color: "var(--se-text-muted)",
                      margin: "4px 0 0 0",
                    }}
                  >
                    netID: {profile.netID}
                  </p>
                )}
              </div>
            </div>

            {/* Stats grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginTop: 20,
              }}
            >
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
              <StatTile label="Goal" value={profile.goal} />
            </div>

            {/* Logout */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <Button
                variant="ghost"
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
        )}
      </section>

      {/* ════ Section 2 — Nutrition Charts ════ */}
      <section style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>Nutrition Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card padding="md">
            <VegaChart spec={barSpec} id="profile-bar-chart" />
          </Card>
          <Card padding="md">
            <VegaChart spec={lineSpec} id="profile-line-chart" />
          </Card>
        </div>
      </section>

      {/* ════ Section 3 — Meal Reports ════ */}
      <section style={sectionStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <h2 style={{ ...sectionHeadingStyle, marginBottom: 0 }}>Meal History</h2>

          {/* Export buttons — only shown when report loaded */}
          {report && (
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={() => handleDownload("csv")}>
                Export CSV
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleDownload("json")}>
                Export JSON
              </Button>
            </div>
          )}
        </div>

        {reportLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton variant="rect" height={120} />
            <Skeleton variant="rect" height={200} />
          </div>
        ) : reportError || !report ? (
          <Card padding="md">
            <div style={{ textAlign: "center", padding: "var(--se-space-6)" }}>
              <p style={{ color: "var(--se-error)", fontWeight: 600, fontSize: "var(--se-text-base)", margin: 0 }}>
                Something went wrong
              </p>
              <p style={{ color: "var(--se-text-muted)", fontSize: "var(--se-text-sm)", marginTop: 4, margin: "4px 0 0" }}>
                {reportError || "No report data available."}
              </p>
              <div style={{ marginTop: "var(--se-space-4)" }}>
                <Button variant="secondary" size="sm" onClick={fetchReport}>
                  Try Again
                </Button>
              </div>
            </div>
          </Card>
        ) : report.statistics.total_count === 0 ? (
          <p
            style={{
              color: "var(--se-text-faint)",
              fontSize: "var(--se-text-sm)",
            }}
          >
            No meals logged yet. Start tracking to see your history here.
          </p>
        ) : (
          <>
            {/* Summary stats */}
            <Card padding="md" className="mb-4">
              <p
                style={{
                  fontSize: "var(--se-text-xs)",
                  fontWeight: "var(--se-weight-semibold)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--se-text-faint)",
                  marginBottom: 12,
                  marginTop: 0,
                }}
              >
                Overall Totals
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
                  gap: 16,
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: "var(--se-text-h2)",
                      fontWeight: "var(--se-weight-bold)",
                      color: "var(--se-text-main)",
                      margin: 0,
                    }}
                  >
                    {report.statistics.total_count}
                  </p>
                  <p style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-muted)", margin: "4px 0 0 0" }}>
                    Total Meals
                  </p>
                </div>
                {report.statistics.macros.labels.map((label, i) => (
                  <div key={label}>
                    <p
                      style={{
                        fontSize: "var(--se-text-h2)",
                        fontWeight: "var(--se-weight-bold)",
                        color: "var(--se-text-main)",
                        margin: 0,
                      }}
                    >
                      {report.statistics.macros.values[i] ?? 0}g
                    </p>
                    <p style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-muted)", margin: "4px 0 0 0" }}>
                      {label}
                    </p>
                  </div>
                ))}
              </div>
              <p style={{ marginTop: 16, fontSize: "var(--se-text-xs)", color: "var(--se-text-faint)" }}>
                Estimated total calories:{" "}
                <span style={{ fontWeight: "var(--se-weight-semibold)", color: "var(--se-text-secondary)" }}>
                  {(
                    (report.statistics.macros.values[0] ?? 0) * 4 +
                    (report.statistics.macros.values[1] ?? 0) * 4 +
                    (report.statistics.macros.values[2] ?? 0) * 9
                  ).toFixed(0)} kcal
                </span>
              </p>
            </Card>

            {/* Macros + Categories tables */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Macronutrient Breakdown */}
              <Card padding="md">
                <p
                  style={{
                    fontSize: "var(--se-text-xs)",
                    fontWeight: "var(--se-weight-semibold)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--se-text-faint)",
                    marginBottom: 12,
                    marginTop: 0,
                  }}
                >
                  Macronutrient Breakdown
                </p>
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <table style={{ minWidth: 400, width: "100%", fontSize: "var(--se-text-sm)", borderCollapse: "collapse" }}>
                    <thead>
                      <tr
                        style={{
                          borderBottom: `1px solid var(--se-border)`,
                        }}
                      >
                        <th
                          style={{
                            textAlign: "left",
                            padding: "6px 0",
                            fontWeight: "var(--se-weight-semibold)",
                            color: "var(--se-text-secondary)",
                          }}
                        >
                          Nutrient
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "6px 0",
                            fontWeight: "var(--se-weight-semibold)",
                            color: "var(--se-text-secondary)",
                          }}
                        >
                          Total (g)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.statistics.macros.labels.map((label, i) => (
                        <tr
                          key={label}
                          style={{ borderBottom: `1px solid var(--se-border-muted)` }}
                        >
                          <td style={{ padding: "8px 0", color: "var(--se-text-main)" }}>{label}</td>
                          <td
                            style={{
                              padding: "8px 0",
                              textAlign: "right",
                              fontWeight: "var(--se-weight-semibold)",
                              color: "var(--se-text-main)",
                            }}
                          >
                            {report.statistics.macros.values[i]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Meals by Category */}
              <Card padding="md">
                <p
                  style={{
                    fontSize: "var(--se-text-xs)",
                    fontWeight: "var(--se-weight-semibold)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--se-text-faint)",
                    marginBottom: 12,
                    marginTop: 0,
                  }}
                >
                  Meals by Category
                </p>
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <table style={{ minWidth: 400, width: "100%", fontSize: "var(--se-text-sm)", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid var(--se-border)` }}>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "6px 0",
                            fontWeight: "var(--se-weight-semibold)",
                            color: "var(--se-text-secondary)",
                          }}
                        >
                          Category
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "6px 0",
                            fontWeight: "var(--se-weight-semibold)",
                            color: "var(--se-text-secondary)",
                          }}
                        >
                          Count
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.statistics.categories.labels.map((label, i) => (
                        <tr
                          key={label}
                          style={{ borderBottom: `1px solid var(--se-border-muted)` }}
                        >
                          <td style={{ padding: "8px 0", color: "var(--se-text-main)" }}>{label}</td>
                          <td
                            style={{
                              padding: "8px 0",
                              textAlign: "right",
                              fontWeight: "var(--se-weight-semibold)",
                              color: "var(--se-macro-cal)",
                            }}
                          >
                            {report.statistics.categories.values[i]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* Backend-rendered chart image */}
            {report.chart_base64 && (
              <Card padding="md">
                <p
                  style={{
                    fontSize: "var(--se-text-xs)",
                    fontWeight: "var(--se-weight-semibold)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--se-text-faint)",
                    marginBottom: 12,
                    marginTop: 0,
                  }}
                >
                  Visual Distribution
                </p>
                <img
                  src={report.chart_base64}
                  alt="Meal distribution chart"
                  style={{ width: "100%", maxWidth: 600, height: "auto", display: "block", margin: "0 auto" }}
                />
              </Card>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default Profile;
