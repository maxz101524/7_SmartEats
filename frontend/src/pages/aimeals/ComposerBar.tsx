import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onSlashTrigger: () => void;
  loading: boolean;
  autoFocus?: boolean;
  compact?: boolean;
}

export function ComposerBar({
  value,
  onChange,
  onSubmit,
  onStop,
  onSlashTrigger,
  loading,
  autoFocus,
  compact = false,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading && value.trim()) onSubmit();
    }
  };

  const canSend = !loading && value.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
      className="ai-chatbox-form"
      style={{
        background: "var(--se-bg-surface)",
        border: "1px solid var(--se-border)",
        borderRadius: 22,
        padding: "12px 14px 8px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        transition: "border-color 150ms ease, box-shadow 150ms ease",
        maxWidth: compact ? 560 : 720,
        margin: "0 auto",
        width: "100%",
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        placeholder="Ask about dining halls, dishes, or nutrition…  type / for commands"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          if (next === "/") onSlashTrigger();
        }}
        onKeyDown={handleKeyDown}
        disabled={loading}
        className="ai-chatbox-input"
        style={{
          width: "100%",
          border: "none",
          outline: "none",
          background: "transparent",
          fontSize: 14,
          lineHeight: 1.5,
          color: "var(--se-text-main)",
          resize: "none",
          padding: "6px 0 10px",
          fontFamily: "inherit",
          minHeight: 24,
          maxHeight: 200,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            aria-label="Slash commands"
            onClick={onSlashTrigger}
            style={iconBtn}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M7 20l10-16" />
            </svg>
          </button>
          {value.length > 240 && (
            <span style={{ fontSize: 11, color: "var(--se-text-faint)" }}>{value.length}</span>
          )}
        </div>
        {loading ? (
          <button
            type="button"
            onClick={onStop}
            style={{ ...sendBtn, background: "var(--se-text-main)", color: "var(--se-text-inverted)" }}
            aria-label="Stop"
          >
            <span style={{
              display: "inline-block", width: 10, height: 10, background: "currentColor", borderRadius: 2,
            }} />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            style={{
              ...sendBtn,
              background: canSend ? "var(--se-text-main)" : "var(--se-bg-subtle)",
              color: canSend ? "var(--se-text-inverted)" : "var(--se-text-faint)",
              cursor: canSend ? "pointer" : "default",
            }}
            aria-label="Send"
          >
            Send
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        )}
      </div>
    </form>
  );
}

const iconBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  border: "none",
  background: "transparent",
  color: "var(--se-text-faint)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const sendBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 14px 7px 16px",
  borderRadius: 9999,
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  transition: "all 150ms",
};
