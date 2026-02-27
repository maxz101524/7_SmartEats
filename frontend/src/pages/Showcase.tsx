/**
 * Component Showcase — design review page
 * Route: /showcase  (remove before deploying to production)
 *
 * Visit localhost:5173/showcase to compare components against the reference design.
 * Each section shows all variants and states.
 */

import { useState } from "react";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { FoodListItem } from "../components/FoodListItem";
import { FoodIcon } from "../components/FoodIcon";

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

export default function Showcase() {
  const [added, setAdded] = useState<Record<string, boolean>>({});

  const toggle = (key: string) =>
    setAdded((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div
      className="min-h-screen py-12"
      style={{ background: "var(--se-bg-base)", fontFamily: "var(--se-font-sans)" }}
    >
      <div className="max-w-2xl mx-auto px-6">

        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-extrabold mb-1" style={{ color: "var(--se-text-main)" }}>
            Component Showcase
          </h1>
          <p className="text-sm" style={{ color: "var(--se-text-muted)" }}>
            Compare against the reference design. Report what to adjust before these are used in real pages.
          </p>
        </div>

        {/* ── Color palette ───────────────────────────────────────── */}
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
                <p className="text-xs" style={{ color: "var(--se-text-faint)" }}>{label}</p>
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
                <p className="text-xs" style={{ color: "var(--se-text-faint)" }}>{label}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Typography ──────────────────────────────────────────── */}
        <Section title="Typography">
          <Card padding="md">
            <div className="space-y-3">
              <p style={{ fontSize: "var(--se-text-display)", fontWeight: 800, color: "var(--se-text-main)", lineHeight: 1.1 }}>1,850</p>
              <p style={{ fontSize: "var(--se-text-h1)", fontWeight: 700, color: "var(--se-text-main)", lineHeight: 1.1 }}>Page Title</p>
              <p style={{ fontSize: "var(--se-text-h2)", fontWeight: 700, color: "var(--se-text-main)" }}>Section Heading</p>
              <p style={{ fontSize: "var(--se-text-h3)", fontWeight: 600, color: "var(--se-text-main)" }}>Card Heading</p>
              <p style={{ fontSize: "var(--se-text-base)", fontWeight: 400, color: "var(--se-text-main)" }}>Body text — the quick brown fox jumps over the lazy dog.</p>
              <p style={{ fontSize: "var(--se-text-sm)", fontWeight: 400, color: "var(--se-text-secondary)" }}>Secondary text — supporting information and descriptions.</p>
              <p style={{ fontSize: "var(--se-text-xs)", fontWeight: 400, color: "var(--se-text-muted)" }}>Caption · Timestamp · Muted label</p>
              <p style={{ fontSize: "var(--se-text-xs)", fontWeight: 400, color: "var(--se-text-faint)" }}>Faint — placeholder, disabled</p>
            </div>
          </Card>
        </Section>

        {/* ── Buttons ─────────────────────────────────────────────── */}
        <Section title="Button — variants">
          <div className="flex flex-wrap gap-3 mb-6">
            <div>
              <Label>Primary · md</Label>
              <Button variant="primary">Browse Menu</Button>
            </div>
            <div>
              <Label>Secondary · md</Label>
              <Button variant="secondary">Cancel</Button>
            </div>
            <div>
              <Label>Ghost · md</Label>
              <Button variant="ghost">View all</Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-6">
            <div>
              <Label>Primary · sm</Label>
              <Button variant="primary" size="sm">Add</Button>
            </div>
            <div>
              <Label>Primary · lg</Label>
              <Button variant="primary" size="lg">Log This Meal</Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <div>
              <Label>Primary · loading</Label>
              <Button variant="primary" loading>Saving…</Button>
            </div>
            <div>
              <Label>Primary · disabled</Label>
              <Button variant="primary" disabled>Unavailable</Button>
            </div>
            <div>
              <Label>Secondary · disabled</Label>
              <Button variant="secondary" disabled>Unavailable</Button>
            </div>
          </div>
        </Section>

        {/* ── Cards ───────────────────────────────────────────────── */}
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
              <Label>Hover (try hovering)</Label>
              <Card hover>
                <p className="text-xs uppercase font-semibold tracking-wide mb-1" style={{ color: "var(--se-text-muted)" }}>ISR DINING</p>
                <p className="text-lg font-semibold" style={{ color: "var(--se-text-main)" }}>Illinois Street Res</p>
                <p className="text-sm mt-1" style={{ color: "var(--se-success)" }}>● Open · closes 9pm</p>
              </Card>
            </div>
          </div>

          <Label>Card with no padding (for list containers)</Label>
          <Card padding="none">
            <div className="px-4 py-3 border-b border-[var(--se-border)]">
              <p className="text-sm font-semibold" style={{ color: "var(--se-text-main)" }}>Today's Menu</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-sm" style={{ color: "var(--se-text-muted)" }}>List items go here with their own dividers</p>
            </div>
          </Card>
        </Section>

        {/* ── FoodIcon ────────────────────────────────────────────── */}
        <Section title="FoodIcon — keyword → category → letter pill">
          <Card padding="md">
            <p className="text-xs mb-3" style={{ color: "var(--se-text-faint)" }}>
              Keyword matches (tier 1)
            </p>
            <div className="flex flex-wrap gap-4 mb-5">
              {[
                "Grilled Chicken", "Scrambled Eggs", "Caesar Salad", "Spaghetti Bolognese",
                "Blueberry Muffin", "Chicken Tikka Masala", "Beef Tacos", "Banana Bread",
                "Chocolate Chip Cookie", "Tomato Soup", "Cheese Pizza", "Strawberry Yogurt",
              ].map((name) => (
                <div key={name} className="flex flex-col items-center gap-1.5">
                  <div className="w-10 h-10 rounded-[var(--se-radius-md)] flex items-center justify-center" style={{ background: "var(--se-bg-subtle)" }}>
                    <FoodIcon dishName={name} size="md" />
                  </div>
                  <span className="text-xs text-center" style={{ color: "var(--se-text-muted)", maxWidth: 64 }}>{name}</span>
                </div>
              ))}
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--se-text-faint)" }}>
              Category fallback (tier 2) — no keyword match, category provided
            </p>
            <div className="flex flex-wrap gap-4 mb-5">
              {(["fruit","vegetable","grain","protein","dairy","dessert","drink","soup","other"] as const).map((cat) => (
                <div key={cat} className="flex flex-col items-center gap-1.5">
                  <div className="w-10 h-10 rounded-[var(--se-radius-md)] flex items-center justify-center" style={{ background: "var(--se-bg-subtle)" }}>
                    <FoodIcon dishName="Chef's Special" category={cat} size="md" />
                  </div>
                  <span className="text-xs" style={{ color: "var(--se-text-muted)" }}>{cat}</span>
                </div>
              ))}
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--se-text-faint)" }}>
              Letter pill fallback (tier 3) — no match at all
            </p>
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

        {/* ── FoodListItem ────────────────────────────────────────── */}
        <Section title="FoodListItem — the core list row">
          <Label>Inside a Card — with add button (click to toggle)</Label>
          <Card padding="none">
            <FoodListItem
              dishName="Avocado Toast with Poached Egg"
              category="grain"
              hallName="ISR Dining"
              calories={320}
              protein={14}
              onAdd={() => toggle("avocado")}
              added={added["avocado"]}
            />
            <FoodListItem
              dishName="Grilled Shrimp Tacos"
              category="protein"
              hallName="PAR Dining"
              calories={480}
              protein={28}
              onAdd={() => toggle("tacos")}
              added={added["tacos"]}
            />
            <FoodListItem
              dishName="Blueberry Overnight Oats"
              category="grain"
              hallName="Allen Dining"
              calories={290}
              protein={9}
              onAdd={() => toggle("oats")}
              added={added["oats"]}
            />
            <FoodListItem
              dishName="Caesar Salad"
              category="vegetable"
              hallName="FAR Dining"
              calories={210}
              protein={8}
              onAdd={() => toggle("caesar")}
              added={added["caesar"]}
            />
          </Card>

          <div className="mt-4">
            <Label>Without add button — display-only list</Label>
            <Card padding="none">
              <FoodListItem
                dishName="Chicken Tikka Masala"
                category="protein"
                calories={520}
                protein={38}
              />
              <FoodListItem
                dishName="Vegetable Stir Fry"
                category="vegetable"
                calories={185}
              />
            </Card>
          </div>
        </Section>

        {/* ── Badges ──────────────────────────────────────────────── */}
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

        {/* ── Filter chips ────────────────────────────────────────── */}
        <Section title="Filter chips (category row)">
          <FilterChipDemo />
        </Section>

        {/* ── Shadows ─────────────────────────────────────────────── */}
        <Section title="Shadow scale">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "shadow-sm (cards at rest)", shadow: "var(--se-shadow-sm)" },
              { label: "shadow-md (hover / dropdown)", shadow: "var(--se-shadow-md)" },
              { label: "shadow-lg (modal / panel)", shadow: "var(--se-shadow-lg)" },
            ].map(({ label, shadow }) => (
              <div key={label}>
                <Label>{label}</Label>
                <div
                  className="h-16 rounded-[var(--se-radius-lg)] bg-[var(--se-bg-surface)]"
                  style={{ boxShadow: shadow }}
                />
              </div>
            ))}
          </div>
        </Section>

      </div>
    </div>
  );
}

/* ── FilterChipDemo ──────────────────────────────────────────────────── */
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
