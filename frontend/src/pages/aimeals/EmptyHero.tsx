import { useEffect, useState } from "react";

const ALL_PROMPTS = [
  "What's healthy at ISR today?",
  "High protein lunch ideas",
  "I want something under 400 calories",
  "What vegetarian options are there?",
  "Help me hit my macro goals",
  "Find me a light dinner option",
  "What can I eat before a workout?",
  "What's good at Ikenberry?",
  "I need gluten-free options",
  "Best post-workout meal at PAR?",
  "Compare protein options across halls",
  "Low carb dinner suggestions",
];

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export function EmptyHero({ onPick }: { onPick: (prompt: string) => void }) {
  const [suggestions, setSuggestions] = useState(() => pickRandom(ALL_PROMPTS, 3));
  const [key, setKey] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSuggestions(pickRandom(ALL_PROMPTS, 3));
      setKey((k) => k + 1);
    }, 8000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        textAlign: "center",
        padding: "0 16px",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--se-primary-dim)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          color: "var(--se-primary)",
          fontWeight: 900,
        }}
      >
        ✦
      </div>
      <div>
        <h1
          style={{
            fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
            fontWeight: 800,
            color: "var(--se-text-main)",
            margin: "0 0 8px",
            letterSpacing: "-0.02em",
          }}
        >
          What can I <span className="text-gradient-vivid">help</span> with?
        </h1>
        <p style={{ fontSize: 14, color: "var(--se-text-muted)", margin: 0, maxWidth: 360 }}>
          Ask about dining options, nutrition, or meal ideas across all UIUC dining halls.
        </p>
      </div>
      <div
        key={key}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
          maxWidth: 560,
          animation: "suggestionCrossfade 300ms ease-out",
        }}
      >
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            style={{
              padding: "10px 16px",
              borderRadius: "var(--se-radius-full)",
              border: "1px solid var(--se-border)",
              background: "var(--se-bg-surface)",
              color: "var(--se-text-secondary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "var(--se-shadow-sm)",
              transition: "border-color 120ms, color 120ms, transform 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--se-primary)";
              e.currentTarget.style.color = "var(--se-text-main)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--se-border)";
              e.currentTarget.style.color = "var(--se-text-secondary)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            {s} →
          </button>
        ))}
      </div>
    </div>
  );
}
