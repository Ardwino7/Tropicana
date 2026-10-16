import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

type Tone = "success" | "danger" | "info";

interface Item {
  id: number;
  tone: Tone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  danger: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE: Record<Tone, { bar: string; glyph: string }> = {
  success: { bar: "bg-present", glyph: "✓" },
  danger: { bar: "bg-absent", glyph: "!" },
  info: { bar: "bg-brand", glyph: "i" },
};

/**
 * Les échecs d'écriture doivent être visibles : une saisie qui revient en arrière
 * sans explication ressemble à un bug de l'application, pas à un refus du serveur.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);

  const push = useCallback((tone: Tone, message: string) => {
    const id = (seq.current += 1);
    setItems((current) => [...current.slice(-3), { id, tone, message }]);
    window.setTimeout(() => setItems((current) => current.filter((i) => i.id !== id)), tone === "danger" ? 6000 : 3600);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      danger: (message) => push("danger", message),
      info: (message) => push("info", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-5 left-5 z-50 flex w-[380px] max-w-[calc(100vw-40px)] flex-col gap-2"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto flex items-stretch overflow-hidden rounded-lg border border-ink/10 bg-ink text-surface shadow-pop"
          >
            <span className={clsx("w-[3px] shrink-0", TONE[item.tone].bar)} />
            <span className="flex h-full items-center px-3 text-xs font-semibold">{TONE[item.tone].glyph}</span>
            <p className="flex-1 py-3 pr-3 text-sm leading-5">{item.message}</p>
            <button
              type="button"
              onClick={() => setItems((current) => current.filter((i) => i.id !== item.id))}
              className="px-3 text-ink-muted transition-colors hover:text-surface"
              aria-label="Fermer la notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast doit être utilisé sous ToastProvider.");
  return context;
}
