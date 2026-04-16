import { useState } from "react";

interface Props {
  text: string;
  onRegenerate: () => void;
  canRegenerate: boolean;
}

export function MessageActions({ text, onRegenerate, canRegenerate }: Props) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  return (
    <div
      className="ai-message-actions"
      style={{
        display: "flex",
        gap: 4,
        marginTop: 6,
        opacity: 0,
        transition: "opacity 150ms",
        color: "var(--se-text-faint)",
      }}
    >
      <IconBtn label={copied ? "Copied" : "Copy"} onClick={copy}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      </IconBtn>
      {canRegenerate && (
        <IconBtn label="Regenerate" onClick={onRegenerate}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
        </IconBtn>
      )}
      <IconBtn
        label="Helpful"
        active={feedback === "up"}
        onClick={() => setFeedback(feedback === "up" ? null : "up")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 10v12M15 5.88l-1 5.12h6.83a2 2 0 0 1 2 2.37l-1.3 7A2 2 0 0 1 19.57 22H7V10L14 3" />
        </svg>
      </IconBtn>
      <IconBtn
        label="Not helpful"
        active={feedback === "down"}
        onClick={() => setFeedback(feedback === "down" ? null : "down")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 14V2M9 18.12l1-5.12H3.17a2 2 0 0 1-2-2.37l1.3-7A2 2 0 0 1 4.43 2H17v12L10 21" />
        </svg>
      </IconBtn>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 26,
        height: 26,
        borderRadius: 6,
        border: "none",
        background: "transparent",
        color: active ? "var(--se-primary)" : "inherit",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}
