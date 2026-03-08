import type { ReactNode } from "react";

interface EmptyStateProps {
  /** Short title (e.g. "No dishes match") */
  message: string;
  /** Optional longer description */
  sub?: string;
  /** Optional emoji or icon (e.g. "🍽") or React node */
  icon?: ReactNode;
  /** Optional primary action (e.g. Try Again button) */
  action?: ReactNode;
}

export function EmptyState({ message, sub, icon, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 24px",
        textAlign: "center",
      }}
    >
      {icon !== undefined ? (
        <div style={{ marginBottom: 12, lineHeight: 1 }}>{icon}</div>
      ) : (
        <p style={{ fontSize: 32, marginBottom: 12, lineHeight: 1 }}>🍽</p>
      )}
      <p
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--se-text-main)",
          marginBottom: 4,
        }}
      >
        {message}
      </p>
      {sub && (
        <p style={{ fontSize: 13, color: "var(--se-text-faint)", maxWidth: 280, margin: 0 }}>
          {sub}
        </p>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
