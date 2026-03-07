export const FLAG_COLORS: Record<string, { bg: string; text: string }> = {
  Vegetarian: { bg: "var(--se-success-dim)", text: "var(--se-success)" },
  Vegan:      { bg: "var(--se-success-dim)", text: "var(--se-success)" },
  Halal:      { bg: "var(--se-info-dim)",    text: "var(--se-info)" },
  Jain:       { bg: "var(--se-warning-dim)", text: "var(--se-warning)" },
};

export const FLAG_FALLBACK = { bg: "var(--se-bg-subtle)", text: "var(--se-text-muted)" };
