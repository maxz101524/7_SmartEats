import { useEffect, useMemo, useRef, useState } from "react";


export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  hint?: string;
  disabled?: boolean;
  onRun: () => void;
}

interface Props {
  open: boolean;
  query: string; // text after "/"
  commands: SlashCommand[];
  onClose: () => void;
}

export function SlashMenu({ open, query, commands, onClose }: Props) {
  const [highlight, setHighlight] = useState(0);
  const [lastQuery, setLastQuery] = useState(query);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return commands;
    return commands.filter((c) => c.id.includes(q) || c.label.toLowerCase().includes(q));
  }, [commands, query]);

  if (lastQuery !== query) {
    setLastQuery(query);
    setHighlight(0);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
      } else if (e.key === "Enter") {
        const cmd = filtered[highlight];
        if (cmd && !cmd.disabled) {
          e.preventDefault();
          cmd.onRun();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, highlight, onClose]);

  if (!open || filtered.length === 0) return null;

  return (
    <div
      ref={ref}
      role="listbox"
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left: 0,
        minWidth: 280,
        maxWidth: 360,
        background: "var(--se-bg-surface)",
        border: "1px solid var(--se-border)",
        borderRadius: 12,
        boxShadow: "var(--se-shadow-lg)",
        padding: 6,
        zIndex: 40,
      }}
    >
      {filtered.map((cmd, idx) => (
        <button
          key={cmd.id}
          type="button"
          role="option"
          aria-selected={idx === highlight}
          disabled={cmd.disabled}
          onClick={() => {
            if (!cmd.disabled) {
              cmd.onRun();
              onClose();
            }
          }}
          onMouseEnter={() => setHighlight(idx)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            padding: "8px 10px",
            borderRadius: 8,
            border: "none",
            background: idx === highlight ? "var(--se-bg-subtle)" : "transparent",
            color: cmd.disabled ? "var(--se-text-faint)" : "var(--se-text-main)",
            textAlign: "left",
            cursor: cmd.disabled ? "not-allowed" : "pointer",
            fontSize: 13,
          }}
        >
          <span style={{
            fontFamily: "monospace",
            fontSize: 12,
            color: "var(--se-primary)",
            fontWeight: 700,
            minWidth: 72,
          }}>
            /{cmd.id}
          </span>
          <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span style={{ fontWeight: 600 }}>{cmd.label}</span>
            <span style={{ fontSize: 11, color: "var(--se-text-muted)" }}>{cmd.description}</span>
          </span>
          {cmd.hint && (
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--se-text-faint)" }}>
              {cmd.hint}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
