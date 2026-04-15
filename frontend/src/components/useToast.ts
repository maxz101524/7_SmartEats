import { createContext, useContext } from "react";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

export interface ToastAPI {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

export const ToastContext = createContext<ToastAPI | null>(null);

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
