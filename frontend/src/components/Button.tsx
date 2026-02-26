import { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const sizeClasses = {
    sm: "px-3 py-1.5 text-sm gap-1.5",
    md: "px-6 py-3 text-base gap-2",
    lg: "px-8 py-4 text-lg gap-2",
  }[size];

  const variantClasses = {
    primary: isDisabled
      ? "bg-[var(--se-bg-subtle)] text-[var(--se-text-faint)] cursor-not-allowed"
      : "bg-[var(--se-primary)] text-[var(--se-text-inverted)] hover:bg-[var(--se-primary-hover)] active:scale-[0.97]",

    secondary: isDisabled
      ? "bg-transparent border-[1.5px] border-[var(--se-border)] text-[var(--se-text-faint)] cursor-not-allowed"
      : "bg-transparent border-[1.5px] border-[var(--se-border-strong)] text-[var(--se-text-main)] hover:bg-[var(--se-bg-subtle)] hover:border-[var(--se-primary)]",

    ghost: isDisabled
      ? "bg-transparent text-[var(--se-text-faint)] cursor-not-allowed"
      : "bg-transparent text-[var(--se-text-accent)] hover:underline",
  }[variant];

  return (
    <button
      disabled={isDisabled}
      className={[
        "inline-flex items-center justify-center font-semibold",
        "rounded-[var(--se-radius-md)]",
        "transition-all duration-150",
        sizeClasses,
        variantClasses,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {loading ? (
        <>
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
