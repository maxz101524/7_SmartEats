export function MacroPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 24,
        padding: "0 8px",
        borderRadius: "var(--se-radius-full)",
        background: "var(--se-bg-subtle)",
        color,
        fontSize: 11,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {value}
      <span style={{ color: "var(--se-text-muted)", fontWeight: 700 }}>{label}</span>
    </span>
  );
}
