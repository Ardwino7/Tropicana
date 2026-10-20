import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { EmployeeDialog } from "@/components/EmployeeDialog";
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Loading, Matricule, TextInput } from "@/components/ui";
import { dossiersQuery, employeesQuery, useSetEmployeeStatus, zonesQuery } from "@/data/hooks";
import { displayName } from "@/lib/format";
import { isDossierComplete, missingKinds } from "@/lib/pointage";
import { REQUIRED_KINDS } from "@/lib/statuses";
import type { DossierStatus, Employee, Zone } from "@/types/domain";

type Filter = "all" | "complete" | "incomplete" | "archived";

const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "incomplete", label: "Dossiers incomplets" },
  { value: "complete", label: "Dossiers complets" },
  { value: "archived", label: "Archivés" },
];

export default function EffectifPage() {
  const employees = useQuery(employeesQuery());
  const dossiers = useQuery(dossiersQuery());
  const zones = useQuery(zonesQuery());
  const setStatus = useSetEmployeeStatus();

  const [needle, setNeedle] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);

  const order = useMemo(() => new Map((zones.data ?? []).map((zone) => [zone.code, zone])), [zones.data]);
  const byId = useMemo(() => new Map((dossiers.data ?? []).map((row) => [row.employee_id, row])), [dossiers.data]);

  const rows = useMemo(
    () => select(employees.data ?? [], byId, order, needle, filter),
    [employees.data, byId, order, needle, filter],
  );

  const counts = useMemo(() => {
    const active = (employees.data ?? []).filter((employee) => employee.status === "active");
    const incomplete = active.filter((employee) => !isDossierComplete(required(byId.get(employee.id))));
    return { active: active.length, archived: (employees.data ?? []).length - active.length, incomplete: incomplete.length };
  }, [employees.data, byId]);

  const loading = employees.isLoading || dossiers.isLoading || zones.isLoading;
  const failed = employees.isError || dossiers.isError || zones.isError;

  return (
    <>
      <PageHeader
        title="Effectif & dossiers"
        subtitle={
          loading
            ? "Chargement du référentiel…"
            : `${counts.active} salariés actifs · ${counts.incomplete} dossier${counts.incomplete > 1 ? "s" : ""} incomplet${counts.incomplete > 1 ? "s" : ""} · ${counts.archived} archivé${counts.archived > 1 ? "s" : ""}`
        }
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            Ajouter un salarié
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TextInput
          value={needle}
          onChange={(event) => setNeedle(event.target.value)}
          placeholder="Nom, matricule, CIN, RIB ou poste"
          className="h-[34px] w-full max-w-[320px]"
          aria-label="Rechercher un salarié"
        />
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-0.5">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={clsx(
                "rounded-[4px] px-2.5 py-1.5 text-xs transition-colors",
                filter === option.value ? "bg-ink font-medium text-white" : "text-ink-secondary hover:bg-canvas",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {failed && (
        <ErrorState
          message={(employees.error ?? dossiers.error ?? zones.error)?.message ?? "Référentiel inaccessible."}
          onRetry={() => void Promise.all([employees.refetch(), dossiers.refetch(), zones.refetch()])}
        />
      )}

      {loading && !failed && <Loading label="Chargement de l'effectif" />}

      {!loading && !failed && rows.length === 0 && (
        <Card>
          <EmptyState
            title="Aucun salarié ne correspond"
            body="Modifiez la recherche ou le filtre. Un effectif vide signifie aussi que le schéma n'a pas encore été alimenté : relancez le script de seed."
          />
        </Card>
      )}

      {!loading && !failed && rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-canvas text-left">
                <Th className="pl-4">Salarié</Th>
                <Th>Groupe</Th>
                <Th className="hidden md:table-cell">Poste</Th>
                <Th>CIN</Th>
                <Th className="hidden md:table-cell">RIB</Th>
                <Th>Dossier</Th>
                <Th className="hidden sm:table-cell">Contrat</Th>
                <Th className="pr-4 text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ employee, zone, dossier }) => {
                const complete = isDossierComplete(dossier);
                const archived = employee.status === "archived";
                return (
                  <tr
                    key={employee.id}
                    className={clsx("border-b border-border/70 last:border-0 hover:bg-canvas", archived && "opacity-55")}
                  >
                    <td className="py-2.5 pl-4 pr-3">
                      <Link to={`/salaries/${employee.id}`} className="flex items-center gap-2.5">
                        <Avatar name={employee.full_name} size={28} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink hover:text-brand">{displayName(employee.full_name)}</span>
                          <Matricule value={employee.matricule} />
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="block max-w-[150px] truncate text-xs text-ink-secondary">{zone?.name ?? employee.zone_code}</span>
                    </td>
                    <td className="hidden max-w-[160px] truncate px-3 py-2.5 text-xs text-ink-secondary md:table-cell">
                      {employee.position}
                    </td>
                    <td className="px-3 py-2.5">
                      {employee.cin ? (
                        <span className="font-mono text-xs text-ink-secondary">{employee.cin}</span>
                      ) : (
                        <span className="text-xs text-absent">manquante</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      {employee.rib?.trim() ? (
                        <span className="rounded-full bg-present-soft px-2 py-1 text-[11px] font-medium text-present">Renseigné</span>
                      ) : (
                        <span className="rounded-full bg-leave-soft px-2 py-1 text-[11px] font-medium text-leave">À renseigner</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        title={complete ? "CIN et RIB renseignés, cinq fichiers requis présents" : missingKinds(dossier).join(", ")}
                        className={complete ? "bg-present-soft text-present" : "bg-leave-soft text-leave"}
                      >
                        {complete ? "Complet" : `${REQUIRED_KINDS.length + 2 - missingKinds(dossier).length} / ${REQUIRED_KINDS.length + 2}`}
                      </Badge>
                      {dossier.has_expired_document && (
                        <span className="ml-1.5 text-[11px] text-absent">pièce expirée</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2.5 text-xs text-ink-secondary sm:table-cell">
                      <span className="uppercase">{employee.contract_type ?? "—"}</span>
                      {employee.contract_end_date && (
                        <span className="ml-1 font-mono text-[11px] text-ink-muted">→ {employee.contract_end_date.slice(0, 10)}</span>
                      )}
                    </td>
                    <td className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">
                      <Link
                        to={`/salaries/${employee.id}`}
                        className="mr-2 inline-block text-xs font-medium text-brand hover:text-brand-hover"
                      >
                        Fiche
                      </Link>
                      <button
                        type="button"
                        onClick={() => void setStatus.mutate({ id: employee.id, status: archived ? "active" : "archived" })}
                        className="text-xs text-ink-muted hover:text-ink-secondary"
                      >
                        {archived ? "Réactiver" : "Archiver"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </Card>
      )}

      {creating && <EmployeeDialog onClose={() => setCreating(false)} />}
    </>
  );
}

/** Un salarié sans ligne de vue n'a aucune pièce : le dossier est vide, pas inconnu. */
function required(dossier: DossierStatus | undefined): DossierStatus {
  return (
    dossier ?? {
      employee_id: "",
      matricule: "",
      full_name: "",
      zone_code: "",
      has_cin: false,
      has_contract: false,
      has_cin_doc: false,
      has_medical: false,
      has_insurance: false,
      has_rib: false,
      has_photo: false,
      has_warning: false,
      has_expired_document: false,
      document_count: 0,
    }
  );
}

function select(
  employees: Employee[],
  byId: Map<string, DossierStatus>,
  order: Map<string, Zone>,
  needle: string,
  filter: Filter,
) {
  const query = needle.trim().toLowerCase();
  return employees
    .filter((employee) => {
      if (filter === "archived") return employee.status === "archived";
      if (employee.status !== "active") return false;
      const dossier = required(byId.get(employee.id));
      if (filter === "complete") return isDossierComplete(dossier);
      if (filter === "incomplete") return !isDossierComplete(dossier);
      return true;
    })
    .filter((employee) => {
      if (!query) return true;
      return (
        employee.full_name.toLowerCase().includes(query) ||
        displayName(employee.full_name).toLowerCase().includes(query) ||
        employee.matricule.toLowerCase().includes(query) ||
        employee.position.toLowerCase().includes(query) ||
        (employee.cin ?? "").toLowerCase().includes(query) ||
        (employee.rib ?? "").toLowerCase().includes(query)
      );
    })
    .map((employee) => ({ employee, dossier: required(byId.get(employee.id)), zone: order.get(employee.zone_code) }))
    .sort((a, b) => {
      const rank = (a.zone?.sort_order ?? 900) - (b.zone?.sort_order ?? 900);
      return rank || a.employee.zone_code.localeCompare(b.employee.zone_code) || a.employee.matricule.localeCompare(b.employee.matricule);
    });
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th className={clsx("px-3 py-2.5 text-[11px] font-medium tracking-label text-ink-muted uppercase", className)}>{children}</th>
  );
}
