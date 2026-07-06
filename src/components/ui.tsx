/**
 * Core UI kit for the writer's-desk chrome: Button, Menu (outside-click +
 * Escape close), and a Toast layer. Every control in the app chrome builds
 * from these so hover/focus/disabled states stay consistent.
 */
import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { create } from "zustand";

/* ------------------------------- Button -------------------------------- */

type ButtonVariant = "ghost" | "primary" | "danger" | "toggle-on";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Ghost/inputs are flat; depth lives only on the primary button and cards.
  ghost:
    "border border-line bg-transparent text-ink-2 hover:text-ink hover:border-ink-3/40 hover:bg-sunken/60",
  // Primary carries real elevation + press feel (see .btn-primary in CSS).
  primary: "btn-primary",
  danger:
    "border border-error/40 bg-transparent text-on-error hover:bg-error-soft",
  "toggle-on":
    "border border-accent/40 bg-accent-soft text-on-soft hover:border-accent",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Tooltip text (CSS tooltip; also mirrored to aria-label when icon-only). */
  tip?: string;
  iconOnly?: boolean;
}

export function Button({
  variant = "ghost",
  tip,
  iconOnly,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      data-tip={tip}
      aria-label={rest["aria-label"] ?? (iconOnly ? tip : undefined)}
      className={`${tip ? "tip " : ""}inline-flex select-none items-center gap-1.5 rounded-md text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-35 ${
        iconOnly ? "p-1.5" : "px-2 py-1"
      } ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/* -------------------------------- Menu --------------------------------- */

/**
 * Dropdown that actually behaves: closes on outside click and Escape,
 * anchors to its trigger. Controlled (open/onOpenChange) or uncontrolled.
 */
export function Menu({
  trigger,
  children,
  align = "right",
  open: openProp,
  onOpenChange,
  width = "w-44",
}: {
  trigger: (open: boolean) => ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  width?: string;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => {
    setOpenState(v);
    onOpenChange?.(v);
  };
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(!open)}>{trigger(open)}</div>
      {open && (
        <div
          role="menu"
          className={`absolute ${align === "right" ? "right-0" : "left-0"} top-full z-30 mt-1 ${width} overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onClick,
  children,
  tip,
}: {
  onClick?: () => void;
  children: ReactNode;
  tip?: string;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      title={tip}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-2 hover:bg-sunken hover:text-ink"
    >
      {children}
    </button>
  );
}

/* -------------------------------- Toast -------------------------------- */

interface Toast {
  id: number;
  text: string;
  kind: "info" | "error" | "success";
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, kind?: Toast["kind"]) => void;
  dismiss: (id: number) => void;
}

let toastSeq = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (text, kind = "info") => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      5000,
    );
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative helper for non-React call sites. */
export function toast(text: string, kind: Toast["kind"] = "info"): void {
  useToastStore.getState().push(text, kind);
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div className="no-print pointer-events-none fixed bottom-10 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-center gap-3 rounded-lg border px-3 py-2 font-ui text-xs shadow-lg ${
            t.kind === "error"
              ? "border-error/40 bg-surface text-on-error"
              : t.kind === "success"
                ? "border-success/40 bg-surface text-on-success"
                : "border-line bg-surface text-ink"
          }`}
        >
          <span>{t.text}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
            className="text-ink-3 hover:text-ink"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
