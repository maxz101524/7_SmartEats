import { useState } from "react";

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export function FilterChip({ label, active, onClick }: FilterChipProps) {
  const [hovered, setHovered] = useState(false);

  const activeStyle: React.CSSProperties = {
    background: "var(--se-primary-dim)",
    color: "var(--se-primary)",
    border: "1.5px solid var(--se-primary)",
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
