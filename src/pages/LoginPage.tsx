import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, homeFor } from "@/auth/AuthContext";
import { Button, Field, TextInput } from "@/components/ui";
import { isMockMode } from "@/lib/supabase";
import { STATUS_META } from "@/lib/statuses";
import { toISODate } from "@/lib/format";

const DEMO_ACCOUNTS = [
  { email: "chef.service@pointage.demo", role: "Chef de service" },
  { email: "rh@pointage.demo", role: "Ressources humaines" },
];

export default function LoginPage() {
  const { signIn, signedIn, role, checking } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState(isMockMode ? DEMO_ACCOUNTS[0]!.email : "");
  const [password, setPassword] = useState(isMockMode ? "pointage-demo" : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const from = (location.state as { from?: string } | null)?.from;

  if (signedIn && !checking) return <Navigate to={from ?? homeFor(role)} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const message = await signIn(email.trim(), password);
    setPending(false);
    if (message) setError(message);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_460px]">
      <section className="hidden flex-col justify-between bg-ink px-10 py-10 lg:flex">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold tracking-tight text-white">Pointage</span>
            <span className="text-xs text-white/45">effectifs</span>
          </div>
          <h1 className="mt-14 max-w-[440px] text-display leading-[40px] font-semibold tracking-tight text-white">
            La présence de chacun, marquée en deux secondes.
          </h1>
          <p className="mt-4 max-w-[420px] text-sm leading-6 text-white/60">
            Le chef de service saisit les présences du jour, rattache les contrats et pièces d'identité à chaque salarié. La
            synthèse RH se construit à partir de ces saisies, sans double saisie ni export intermédiaire.
          </p>
        </div>

        <ul className="flex flex-wrap gap-x-6 gap-y-3">
          {(["present", "absent", "leave", "rest", "not_recorded"] as const).map((status) => (
            <li key={status} className="flex items-center gap-2 text-xs text-white/55">
              <span className={`size-2 rounded-full ${STATUS_META[status].dot}`} />
              {STATUS_META[status].label}
              <span className="text-white/25">— {STATUS_META[status].description}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col justify-center bg-canvas px-6 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[340px]">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Connexion</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {isMockMode ? "Comptes de démonstration du jeu de fixtures." : "Identifiants délivrés par un responsable RH."}
          </p>

          <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-4">
            <Field label="Adresse e-mail" htmlFor="email">
              <TextInput
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom.nom@exemple.ma"
              />
            </Field>
            <Field label="Mot de passe" htmlFor="password">
              <TextInput
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            {error && (
              <p role="alert" className="rounded-md border border-absent/30 bg-absent-soft px-3 py-2 text-xs text-absent">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" loading={pending} disabled={!email || !password} className="h-[38px]">
              {pending ? "Vérification…" : "Se connecter"}
            </Button>
          </form>

          {isMockMode && (
            <div className="mt-7 rounded-lg border border-border bg-surface p-3">
              <p className="text-xs font-medium text-ink">Basculer de rôle</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {DEMO_ACCOUNTS.map((account) => (
                  <li key={account.email} className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px] text-ink-muted">{account.email}</span>
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() => {
                        setEmail(account.email);
                        setPassword("pointage-demo");
                        setError(null);
                      }}
                    >
                      {account.role}
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-ink-muted">Mot de passe commun : pointage-demo</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
