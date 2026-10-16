import { displayName } from "@/lib/format";
import type { Attendance, CellStatus, DossierStatus, Employee, Zone } from "@/types/domain";

/**
 * Toute l'arithmétique de la grille, hors React : elle est testable sans serveur,
 * et la page ne garde que le rendu.
 */

export const EMPTY_COUNTS: Record<CellStatus, number> = { present: 0, absent: 0, leave: 0, rest: 0, not_recorded: 0 };

export interface DayTally extends Record<CellStatus, number> {
  recorded: number;
  headcount: number;
}

export function tallyDay(rows: Attendance[], headcount: number): DayTally {
  const counts = { ...EMPTY_COUNTS };
  for (const row of rows) counts[row.status] += 1;
  const recorded = rows.length;
  counts.not_recorded = Math.max(0, headcount - recorded);
  return { ...counts, recorded, headcount };
}

/** Complétude calculée depuis les champs de la fiche et les pièces obligatoires. */
export function isDossierComplete(dossier: DossierStatus): boolean {
  return missingKinds(dossier).length === 0;
}

export function missingKinds(dossier: DossierStatus): string[] {
  const missing: string[] = [];
  if (!dossier.has_cin) missing.push("CIN au référentiel");
  if (!dossier.has_rib) missing.push("RIB à renseigner");
  if (!dossier.has_contract) missing.push("contrat");
  if (!dossier.has_cin_doc) missing.push("CIN (copie)");
  if (!dossier.has_medical) missing.push("certificat médical");
  if (!dossier.has_photo) missing.push("photo");
  return missing;
}

export interface PointageGroup {
  code: string;
  name: string;
  rows: Employee[];
  counts: DayTally;
  /** Salariés affichés sans saisie : cible du raccourci « tout marquer présent ». */
  unrecordedIds: string[];
}

export function groupPointage(input: {
  employees: Employee[];
  zones: Zone[];
  cells: Map<string, Attendance>;
  completeIds: Set<string>;
  needle: string;
  statusFilter: CellStatus | null;
  onlyIncomplete: boolean;
}): PointageGroup[] {
  const { employees, zones, cells, completeIds, needle, statusFilter, onlyIncomplete } = input;
  const order = new Map(zones.map((zone, index) => [zone.code, { rank: zone.sort_order || index + 1, name: zone.name }]));

  const byZone = new Map<string, Employee[]>();
  for (const employee of employees) {
    if (employee.status !== "active") continue;
    byZone.set(employee.zone_code, [...(byZone.get(employee.zone_code) ?? []), employee]);
  }

  return [...byZone.entries()]
    .map(([code, members]) => {
      const meta = order.get(code);
      const rows = members.filter((employee) => matches(employee, cells, completeIds, needle, statusFilter, onlyIncomplete));
      const counts = tallyDay(
        members.map((employee) => cells.get(employee.id)).filter((row): row is Attendance => Boolean(row)),
        members.length,
      );
      return {
        code,
        name: meta?.name ?? code,
        rank: meta?.rank ?? 900,
        rows: rows.sort((a, b) => a.matricule.localeCompare(b.matricule)),
        counts,
        unrecordedIds: rows.filter((employee) => !cells.has(employee.id)).map((employee) => employee.id),
      };
    })
    .filter((group) => group.rows.length > 0)
    .sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code))
    .map(({ rank: _rank, ...group }) => group);
}

function matches(
  employee: Employee,
  cells: Map<string, Attendance>,
  completeIds: Set<string>,
  needle: string,
  statusFilter: CellStatus | null,
  onlyIncomplete: boolean,
): boolean {
  if (statusFilter && (cells.get(employee.id)?.status ?? "not_recorded") !== statusFilter) return false;
  if (onlyIncomplete && completeIds.has(employee.id)) return false;
  if (!needle) return true;
  return (
    employee.full_name.toLowerCase().includes(needle) ||
    displayName(employee.full_name).toLowerCase().includes(needle) ||
    employee.position.toLowerCase().includes(needle) ||
    employee.matricule.toLowerCase().includes(needle) ||
    (employee.cin ?? "").toLowerCase().includes(needle) ||
    (employee.rib ?? "").toLowerCase().includes(needle)
  );
}

/** Regroupement des présences par salarié sur une plage — sert aux exceptions RH. */
export function absencesByEmployee(rows: Attendance[], employees: Employee[]): Map<string, { days: string[]; employee: Employee }> {
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  const result = new Map<string, { days: string[]; employee: Employee }>();
  for (const row of rows) {
    if (row.status !== "absent") continue;
    const employee = byId.get(row.employee_id);
    if (!employee) continue;
    const existing = result.get(row.employee_id);
    result.set(row.employee_id, { employee, days: [...(existing?.days ?? []), row.day] });
  }
  return result;
}
