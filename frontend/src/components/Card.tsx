import { type ReactNode } from "react";
interface CardProps {
  children: ReactNode;
  className?: string;
  /** Adds hover border/shadow lift effect — use on clickable cards */
  hover?: boolean;
  /** Uses --se-primary-dim background — for the hero stat tile (calories) */
  hero?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

export function Card({
  children,
  className = "",
  hover = false,
  hero = false,
  padding = "md",
}: CardProps) {
  const paddingClass = {
    none: "",
    sm: "p-3",
    md: "p-4 md:p-6",
    lg: "p-6 md:p-8",
  }[padding];

  return (
    <div
      className={[
        "rounded-[var(--se-radius-lg)] border border-[var(--se-border)]",
        hero ? "bg-[var(--se-primary-dim)]" : "bg-[var(--se-bg-surface)]",
        hover
          ? "transition-all duration-150 cursor-pointer hover:border-[var(--se-border-strong)]"
          : "",
        paddingClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        boxShadow: "var(--se-shadow-sm)",
        ...(hover ? undefined : {}),
      }}
      onMouseEnter={
        hover
          ? (e) => {
              e.currentTarget.style.boxShadow = "var(--se-shadow-md)";
            }
          : undefined
      }
      onMouseLeave={
        hover
          ? (e) => {
              e.currentTarget.style.boxShadow = "var(--se-shadow-sm)";
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
