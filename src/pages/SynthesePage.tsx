import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/AppShell";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Loading, Matricule, RateBar } from "@/components/ui";
import {
  dailyRangeQuery,
  dossiersQuery,
  employeesQuery,
  monthRangeQuery,
  zonesQuery,
} from "@/data/hooks";
import {
  addDaysISO,
  displayName,
  formatMediumDay,
  formatMonth,
  formatRate,
  monthBounds,
  parseDay,
  todayISO,
} from "@/lib/format";
import { isDossierComplete, missingKinds } from "@/lib/pointage";
import type { Attendance, DailyAttendance, DossierStatus, Employee, Zone } from "@/types/domain";

const INK = "#0a2540";
const GRID = "#e3e8ee";
const MUTED = "#6b7c93";

const SERIES = [
  { key: "present", label: "Présents", fill: "#00a67e" },
  { key: "absent", label: "Absents", fill: "#de3a3a" },
  { key: "leave", label: "Congés", fill: "#b15c00" },
  { key: "rest", label: "Repos", fill: "#cbd3dc" },
] as const;

export default function SynthesePage() {
  const today = todayISO();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const bounds = useMemo(() => monthBounds(`${month}-01`), [month]);

  const daily = useQuery(dailyRangeQuery(bounds.from, bounds.to));
  const cells = useQuery(monthRangeQuery(bounds.from, bounds.to));
  const employees = useQuery(employeesQuery());
  const zones = useQuery(zonesQuery());
  const dossiers = useQuery(dossiersQuery());

  const loading = daily.isLoading || cells.isLoading || employees.isLoading || zones.isLoading;
  const failed = daily.isError || cells.isError || employees.isError;

  const days = useMemo(() => buildDays(bounds.from, bounds.to, daily.data ?? []), [bounds, daily.data]);
  const totals = useMemo(() => sumDays(days), [days]);
  const zoneRows = useMemo(
    () => buildZoneRows({ cells: cells.data ?? [], employees: employees.data ?? [], zones: zones.data ?? [] }),
    [cells.data, employees.data, zones.data],
  );
  const exceptions = useMemo(
    () => buildExceptions(cells.data ?? [], employees.data ?? [], dossiers.data ?? []),
    [cells.data, employees.data, dossiers.data],
  );

  return (
    <>
      <PageHeader
        title="Synthèse RH"
        subtitle={`Présences, absences et dossiers — lecture du mois de ${formatMonth(`${month}-01`)}.`}
        actions={
          <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-0.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMonth(shiftMonth(month, -1))}
              aria-label="Mois précédent"
            >
              ←
            </Button>
            <span className="min-w-[128px] px-1 text-center text-sm font-medium tracking-tight text-ink">
              {formatMonth(`${month}-01`)}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mois suivant">
              →
            </Button>
          </div>
        }
      />

      {failed && <ErrorState message={(daily.error ?? cells.error)?.message ?? "Synthèse indisponible."} onRetry={() => void daily.refetch()} />}

      {loading && !failed && <Loading label="Chargement de la synthèse" />}

      {!loading && !failed && totals.recorded === 0 && (
        <Card>
          <EmptyState
            title="Aucune saisie ce mois-ci"
            body="La synthèse se remplit dès que le premier poste est pointé. Vérifiez la date retenue, ou changez de mois."
          />
        </Card>
      )}

      {!loading && !failed && totals.recorded > 0 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi
              label="Taux de présence"
              value={formatRate(totals.present, totals.workable, 0)}
              hint={`${totals.present} présences sur ${totals.workable} postes théoriques pointés`}
              tone="present"
            />
            <Kpi
              label="Absences cumulées"
              value={String(totals.absent)}
              hint={`soit ${formatRate(totals.absent, totals.workable, 1)} des postes suivis`}
              tone="absent"
            />
            <Kpi
              label="Congés posés"
              value={String(totals.leave)}
              hint="Absences justifiées, comptées à part"
              tone="leave"
            />
            <Kpi
              label="Dossiers incomplets"
              value={String(exceptions.incompleteDossiers)}
              hint={`${exceptions.expired} pièce${exceptions.expired > 1 ? "s" : ""} expirée${exceptions.expired > 1 ? "s" : ""} au total`}
              tone="rest"
            />
          </div>

          <Card>
            <CardHeader
              title="Jour par jour"
              subtitle="Barres empilées par statut. Les repos hebdomadaires restent visibles pour ne pas gonfler le taux de présence."
            />
            <div className="h-[240px] px-2 py-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={days} margin={{ top: 4, right: 12, bottom: 0, left: -18 }} barSize={12}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis
                    dataKey="dayNum"
                    tick={{ fontSize: 11, fill: MUTED }}
                    axisLine={{ stroke: GRID }}
                    tickLine={false}
                    interval={Math.max(0, Math.floor(days.length / 12))}
                  />
                  <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "#f6f9fc" }}
                    contentStyle={{
                      border: `1px solid ${GRID}`,
                      borderRadius: 8,
                      fontSize: 12,
                      color: INK,
                      boxShadow: "0 8px 24px -6px rgba(10,37,64,.18)",
                    }}
                    labelFormatter={(_value, payload) => {
                      const entry = payload?.[0]?.payload as { label?: string } | undefined;
                      return entry?.label ?? "";
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={26}
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span style={{ fontSize: 12, color: MUTED }}>{value}</span>}
                  />
                  {SERIES.map((series) => (
                    <Bar
                      key={series.key}
                      dataKey={series.key}
                      name={series.label}
                      stackId="jour"
                      fill={series.fill}
                      radius={series.key === "rest" ? [3, 3, 0, 0] : 0}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader
                title="Calendrier des présences"
                subtitle="Une case par jour : la teinte dit le taux de présence, le chiffre le nombre de postes pointés."
                actions={
                  <span className="hidden items-center gap-1.5 text-[11px] text-ink-muted sm:flex">
                    <span className="size-2.5 rounded-sm bg-present/30" />
                    <span className="size-2.5 rounded-sm bg-present/60" />
                    <span className="size-2.5 rounded-sm bg-present" />
                    <span className="size-2.5 rounded-sm bg-absent/50" />
                    <span className="size-2.5 rounded-sm border border-dashed border-border-strong" />
                  </span>
                }
              />
              <CalendarGrid days={days} month={month} today={today} />
            </Card>

            <Card>
              <CardHeader title="Par groupe" subtitle="Taux de présence du mois, poste par poste." />
              <ul className="divide-y divide-border/70">
                {zoneRows.map((row) => (
                  <li key={row.zone.code} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{row.zone.name}</span>
                      <span className="text-[11px] text-ink-muted">
                        {row.present}/{row.workable} pointés · {row.headcount} au référentiel
                      </span>
                    </span>
                    <RateBar
                      className="w-20"
                      total={row.workable}
                      parts={[
                        { value: row.present, className: "bg-present" },
                        { value: row.absent, className: "bg-absent" },
                        { value: row.leave, className: "bg-leave" },
                      ]}
                    />
                    <span className="tnum w-12 text-right text-sm font-medium text-ink">{formatRate(row.present, row.workable, 0)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="overflow-hidden">
              <CardHeader
                title="Absences répétées"
                subtitle="Les salariés les plus souvent marqués absents dans le mois."
              />
              {exceptions.absences.length === 0 ? (
                <EmptyState title="Aucune absence non justifiée" body="Le mois ne compte pas d'absence marquée « absent »." />
              ) : (
                <ul className="divide-y divide-border/70">
                  {exceptions.absences.map((row) => (
                    <li key={row.employee.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Avatar name={row.employee.full_name} size={28} />
                      <span className="min-w-0 flex-1">
                        <Link to={`/salaries/${row.employee.id}`} className="block truncate text-sm font-medium text-ink hover:text-brand">
                          {displayName(row.employee.full_name)}
                        </Link>
                        <Matricule value={row.employee.matricule} />
                      </span>
                      <span className="max-w-[190px] truncate font-mono text-[11px] text-ink-muted">{row.days.join(" · ")}</span>
                      <Badge className="bg-absent-soft text-absent">{row.count} abs.</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title="Dossiers à reprendre" subtitle="Pièce expirée ou document manquant au dossier." />
              {exceptions.dossiers.length === 0 ? (
                <EmptyState title="Tous les dossiers sont en règle" body="CIN et RIB renseignés, quatre fichiers requis présents, aucune expiration constatée." />
              ) : (
                <ul className="divide-y divide-border/70">
                  {exceptions.dossiers.map((row) => (
                    <li key={row.employee.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Avatar name={row.employee.full_name} size={28} className="bg-rest-soft text-ink-secondary" />
                      <span className="min-w-0 flex-1">
                        <Link to={`/salaries/${row.employee.id}`} className="block truncate text-sm font-medium text-ink hover:text-brand">
                          {displayName(row.employee.full_name)}
                        </Link>
                        <span className="block truncate text-[11px] text-ink-muted">
                          {row.expired ? "pièce arrivée à expiration" : `manque ${missingKinds(row.dossier).join(", ")}`}
                        </span>
                      </span>
                      <Badge className={row.expired ? "bg-absent-soft text-absent" : "bg-leave-soft text-leave"}>
                        {row.dossier.document_count} pièce{row.dossier.document_count > 1 ? "s" : ""}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Morceaux d'interface
// ---------------------------------------------------------------------------

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "present" | "absent" | "leave" | "rest";
}) {
  const bar = { present: "bg-present", absent: "bg-absent", leave: "bg-leave", rest: "bg-rest" }[tone];
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className={clsx("h-3 w-1 rounded-full", bar)} />
        <p className="text-[11px] font-medium tracking-label text-ink-muted uppercase">{label}</p>
      </div>
      <p className="tnum mt-2 text-[28px] leading-8 font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-xs leading-4 text-ink-muted">{hint}</p>
    </div>
  );
}

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

function CalendarGrid({ days, month, today }: { days: DayCell[]; month: string; today: string }) {
  const offset = (parseDay(`${month}-01`).getDay() + 6) % 7;
  return (
    <div className="px-4 py-3.5">
      <div className="mb-1.5 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((label, index) => (
          <span key={index} className="text-center text-[11px] text-ink-muted">
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: offset }, (_, index) => <span key={`pad-${index}`} />)}
        {days.map((cell) => (
          <div
            key={cell.iso}
            title={`${cell.label} — ${cell.recorded ? `${formatRate(cell.rate, 1, 0)} de présence, ${cell.present}/${cell.workable}` : "aucune saisie"}`}
            className={clsx(
              "flex h-[46px] flex-col justify-between rounded-md border p-1.5",
              cell.future
                ? "border-border bg-canvas"
                : cell.recorded === 0
                  ? "border-dashed border-border-strong bg-surface"
                  : rateClass(cell.rate),
            )}
          >
            <span className={clsx("tnum text-[11px] leading-none", cell.future ? "text-ink-muted/60" : "text-ink/70")}>
              {cell.dayNum}
            </span>
            <span className={clsx("tnum text-right text-[11px] leading-none", textClass(cell))}>
              {cell.future || cell.recorded === 0 ? "·" : cell.present}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] leading-4 text-ink-muted">
        Case pointillée = journée sans aucune saisie. Ce n'est pas un statut : le pointage reste à faire.{" "}
        {today.slice(0, 7) === month && <span className="text-ink-secondary">La case du jour est encadrée.</span>}
      </p>
    </div>
  );
}

function rateClass(rate: number): string {
  if (rate >= 0.9) return "border-present/40 bg-present";
  if (rate >= 0.75) return "border-present/30 bg-present/60";
  if (rate >= 0.5) return "border-present/20 bg-present/30";
  if (rate >= 0.25) return "border-leave/30 bg-leave-soft";
  return "border-absent/30 bg-absent/50";
}

function textClass(cell: DayCell): string {
  if (cell.iso === cell.today) return "text-ink font-semibold";
  if (cell.rate >= 0.9) return "text-white";
  if (cell.rate >= 0.75) return "text-ink";
  return "text-ink-secondary";
}

// ---------------------------------------------------------------------------
// Calculs
// ---------------------------------------------------------------------------

interface DayCell {
  iso: string;
  dayNum: number;
  label: string;
  present: number;
  absent: number;
  leave: number;
  rest: number;
  recorded: number;
  workable: number;
  rate: number;
  future: boolean;
  today: string;
}

function buildDays(from: string, to: string, rows: DailyAttendance[]): DayCell[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const today = todayISO();
  const cells: DayCell[] = [];
  for (let iso = from; iso <= to; iso = addDaysISO(iso, 1)) {
    const row = byDay.get(iso);
    const present = row?.present ?? 0;
    const absent = row?.absent ?? 0;
    const leave = row?.leave ?? 0;
    const rest = row?.rest ?? 0;
    const recorded = row?.recorded ?? 0;
    const workable = present + absent + leave;
    cells.push({
      iso,
      dayNum: Number(iso.slice(-2)),
      label: formatMediumDay(iso),
      present,
      absent,
      leave,
      rest,
      recorded,
      workable,
      rate: workable > 0 ? present / workable : 0,
      future: iso > today,
      today,
    });
  }
  return cells;
}

function sumDays(days: DayCell[]) {
  const totals = { present: 0, absent: 0, leave: 0, rest: 0, recorded: 0, workable: 0 };
  for (const day of days) {
    if (day.future) continue;
    totals.present += day.present;
    totals.absent += day.absent;
    totals.leave += day.leave;
    totals.rest += day.rest;
    totals.recorded += day.recorded;
    totals.workable += day.workable;
  }
  return totals;
}

function buildZoneRows({
  cells,
  employees,
  zones,
}: {
  cells: Attendance[];
  employees: Employee[];
  zones: Zone[];
}) {
  const zoneOf = new Map(employees.map((employee) => [employee.id, employee.zone_code]));
  const headcount = new Map<string, number>();
  for (const employee of employees) {
    if (employee.status === "active") headcount.set(employee.zone_code, (headcount.get(employee.zone_code) ?? 0) + 1);
  }

  const tallies = new Map<string, { present: number; absent: number; leave: number; workable: number }>();
  for (const cell of cells) {
    const code = zoneOf.get(cell.employee_id);
    if (!code) continue;
    const tally = tallies.get(code) ?? { present: 0, absent: 0, leave: 0, workable: 0 };
    if (cell.status !== "rest") tally.workable += 1;
    if (cell.status === "present") tally.present += 1;
    if (cell.status === "absent") tally.absent += 1;
    if (cell.status === "leave") tally.leave += 1;
    tallies.set(code, tally);
  }

  return zones
    .filter((zone) => (headcount.get(zone.code) ?? 0) > 0)
    .map((zone) => ({ zone, headcount: headcount.get(zone.code) ?? 0, ...(tallies.get(zone.code) ?? { present: 0, absent: 0, leave: 0, workable: 0 }) }))
    .sort((a, b) => b.workable - a.workable || a.zone.sort_order - b.zone.sort_order);
}

function buildExceptions(cells: Attendance[], employees: Employee[], dossiers: DossierStatus[]) {
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  const absences = new Map<string, string[]>();
  for (const cell of cells) {
    if (cell.status !== "absent") continue;
    absences.set(cell.employee_id, [...(absences.get(cell.employee_id) ?? []), cell.day]);
  }

  const ranked = [...absences.entries()]
    .filter(([id]) => byId.has(id))
    .map(([id, days]) => ({ employee: byId.get(id) as Employee, days: days.sort().map((day) => day.slice(-2)) }))
    .sort((a, b) => b.days.length - a.days.length || a.employee.matricule.localeCompare(b.employee.matricule))
    .slice(0, 8)
    .map((row) => ({ ...row, count: row.days.length }));

  const incompleteList = dossiers
    .filter((dossier) => !isDossierComplete(dossier) || dossier.has_expired_document)
    .map((dossier) => {
      const employee = byId.get(dossier.employee_id);
      return employee ? { employee, dossier, expired: dossier.has_expired_document } : null;
    })
    .filter((row): row is { employee: Employee; dossier: DossierStatus; expired: boolean } => row !== null)
    .sort((a, b) => Number(b.expired) - Number(a.expired) || a.employee.matricule.localeCompare(b.employee.matricule))
    .slice(0, 8);

  return {
    absences: ranked,
    dossiers: incompleteList,
    incompleteDossiers: dossiers.filter((dossier) => !isDossierComplete(dossier)).length,
    expired: dossiers.filter((dossier) => dossier.has_expired_document).length,
  };
}

function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Number(year), Number(index) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
