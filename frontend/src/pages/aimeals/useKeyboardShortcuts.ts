import { useEffect } from "react";

interface Bindings {
  onNewChat: () => void;
  onToggleDrawer: () => void;
}

export function useKeyboardShortcuts({ onNewChat, onToggleDrawer }: Bindings) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const target = e.target as HTMLElement | null;
      const inField = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        onNewChat();
      } else if (e.key === "/" && !inField) {
        e.preventDefault();
        onToggleDrawer();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNewChat, onToggleDrawer]);
}
