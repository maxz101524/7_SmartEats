import { useEffect, useState } from "react";

const THINKING_STATES = [
  "Reading your goals",
  "Checking menu macros",
  "Filtering weak matches",
  "Building a tray",
] as const;

export function ThinkingIndicator() {
  const [stateIndex, setStateIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStateIndex((prev) => (prev + 1) % THINKING_STATES.length);
    }, 1300);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 16, paddingBottom: 8 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "var(--se-primary-dim)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          flexShrink: 0,
          color: "var(--se-primary)",
          fontWeight: 900,
          animation: "ai-thinking-pulse 1.6s ease-in-out infinite",
        }}
      >
        ✦
      </div>
      <div
        style={{
          background: "var(--se-bg-surface)",
          border: "1px solid var(--se-border)",
          borderRadius: "18px 18px 18px 4px",
          padding: "11px 14px",
          minWidth: 210,
          boxShadow: "var(--se-shadow-sm)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: 2,
            background: "linear-gradient(90deg, transparent, var(--se-primary), transparent)",
            animation: "ai-thinking-sweep 1.4s ease-in-out infinite",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--se-success)",
              boxShadow: "0 0 0 4px rgba(34, 197, 94, 0.12)",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--se-text-secondary)" }}>
            {THINKING_STATES[stateIndex]}
          </span>
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 8 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--se-text-faint)",
                animation: `dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
