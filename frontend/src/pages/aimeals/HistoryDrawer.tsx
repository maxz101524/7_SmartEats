import { useEffect, useMemo, useState } from "react";
import type { ConvoSummary } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  conversations: ConvoSummary[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNewChat: () => void;
  onRename: (id: number, newTitle: string) => void;
  onDelete: (id: number) => void;
  isAuthenticated: boolean;
  onSignIn: () => void;
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString();
}

export function HistoryDrawer({
  open, onClose, conversations, activeId, onSelect, onNewChat,
  onRename, onDelete, isAuthenticated, onSignIn,
}: Props) {
  const [search, setSearch] = useState("");
  const [menuOpenFor, setMenuOpenFor] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.2)",
          backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
          zIndex: 60,
        }}
      />
      <aside
        className="ai-history-drawer"
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0,
          background: "var(--se-bg-surface)",
          borderRight: "1px solid var(--se-border)",
          zIndex: 61,
          animation: "drawerSlideIn 260ms cubic-bezier(0.32, 0.72, 0, 1)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--se-shadow-lg)",
        }}
      >
        <div style={{ padding: "18px 18px 12px", borderBottom: "1px solid var(--se-border-muted)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--se-text-main)" }}>
              Recent chats
            </h3>
            <button type="button" onClick={onClose} aria-label="Close" style={{
              width: 28, height: 28, border: "none", borderRadius: 6, background: "transparent",
              color: "var(--se-text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1,
            }}>×</button>
          </div>
          <button
            type="button"
            onClick={() => { onNewChat(); onClose(); }}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 10,
              border: "1px solid var(--se-border)", background: "var(--se-bg-elevated)",
              color: "var(--se-text-main)", fontSize: 13, fontWeight: 700,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <span style={{ fontSize: 16, color: "var(--se-primary)" }}>+</span>
            New chat
          </button>
          <input
            type="text"
            placeholder="Search chats…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", marginTop: 10, padding: "8px 12px",
              borderRadius: 8, border: "1px solid var(--se-border)",
              background: "var(--se-bg-base)", fontSize: 13, outline: "none",
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
          {!isAuthenticated ? (
            <div style={{ textAlign: "center", padding: "40px 16px" }}>
              <p style={{ fontSize: 13, color: "var(--se-text-muted)", margin: "0 0 12px" }}>
                Sign in to save your chats and access them across devices.
              </p>
              <button
                type="button"
                onClick={onSignIn}
                style={{
                  padding: "8px 16px", borderRadius: 9999, border: "none",
                  background: "var(--se-primary)", color: "white",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}
              >
                Sign in
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--se-text-faint)", textAlign: "center", padding: 24 }}>
              {search ? "No matches." : "No chats yet — ask something to begin."}
            </p>
          ) : (
            filtered.map((c) => {
              const isActive = c.id === activeId;
              const isRenaming = renamingId === c.id;
              return (
                <div
                  key={c.id}
                  style={{
                    position: "relative",
                    borderRadius: 8,
                    background: isActive ? "var(--se-bg-subtle)" : "transparent",
                    marginBottom: 2,
                  }}
                >
                  {isRenaming ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (renameValue.trim()) onRename(c.id, renameValue.trim());
                        setRenamingId(null);
                      }}
                      style={{ padding: "6px 10px" }}
                    >
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => setRenamingId(null)}
                        onKeyDown={(e) => { if (e.key === "Escape") setRenamingId(null); }}
                        style={{
                          width: "100%", padding: "6px 8px", borderRadius: 6,
                          border: "1px solid var(--se-border-strong)",
                          fontSize: 13, outline: "none",
                        }}
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { onSelect(c.id); }}
                      style={{
                        display: "block", width: "100%", padding: "10px 12px",
                        textAlign: "left", background: "transparent", border: "none",
                        cursor: "pointer", borderRadius: 8,
                      }}
                    >
                      <div style={{
                        fontSize: 13, fontWeight: 600,
                        color: "var(--se-text-main)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {c.title}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--se-text-faint)", marginTop: 2 }}>
                        {relativeTime(c.updated_at)} · {c.message_count} msg
                      </div>
                    </button>
                  )}
                  {!isRenaming && (
                    <button
                      type="button"
                      aria-label="More"
                      onClick={(e) => { e.stopPropagation(); setMenuOpenFor(menuOpenFor === c.id ? null : c.id); }}
                      style={{
                        position: "absolute", top: 8, right: 8,
                        width: 24, height: 24, borderRadius: 6,
                        border: "none", background: "transparent",
                        color: "var(--se-text-muted)", cursor: "pointer",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      ⋯
                    </button>
                  )}
                  {menuOpenFor === c.id && (
                    <div style={{
                      position: "absolute", top: 28, right: 8,
                      background: "var(--se-bg-surface)",
                      border: "1px solid var(--se-border)",
                      borderRadius: 8, boxShadow: "var(--se-shadow-md)",
                      padding: 4, zIndex: 5, minWidth: 120,
                    }}>
                      <button
                        type="button"
                        onClick={() => { setMenuOpenFor(null); setRenamingId(c.id); setRenameValue(c.title); }}
                        style={menuItem}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => { setMenuOpenFor(null); onDelete(c.id); }}
                        style={{ ...menuItem, color: "var(--se-error)" }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}

const menuItem: React.CSSProperties = {
  display: "block", width: "100%", padding: "6px 10px",
  textAlign: "left", background: "transparent", border: "none",
  cursor: "pointer", fontSize: 12, borderRadius: 4,
  color: "var(--se-text-secondary)",
};
