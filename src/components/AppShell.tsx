import { type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useAuth, homeFor } from "@/auth/AuthContext";
import { Avatar, Badge, Button } from "@/components/ui";
import { displayName } from "@/lib/format";
import { isMockMode } from "@/lib/supabase";

const ROLE_LABEL: Record<string, string> = { chef_de_service: "Chef de service", rh: "Ressources humaines" };

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  rhOnly?: boolean;
}

const NAV: NavItem[] = [
  {
    to: "/pointage",
    label: "Pointage du jour",
    icon: <IconCheck />,
  },
  {
    to: "/effectif",
    label: "Effectif & dossiers",
    icon: <IconPeople />,
  },
  {
    to: "/synthese",
    label: "Synthèse RH",
    icon: <IconChart />,
    rhOnly: true,
  },
];

export function AppShell() {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const items = NAV.filter((item) => (role === "rh" ? item.rhOnly : !item.rhOnly));

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-ink/40 bg-ink lg:flex">
        <div className="flex items-baseline gap-2 px-4 pt-5 pb-4">
          <span className="text-base font-semibold tracking-tight text-white">Pointage</span>
          <span className="text-xs text-white/45">effectifs</span>
        </div>

        <nav className="flex flex-col gap-0.5 px-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                  isActive ? "bg-white/10 font-medium text-white" : "text-white/60 hover:bg-white/5 hover:text-white/90",
                )
              }
            >
              <span className="text-white/50">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-white/10 px-3 py-3">
          <div className="flex items-center gap-2.5">
            <Avatar name={profile?.full_name ?? "?"} size={30} className="bg-white/10 text-white/80" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white">{displayName(profile?.full_name ?? "")}</p>
              <p className="truncate text-[11px] text-white/45">{ROLE_LABEL[role ?? ""] ?? "—"} </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void signOut().then(() => navigate("/connexion", { replace: true }))}
            className="mt-2.5 w-full rounded-md border border-white/15 py-1.5 text-xs text-white/70 transition-colors hover:border-white/30 hover:text-white"
          >
            Se déconnecter
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-ink px-4 py-2.5 lg:hidden">
          <span className="text-sm font-semibold text-white">Pointage effectifs</span>
          <div className="flex items-center gap-1.5">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  clsx("rounded-md px-2 py-1 text-xs", isActive ? "bg-white/15 text-white" : "text-white/60")
                }
              >
                {item.icon}
              </NavLink>
            ))}
            <Button size="sm" variant="quiet" onClick={() => void signOut().then(() => navigate(homeFor(role)))}>
              Quitter
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-5 sm:px-6">
          {isMockMode && (
            <p className="mb-4 rounded-md border border-leave/30 bg-leave-soft px-3 py-1.5 text-xs text-leave">
              Jeu de fixtures local — aucune connexion à votre projet Supabase. Retirez VITE_MOCK_API pour travailler sur les
              vraies données.
            </p>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-display font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <Badge className={role === "rh" ? "bg-brand-soft text-brand" : "bg-rest-soft text-ink-secondary"}>
      {ROLE_LABEL[role] ?? role}
    </Badge>
  );
}

function IconCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.75" y="1.75" width="12.5" height="12.5" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.9 8.2l2.1 2.1 4.1-4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPeople() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="6" cy="5.2" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.8 13.4c.5-2.3 2.2-3.5 4.2-3.5s3.7 1.2 4.2 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M11.2 3.2a2.2 2.2 0 0 1 0 4.2M12.2 13.4c-.2-1.2-.7-2.2-1.5-2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.2 13.6h11.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="3.4" y="7.6" width="2.4" height="4.4" rx="0.7" fill="currentColor" opacity="0.75" />
      <rect x="7" y="4.6" width="2.4" height="7.4" rx="0.7" fill="currentColor" opacity="0.75" />
      <rect x="10.6" y="6.2" width="2.4" height="5.8" rx="0.7" fill="currentColor" opacity="0.75" />
    </svg>
  );
}
