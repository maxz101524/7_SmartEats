/** Brand monogram used as the AI planner's avatar (replaces generic sparkle glyphs). */
export default function AssistantMark({ size = 28, pulse = false }: { size?: number; pulse?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        background: "var(--se-bg-ink)",
        color: "var(--se-primary)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--se-font-display)",
        fontStyle: "italic",
        fontWeight: 600,
        fontSize: Math.round(size * 0.56),
        lineHeight: 1,
        paddingRight: Math.round(size * 0.04),
        animation: pulse ? "ai-thinking-pulse 1.6s ease-in-out infinite" : undefined,
      }}
    >
      S
    </span>
  );
}
