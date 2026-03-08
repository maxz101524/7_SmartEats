import { type ReactNode, useCallback } from "react";
interface CardProps {
  children: ReactNode;
  className?: string;
  /** Adds hover border/shadow lift effect — use on clickable cards */
  hover?: boolean;
  /** Uses --se-primary-dim background — for the hero stat tile (calories) */
  hero?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  onClick?: () => void;
}

export function Card({
  children,
  className = "",
  hover = false,
  hero = false,
  padding = "md",
  onClick,
}: CardProps) {
  const paddingClass = {
    none: "",
    sm: "p-3",
    md: "p-4 md:p-6",
    lg: "p-6 md:p-8",
  }[padding];

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (onClick && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        onClick();
      }
    },
    [onClick]
  );

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
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
        transition: "transform 150ms ease, box-shadow 150ms ease",
      }}
      onMouseEnter={
        hover
          ? (e) => {
              e.currentTarget.style.boxShadow = "var(--se-shadow-md)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }
          : undefined
      }
      onMouseLeave={
        hover
          ? (e) => {
              e.currentTarget.style.boxShadow = "var(--se-shadow-sm)";
              e.currentTarget.style.transform = "translateY(0)";
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
