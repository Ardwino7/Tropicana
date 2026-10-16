import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import type { ContractType, Employee } from "@/types/domain";
import { useSaveEmployee, zonesQuery } from "@/data/hooks";
import { Button, Field, Select, TextInput } from "@/components/ui";
import { todayISO } from "@/lib/format";

const CONTRACT_TYPES: ReadonlyArray<{ value: ContractType; label: string }> = [
  { value: "cdi", label: "CDI" },
  { value: "cdd", label: "CDD" },
  { value: "stage", label: "Stage" },
  { value: "interim", label: "Intérim" },
];

interface Draft {
  matricule: string;
  full_name: string;
  cin: string;
  rib: string;
  position: string;
  zone_code: string;
  hire_date: string;
  contract_type: ContractType | "";
  contract_end_date: string;
}

function blank(zoneCode: string): Draft {
  return {
    matricule: "",
    full_name: "",
    cin: "",
    rib: "",
    position: "",
    zone_code: zoneCode,
    hire_date: todayISO(),
    contract_type: "cdi",
    contract_end_date: "",
  };
}

function fromEmployee(employee: Employee): Draft {
  return {
    matricule: employee.matricule,
    full_name: employee.full_name,
    cin: employee.cin ?? "",
    rib: employee.rib ?? "",
    position: employee.position,
    zone_code: employee.zone_code,
    hire_date: employee.hire_date ?? "",
    contract_type: employee.contract_type ?? "",
    contract_end_date: employee.contract_end_date ?? "",
  };
}

/**
 * Fiche d'identité d'un salarié. La base n'a pas de clé technique à offrir à un
 * chef de service : le matricule est la seule identité qu'il connaît, donc il est
 * demandé, contrôlé, et affiché en monospace pour qu'on le relise sans ambiguïté.
 */
export function EmployeeDialog({ employee, onClose }: { employee?: Employee; onClose: () => void }) {
  const { data: zones = [] } = useQuery(zonesQuery());
  const save = useSaveEmployee();
  const [draft, setDraft] = useState<Draft>(() => (employee ? fromEmployee(employee) : blank("")));
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const errors = useMemo(() => {
    const list: string[] = [];
    if (!draft.matricule.trim()) list.push("Le matricule est obligatoire.");
    if (!draft.full_name.trim()) list.push("Le nom complet est obligatoire.");
    if (!draft.zone_code) list.push("Choisissez un groupe.");
    if (draft.contract_type === "cdd" && !draft.contract_end_date) list.push("Un CDD porte une date de fin.");
    return list;
  }, [draft]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setTouched(true);
    if (errors.length) return;
    await save.mutateAsync({
      id: employee?.id,
      matricule: draft.matricule.trim().toUpperCase(),
      full_name: draft.full_name.trim().replace(/\s+/g, " "),
      cin: draft.cin.trim().toUpperCase() || null,
      rib: draft.rib.trim().replace(/\s+/g, " ") || null,
      position: draft.position.trim() || "Agent",
      zone_code: draft.zone_code,
      hire_date: draft.hire_date || null,
      contract_type: draft.contract_type || null,
      contract_end_date: draft.contract_end_date || null,
    });
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={employee ? "Modifier la fiche du salarié" : "Ajouter un salarié"}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-8 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[560px] rounded-xl border border-border bg-surface shadow-pop">
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-ink">
              {employee ? "Modifier la fiche" : "Nouveau salarié"}
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              {employee
                ? "Le matricule et le nom restent la référence du pointage."
                : "Il apparaîtra immédiatement dans la grille de pointage du jour."}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Fermer">
            Fermer
          </Button>
        </header>

        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <Field label="Matricule" htmlFor="matricule">
            <TextInput
              id="matricule"
              autoFocus
              value={draft.matricule}
              onChange={(event) => set("matricule", event.target.value)}
              placeholder="EX-0090"
              className={clsx("font-mono", touched && !draft.matricule.trim() && "border-absent")}
            />
          </Field>

          <Field label="Nom complet" htmlFor="full_name" hint="Tel qu'inscrit au référentiel.">
            <TextInput
              id="full_name"
              value={draft.full_name}
              onChange={(event) => set("full_name", event.target.value)}
              placeholder="Mohammed Lahlal"
              className={clsx(touched && !draft.full_name.trim() && "border-absent")}
            />
          </Field>

          <Field label="CIN" htmlFor="cin" hint="Vide si la pièce n'est pas encore au dossier.">
            <TextInput
              id="cin"
              value={draft.cin}
              onChange={(event) => set("cin", event.target.value)}
              placeholder="A123456"
              className="font-mono uppercase"
            />
          </Field>

          <Field label="RIB" htmlFor="rib" hint="Saisi comme texte, sans téléverser de fichier bancaire.">
            <TextInput
              id="rib"
              value={draft.rib}
              onChange={(event) => set("rib", event.target.value)}
              placeholder="Code banque · agence · compte · clé"
              className="font-mono"
              autoComplete="off"
            />
          </Field>

          <Field label="Poste" htmlFor="position">
            <TextInput
              id="position"
              value={draft.position}
              onChange={(event) => set("position", event.target.value)}
              placeholder="Conducteur camion"
            />
          </Field>

          <Field label="Groupe" htmlFor="zone_code">
            <Select id="zone_code" value={draft.zone_code} onChange={(event) => set("zone_code", event.target.value)}>
              {!draft.zone_code && <option value="">— à choisir —</option>}
              {zones.map((zone) => (
                <option key={zone.code} value={zone.code}>
                  {zone.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date d'embauche" htmlFor="hire_date">
            <TextInput
              id="hire_date"
              type="date"
              value={draft.hire_date}
              onChange={(event) => set("hire_date", event.target.value)}
            />
          </Field>

          <Field label="Type de contrat" htmlFor="contract_type">
            <Select
              id="contract_type"
              value={draft.contract_type}
              onChange={(event) => set("contract_type", event.target.value as ContractType | "")}
            >
              <option value="">— non renseigné —</option>
              {CONTRACT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Fin de contrat" htmlFor="contract_end_date" hint="Renseigner pour un CDD, un stage ou un intérim.">
            <TextInput
              id="contract_end_date"
              type="date"
              value={draft.contract_end_date}
              onChange={(event) => set("contract_end_date", event.target.value)}
            />
          </Field>
        </div>

        {touched && errors.length > 0 && (
          <ul className="mx-5 mb-2 rounded-md border border-absent/30 bg-absent-soft px-3 py-2 text-xs text-absent">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}

        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => void submit()}>
            {employee ? "Enregistrer" : "Ajouter à l'effectif"}
          </Button>
        </footer>
      </div>
    </div>
  );
}
