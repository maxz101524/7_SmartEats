import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config";

/* ─── Types ────────────────────────────────────────────────────────── */

interface LatencyByBucket {
  bucket: string;
  avg_latency_ms: number;
  count: number;
}

interface LatencyDistribution {
  latency_range: string;
  count: number;
}

interface LatencyTrendRow {
  date: string;
  avg_latency_ms: number;
  count: number;
}

interface LatencyTrend {
  series: LatencyTrendRow[];
  summary: {
    p50_latency_ms: number;
    p95_latency_ms: number;
    request_count: number;
  };
}

interface DauRow {
  date: string;
  dau: number;
}

interface IntentRow {
  intent: string;
  count: number;
}

interface ConversionSummary {
  query_users: number;
  converted_users: number;
  conversion_rate: number;
  follow_up_rate: number;
}

interface CostSummary {
  request_count: number;
  session_count: number;
  total_tokens: number;
  avg_tokens_per_request: number;
  total_estimated_cost_usd: number;
  avg_cost_per_request_usd: number;
  avg_cost_per_session_usd: number;
}

interface TopQuery {
  timestamp: string;
  prompt_preview: string;
  prompt_chars: number;
  total_tokens: number;
  estimated_cost_usd: number;
  intent: string;
}

interface ScatterPoint {
  prompt_chars: number;
  total_tokens: number;
  intent: string;
}

/* ─── Design helpers ───────────────────────────────────────────────── */

const CHART_HEIGHT = 220;
const CHART_PADDING = { top: 16, right: 16, bottom: 28, left: 44 };

const INTENT_COLORS: Record<string, string> = {
  high_protein: "var(--se-macro-protein)",
  vegetarian: "var(--se-success)",
  allergy: "var(--se-error)",
  low_carb: "var(--se-macro-carbs)",
  calorie_control: "var(--se-macro-fat)",
  general: "var(--se-text-muted)",
};

const INTENT_LABELS: Record<string, string> = {
  high_protein: "High Protein",
  vegetarian: "Vegetarian",
  allergy: "Allergy / Restriction",
  low_carb: "Low Carb",
  calorie_control: "Calorie Control",
  general: "General",
};

function intentColor(intent: string) {
  return INTENT_COLORS[intent] || "var(--se-text-muted)";
}

function intentLabel(intent: string) {
  return INTENT_LABELS[intent] || intent.replace(/_/g, " ");
}

function niceMax(value: number) {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const mantissa = value / base;
  if (mantissa <= 1) return 1 * base;
  if (mantissa <= 2) return 2 * base;
  if (mantissa <= 5) return 5 * base;
  return 10 * base;
}

function formatCompactNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toString();
}

function formatDate(iso: string) {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

/* ─── Shared layout primitives ────────────────────────────────────── */

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--se-primary)",
        }}
      >
        {eyebrow}
      </p>
      <h2
        style={{
          margin: "2px 0 0",
          fontSize: "var(--se-text-h3)",
          fontWeight: 800,
          color: "var(--se-text-main)",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h2>
      {description && (
        <p style={{ margin: "4px 0 0", fontSize: "var(--se-text-sm)", color: "var(--se-text-muted)" }}>
          {description}
        </p>
      )}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--se-bg-surface)",
        border: "1px solid var(--se-border)",
        borderRadius: "var(--se-radius-lg)",
        boxShadow: "var(--se-shadow-sm)",
        padding: "18px 20px 16px",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: "var(--se-text-sm)",
              fontWeight: 700,
              color: "var(--se-text-main)",
            }}
          >
            {title}
          </p>
          {subtitle && (
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--se-text-muted)" }}>{subtitle}</p>
          )}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? "var(--se-primary-dim)" : "var(--se-bg-surface)",
        border: accent ? "1px solid rgba(232,74,39,0.18)" : "1px solid var(--se-border)",
        borderRadius: "var(--se-radius-lg)",
        padding: "16px 18px",
        boxShadow: "var(--se-shadow-sm)",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: accent ? "var(--se-primary)" : "var(--se-text-faint)",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "6px 0 0",
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: accent ? "var(--se-primary)" : "var(--se-text-main)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </p>
      {hint && (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 12,
            color: accent ? "var(--se-primary-hover)" : "var(--se-text-muted)",
            fontWeight: 500,
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

/* ─── Custom charts (SVG) ─────────────────────────────────────────── */

function EmptyState({ label }: { label: string }) {
  return (
    <div
      style={{
        height: CHART_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--se-text-faint)",
        fontSize: "var(--se-text-sm)",
        background: "var(--se-bg-subtle)",
        borderRadius: "var(--se-radius-md)",
      }}
    >
      {label}
    </div>
  );
}

function AxisLabel({
  x,
  y,
  anchor = "middle",
  children,
}: {
  x: number;
  y: number;
  anchor?: "start" | "middle" | "end";
  children: React.ReactNode;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      style={{
        fill: "var(--se-text-faint)",
        fontSize: 10,
        fontFamily: "var(--se-font-sans)",
        fontWeight: 600,
      }}
    >
      {children}
    </text>
  );
}

interface BarChartProps {
  data: { label: string; value: number; color?: string; meta?: string }[];
  yLabel?: string;
  height?: number;
  valueFormatter?: (value: number) => string;
  orientation?: "vertical" | "horizontal";
}

function BarChart({ data, yLabel, height = CHART_HEIGHT, valueFormatter, orientation = "vertical" }: BarChartProps) {
  const [width, setWidth] = useState(640);
  const formatValue = valueFormatter ?? formatCompactNumber;

  useEffect(() => {
    const handle = () => setWidth(Math.max(280, window.innerWidth));
    handle();
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  if (!data.length) return <EmptyState label="No data yet" />;

  const maxValue = niceMax(Math.max(...data.map((d) => d.value)));

  if (orientation === "horizontal") {
    const rowHeight = 30;
    const chartHeight = Math.max(height, rowHeight * data.length + 20);
    const leftPad = 140;
    const rightPad = 40;
    const svgWidth = 640;
    const plotWidth = svgWidth - leftPad - rightPad;

    return (
      <svg
        viewBox={`0 0 ${svgWidth} ${chartHeight}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: chartHeight, overflow: "visible" }}
      >
        {data.map((row, idx) => {
          const y = idx * rowHeight + 10;
          const barWidth = (row.value / maxValue) * plotWidth;
          return (
            <g key={row.label}>
              <text
                x={leftPad - 10}
                y={y + rowHeight / 2}
                textAnchor="end"
                dominantBaseline="middle"
                style={{ fill: "var(--se-text-secondary)", fontSize: 12, fontWeight: 600 }}
              >
                {row.label}
              </text>
              <rect
                x={leftPad}
                y={y + 4}
                width={Math.max(2, barWidth)}
                height={rowHeight - 12}
                rx={6}
                fill={row.color || "var(--se-primary)"}
                opacity={0.9}
              />
              <text
                x={leftPad + barWidth + 8}
                y={y + rowHeight / 2}
                dominantBaseline="middle"
                style={{ fill: "var(--se-text-main)", fontSize: 12, fontWeight: 700 }}
              >
                {formatValue(row.value)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  const plotWidth = width > 0 ? 640 : 640;
  const svgWidth = 640;
  const chartHeight = height;
  const barAreaWidth = svgWidth - CHART_PADDING.left - CHART_PADDING.right;
  const barWidth = Math.min(60, (barAreaWidth / data.length) * 0.6);
  const step = barAreaWidth / data.length;
  const yScale = (value: number) =>
    CHART_PADDING.top + (chartHeight - CHART_PADDING.top - CHART_PADDING.bottom) * (1 - value / maxValue);

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => maxValue * ratio);

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${chartHeight}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: chartHeight, overflow: "visible" }}
    >
      {gridLines.map((value) => (
        <g key={value}>
          <line
            x1={CHART_PADDING.left}
            x2={svgWidth - CHART_PADDING.right}
            y1={yScale(value)}
            y2={yScale(value)}
            stroke="var(--se-border-muted)"
            strokeDasharray="3 3"
          />
          <AxisLabel x={CHART_PADDING.left - 6} y={yScale(value) + 3} anchor="end">
            {formatValue(value)}
          </AxisLabel>
        </g>
      ))}
      {data.map((row, idx) => {
        const centerX = CHART_PADDING.left + step * idx + step / 2;
        const barX = centerX - barWidth / 2;
        const barY = yScale(row.value);
        const barHeight = chartHeight - CHART_PADDING.bottom - barY;
        return (
          <g key={row.label}>
            <rect
              x={barX}
              y={barY}
              width={barWidth}
              height={Math.max(0, barHeight)}
              rx={6}
              fill={row.color || "var(--se-primary)"}
              opacity={0.92}
            />
            <text
              x={centerX}
              y={barY - 6}
              textAnchor="middle"
              style={{ fill: "var(--se-text-main)", fontSize: 11, fontWeight: 700 }}
            >
              {formatValue(row.value)}
            </text>
            <AxisLabel x={centerX} y={chartHeight - 10}>
              {row.label}
            </AxisLabel>
          </g>
        );
      })}
      {yLabel && (
        <text
          x={-chartHeight / 2}
          y={12}
          transform={`rotate(-90)`}
          textAnchor="middle"
          style={{ fill: "var(--se-text-faint)", fontSize: 10, fontWeight: 600 }}
        >
          {yLabel}
        </text>
      )}
    </svg>
  );
}

interface LineChartProps {
  data: { x: string; y: number; secondary?: number }[];
  yLabel?: string;
  accent?: string;
  fill?: boolean;
  valueFormatter?: (value: number) => string;
}

function LineChart({ data, yLabel, accent = "var(--se-primary)", fill = true, valueFormatter }: LineChartProps) {
  const formatValue = valueFormatter ?? formatCompactNumber;

  if (!data.length) return <EmptyState label="No data yet" />;

  const svgWidth = 640;
  const chartHeight = CHART_HEIGHT;
  const plotWidth = svgWidth - CHART_PADDING.left - CHART_PADDING.right;
  const plotHeight = chartHeight - CHART_PADDING.top - CHART_PADDING.bottom;
  const maxValue = niceMax(Math.max(...data.map((d) => d.y)) || 1);

  const points = data.map((row, idx) => {
    const xPx = CHART_PADDING.left + (plotWidth * idx) / Math.max(1, data.length - 1);
    const yPx = CHART_PADDING.top + plotHeight * (1 - row.y / maxValue);
    return { label: row.x, value: row.y, xPx, yPx };
  });

  const pathData = points
    .map((point, idx) => `${idx === 0 ? "M" : "L"} ${point.xPx.toFixed(2)} ${point.yPx.toFixed(2)}`)
    .join(" ");

  const areaData = `${pathData} L ${points[points.length - 1].xPx.toFixed(2)} ${(
    CHART_PADDING.top + plotHeight
  ).toFixed(2)} L ${points[0].xPx.toFixed(2)} ${(CHART_PADDING.top + plotHeight).toFixed(2)} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => maxValue * ratio);
  const xTickEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${chartHeight}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: chartHeight, overflow: "visible" }}
    >
      <defs>
        <linearGradient id="lineFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={0.28} />
          <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {gridLines.map((value) => {
        const y = CHART_PADDING.top + plotHeight * (1 - value / maxValue);
        return (
          <g key={value}>
            <line
              x1={CHART_PADDING.left}
              x2={svgWidth - CHART_PADDING.right}
              y1={y}
              y2={y}
              stroke="var(--se-border-muted)"
              strokeDasharray="3 3"
            />
            <AxisLabel x={CHART_PADDING.left - 6} y={y + 3} anchor="end">
              {formatValue(value)}
            </AxisLabel>
          </g>
        );
      })}

      {fill && <path d={areaData} fill="url(#lineFill)" />}
      <path d={pathData} stroke={accent} strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />

      {points.map((point, idx) => (
        <g key={`${point.label}-${idx}`}>
          {idx % xTickEvery === 0 && (
            <AxisLabel x={point.xPx} y={chartHeight - 10}>
              {formatDate(point.label)}
            </AxisLabel>
          )}
          <circle cx={point.xPx} cy={point.yPx} r={3.2} fill="var(--se-bg-surface)" stroke={accent} strokeWidth={2} />
        </g>
      ))}

      {yLabel && (
        <text
          x={-chartHeight / 2}
          y={12}
          transform={`rotate(-90)`}
          textAnchor="middle"
          style={{ fill: "var(--se-text-faint)", fontSize: 10, fontWeight: 600 }}
        >
          {yLabel}
        </text>
      )}
    </svg>
  );
}

interface HistogramProps {
  data: LatencyDistribution[];
}

function Histogram({ data }: HistogramProps) {
  if (!data.length) return <EmptyState label="No latency samples yet" />;

  const normalized = data.map((row) => ({
    label: row.latency_range,
    value: row.count,
    color: "var(--se-macro-protein)",
  }));

  return <BarChart data={normalized} />;
}

interface ScatterProps {
  data: ScatterPoint[];
}

function ScatterChart({ data }: ScatterProps) {
  if (!data.length) return <EmptyState label="No token samples yet" />;

  const svgWidth = 640;
  const chartHeight = CHART_HEIGHT + 20;
  const plotWidth = svgWidth - CHART_PADDING.left - CHART_PADDING.right;
  const plotHeight = chartHeight - CHART_PADDING.top - CHART_PADDING.bottom;

  const maxX = niceMax(Math.max(...data.map((d) => d.prompt_chars)) || 1);
  const maxY = niceMax(Math.max(...data.map((d) => d.total_tokens)) || 1);

  const xScale = (value: number) => CHART_PADDING.left + plotWidth * (value / maxX);
  const yScale = (value: number) => CHART_PADDING.top + plotHeight * (1 - value / maxY);

  const gridX = [0, 0.25, 0.5, 0.75, 1].map((ratio) => maxX * ratio);
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((ratio) => maxY * ratio);

  const intents = Array.from(new Set(data.map((d) => d.intent)));

  return (
    <div>
      <svg
        viewBox={`0 0 ${svgWidth} ${chartHeight}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: chartHeight, overflow: "visible" }}
      >
        {gridY.map((value) => (
          <g key={`y-${value}`}>
            <line
              x1={CHART_PADDING.left}
              x2={svgWidth - CHART_PADDING.right}
              y1={yScale(value)}
              y2={yScale(value)}
              stroke="var(--se-border-muted)"
              strokeDasharray="3 3"
            />
            <AxisLabel x={CHART_PADDING.left - 6} y={yScale(value) + 3} anchor="end">
              {formatCompactNumber(value)}
            </AxisLabel>
          </g>
        ))}
        {gridX.map((value) => (
          <AxisLabel key={`x-${value}`} x={xScale(value)} y={chartHeight - 10}>
            {formatCompactNumber(value)}
          </AxisLabel>
        ))}
        {data.map((point, idx) => (
          <circle
            key={`${point.prompt_chars}-${point.total_tokens}-${idx}`}
            cx={xScale(point.prompt_chars)}
            cy={yScale(point.total_tokens)}
            r={4.5}
            fill={intentColor(point.intent)}
            opacity={0.75}
            stroke="var(--se-bg-surface)"
            strokeWidth={1}
          />
        ))}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
        {intents.map((intent) => (
          <div key={intent} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: intentColor(intent),
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: 12, color: "var(--se-text-muted)", fontWeight: 600 }}>
              {intentLabel(intent)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Funnel card ─────────────────────────────────────────────────── */

function FunnelCard({ conversion, costSummary }: { conversion: ConversionSummary | null; costSummary: CostSummary | null }) {
  const rows = [
    {
      label: "AI chat requests",
      value: costSummary?.request_count ?? 0,
      color: "var(--se-primary)",
    },
    {
      label: "Sessions that queried AI",
      value: conversion?.query_users ?? 0,
      color: "var(--se-macro-fat)",
    },
    {
      label: "Sessions that added a dish from AI",
      value: conversion?.converted_users ?? 0,
      color: "var(--se-success)",
    },
  ];

  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((row) => (
        <div key={row.label}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: "var(--se-text-secondary)", fontWeight: 600 }}>{row.label}</span>
            <span style={{ color: "var(--se-text-main)", fontWeight: 800 }}>{row.value.toLocaleString()}</span>
          </div>
          <div
            style={{
              height: 10,
              borderRadius: "var(--se-radius-full)",
              background: "var(--se-bg-subtle)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(row.value / max) * 100}%`,
                height: "100%",
                background: row.color,
                borderRadius: "var(--se-radius-full)",
                transition: "width 300ms ease",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main page ────────────────────────────────────────────────────── */

export default function AnalyticsDashboard() {
  const navigate = useNavigate();
  const token = useMemo(() => localStorage.getItem("authToken"), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);

  const [latencyByBucket, setLatencyByBucket] = useState<LatencyByBucket[]>([]);
  const [latencyDistribution, setLatencyDistribution] = useState<LatencyDistribution[]>([]);
  const [latencyTrend, setLatencyTrend] = useState<LatencyTrend | null>(null);
  const [dau, setDau] = useState<DauRow[]>([]);
  const [intents, setIntents] = useState<IntentRow[]>([]);
  const [conversion, setConversion] = useState<ConversionSummary | null>(null);
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const [topQueries, setTopQueries] = useState<TopQuery[]>([]);
  const [scatter, setScatter] = useState<ScatterPoint[]>([]);

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    const headers = { Authorization: `Token ${token}` };
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const endpoints = [
          axios.get<LatencyByBucket[]>(`${API_BASE}/analytics/performance/latency-by-bucket/`, { headers }),
          axios.get<LatencyDistribution[]>(`${API_BASE}/analytics/performance/latency-distribution/`, { headers }),
          axios.get<LatencyTrend>(`${API_BASE}/analytics/performance/latency-trend/`, { headers }),
          axios.get<DauRow[]>(`${API_BASE}/analytics/behavior/dau/`, { headers }),
          axios.get<IntentRow[]>(`${API_BASE}/analytics/behavior/intents/`, { headers }),
          axios.get<ConversionSummary>(`${API_BASE}/analytics/behavior/conversion/`, { headers }),
          axios.get<CostSummary>(`${API_BASE}/analytics/cost/summary/`, { headers }),
          axios.get<TopQuery[]>(`${API_BASE}/analytics/cost/top-queries/`, { headers }),
          axios.get<ScatterPoint[]>(`${API_BASE}/analytics/cost/input-vs-tokens/`, { headers }),
        ];
        const [
          bucketRes,
          distRes,
          trendRes,
          dauRes,
          intentsRes,
          conversionRes,
          costRes,
          topRes,
          scatterRes,
        ] = await Promise.all(endpoints);
        if (cancelled) return;
        setLatencyByBucket(bucketRes.data as LatencyByBucket[]);
        setLatencyDistribution(distRes.data as LatencyDistribution[]);
        setLatencyTrend(trendRes.data as LatencyTrend);
        setDau(dauRes.data as DauRow[]);
        setIntents(intentsRes.data as IntentRow[]);
        setConversion(conversionRes.data as ConversionSummary);
        setCostSummary(costRes.data as CostSummary);
        setTopQueries(topRes.data as TopQuery[]);
        setScatter(scatterRes.data as ScatterPoint[]);
      } catch (err) {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status === 401 || status === 403) {
          setError("You need to sign in to view analytics.");
        } else {
          setError("Unable to load analytics data. Try refreshing or ensure the backend is reachable.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [token, navigate, refreshIndex]);

  const bucketRows = useMemo(
    () =>
      latencyByBucket.map((row) => ({
        label: row.bucket || "n/a",
        value: row.avg_latency_ms,
        meta: `${row.count} req`,
        color: "var(--se-primary)",
      })),
    [latencyByBucket],
  );

  const dauSeries = useMemo(
    () => dau.map((row) => ({ x: row.date, y: row.dau })),
    [dau],
  );

  const latencyTrendSeries = useMemo(() => {
    if (!latencyTrend) return [];
    return latencyTrend.series.map((row) => ({ x: row.date, y: row.avg_latency_ms }));
  }, [latencyTrend]);

  const intentRows = useMemo(
    () =>
      intents.map((row) => ({
        label: intentLabel(row.intent),
        value: row.count,
        color: intentColor(row.intent),
      })),
    [intents],
  );

  return (
    <main
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "24px 28px 64px",
        color: "var(--se-text-main)",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          marginBottom: 28,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--se-primary)",
            }}
          >
            AI System Evaluation
          </p>
          <h1
            style={{
              margin: "4px 0 0",
              fontSize: "var(--se-text-h1)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "var(--se-text-main)",
            }}
          >
            SmartEats Analytics Dashboard
          </h1>
          <p style={{ margin: "6px 0 0", color: "var(--se-text-muted)", fontSize: "var(--se-text-sm)", maxWidth: 640 }}>
            Monitors the AI meal planner across three lenses: system performance, user behavior, and cost. Data
            refreshes on demand from the SmartEats backend event log.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setRefreshIndex((i) => i + 1)}
            style={{
              border: "1px solid var(--se-border)",
              background: "var(--se-bg-surface)",
              padding: "9px 16px",
              borderRadius: "var(--se-radius-full)",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--se-text-main)",
              cursor: "pointer",
              boxShadow: "var(--se-shadow-sm)",
            }}
          >
            Refresh data
          </button>
        </div>
      </header>

      {loading && (
        <div style={{ color: "var(--se-text-muted)", padding: "40px 0" }}>Loading analytics…</div>
      )}
      {error && !loading && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: "var(--se-radius-md)",
            background: "var(--se-error-dim)",
            color: "var(--se-error)",
            border: "1px solid var(--se-error)",
            marginBottom: 20,
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && (costSummary?.request_count ?? 0) === 0 && (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: "var(--se-radius-lg)",
            background: "var(--se-bg-surface)",
            border: "1px dashed var(--se-border-strong)",
            marginBottom: 24,
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--se-success)",
              marginTop: 8,
              flexShrink: 0,
              boxShadow: "0 0 0 4px rgba(22,163,74,0.15)",
            }}
          />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--se-text-main)" }}>
              Live · awaiting first events
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--se-text-muted)", lineHeight: 1.5 }}>
              This dashboard streams from production event logs. Charts populate automatically as users interact
              with the AI meal planner — every chat request, follow-up click, and AI-sourced dish add is captured
              in real time. Nothing is backfilled or mocked.
            </p>
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Metric row */}
          <section style={{ marginBottom: 28 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 14,
              }}
            >
              <MetricCard
                label="P50 Latency"
                value={
                  latencyTrend?.summary.request_count
                    ? `${latencyTrend.summary.p50_latency_ms} ms`
                    : "—"
                }
                hint="Median AI chat response time"
              />
              <MetricCard
                label="P95 Latency"
                value={
                  latencyTrend?.summary.request_count
                    ? `${latencyTrend.summary.p95_latency_ms} ms`
                    : "—"
                }
                hint="Tail latency, 95th percentile"
              />
              <MetricCard
                label="Conversion Rate"
                value={
                  conversion?.query_users
                    ? `${((conversion.conversion_rate ?? 0) * 100).toFixed(1)}%`
                    : "—"
                }
                hint="Query → dish added"
                accent
              />
              <MetricCard
                label="Follow-up Rate"
                value={
                  costSummary?.request_count
                    ? `${((conversion?.follow_up_rate ?? 0) * 100).toFixed(1)}%`
                    : "—"
                }
                hint="Click-through on AI chips"
              />
              <MetricCard
                label="Avg Cost / Session"
                value={
                  costSummary?.session_count
                    ? `$${(costSummary.avg_cost_per_session_usd ?? 0).toFixed(4)}`
                    : "—"
                }
                hint={
                  costSummary?.session_count
                    ? `${costSummary.session_count} sessions tracked`
                    : "No sessions yet"
                }
              />
              <MetricCard
                label="Total Requests"
                value={(costSummary?.request_count ?? 0).toLocaleString()}
                hint={
                  costSummary?.request_count
                    ? `${costSummary.total_tokens.toLocaleString()} tokens total`
                    : "Awaiting first event"
                }
              />
            </div>
          </section>

          {/* System performance */}
          <section style={{ marginBottom: 32 }}>
            <SectionHeader
              eyebrow="System Performance"
              title="How fast and stable is the AI responding?"
              description="Latency shows how quickly the AI meal planner responds, segmented by input size and time."
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                gap: 16,
              }}
            >
              <ChartCard title="Latency by Prompt Length" subtitle="Average response time per input length bucket">
                <BarChart
                  data={bucketRows}
                  valueFormatter={(v) => `${Math.round(v)} ms`}
                />
              </ChartCard>
              <ChartCard title="Latency Distribution" subtitle="Histogram of request response times">
                <Histogram data={latencyDistribution} />
              </ChartCard>
              <ChartCard
                title="Latency Trend Over Time"
                subtitle="Daily average AI chat latency"
                right={
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--se-text-muted)",
                      padding: "4px 10px",
                      background: "var(--se-bg-subtle)",
                      borderRadius: "var(--se-radius-full)",
                    }}
                  >
                    {latencyTrend?.summary.request_count ?? 0} reqs
                  </span>
                }
              >
                <LineChart data={latencyTrendSeries} valueFormatter={(v) => `${Math.round(v)} ms`} />
              </ChartCard>
            </div>
          </section>

          {/* User behavior */}
          <section style={{ marginBottom: 32 }}>
            <SectionHeader
              eyebrow="User Behavior"
              title="How are students using the AI meal planner?"
              description="Engagement patterns, intent categories, and conversion from query to action."
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                gap: 16,
              }}
            >
              <ChartCard title="Daily Active AI Users" subtitle="Unique users per day hitting the AI planner">
                <LineChart data={dauSeries} accent="var(--se-macro-protein)" />
              </ChartCard>
              <ChartCard title="Top AI Intents" subtitle="Frequency of inferred user intent tags">
                <BarChart data={intentRows} orientation="horizontal" valueFormatter={(v) => `${Math.round(v)}`} />
              </ChartCard>
              <ChartCard title="Query → Action Funnel" subtitle="How many AI users convert to in-app actions">
                <FunnelCard conversion={conversion} costSummary={costSummary} />
              </ChartCard>
            </div>
          </section>

          {/* Cost */}
          <section style={{ marginBottom: 8 }}>
            <SectionHeader
              eyebrow="Cost"
              title="What is AI consumption costing us?"
              description="Token usage, estimated spend, and how prompt size drives cost."
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                gap: 16,
              }}
            >
              <ChartCard
                title="Input Length vs Token Usage"
                subtitle="Each dot is a request, colored by intent"
              >
                <ScatterChart data={scatter} />
              </ChartCard>
              <ChartCard title="Top 5 Highest-Token Queries" subtitle="Requests consuming the most tokens">
                {topQueries.length === 0 ? (
                  <EmptyState label="No high-token requests captured yet" />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {topQueries.map((query, idx) => (
                      <div
                        key={`${query.timestamp}-${idx}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "24px 1fr auto",
                          gap: 12,
                          alignItems: "center",
                          padding: "10px 12px",
                          borderRadius: "var(--se-radius-md)",
                          background: "var(--se-bg-subtle)",
                        }}
                      >
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background: "var(--se-primary-dim)",
                            color: "var(--se-primary)",
                            fontSize: 11,
                            fontWeight: 800,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {idx + 1}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <p
                            style={{
                              margin: 0,
                              fontSize: 13,
                              color: "var(--se-text-main)",
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {query.prompt_preview || "(empty prompt)"}
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--se-text-muted)" }}>
                            {intentLabel(query.intent)} · {query.prompt_chars} chars
                          </p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p
                            style={{
                              margin: 0,
                              fontSize: 13,
                              fontWeight: 800,
                              color: "var(--se-text-main)",
                            }}
                          >
                            {query.total_tokens.toLocaleString()} tok
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--se-text-muted)" }}>
                            ${query.estimated_cost_usd.toFixed(5)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ChartCard>
              <ChartCard title="Cost Summary" subtitle="Aggregate spend and token consumption">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <MetricCard
                    label="Avg Cost / Req"
                    value={`$${(costSummary?.avg_cost_per_request_usd ?? 0).toFixed(5)}`}
                  />
                  <MetricCard
                    label="Total Spend"
                    value={`$${(costSummary?.total_estimated_cost_usd ?? 0).toFixed(3)}`}
                  />
                  <MetricCard
                    label="Avg Tokens / Req"
                    value={`${(costSummary?.avg_tokens_per_request ?? 0).toFixed(1)}`}
                  />
                  <MetricCard
                    label="Sessions"
                    value={`${(costSummary?.session_count ?? 0).toLocaleString()}`}
                  />
                </div>
              </ChartCard>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
