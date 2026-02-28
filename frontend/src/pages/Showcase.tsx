/**
 * Component Showcase — design review page
 * Route: /showcase  (remove before deploying to production)
 */

import { useState } from "react";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { FoodListItem } from "../components/FoodListItem";
import { FoodIcon } from "../components/FoodIcon";

// ─── Grain setup ─────────────────────────────────────────────────────────────
//
// WHY soft-light fails on light backgrounds:
//   soft-light formula when B ≈ 1 (near-white): output ≈ B → no change.
//   On #FAFAFA (L=0.98), even 100% opacity soft-light grain = invisible.
//
// FIX for flat backgrounds → `multiply` blend + range-compressed noise:
//   feComponentTransfer shifts noise from [0,1] → [floor,1].
//   multiply(base, grain) = base × grain.
//   When grain = 0.85: output = base × 0.85 → 15% darkening. Clearly visible.
//   CSS `opacity` then scales the effect strength.
//
// GRADIENTS keep soft-light: the gradient provides mid-tone contrast that
//   soft-light interacts with beautifully (glowing / luminous look).


/**
 * Range-compressed noise → [floor, 1.0] — for multiply blend on light backgrounds.
 * floor controls max darkening:  floor=0.85 → up to 15% darken.
 * baseFrequency: 0.72 = fine paper grain · 0.50 = coarser film grain.
 */
function grainMultiplyUrl(floor = 0.85, baseFrequency = 0.72, size = 200): string {
  const slope = 1 - floor;
  const intercept = floor;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
    `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${baseFrequency}' numOctaves='4' stitchTiles='stitch'/>` +
    `<feColorMatrix type='saturate' values='0'/>` +
    `<feComponentTransfer>` +
    `<feFuncR type='linear' slope='${slope}' intercept='${intercept}'/>` +
    `<feFuncG type='linear' slope='${slope}' intercept='${intercept}'/>` +
    `<feFuncB type='linear' slope='${slope}' intercept='${intercept}'/>` +
    `</feComponentTransfer></filter>` +
    `<rect width='${size}' height='${size}' filter='url(%23n)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// Pre-computed grain tile
const GRAIN_PAPER = grainMultiplyUrl(0.86, 0.72, 200); // fine multiply grain — artisan paper

// CSS keyframes for animated film grain (shifts tile position at ~12fps via steps())
const GRAIN_KEYFRAMES = `
  @keyframes grain-shift {
    0%   { transform: translate(0,     0);    }
    12%  { transform: translate(-5%,  -10%);  }
    25%  { transform: translate(7%,   -25%);  }
    37%  { transform: translate(-15%,  5%);   }
    50%  { transform: translate(-5%,   25%);  }
    62%  { transform: translate(15%,   10%);  }
    75%  { transform: translate(-10%,  0%);   }
    87%  { transform: translate(3%,   -15%);  }
    100% { transform: translate(0,     0);    }
  }
`;

// ─── Background option type & groups ─────────────────────────────────────────

type GrainPreset = "paper";

type BgOption = {
  id: string;
  label: string;
  desc: string;
  bgColor: string;
  gradientImage?: string;
  grainPreset?: GrainPreset;         // which noise tile to use (default: "paper")
  grainBlend?: React.CSSProperties["mixBlendMode"]; // default: "multiply"
  grainOpacity: number;              // CSS opacity on the grain overlay (0 = no grain)
  animated?: boolean;
  dark?: boolean;
};

const GRAIN_MAP: Record<GrainPreset, string> = {
  paper: GRAIN_PAPER,
};

// ── Clean cream/grey backgrounds — the finalists ──────────────────────────────

const BG_OPTIONS: BgOption[] = [
  {
    id: "clean-cream",
    label: "Clean Cream",
    desc: "Warm cream #F5F3F0 + fine multiply grain × 0.55 — the chosen app background.",
    bgColor: "#F5F3F0",
    grainPreset: "paper",
    grainBlend: "multiply",
    grainOpacity: 0.55,
  },
  {
    id: "warm-paper",
    label: "Warm Paper",
    desc: "Deeper ivory cream + multiply grain × 0.80 — more warmth, still clean.",
    bgColor: "#F5F0E8",
    grainPreset: "paper",
    grainBlend: "multiply",
    grainOpacity: 0.80,
  },
  {
    id: "studio-grey",
    label: "Studio Grey",
    desc: "Cool-neutral #F3F2F0 + fine grain × 0.55 — cleanest, most neutral option.",
    bgColor: "#F3F2F0",
    grainPreset: "paper",
    grainBlend: "multiply",
    grainOpacity: 0.55,
  },
  {
    id: "near-white",
    label: "Near White",
    desc: "#FAFAF8 + feather grain × 0.40 — minimal texture, brightest option.",
    bgColor: "#FAFAF8",
    grainPreset: "paper",
    grainBlend: "multiply",
    grainOpacity: 0.40,
  },
  {
    id: "flat-ref",
    label: "Flat (no grain)",
    desc: "Flat warm cream — no grain. Comparison baseline.",
    bgColor: "#F3F0EA",
    grainOpacity: 0,
  },
];

const ALL_OPTIONS = BG_OPTIONS;

// ─── Grain overlay component ──────────────────────────────────────────────────

function GrainOverlay({
  opt,
  forTile = false,
}: {
  opt: BgOption;
  forTile?: boolean;
}) {
  if (opt.grainOpacity === 0) return null;
  const grainImg = GRAIN_MAP[opt.grainPreset ?? "paper"];
  const blend = opt.grainBlend ?? "multiply";
  const sharedStyle: React.CSSProperties = {
    pointerEvents: "none",
    backgroundImage: grainImg,
    backgroundRepeat: "repeat",
    mixBlendMode: blend,
    opacity: opt.grainOpacity,
  };
  if (forTile) {
    return (
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          ...sharedStyle,
        }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: "-120px",
        zIndex: 0,
        ...sharedStyle,
        ...(opt.animated && {
          animation: "grain-shift 0.5s steps(1) infinite",
        }),
      }}
    />
  );
}

// ─── Swatch sub-components ────────────────────────────────────────────────────

function SwatchCard({ dark = false }: { dark?: boolean }) {
  return (
    <div
      style={{
        background: dark ? "#2A1E14" : "#fff",
        border: `1px solid ${dark ? "#3D2A1A" : "#E4DED5"}`,
        borderRadius: 12,
        padding: "10px 12px",
        boxShadow: dark
          ? "0 1px 3px rgba(0,0,0,0.45)"
          : "0 1px 3px rgba(0,0,0,0.07)",
        width: "100%",
      }}
    >
      <p
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: dark ? "#8A7060" : "#7A736B",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        CALORIES
      </p>
      <p style={{ fontSize: 22, fontWeight: 800, color: "#E84A27", lineHeight: 1 }}>
        1,850
      </p>
      <p
        style={{ fontSize: 10, color: dark ? "#7A6A5A" : "#A89E95", marginTop: 2 }}
      >
        kcal today
      </p>
      <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 9999,
            background: "#FDE8E2",
            color: "#E84A27",
          }}
        >
          320 kcal
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 9999,
            background: "#DBEAFE",
            color: "#3B82F6",
          }}
        >
          14g P
        </span>
      </div>
    </div>
  );
}

function SwatchButton({
  opt,
  active,
  onSelect,
}: {
  opt: BgOption;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="text-left"
      style={{
        borderRadius: 14,
        border: active ? "2px solid var(--se-primary)" : "2px solid transparent",
        outline: active ? "3px solid var(--se-primary-dim)" : "none",
        padding: 0,
        overflow: "hidden",
        cursor: "pointer",
        background: "transparent",
        boxShadow: active
          ? "0 4px 16px rgba(232,74,39,0.20)"
          : "0 1px 4px rgba(0,0,0,0.09)",
        transition: "box-shadow 0.15s, border-color 0.15s",
      }}
    >
      {/* ── Textured background preview area ── */}
      <div
        style={{
          position: "relative",
          height: 140,
          overflow: "hidden",
          backgroundColor: opt.bgColor,
        }}
      >
        {/* Gradient layer */}
        {opt.gradientImage && (
          <div
            style={{ position: "absolute", inset: 0, backgroundImage: opt.gradientImage }}
          />
        )}
        {/* Grain overlay */}
        <GrainOverlay opt={opt} forTile />
        {/* Animated badge */}
        {opt.animated && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "rgba(232,74,39,0.90)",
              color: "#fff",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: "2px 6px",
              borderRadius: 4,
              zIndex: 3,
            }}
          >
            LIVE
          </div>
        )}
        {/* Card rendered above grain */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "14px 12px",
          }}
        >
          <SwatchCard dark={opt.dark} />
        </div>
      </div>

      {/* ── Label area ── */}
      <div
        style={{
          background: active ? "var(--se-primary-dim)" : "var(--se-bg-surface)",
          borderTop: "1px solid var(--se-border)",
          padding: "8px 10px",
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: active ? "var(--se-primary)" : "var(--se-text-main)",
            marginBottom: 2,
          }}
        >
          {active ? "✓ " : ""}
          {opt.label}
        </p>
        <p style={{ fontSize: 10, color: "var(--se-text-faint)", lineHeight: 1.35 }}>
          {opt.desc}
        </p>
      </div>
    </button>
  );
}

// ─── Shared section helpers ───────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-4"
        style={{ color: "var(--se-text-muted)" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs mb-2" style={{ color: "var(--se-text-faint)" }}>
      {children}
    </p>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Showcase() {
  const [activeBg, setActiveBg] = useState<string>("clean-cream");
  const [added, setAdded] = useState<Record<string, boolean>>({});

  const toggle = (key: string) =>
    setAdded((prev) => ({ ...prev, [key]: !prev[key] }));

  const selected = ALL_OPTIONS.find((b) => b.id === activeBg)!;

  return (
    <>
      {/* Grain animation keyframes — injected once */}
      <style>{GRAIN_KEYFRAMES}</style>

      {/* ── Page background stack ─────────────────────────────────── */}
      <div
        className="min-h-screen"
        style={{
          backgroundColor: selected.bgColor,
          transition: "background-color 0.4s ease",
          position: "relative",
        }}
      >
        {/* Gradient overlay (fixed, covers full viewport) */}
        {selected.gradientImage && (
          <div
            aria-hidden="true"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 0,
              pointerEvents: "none",
              backgroundImage: selected.gradientImage,
            }}
          />
        )}

        {/* Grain overlay */}
        <GrainOverlay opt={selected} />

        {/* ── All content sits above grain (z-index: 1) ───────────── */}
        <div
          className="py-12"
          style={{ position: "relative", zIndex: 1, fontFamily: "var(--se-font-sans)" }}
        >
          <div className="max-w-2xl mx-auto px-6">

            {/* Header */}
            <div className="mb-12">
              <h1
                className="text-3xl font-extrabold mb-1"
                style={{ color: "var(--se-text-main)" }}
              >
                Component Showcase
              </h1>
              <p className="text-sm" style={{ color: "var(--se-text-muted)" }}>
                Design review — background picker + component library.
              </p>
            </div>

            {/* ── Background picker ─────────────────────────────────── */}
            <Section title="Background — click to preview full page">
              <div className="grid grid-cols-2 gap-3 mb-5">
                {BG_OPTIONS.map((opt) => (
                  <SwatchButton
                    key={opt.id}
                    opt={opt}
                    active={activeBg === opt.id}
                    onSelect={() => setActiveBg(opt.id)}
                  />
                ))}
              </div>

              {/* Selected info bar */}
              <div
                style={{
                  background: "var(--se-bg-surface)",
                  border: "1px solid var(--se-border)",
                  borderLeft: "3px solid var(--se-primary)",
                  borderRadius: "var(--se-radius-md)",
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: "1px solid var(--se-border)",
                    flexShrink: 0,
                    backgroundColor: selected.bgColor,
                    backgroundImage: selected.gradientImage,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {selected.grainOpacity > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundImage: GRAIN_MAP[selected.grainPreset ?? "paper"],
                        mixBlendMode: selected.grainBlend ?? "multiply",
                        opacity: selected.grainOpacity,
                      }}
                    />
                  )}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--se-text-main)" }}>
                    {selected.label}
                    {selected.animated && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 9,
                          fontWeight: 700,
                          background: "var(--se-primary)",
                          color: "#fff",
                          padding: "1px 5px",
                          borderRadius: 3,
                          letterSpacing: "0.05em",
                        }}
                      >
                        ANIMATED
                      </span>
                    )}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--se-text-muted)" }}>
                    {selected.bgColor}
                    {selected.gradientImage ? " + gradient" : ""}
                    {" · "}
                    {selected.grainOpacity > 0
                      ? `${selected.grainBlend ?? "multiply"} grain × ${selected.grainOpacity} (${selected.grainPreset ?? "paper"})`
                      : "no grain"}
                  </p>
                </div>
              </div>
            </Section>

            {/* ── Color tokens ──────────────────────────────────────── */}
            <Section title="Color tokens — surfaces & brand">
              <div className="grid grid-cols-5 gap-2 mb-4">
                {[
                  { label: "bg-base", bg: "var(--se-bg-base)", border: true },
                  { label: "bg-surface", bg: "var(--se-bg-surface)", border: true },
                  { label: "bg-elevated", bg: "var(--se-bg-elevated)", border: true },
                  { label: "bg-subtle", bg: "var(--se-bg-subtle)", border: false },
                  { label: "primary-dim", bg: "var(--se-primary-dim)", border: false },
                ].map(({ label, bg, border }) => (
                  <div key={label}>
                    <div
                      className="h-10 rounded-[var(--se-radius-md)] mb-1"
                      style={{
                        background: bg,
                        border: border ? "1px solid var(--se-border)" : undefined,
                        boxShadow: border ? "var(--se-shadow-sm)" : undefined,
                      }}
                    />
                    <p className="text-xs" style={{ color: "var(--se-text-faint)" }}>
                      {label}
                    </p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: "macro-cal", color: "var(--se-macro-cal)" },
                  { label: "macro-protein", color: "var(--se-macro-protein)" },
                  { label: "macro-carbs", color: "var(--se-macro-carbs)" },
                  { label: "macro-fat", color: "var(--se-macro-fat)" },
                  { label: "macro-fiber", color: "var(--se-macro-fiber)" },
                ].map(({ label, color }) => (
                  <div key={label}>
                    <div
                      className="h-10 rounded-[var(--se-radius-md)] mb-1"
                      style={{ background: color }}
                    />
                    <p className="text-xs" style={{ color: "var(--se-text-faint)" }}>
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </Section>

            {/* ── Typography ────────────────────────────────────────── */}
            <Section title="Typography">
              <Card padding="md">
                <div className="space-y-3">
                  <p style={{ fontSize: "var(--se-text-display)", fontWeight: 800, color: "var(--se-text-main)", lineHeight: 1.1 }}>1,850</p>
                  <p style={{ fontSize: "var(--se-text-h1)", fontWeight: 700, color: "var(--se-text-main)", lineHeight: 1.1 }}>Page Title</p>
                  <p style={{ fontSize: "var(--se-text-h2)", fontWeight: 700, color: "var(--se-text-main)" }}>Section Heading</p>
                  <p style={{ fontSize: "var(--se-text-h3)", fontWeight: 600, color: "var(--se-text-main)" }}>Card Heading</p>
                  <p style={{ fontSize: "var(--se-text-base)", color: "var(--se-text-main)" }}>Body text — the quick brown fox jumps over the lazy dog.</p>
                  <p style={{ fontSize: "var(--se-text-sm)", color: "var(--se-text-secondary)" }}>Secondary text — supporting information and descriptions.</p>
                  <p style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-muted)" }}>Caption · Timestamp · Muted label</p>
                  <p style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-faint)" }}>Faint — placeholder, disabled</p>
                </div>
              </Card>
            </Section>

            {/* ── Buttons ───────────────────────────────────────────── */}
            <Section title="Button — variants">
              <div className="flex flex-wrap gap-3 mb-6">
                <div><Label>Primary · md</Label><Button variant="primary">Browse Menu</Button></div>
                <div><Label>Secondary · md</Label><Button variant="secondary">Cancel</Button></div>
                <div><Label>Ghost · md</Label><Button variant="ghost">View all</Button></div>
              </div>
              <div className="flex flex-wrap gap-3 mb-6">
                <div><Label>Primary · sm</Label><Button variant="primary" size="sm">Add</Button></div>
                <div><Label>Primary · lg</Label><Button variant="primary" size="lg">Log This Meal</Button></div>
              </div>
              <div className="flex flex-wrap gap-3">
                <div><Label>Loading</Label><Button variant="primary" loading>Saving…</Button></div>
                <div><Label>Disabled</Label><Button variant="primary" disabled>Unavailable</Button></div>
                <div><Label>Secondary disabled</Label><Button variant="secondary" disabled>Unavailable</Button></div>
              </div>
            </Section>

            {/* ── Cards ─────────────────────────────────────────────── */}
            <Section title="Card — variants">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <Label>Default</Label>
                  <Card>
                    <p className="text-xs uppercase font-semibold tracking-wide mb-1" style={{ color: "var(--se-text-muted)" }}>PROTEIN</p>
                    <p className="text-4xl font-extrabold" style={{ color: "var(--se-macro-protein)" }}>42g</p>
                    <p className="text-sm mt-1" style={{ color: "var(--se-text-muted)" }}>of 138g goal</p>
                  </Card>
                </div>
                <div>
                  <Label>Hero (calories)</Label>
                  <Card hero>
                    <p className="text-xs uppercase font-semibold tracking-wide mb-1" style={{ color: "var(--se-macro-cal)" }}>CALORIES</p>
                    <p className="text-4xl font-extrabold" style={{ color: "var(--se-macro-cal)" }}>1,850</p>
                    <p className="text-sm mt-1" style={{ color: "var(--se-text-muted)" }}>kcal today</p>
                  </Card>
                </div>
                <div>
                  <Label>Hover</Label>
                  <Card hover>
                    <p className="text-xs uppercase font-semibold tracking-wide mb-1" style={{ color: "var(--se-text-muted)" }}>ISR DINING</p>
                    <p className="text-lg font-semibold" style={{ color: "var(--se-text-main)" }}>Illinois Street Res</p>
                    <p className="text-sm mt-1" style={{ color: "var(--se-success)" }}>● Open · closes 9pm</p>
                  </Card>
                </div>
              </div>
              <Label>No padding (list container)</Label>
              <Card padding="none">
                <div className="px-4 py-3 border-b border-[var(--se-border)]">
                  <p className="text-sm font-semibold" style={{ color: "var(--se-text-main)" }}>Today's Menu</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-sm" style={{ color: "var(--se-text-muted)" }}>List items go here with their own dividers</p>
                </div>
              </Card>
            </Section>

            {/* ── FoodIcon ──────────────────────────────────────────── */}
            <Section title="FoodIcon — keyword → category → letter pill">
              <Card padding="md">
                <p className="text-xs mb-3" style={{ color: "var(--se-text-faint)" }}>Keyword matches (tier 1)</p>
                <div className="flex flex-wrap gap-4 mb-5">
                  {["Grilled Chicken", "Scrambled Eggs", "Caesar Salad", "Spaghetti Bolognese", "Blueberry Muffin", "Chicken Tikka Masala", "Beef Tacos", "Banana Bread", "Chocolate Chip Cookie", "Tomato Soup", "Cheese Pizza", "Strawberry Yogurt"].map((name) => (
                    <div key={name} className="flex flex-col items-center gap-1.5">
                      <div className="w-10 h-10 rounded-[var(--se-radius-md)] flex items-center justify-center" style={{ background: "var(--se-bg-subtle)" }}>
                        <FoodIcon dishName={name} size="md" />
                      </div>
                      <span className="text-xs text-center" style={{ color: "var(--se-text-muted)", maxWidth: 64 }}>{name}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs mb-3" style={{ color: "var(--se-text-faint)" }}>Category fallback (tier 2)</p>
                <div className="flex flex-wrap gap-4 mb-5">
                  {(["fruit", "vegetable", "grain", "protein", "dairy", "dessert", "drink", "soup", "other"] as const).map((cat) => (
                    <div key={cat} className="flex flex-col items-center gap-1.5">
                      <div className="w-10 h-10 rounded-[var(--se-radius-md)] flex items-center justify-center" style={{ background: "var(--se-bg-subtle)" }}>
                        <FoodIcon dishName="Chef's Special" category={cat} size="md" />
                      </div>
                      <span className="text-xs" style={{ color: "var(--se-text-muted)" }}>{cat}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs mb-3" style={{ color: "var(--se-text-faint)" }}>Letter pill fallback (tier 3)</p>
                <div className="flex flex-wrap gap-4">
                  {["Chef's Creation", "Daily Special", "House Mix", "Fusion Blend", "Mystery Dish"].map((name) => (
                    <div key={name} className="flex flex-col items-center gap-1.5">
                      <FoodIcon dishName={name} size="md" />
                      <span className="text-xs text-center" style={{ color: "var(--se-text-muted)", maxWidth: 64 }}>{name}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </Section>

            {/* ── FoodListItem ──────────────────────────────────────── */}
            <Section title="FoodListItem — the core list row">
              <Label>With add button (click to toggle)</Label>
              <Card padding="none">
                <FoodListItem dishName="Avocado Toast with Poached Egg" category="grain" hallName="ISR Dining" calories={320} protein={14} onAdd={() => toggle("avocado")} added={added["avocado"]} />
                <FoodListItem dishName="Grilled Shrimp Tacos" category="protein" hallName="PAR Dining" calories={480} protein={28} onAdd={() => toggle("tacos")} added={added["tacos"]} />
                <FoodListItem dishName="Blueberry Overnight Oats" category="grain" hallName="Allen Dining" calories={290} protein={9} onAdd={() => toggle("oats")} added={added["oats"]} />
                <FoodListItem dishName="Caesar Salad" category="vegetable" hallName="FAR Dining" calories={210} protein={8} onAdd={() => toggle("caesar")} added={added["caesar"]} />
              </Card>
              <div className="mt-4">
                <Label>Display-only (no add button)</Label>
                <Card padding="none">
                  <FoodListItem dishName="Chicken Tikka Masala" category="protein" calories={520} protein={38} />
                  <FoodListItem dishName="Vegetable Stir Fry" category="vegetable" calories={185} />
                </Card>
              </div>
            </Section>

            {/* ── Badges ────────────────────────────────────────────── */}
            <Section title="Macro badges & status pills">
              <Card padding="md">
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: "var(--se-primary-dim)", color: "var(--se-macro-cal)" }}>320 kcal</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: "var(--se-info-dim)", color: "var(--se-macro-protein)" }}>14g P</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: "var(--se-warning-dim)", color: "var(--se-macro-carbs)" }}>38g C</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: "#FEF3EE", color: "var(--se-macro-fat)" }}>12g F</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "var(--se-success-dim)", color: "var(--se-success)" }}>● Open</span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "var(--se-error-dim)", color: "var(--se-error)" }}>● Closed</span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "var(--se-warning-dim)", color: "var(--se-warning)" }}>⚠ Limited hours</span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "var(--se-info-dim)", color: "var(--se-info)" }}>ℹ Info</span>
                </div>
              </Card>
            </Section>

            {/* ── Filter chips ──────────────────────────────────────── */}
            <Section title="Filter chips (category row)">
              <FilterChipDemo />
            </Section>

            {/* ── Shadows ───────────────────────────────────────────── */}
            <Section title="Shadow scale">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "shadow-sm (cards at rest)", shadow: "var(--se-shadow-sm)" },
                  { label: "shadow-md (hover / dropdown)", shadow: "var(--se-shadow-md)" },
                  { label: "shadow-lg (modal / panel)", shadow: "var(--se-shadow-lg)" },
                ].map(({ label, shadow }) => (
                  <div key={label}>
                    <Label>{label}</Label>
                    <div className="h-16 rounded-[var(--se-radius-lg)] bg-[var(--se-bg-surface)]" style={{ boxShadow: shadow }} />
                  </div>
                ))}
              </div>
            </Section>

          </div>
        </div>
      </div>
    </>
  );
}

// ─── Filter chip demo ─────────────────────────────────────────────────────────

function FilterChipDemo() {
  const chips = ["All", "Breakfast", "Lunch", "Dinner", "Snack"];
  const [active, setActive] = useState("All");
  return (
    <div className="flex gap-2 flex-wrap">
      {chips.map((chip) => {
        const isActive = chip === active;
        return (
          <button
            key={chip}
            onClick={() => setActive(chip)}
            className="px-3 h-8 rounded-full text-xs font-semibold transition-all duration-100 border"
            style={{
              background: isActive ? "var(--se-primary-dim)" : "var(--se-bg-subtle)",
              borderColor: isActive ? "var(--se-primary)" : "var(--se-border)",
              color: isActive ? "var(--se-primary)" : "var(--se-text-muted)",
            }}
          >
            {chip}
          </button>
        );
      })}
    </div>
  );
}
