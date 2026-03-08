import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastAPI {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<ToastAPI | null>(null);

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const TYPE_STYLES: Record<ToastType, { bg: string; border: string; color: string }> = {
  success: {
    bg: "var(--se-success-dim)",
    border: "var(--se-success)",
    color: "var(--se-success)",
  },
  error: {
    bg: "var(--se-error-dim)",
    border: "var(--se-error)",
    color: "var(--se-error)",
  },
  info: {
    bg: "var(--se-info-dim)",
    border: "var(--se-info)",
    color: "var(--se-info)",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const api: ToastAPI = {
    success: useCallback((msg: string) => addToast(msg, "success"), [addToast]),
    error: useCallback((msg: string) => addToast(msg, "error"), [addToast]),
    info: useCallback((msg: string) => addToast(msg, "info"), [addToast]),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          display: "flex",
          flexDirection: "column-reverse",
          gap: 8,
          zIndex: 9999,
          pointerEvents: "none",
          maxHeight: "min(80vh, 400px)",
          overflowY: "auto",
        }}
      >
        {toasts.map((t) => (
          <SingleToast key={t.id} toast={t} onDismiss={() => setToasts((p) => p.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function SingleToast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const s = TYPE_STYLES[toast.type];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      role="alert"
      aria-live="polite"
      onClick={onDismiss}
      style={{
        pointerEvents: "auto",
        cursor: "pointer",
        padding: "12px 20px",
        borderRadius: "var(--se-radius-md)",
        border: `1.5px solid ${s.border}`,
        background: s.bg,
        color: s.color,
        fontFamily: "var(--se-font-sans)",
        fontSize: "var(--se-text-sm)",
        fontWeight: 600,
        boxShadow: "var(--se-shadow-md)",
        transform: visible ? "translateX(0)" : "translateX(120%)",
        opacity: visible ? 1 : 0,
        transition: "transform 200ms ease-out, opacity 200ms ease-out",
        maxWidth: 360,
      }}
    >
      {toast.message}
    </div>
  );
}
