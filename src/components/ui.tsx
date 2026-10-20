import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import clsx from "clsx";
import { displayName, initials } from "@/lib/format";

// ---------------------------------------------------------------------------
// Boutons
// ---------------------------------------------------------------------------

type Variant = "primary" | "default" | "ghost" | "danger" | "quiet";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-white border-brand hover:bg-brand-hover hover:border-brand-hover shadow-[0_1px_2px_rgba(10,37,64,.15)]",
  default: "bg-surface text-ink border-border hover:border-border-strong hover:bg-canvas",
  ghost: "bg-transparent text-ink-secondary border-transparent hover:bg-rest-soft hover:text-ink",
  danger: "bg-surface text-absent border-border hover:border-absent hover:bg-absent-soft",
  quiet: "bg-rest-soft text-ink-secondary border-transparent hover:bg-border",
};

const SIZE: Record<Size, string> = {
  sm: "h-[30px] px-2.5 text-xs gap-1.5",
  md: "h-[34px] px-3.5 text-sm gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "md", loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-md border font-medium transition-[background,border-color,color] duration-150",
        "disabled:cursor-not-allowed disabled:opacity-45",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={clsx("size-[13px] animate-spin", className)} aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.25" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Champs
// ---------------------------------------------------------------------------

const FIELD =
  "w-full rounded-md border border-border bg-surface px-2.5 text-sm text-ink placeholder:text-ink-muted/70 transition-colors hover:border-border-strong focus:border-brand";

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={clsx(FIELD, "h-[34px]", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={clsx(FIELD, "h-[34px] appearance-none bg-[right_10px_center_no-repeat] pr-8", className)} {...rest}>
      {children}
    </select>
  );
});

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      <span className="text-xs font-medium tracking-label text-ink-muted uppercase">{label}</span>
      {children}
      {hint && <span className="text-xs leading-4 text-ink-muted">{hint}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

export function Avatar({ name, size = 32, src, className }: { name: string; size?: number; src?: string | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft font-semibold tracking-tight text-brand",
        className,
      )}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

export function Badge({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex h-[20px] shrink-0 items-center rounded-sm px-1.5 text-[11px] font-semibold leading-none tracking-label uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Personne dont le nom est absent de la base ne doit voir son identité cassée à l'écran. */
export function EmployeeName({ name, className }: { name: string; className?: string }) {
  return <span className={clsx("truncate text-sm font-medium text-ink", className)}>{displayName(name)}</span>;
}

export function Matricule({ value, className }: { value: string; className?: string }) {
  return <span className={clsx("font-mono text-xs tracking-tight text-ink-muted", className)}>{value}</span>;
}

export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={clsx("rounded-xl border border-border bg-surface", className)}>{children}</section>;
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={clsx("flex flex-col items-start justify-between gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="mb-1 size-8 rounded-full border-2 border-dashed border-border-strong" />
      <p className="text-sm font-medium text-ink">{title}</p>
      {body && <p className="max-w-[380px] text-xs leading-5 text-ink-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Chargement" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-14 text-xs text-ink-muted">
      <Spinner />
      {label}…
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-absent/30 bg-absent-soft px-4 py-3">
      <p className="text-sm font-medium text-absent">Le serveur a refusé la requête</p>
      <p className="text-xs leading-5 text-ink-secondary">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

/** Barre de répartition présent/absent/congé/repos — la même largeur partout, pour comparer à l'œil. */
export function RateBar({ parts, total, className }: { parts: Array<{ value: number; className: string }>; total: number; className?: string }) {
  if (total <= 0) return <div className={clsx("h-1.5 rounded-full bg-rest-soft", className)} />;
  return (
    <div className={clsx("flex h-1.5 overflow-hidden rounded-full bg-rest-soft", className)}>
      {parts.map((part, index) =>
        part.value > 0 ? (
          <span
            key={index}
            className={part.className}
            style={{ width: `${(part.value / total) * 100}%` }}
            title={`${part.value}`}
          />
        ) : null,
      )}
    </div>
  );
}
