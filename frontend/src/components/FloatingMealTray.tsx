import { useEffect, useState } from "react";
import { useMealTray } from "../mealTray";
import { MealTrayCard } from "./MealTrayCard";

export default function FloatingMealTray() {
  const { count, totals } = useMealTray();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Floating action button — bottom right */}
      <button
        type="button"
        aria-label={`Open meal tray (${count} item${count === 1 ? "" : "s"})`}
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 45,
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 18px 12px 14px",
          borderRadius: "9999px",
          background: count > 0 ? "var(--se-primary)" : "var(--se-bg-surface)",
          color: count > 0 ? "var(--se-text-inverted)" : "var(--se-text-main)",
          border: "1px solid",
          borderColor: count > 0 ? "var(--se-primary)" : "var(--se-border)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: "0.875rem",
          transition: "transform 140ms ease, box-shadow 140ms ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background:
              count > 0 ? "rgba(255,255,255,0.18)" : "var(--se-bg-elevated)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          {/* Tray icon */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7h18M5 7v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          </svg>
          {count > 0 && (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                minWidth: 18,
                height: 18,
                padding: "0 5px",
                borderRadius: "9999px",
                background: "var(--se-bg-surface)",
                color: "var(--se-primary)",
                fontSize: 10,
                fontWeight: 800,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1.5px solid var(--se-primary)",
                lineHeight: 1,
              }}
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1, lineHeight: 1.1 }}>
          <span style={{ fontSize: 12, fontWeight: 700, opacity: count > 0 ? 0.85 : 0.7 }}>Meal tray</span>
          <span style={{ fontSize: 13, fontWeight: 800 }}>
            {count === 0 ? "Empty" : `${totals.calories} kcal`}
          </span>
        </span>
      </button>

      {/* Backdrop + drawer */}
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 12, 8, 0.42)",
              backdropFilter: "blur(2px)",
              zIndex: 60,
              animation: "se-tray-fade 180ms ease-out",
            }}
          />
          <aside
            role="dialog"
            aria-label="Meal tray"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(420px, 100%)",
              background: "var(--se-bg-base)",
              zIndex: 61,
              boxShadow: "-12px 0 40px rgba(0,0,0,0.18)",
              display: "flex",
              flexDirection: "column",
              animation: "se-tray-slide 240ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 20px",
                borderBottom: "1px solid var(--se-border)",
                background: "var(--se-bg-surface)",
              }}
            >
              <div>
                <p
                  style={{
                    margin: "0 0 2px",
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--se-text-faint)",
                  }}
                >
                  SmartEats
                </p>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.05rem",
                    fontWeight: 800,
                    color: "var(--se-text-main)",
                  }}
                >
                  Your meal tray
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close meal tray"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  border: "1px solid var(--se-border)",
                  background: "var(--se-bg-surface)",
                  color: "var(--se-text-secondary)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "18px 18px 28px" }}>
              <MealTrayCard />
            </div>
          </aside>

          <style>{`
            @keyframes se-tray-fade {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
            @keyframes se-tray-slide {
              from { transform: translateX(40px); opacity: 0; }
              to   { transform: translateX(0); opacity: 1; }
            }
          `}</style>
        </>
      )}
    </>
  );
}
