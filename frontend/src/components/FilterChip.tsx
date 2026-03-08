import { useState } from "react";

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  tint?: "primary" | "success" | "error";
}

const tintMap: Record<
  "primary" | "success" | "error",
  { bg: string; color: string; border: string }
> = {
  primary: {
    bg: "var(--se-primary-dim)",
    color: "var(--se-primary)",
    border: "1px solid var(--se-primary)",
  },
  success: {
    bg: "var(--se-success-dim)",
    color: "var(--se-success)",
    border: "1px solid var(--se-success)",
  },
  error: {
    bg: "var(--se-error-dim)",
    color: "var(--se-error)",
    border: "1px solid var(--se-error)",
  },
};

export function FilterChip({ label, active, onClick, tint = "primary" }: FilterChipProps) {
  const [hovered, setHovered] = useState(false);

  const colors = tintMap[tint];

  const activeStyle: React.CSSProperties = {
    background: colors.bg,
    color: colors.color,
    border: colors.border,
  };

  const inactiveStyle: React.CSSProperties = {
    background: hovered ? "var(--se-bg-elevated)" : "var(--se-bg-subtle)",
    color: hovered ? "var(--se-text-main)" : "var(--se-text-muted)",
    border: "1.5px solid transparent",
  };

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 32,
        padding: "0 12px",
        borderRadius: 9999,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 100ms",
        display: "inline-flex",
        alignItems: "center",
        lineHeight: 1,
        ...(active ? activeStyle : inactiveStyle),
      }}
    >
      {label}
    </button>
  );
}
