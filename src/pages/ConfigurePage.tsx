import { useState } from "react";
import { Button } from "@/components/ui";

const STEPS = [
  {
    title: "Créer le projet",
    body: "Un projet Supabase (gratuit suffit). Notez l'URL de la passerelle et la clé anon depuis Project Settings → API.",
  },
  {
    title: "Appliquer le schéma",
    body: "Collez supabase/migrations/0001_init.sql dans l'SQL Editor et exécutez-le. Il crée les tables, la RLS, le bucket « documents » et les vues d'agrégation.",
  },
  {
    title: "Renseigner .env.local",
    body: "VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY pour le navigateur, SUPABASE_SERVICE_ROLE_KEY pour le script de seed uniquement.",
  },
  {
    title: "Charger l'effectif",
    body: "npm run db:seed — les 89 salariés et leurs CIN du classeur, un mois de pointages et deux comptes de démonstration.",
  },
];

const CODE = `VITE_SUPABASE_URL=https://<projet>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon  public>
SUPABASE_SERVICE_ROLE_KEY=<service_role  keep private>`;

export default function ConfigurePage() {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mx-auto flex min-h-screen max-w-[680px] flex-col justify-center px-6 py-12">
      <p className="text-xs font-semibold tracking-label text-brand uppercase">Configuration requise</p>
      <h1 className="mt-2 text-display font-semibold tracking-tight text-ink">Aucun projet Supabase n'est branché</h1>
      <p className="mt-3 text-sm leading-6 text-ink-secondary">
        Les identifiants attendus sont absents ou ressemblent à ceux de l'exemple fourni. L'application refuse de démarrer sur une
        base fantôme plutôt que d'afficher un effectif vide.
      </p>

      <ol className="mt-8 flex flex-col gap-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xs font-semibold text-ink-muted">
              {index + 1}
            </span>
            <div>
              <p className="text-sm font-medium text-ink">{step.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-ink-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex items-start justify-between gap-3 rounded-lg border border-border bg-ink p-3">
        <pre className="overflow-x-auto font-mono text-[11px] leading-5 text-white/85">{CODE}</pre>
        <Button
          size="sm"
          variant="quiet"
          onClick={() => {
            void navigator.clipboard.writeText(CODE).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1800);
            });
          }}
        >
          {copied ? "Copié" : "Copier"}
        </Button>
      </div>

      <p className="mt-6 text-xs leading-5 text-ink-muted">
        Pour relire le plan d'import avant même de créer le projet :{" "}
        <code className="rounded-sm bg-rest-soft px-1 py-0.5 font-mono text-[11px] text-ink-secondary">
          npm run db:seed -- --dry-run
        </code>
        . Pour développer sans base :{" "}
        <code className="rounded-sm bg-rest-soft px-1 py-0.5 font-mono text-[11px] text-ink-secondary">VITE_MOCK_API=1 npm run dev</code>
        .
      </p>
    </div>
  );
}
