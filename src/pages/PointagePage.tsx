import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { PageHeader } from "@/components/AppShell";
import { Avatar, Button, Card, EmptyState, ErrorState, Loading, RateBar, Select, TextInput } from "@/components/ui";
import { useAuth } from "@/auth/AuthContext";
import {
  dayQuery,
  dossiersQuery,
  employeesQuery,
  useAttendanceWrite,
  useAttendancePeriodWrite,
  useBulkAttendanceWrite,
  zonesQuery,
} from "@/data/hooks";
import { isMockMode, supabase } from "@/lib/supabase";
import { ATTENDANCE_STATUSES, STATUS_META } from "@/lib/statuses";
import { displayName, formatLongDay, formatRate, todayISO, addDaysISO } from "@/lib/format";
import { groupPointage, isDossierComplete, missingKinds, tallyDay, type PointageGroup } from "@/lib/pointage";
import { queryClient } from "@/lib/queryClient";
import type { Attendance, AttendanceStatus, CellStatus } from "@/types/domain";

type Filter = "all" | CellStatus;

const SHORTCUTS = "↑ ↓ pour naviguer · 1 à 4 pour marquer · retour arrière pour effacer";

export default function PointagePage() {
  const [params, setParams] = useSearchParams();
  const day = params.get("date") || todayISO();
  const { userId } = useAuth();

  const employees = useQuery(employeesQuery());
  const zones = useQuery(zonesQuery());
  const cellsOfDay = useQuery(dayQuery(day));
  const dossiers = useQuery(dossiersQuery());
  const write = useAttendanceWrite(day);
  const writeBulk = useBulkAttendanceWrite(day);
  const writePeriod = useAttendancePeriodWrite();

  const [needle, setNeedle] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [zoneFilter, setZoneFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rangeOpen, setRangeOpen] = useState(false);
  const [confirmAllPresentOpen, setConfirmAllPresentOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(day);
  const [rangeTo, setRangeTo] = useState(day);
  const [rangeStatus, setRangeStatus] = useState<AttendanceStatus>("present");

  const setDay = useCallback(
    (next: string) => {
      const updated = new URLSearchParams(params);
      updated.set("date", next);
      setParams(updated, { replace: true });
    },
    [params, setParams],
  );

  // Le temps réel lève le délai de fraîcheur : la saisie d'un poste voisin apparaît ici.
  useEffect(() => {
    if (isMockMode) return;
    const channel = supabase
      .channel(`pointage-${day}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendances", filter: `day=eq.${day}` },
        () => void queryClient.invalidateQueries({ queryKey: ["pointage", day] }),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [day]);

  const cells = useMemo(() => {
    const map = new Map<string, Attendance>();
    for (const row of cellsOfDay.data ?? []) map.set(row.employee_id, row);
    return map;
  }, [cellsOfDay.data]);

  const effectif = (employees.data ?? []).filter((employee) => employee.status === "active");
  const roster = useMemo(() => new Set(effectif.map((employee) => employee.id)), [effectif]);

  const completeIds = useMemo(() => {
    const set = new Set<string>();
    for (const dossier of dossiers.data ?? []) if (isDossierComplete(dossier) && roster.has(dossier.employee_id)) set.add(dossier.employee_id);
    return set;
  }, [dossiers.data, roster]);
  const missingById = useMemo(
    () => new Map((dossiers.data ?? []).map((dossier) => [dossier.employee_id, missingKinds(dossier)])),
    [dossiers.data],
  );

  const zoneEffectif = useMemo(
    () => (zoneFilter === "all" ? effectif : effectif.filter((employee) => employee.zone_code === zoneFilter)),
    [effectif, zoneFilter],
  );
  const groups = useMemo(
    () =>
      groupPointage({
        employees: zoneEffectif,
        zones: zones.data ?? [],
        cells,
        completeIds,
        needle: needle.trim().toLowerCase(),
        statusFilter: filter === "all" ? null : filter,
        onlyIncomplete,
      }),
      [zoneEffectif, zones.data, cells, completeIds, needle, filter, onlyIncomplete],
  );

  const counts = useMemo(
    () => tallyDay((cellsOfDay.data ?? []).filter((row) => roster.has(row.employee_id)), effectif.length),
    [cellsOfDay.data, effectif.length, roster],
  );
  const visible = groups.reduce((total, group) => total + group.rows.length, 0);
  const visibleIds = groups.flatMap((group) => group.rows.map((employee) => employee.id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const selectedActiveIds = [...selectedIds].filter((id) => roster.has(id));
  const rangeDayCount = calendarDayCount(rangeFrom, rangeTo);
  const rangeDays = inclusiveDays(rangeFrom, rangeTo);
  const rangeError = rangeDayCount < 1
    ? "Choisissez une période valide."
    : rangeDayCount > 31
      ? "La période ne peut pas dépasser 31 jours par saisie."
      : "";

  useEffect(() => {
    if (!confirmAllPresentOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setConfirmAllPresentOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmAllPresentOpen]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const pill = (event.target as HTMLElement).closest<HTMLElement>("[data-employee]");
    const employeeId = pill?.dataset.employee;
    if (!pill || !employeeId) return;

    if (event.key >= "1" && event.key <= "4") {
      event.preventDefault();
      const status = ATTENDANCE_STATUSES[Number(event.key) - 1];
      if (status) void write.mutate([{ employeeId, status, recordedBy: userId }]);
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      void write.mutate([{ employeeId, status: null, recordedBy: userId }]);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const pills = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-employee]"));
      const next = pills[pills.indexOf(pill) + (event.key === "ArrowDown" ? 1 : -1)];
      if (next) {
        next.focus();
        next.scrollIntoView({ block: "nearest" });
      }
    }
  };

  if (employees.isPending) return <Loading label="Chargement de l'effectif" />;
  if (employees.error) return <ErrorState message={employees.error.message} onRetry={() => void employees.refetch()} />;

  if (effectif.length === 0)
    return (
      <>
        <PageHeader title="Pointage du jour" subtitle={formatLongDay(day)} />
        <Card>
          <EmptyState
            title="Aucun salarié dans l'effectif"
            body="Lancez `npm run db:seed` pour charger les 89 salariés du classeur, ou créez une fiche depuis Effectif & dossiers."
            action={
              <Link to="/effectif">
                <Button variant="primary" size="sm">
                  Ouvrir l'effectif
                </Button>
              </Link>
            }
          />
        </Card>
      </>
    );

  return (
    <>
      <PageHeader
        title="Pointage du jour"
        subtitle={`${formatLongDay(day)} · ${effectif.length} salariés suivis`}
        actions={
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={() => setDay(addDaysISO(day, -1))} aria-label="Jour précédent">
              ←
            </Button>
            <input
              type="date"
              value={day}
              onChange={(event) => event.target.value && setDay(event.target.value)}
              className="h-[30px] rounded-md border border-border bg-surface px-2 font-mono text-xs text-ink"
              aria-label="Date de la saisie"
            />
            <Button size="sm" onClick={() => setDay(addDaysISO(day, 1))} aria-label="Jour suivant">
              →
            </Button>
            <Button size="sm" variant={day === todayISO() ? "quiet" : "primary"} onClick={() => setDay(todayISO())}>
              Aujourd'hui
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={writeBulk.isPending || effectif.length === 0}
              aria-haspopup="dialog"
              onClick={() => setConfirmAllPresentOpen(true)}
            >
              Tous présents
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {(["present", "absent", "leave", "rest", "not_recorded"] as const).map((status) => (
          <StatTile
            key={status}
            status={status}
            value={counts[status]}
            total={effectif.length}
            active={filter === status}
            onSelect={() => setFilter(filter === status ? "all" : status)}
          />
        ))}
        <div className="flex flex-col justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2.5">
          <span className="text-[11px] font-medium tracking-label text-ink-muted uppercase">Taux de saisie</span>
          <span className="text-display tnum font-semibold leading-none text-ink">{formatRate(counts.recorded, effectif.length)}</span>
          <RateBar
            total={effectif.length}
            parts={[
              { value: counts.recorded, className: "bg-ink" },
              { value: counts.not_recorded, className: "bg-border-strong" },
            ]}
          />
          <span className="tnum text-[11px] text-ink-muted">
            {counts.recorded} saisis · {counts.not_recorded} à faire
          </span>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-[340px]">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-muted">⌕</span>
          <TextInput
            value={needle}
            onChange={(event) => setNeedle(event.target.value)}
            placeholder="Nom, matricule, CIN ou RIB"
            aria-label="Rechercher un salarié"
            className="pl-7"
          />
        </div>
        <label className="flex h-[34px] cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs text-ink-secondary hover:border-border-strong">
          <input
            type="checkbox"
            checked={onlyIncomplete}
            onChange={(event) => setOnlyIncomplete(event.target.checked)}
            className="size-3.5 accent-[var(--color-brand)]"
          />
          Dossiers incomplets seulement
        </label>
        <Select aria-label="Filtrer par zone" value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)} className="w-[210px] text-xs">
          <option value="all">Toutes les zones</option>
          {(zones.data ?? []).map((zone) => (
            <option key={zone.code} value={zone.code}>
              {zone.name}
            </option>
          ))}
        </Select>
        {filter !== "all" && (
          <Button size="sm" variant="quiet" onClick={() => setFilter("all")}>
            Filtre « {STATUS_META[filter].label} » — effacer
          </Button>
        )}
        <span className="ml-auto hidden text-[11px] text-ink-muted xl:inline">{SHORTCUTS}</span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={visibleIds.length === 0}
          onClick={() =>
            setSelectedIds((current) => {
              const next = new Set(current);
              if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
              else visibleIds.forEach((id) => next.add(id));
              return next;
            })
          }
        >
          {allVisibleSelected ? "Désélectionner les affichés" : `Sélectionner les ${visible} affichés`}
        </Button>
        <span className="text-xs text-ink-secondary" aria-live="polite">
          {selectedActiveIds.length} salarié{selectedActiveIds.length > 1 ? "s" : ""} sélectionné{selectedActiveIds.length > 1 ? "s" : ""}
        </span>
        {selectedActiveIds.length > 0 && (
          <>
            <Button size="sm" variant="quiet" onClick={() => setSelectedIds(new Set())}>
              Effacer la sélection
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setRangeFrom(day);
                setRangeTo(day);
                setRangeOpen((open) => !open);
              }}
            >
              Présence sur une période
            </Button>
          </>
        )}
      </div>

      {rangeOpen && selectedActiveIds.length > 0 && (
        <Card className="mb-3 border-brand/30 bg-brand-soft/30 p-3">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (rangeError) return;
              const records = rangeDays.flatMap((rangeDay) =>
                selectedActiveIds.map((employeeId) => ({ employeeId, day: rangeDay, status: rangeStatus, recordedBy: userId })),
              );
              void writePeriod.mutateAsync(records).then(() => {
                setRangeOpen(false);
                setSelectedIds(new Set());
              });
            }}
          >
            <div className="min-w-[220px] flex-1">
              <p className="text-sm font-semibold text-ink">Appliquer un statut sur une période</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {selectedActiveIds.length} salarié(s) · {rangeDayCount} jour(s), dates incluses. Les saisies existantes de cette période seront remplacées.
              </p>
            </div>
            <label className="flex flex-col gap-1 text-[11px] text-ink-muted">
              Du
              <input type="date" required value={rangeFrom} onChange={(event) => setRangeFrom(event.target.value)} className="h-[34px] rounded-md border border-border bg-surface px-2 text-xs text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-ink-muted">
              Au
              <input type="date" required min={rangeFrom} value={rangeTo} onChange={(event) => setRangeTo(event.target.value)} className="h-[34px] rounded-md border border-border bg-surface px-2 text-xs text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-ink-muted">
              Statut
              <Select value={rangeStatus} onChange={(event) => setRangeStatus(event.target.value as AttendanceStatus)} className="w-[130px] text-xs">
                {ATTENDANCE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_META[status].label}</option>)}
              </Select>
            </label>
            <Button type="submit" size="sm" variant="primary" loading={writePeriod.isPending} disabled={Boolean(rangeError)}>
              Enregistrer la période
            </Button>
            <Button type="button" size="sm" onClick={() => setRangeOpen(false)}>
              Annuler
            </Button>
            {rangeError && <p className="w-full text-xs text-absent" role="alert">{rangeError}</p>}
          </form>
        </Card>
      )}

      {counts.not_recorded > 0 && (
        <p className="mb-3 rounded-md border border-leave/25 bg-leave-soft px-3 py-2 text-xs text-leave">
          <strong className="tnum">{counts.not_recorded}</strong> salarié{counts.not_recorded > 1 ? "s" : ""} sans saisie pour ce
          jour — {groups.filter((group) => group.counts.not_recorded > 0).length} groupe
          {groups.filter((group) => group.counts.not_recorded > 0).length > 1 ? "s" : ""} concerné
          {groups.filter((group) => group.counts.not_recorded > 0).length > 1 ? "s" : ""}.
        </p>
      )}

      {cellsOfDay.isPending ? (
        <Loading label="Chargement des pointages" />
      ) : cellsOfDay.error ? (
        <ErrorState message={cellsOfDay.error.message} onRetry={() => void cellsOfDay.refetch()} />
      ) : visible === 0 ? (
        <Card>
          <EmptyState
            title="Aucun salarié ne correspond"
            body="Ajustez la recherche, le filtre de statut ou la sélection « dossiers incomplets »."
            action={
              <Button
                size="sm"
                onClick={() => {
                  setNeedle("");
                  setFilter("all");
                  setOnlyIncomplete(false);
                }}
              >
                Réinitialiser les filtres
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3" onKeyDown={onKeyDown}>
          {groups.map((group) => (
            <ZoneGroup
              key={group.code}
              group={group}
              collapsed={collapsed.has(group.code)}
              onToggle={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(group.code)) next.delete(group.code);
                  else next.add(group.code);
                  return next;
                })
              }
              cells={cells}
              completeIds={completeIds}
              write={write}
              writeBulk={writeBulk}
              userId={userId}
              dossiersKnown={dossiers.data !== undefined}
              missingById={missingById}
              selectedIds={selectedIds}
              onToggleSelection={(id) => setSelectedIds((current) => toggleId(current, id))}
            />
          ))}
        </div>
      )}

      {confirmAllPresentOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-all-present-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-8 backdrop-blur-[2px]"
          onClick={(event) => {
            if (event.target === event.currentTarget && !writeBulk.isPending) setConfirmAllPresentOpen(false);
          }}
        >
          <div className="w-full max-w-[440px] rounded-xl border border-border bg-surface shadow-pop">
            <header className="border-b border-border px-5 py-4">
              <h2 id="confirm-all-present-title" className="text-base font-semibold tracking-tight text-ink">
                Marquer tout l’effectif présent ?
              </h2>
              <p className="mt-1 text-xs text-ink-muted">{formatLongDay(day)}</p>
            </header>
            <div className="px-5 py-4">
              <p className="text-sm leading-5 text-ink-secondary">
                Cette action marquera les <strong className="tnum text-ink">{effectif.length}</strong> salariés actifs comme présents.
              </p>
              <p className="mt-2 rounded-md border border-leave/25 bg-leave-soft px-3 py-2 text-xs leading-5 text-leave">
                Les statuts déjà saisis pour cette journée seront remplacés.
              </p>
            </div>
            <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button size="sm" disabled={writeBulk.isPending} onClick={() => setConfirmAllPresentOpen(false)}>
                Annuler
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={writeBulk.isPending}
                onClick={() => {
                  setConfirmAllPresentOpen(false);
                  void writeBulk.mutate(
                    effectif.map((employee) => ({ employeeId: employee.id, status: "present" as const, recordedBy: userId })),
                  );
                }}
              >
                Confirmer
              </Button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function StatTile({
  status,
  value,
  total,
  active,
  onSelect,
}: {
  status: CellStatus;
  value: number;
  total: number;
  active: boolean;
  onSelect: () => void;
}) {
  const meta = STATUS_META[status];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={clsx(
        "flex flex-col items-start gap-1.5 rounded-lg border bg-surface px-3 py-2.5 text-left transition-all",
        active ? "border-ink shadow-pop" : "border-border hover:border-border-strong",
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-label">
        <span className={clsx("size-2 rounded-full", meta.dot)} />
        <span className="text-ink-muted">{meta.label}</span>
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-display tnum font-semibold leading-none text-ink">{value}</span>
        <span className="tnum text-[11px] text-ink-muted">/ {total}</span>
      </span>
      <span className="tnum text-[11px] text-ink-muted">{formatRate(value, total)}</span>
    </button>
  );
}

type Write = ReturnType<typeof useAttendanceWrite>;
type BulkWrite = ReturnType<typeof useBulkAttendanceWrite>;

function toggleId(current: Set<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function calendarDayCount(from: string, to: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return 0;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return !Number.isFinite(start) || !Number.isFinite(end) || end < start ? 0 : Math.floor((end - start) / 86_400_000) + 1;
}

function inclusiveDays(from: string, to: string): string[] {
  const count = calendarDayCount(from, to);
  if (count < 1 || count > 31) return [];
  const days: string[] = [];
  for (let index = 0, day = from; index < count; index += 1, day = addDaysISO(day, 1)) days.push(day);
  return days;
}

function ZoneGroup({
  group,
  collapsed,
  onToggle,
  cells,
  completeIds,
  write,
  writeBulk,
  userId,
  dossiersKnown,
  missingById,
  selectedIds,
  onToggleSelection,
}: {
  group: PointageGroup;
  collapsed: boolean;
  onToggle: () => void;
  cells: Map<string, Attendance>;
  completeIds: Set<string>;
  write: Write;
  writeBulk: BulkWrite;
  userId: string | null;
  dossiersKnown: boolean;
  missingById: Map<string, string[]>;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
}) {
  const busy = write.isPending || writeBulk.isPending;
  const missing = group.unrecordedIds;

  return (
    <Card className="overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-canvas px-3 py-2">
        <button type="button" onClick={onToggle} className="flex min-w-0 items-center gap-2 text-left" aria-expanded={!collapsed}>
          <span className="w-3 text-[11px] text-ink-muted">{collapsed ? "▸" : "▾"}</span>
          <span className="truncate text-sm font-semibold text-ink">{group.name}</span>
        </button>
        <span className="font-mono text-[11px] text-ink-muted">{group.code}</span>

        <div className="flex items-center gap-2">
          <RateBar
            className="w-[110px]"
            total={group.counts.headcount}
            parts={ATTENDANCE_STATUSES.map((status) => ({ value: group.counts[status], className: STATUS_META[status].dot }))}
          />
          <span className="tnum text-xs text-ink-secondary">
            <strong className="font-semibold text-present">{group.counts.present}</strong> / {group.counts.headcount} présents
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {busy && missing.length === 0 ? null : (
            <Button
              size="sm"
              disabled={busy || missing.length === 0}
              onClick={() =>
                void writeBulk.mutate(
                  missing.map((employeeId) => ({ employeeId, status: "present" as const, recordedBy: userId })),
                )
              }
            >
              {missing.length === 0 ? "Groupe complet" : `Marquer ${missing.length} présent${missing.length > 1 ? "s" : ""}`}
            </Button>
          )}
        </div>
      </header>

      {!collapsed && (
        <ul>
          {group.rows.map((employee) => (
            <EmployeeRow
              key={employee.id}
              employee={employee}
              cell={cells.get(employee.id) ?? null}
              incomplete={dossiersKnown && !completeIds.has(employee.id)}
              incompleteDetails={missingById.get(employee.id)?.join(" · ") ?? "État du dossier indisponible"}
              selected={selectedIds.has(employee.id)}
              onToggleSelection={() => onToggleSelection(employee.id)}
              write={write}
              userId={userId}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function EmployeeRow({
  employee,
  cell,
  incomplete,
  incompleteDetails,
  selected,
  onToggleSelection,
  write,
  userId,
}: {
  employee: { id: string; full_name: string; matricule: string; cin: string | null; rib: string | null };
  cell: Attendance | null;
  incomplete: boolean;
  incompleteDetails: string;
  selected: boolean;
  onToggleSelection: () => void;
  write: Write;
  userId: string | null;
}) {
  const current: CellStatus = cell?.status ?? "not_recorded";
  const name = displayName(employee.full_name);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2 last:border-b-0 hover:bg-canvas">
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelection}
        aria-label={`Sélectionner ${name} pour une saisie sur période`}
        className="size-4 shrink-0 accent-[var(--color-brand)]"
      />
      <Avatar name={employee.full_name} size={28} />
      <div className="min-w-[170px] flex-1">
        <p className="truncate text-sm font-medium text-ink">{name}</p>
        <p className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-muted">
          <span className="font-mono">{employee.matricule}</span>
          {employee.cin ? (
            <span className="font-mono">{employee.cin}</span>
          ) : (
            <span className="rounded-sm bg-leave-soft px-1 py-0.5 text-leave">CIN manquante</span>
          )}
          <span className={employee.rib?.trim() ? "text-present" : "text-leave"} title={employee.rib?.trim() ? "RIB renseigné dans la fiche" : "RIB à renseigner dans la fiche"}>
            RIB {employee.rib?.trim() ? "renseigné" : "manquant"}
          </span>
        </p>
      </div>

      <div role="group" aria-label={`Statut de ${name}`} className="flex items-center gap-1.5">
        {ATTENDANCE_STATUSES.map((status, index) => {
          const meta = STATUS_META[status];
          const selected = current === status;
          return (
            <button
              key={status}
              type="button"
              data-employee={employee.id}
              aria-pressed={selected}
              title={`${meta.description} — touche ${index + 1}`}
              onClick={() => void write.mutate([{ employeeId: employee.id, status: selected ? null : status, recordedBy: userId }])}
              className={clsx(
                "h-[26px] min-w-[62px] rounded-md border px-2 text-xs font-medium transition-colors",
                selected ? meta.selected : meta.idle,
              )}
            >
              {meta.label}
            </button>
          );
        })}
      </div>

      <div className="flex w-[128px] items-center justify-end gap-2">
        {current === "not_recorded" && <span className="text-[11px] text-rest">Non saisi</span>}
        {incomplete && (
          <span className="size-2 rounded-full bg-leave" title={`Dossier incomplet : ${incompleteDetails}`} aria-label={`Dossier incomplet : ${incompleteDetails}`} />
        )}
        <Link
          to={`/salaries/${employee.id}`}
          className="text-[11px] font-medium text-brand hover:underline"
          aria-label={`Ouvrir la fiche de ${name}`}
        >
          Fiche →
        </Link>
      </div>
    </li>
  );
}
