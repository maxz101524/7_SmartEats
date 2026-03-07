interface SkeletonProps {
  variant?: "text" | "rect" | "circle";
  width?: string | number;
  height?: string | number;
  lines?: number;
}

const base: React.CSSProperties = {
  background: `linear-gradient(
    90deg,
    var(--se-bg-subtle) 25%,
    var(--se-border-muted) 50%,
    var(--se-bg-subtle) 75%
  )`,
  backgroundSize: "200% 100%",
  animation: "shimmer 1.5s ease-in-out infinite",
  borderRadius: "var(--se-radius-sm)",
};

export default function Skeleton({
  variant = "rect",
  width,
  height,
  lines = 3,
}: SkeletonProps) {
  if (variant === "circle") {
    const size = width ?? 48;
    return (
      <div
        style={{ ...base, width: size, height: size, borderRadius: "50%" }}
        aria-hidden="true"
      />
    );
  }

  if (variant === "text") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            style={{
              ...base,
              height: 14,
              width: i === lines - 1 ? "60%" : "100%",
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      style={{ ...base, width: width ?? "100%", height: height ?? 80 }}
      aria-hidden="true"
    />
  );
}
