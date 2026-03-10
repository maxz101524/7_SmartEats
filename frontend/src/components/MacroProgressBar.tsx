interface MacroProgressBarProps {
  label: string;
  current: number;
  max: number;
  color: string;
  animate?: boolean;
}

export function MacroProgressBar({ label, current, max, color, animate = true }: MacroProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span
          style={{
            fontSize: "var(--se-text-sm)",
            fontWeight: "var(--se-weight-bold)",
            color: "var(--se-text-main)",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: "var(--se-text-sm)",
            color: "var(--se-text-muted)",
            fontWeight: "var(--se-weight-medium)",
          }}
        >
          {current}g / {max}g
        </span>
      </div>
      <div
        style={{
          height: 10,
          borderRadius: 9999,
          background: "var(--se-bg-subtle)",
          overflow: "hidden",
        }}
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${label}: ${current}g of ${max}g`}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 9999,
            background: color,
            transition: animate ? "width 600ms ease-out" : "none",
          }}
        />
      </div>
    </div>
  );
}
