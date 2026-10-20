import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { PageHeader } from "@/components/AppShell";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Select,
  TextInput,
} from "@/components/ui";
import { EmployeeDialog } from "@/components/EmployeeDialog";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/auth/AuthContext";
import {
  auditQuery,
  documentsQuery,
  documentPreviewQuery,
  employeeAttendanceRangeQuery,
  employeeQuery,
  useDeleteDocument,
  useDownloadDocument,
  useUploadDocument,
  useVerifyDocument,
  useSetEmployeeStatus,
} from "@/data/hooks";
import { DOCUMENT_KINDS, DOCUMENT_KIND_META, REQUIRED_KINDS, STATUS_META } from "@/lib/statuses";
import { buildFileName, displayName, fileSlug, formatBytes, formatMediumDay, formatTimestamp, monthBounds, pluralize, todayISO } from "@/lib/format";
import type { CellStatus, DocumentKind, EmployeeDocument } from "@/types/domain";

export default function EmployeePage() {
  const { id = "" } = useParams();
  const { userId, role } = useAuth();
  const today = todayISO();
  const bounds = monthBounds(today);
  const [trackFrom, setTrackFrom] = useState(bounds.from);
  const [trackTo, setTrackTo] = useState(today);
  const trackDayCount = calendarDayCount(trackFrom, trackTo);
  const trackError = trackDayCount < 1
    ? "Choisissez une période valide."
    : trackDayCount > 366
      ? "La période ne peut pas dépasser 12 mois."
      : "";
  const employee = useQuery(employeeQuery(id));
  const documents = useQuery(documentsQuery(id));
  const audit = useQuery(auditQuery(id));
  const photoDocument = documents.data?.find((doc) => doc.kind === "photo") ?? null;
  const photoIsImage = Boolean(photoDocument?.mime_type.toLowerCase().startsWith("image/"));
  const photoPreview = useQuery(documentPreviewQuery(photoIsImage ? photoDocument?.storage_path ?? null : null));
  const history = useQuery(employeeAttendanceRangeQuery(id, trackFrom, trackTo, !trackError));

  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [downloadedIds, setDownloadedIds] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(`employee-downloads:${id}`) ?? "[]") as unknown;
      return Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(`employee-downloads:${id}`) ?? "[]") as unknown;
      setDownloadedIds(Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : []);
    } catch {
      setDownloadedIds([]);
    }
  }, [id]);
  const upload = useUploadDocument(id);
  const verify = useVerifyDocument(id);
  const remove = useDeleteDocument(id);
  const download = useDownloadDocument();
  const setStatus = useSetEmployeeStatus();
  const [kind, setKind] = useState<DocumentKind>("insurance");
  const [expiry, setExpiry] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const requiredInputs = useRef<Partial<Record<DocumentKind, HTMLInputElement>>>({});

  const cells = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of history.data ?? []) if (row.employee_id === id) map.set(row.day, row.status);
    return map;
  }, [history.data, id]);

  function setTrackingMonths(months: number) {
    const end = todayISO();
    setTrackTo(end);
    setTrackFrom(months === 0 ? monthBounds(end).from : shiftMonthsISO(end, -months));
  }

  if (employee.isPending) return <Loading label="Chargement de la fiche" />;
  if (employee.error)
    return (
      <>
        <PageHeader title="Fiche introuvable" />
        <ErrorState message={employee.error.message} onRetry={() => void employee.refetch()} />
      </>
    );

  const person = employee.data;
  const name = displayName(person.full_name);
  const rows = documents.data ?? [];
  const present = rows.filter((doc) => REQUIRED_KINDS.includes(doc.kind));
  const presentRequiredCount = REQUIRED_KINDS.filter((required) => present.some((doc) => doc.kind === required)).length;
  const missing = [
    ...(!person.cin ? ["CIN au référentiel"] : []),
    ...(!person.rib?.trim() ? ["RIB à renseigner"] : []),
    ...REQUIRED_KINDS.filter((required) => !present.some((doc) => doc.kind === required)).map((required) => DOCUMENT_KIND_META[required].label.toLowerCase()),
  ];

  async function onPick(event: ChangeEvent<HTMLInputElement>, selectedKind: DocumentKind = kind) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (selectedKind === "photo" && !["image/jpeg", "image/png"].includes(file.type)) {
      toast.danger("Choisissez une photo au format JPG ou PNG.");
      return;
    }
    try {
      await upload.mutateAsync({
        kind: selectedKind,
        file,
        fileName: buildFileName(DOCUMENT_KIND_META[selectedKind].prefix, person.cin, person.full_name, todayISO(), extension(file.name)),
        expiresOn: expiry || null,
        uploadedBy: userId,
      });
    } catch {
      // useUploadDocument affiche déjà le message d'erreur via sa notification.
    }
  }

  async function copyValue(label: string, value: string | null | undefined) {
    if (!value?.trim()) return;
    try {
      await navigator.clipboard.writeText(value.trim());
      toast.success(`${label} copié.`);
    } catch {
      toast.danger(`Impossible de copier ${label}.`);
    }
  }

  async function downloadFile(doc: EmployeeDocument) {
    await download.mutateAsync({ storagePath: doc.storage_path, fileName: doc.file_name });
    const next = downloadedIds.includes(doc.id) ? downloadedIds : [...downloadedIds, doc.id];
    setDownloadedIds(next);
    try {
      window.localStorage.setItem(`employee-downloads:${id}`, JSON.stringify(next));
    } catch {
      // Keep the current-page indicator even when local storage is unavailable.
    }
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={person.full_name} size={40} src={photoIsImage ? photoPreview.data : null} />
            <span className="flex flex-col">
              <span>{name}</span>
              <span className="font-mono text-xs font-normal text-ink-muted">
                {person.matricule} · {person.cin ?? "CIN manquante"}
              </span>
            </span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{person.position}</span>
            <span className="text-ink-muted">·</span>
            {role === "chef_de_service" && (
              <Link to={`/pointage?date=${todayISO()}`} className="text-brand hover:underline">
                Voir dans le pointage
              </Link>
            )}
            {person.status === "archived" && <Badge className="bg-rest-soft text-ink-secondary">Archivé</Badge>}
          </span>
        }
        actions={
          <>
            <Button size="sm" onClick={() => setEditing(true)}>
              Modifier la fiche
            </Button>
            <Button
              size="sm"
              variant={person.status === "active" ? "danger" : "default"}
              onClick={() => void setStatus.mutateAsync({ id: person.id, status: person.status === "active" ? "archived" : "active" })}
            >
              {person.status === "active" ? "Archiver" : "Réactiver"}
            </Button>
          </>
        }
      />

      <Card className="mb-4 overflow-hidden">
        <CardHeader
          title="Informations rapides"
          subtitle={`${person.matricule} · ${person.position}`}
          actions={<Badge className={missing.length === 0 ? "bg-present-soft text-present" : "bg-leave-soft text-leave"}>{missing.length === 0 ? "Dossier complet" : `${missing.length} élément${missing.length > 1 ? "s" : ""} à compléter`}</Badge>}
        />
        <div className="grid gap-3 p-4 sm:grid-cols-[112px_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col items-center gap-2">
            {photoIsImage && photoPreview.data ? (
              <img src={photoPreview.data} alt={`Photo de ${name}`} className="size-24 rounded-lg border border-border object-cover" />
            ) : (
              <div className="flex size-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-strong bg-canvas text-center">
                <Avatar name={person.full_name} size={40} />
                <span className="px-1 text-[10px] leading-3 text-ink-muted">
                  {photoPreview.isLoading ? "Chargement…" : photoDocument ? "Image indisponible" : "Photo à ajouter"}
                </span>
              </div>
            )}
            {photoDocument && !photoIsImage && (
              <Button size="sm" variant="quiet" onClick={() => void downloadFile(photoDocument)}>
                Ouvrir la pièce
              </Button>
            )}
            {photoIsImage && photoPreview.error && <span className="text-center text-[10px] text-absent">Aperçu indisponible</span>}
            {!photoDocument && (
              <button
                type="button"
                disabled={upload.isPending}
                onClick={() => requiredInputs.current.photo?.click()}
                className="text-[11px] font-medium text-brand hover:underline disabled:cursor-wait disabled:opacity-60"
              >
                {upload.isPending ? "Téléversement…" : "Ajouter une photo"}
              </button>
            )}
          </div>
          <QuickValue label="CIN" value={person.cin} onCopy={() => void copyValue("CIN", person.cin)} />
          <QuickValue label="RIB" value={person.rib} onCopy={() => void copyValue("RIB", person.rib)} />
        </div>
        {missing.length > 0 && <p className="border-t border-border px-4 py-2.5 text-xs leading-5 text-ink-secondary">À compléter : {missing.join(" · ")}</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card id="employee-documents" className="overflow-hidden">
          <CardHeader
            title="Pièces du dossier"
            subtitle={
              missing.length === 0
                ? `Dossier complet — ${presentRequiredCount} pièces requises`
                : `${pluralize(missing.length, "élément obligatoire")} manquant${missing.length > 1 ? "s" : ""} : ${missing.join(", ")}`
            }
          />

          <ul className="divide-y divide-border">
            {REQUIRED_KINDS.map((entry) => {
              const document = rows.find((doc) => doc.kind === entry);
              return (
                <li key={entry} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{DOCUMENT_KIND_META[entry].label}</span>
                    <span className={clsx("block truncate text-[11px]", document ? "text-present" : "text-absent")}>
                      {document ? `${downloadedIds.includes(document.id) ? "Téléchargé sur cet appareil" : "Déposé · téléchargement disponible"} · ${document.original_name}` : "À fournir"}
                    </span>
                  </span>
                  <input
                    ref={(element) => {
                      if (element) requiredInputs.current[entry] = element;
                    }}
                    type="file"
                    accept={entry === "photo" ? "image/jpeg,image/png" : "application/pdf,image/jpeg,image/png"}
                    className="hidden"
                    onChange={(event) => void onPick(event, entry)}
                  />
                  <div className="flex w-full gap-2 sm:w-auto">
                    {document && <Button size="sm" variant="default" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" loading={download.isPending} disabled={download.isPending} onClick={() => void downloadFile(document)}>{downloadedIds.includes(document.id) ? "Télécharger à nouveau" : "Télécharger"}</Button>}
                    <Button size="sm" variant={document ? "default" : "primary"} className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" loading={upload.isPending} disabled={upload.isPending} onClick={() => requiredInputs.current[entry]?.click()}>
                      {document ? "Remplacer" : "Ajouter"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-border bg-canvas px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-muted">Autre pièce</span>
              <Select value={kind} onChange={(event) => setKind(event.target.value as DocumentKind)} className="h-[30px] w-[150px] text-xs">
                {DOCUMENT_KINDS.filter((entry) => !REQUIRED_KINDS.includes(entry)).map((entry) => (
                  <option key={entry} value={entry}>{DOCUMENT_KIND_META[entry].label}</option>
                ))}
              </Select>
              <label className="ml-1 flex items-center gap-2 text-xs text-ink-muted">
                Validité
                <input type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} className="h-[30px] rounded-md border border-border bg-surface px-2 font-mono text-xs text-ink" aria-label="Date d'expiration de la pièce" />
              </label>
              <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={onPick} />
              <Button size="sm" variant="default" loading={upload.isPending} disabled={upload.isPending} onClick={() => input.current?.click()}>Téléverser</Button>
            </div>
            <p className="mt-2 truncate font-mono text-[10px] text-ink-muted">
              {DOCUMENT_KIND_META[kind].prefix}_{(person.cin ?? "SANS-CIN").toUpperCase()}_{fileSlug(person.full_name) || "SALARIE"}_{todayISO()}.pdf
            </p>
          </div>

          {documents.isPending ? (
            <Loading label="Chargement des pièces" />
          ) : documents.error ? (
            <ErrorState message={documents.error.message} onRetry={() => void documents.refetch()} />
          ) : rows.filter((doc) => !REQUIRED_KINDS.includes(doc.kind)).length === 0 ? (
            <EmptyState
              title="Aucune pièce facultative"
              body="Les pièces requises sont listées ci-dessus. Les documents facultatifs apparaîtront ici dès leur ajout."
            />
          ) : (
            <ul>
              {rows.filter((doc) => !REQUIRED_KINDS.includes(doc.kind)).map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  canVerify={role === "rh"}
                  userId={userId}
                  downloaded={downloadedIds.includes(doc.id)}
                  busy={verify.isPending || remove.isPending || download.isPending}
                  onVerify={(verified) => void verify.mutateAsync({ id: doc.id, verified, by: userId })}
                  onRemove={() => void remove.mutateAsync({ id: doc.id, storagePath: doc.storage_path })}
                  onDownload={() => void downloadFile(doc)}
                />
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Suivi des présences" subtitle={trackError ? "Période personnalisée" : `${pluralize(cells.size, "journée saisie")} sur ${trackDayCount} jours`} />
            <div className="px-4 py-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[11px] text-ink-muted">
                  Du
                  <TextInput type="date" value={trackFrom} onChange={(event) => setTrackFrom(event.target.value)} aria-label="Début du suivi" className="w-full font-mono text-xs" />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-ink-muted">
                  Au
                  <TextInput type="date" value={trackTo} onChange={(event) => setTrackTo(event.target.value)} aria-label="Fin du suivi" className="w-full font-mono text-xs" />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Button size="sm" variant="quiet" onClick={() => setTrackingMonths(0)}>Ce mois</Button>
                <Button size="sm" variant="quiet" onClick={() => setTrackingMonths(3)}>3 mois</Button>
                <Button size="sm" variant="quiet" onClick={() => setTrackingMonths(12)}>12 mois</Button>
              </div>
              {trackError ? (
                <p className="mt-3 text-xs text-absent" role="alert">{trackError}</p>
              ) : history.isPending ? (
                <Loading label="Chargement du suivi" />
              ) : history.error ? (
                <ErrorState message={history.error.message} onRetry={() => void history.refetch()} />
              ) : (
                <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
                  {monthGroups({ from: trackFrom, to: trackTo }).map(({ label, days }) => (
                    <section key={label} aria-label={label}>
                      <h3 className="mb-1 text-[11px] font-medium capitalize text-ink-muted">{label}</h3>
                      <div className="flex flex-wrap gap-1">
                        {days.map((day) => {
                          const status = cells.get(day);
                          return (
                            <span
                              key={day}
                              title={`${formatMediumDay(day)} · ${status ? STATUS_META[status as CellStatus].label : "Non saisi"}`}
                              className={clsx(
                                "flex size-[26px] items-center justify-center rounded-sm border text-[10px] font-medium",
                                status === "present" && "border-present bg-present-soft text-present",
                                status === "absent" && "border-absent bg-absent-soft text-absent",
                                status === "leave" && "border-leave bg-leave-soft text-leave",
                                status === "rest" && "border-rest bg-rest-soft text-rest",
                                !status && "border-dashed border-border-strong text-ink-muted",
                              )}
                            >
                              {Number(day.slice(-2))}
                            </span>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-muted" aria-label="Légende du suivi des présences">
                {([
                  ["Présent", "bg-present-soft border-present"],
                  ["Absent", "bg-absent-soft border-absent"],
                  ["Congé", "bg-leave-soft border-leave"],
                  ["Repos", "bg-rest-soft border-rest"],
                  ["Non saisi", "border-dashed border-border-strong"],
                ] as const).map(([label, style]) => (
                  <span key={label} className="inline-flex items-center gap-1">
                    <span className={clsx("size-2.5 rounded-sm border", style)} />
                    {label}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-4 text-ink-muted">Cases vides = aucune saisie. Sélectionnez une période jusqu’à 12 mois.</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Historique" subtitle="Journal d'audit" />
            {audit.isPending ? (
              <Loading />
            ) : (audit.data ?? []).length === 0 ? (
              <p className="px-4 py-3 text-xs text-ink-muted">Aucun événement enregistré.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {(audit.data ?? []).map((entry) => (
                  <li key={entry.id} className="flex flex-col gap-0.5 px-4 py-2">
                    <span className="text-xs text-ink">{humanAction(entry.action)}</span>
                    <span className="font-mono text-[10px] text-ink-muted">
                      {formatTimestamp(entry.created_at)} · {entry.actor_label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {editing && <EmployeeDialog employee={person} onClose={() => setEditing(false)} />}
    </>
  );
}

function QuickValue({ label, value, onCopy }: { label: string; value: string | null | undefined; onCopy: () => void }) {
  const available = Boolean(value?.trim());
  return (
    <div className="min-w-0 rounded-lg border border-border bg-canvas px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-label text-ink-muted">{label}</p>
        {available && (
          <button type="button" onClick={onCopy} className="text-[11px] font-medium text-brand hover:underline" aria-label={`Copier ${label}`}>
            Copier
          </button>
        )}
      </div>
      <p className={clsx("mt-2 break-all font-mono text-sm", available ? "text-ink" : "font-medium text-absent")}>
        {available ? value : "À renseigner"}
      </p>
    </div>
  );
}

function DocumentRow({
  doc,
  canVerify,
  userId,
  downloaded,
  busy,
  onVerify,
  onRemove,
  onDownload,
}: {
  doc: EmployeeDocument;
  canVerify: boolean;
  userId: string | null;
  downloaded: boolean;
  busy: boolean;
  onVerify: (verified: boolean) => void;
  onRemove: () => void;
  onDownload: () => void;
}) {
  const meta = DOCUMENT_KIND_META[doc.kind];
  const expired = Boolean(doc.expires_on && doc.expires_on < todayISO());

  return (
    <li className="flex flex-col gap-2.5 border-b border-border px-3 py-3 last:border-b-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2 sm:px-4 sm:py-2.5">
      <div className="flex min-w-0 items-center gap-2 sm:contents">
        <Badge className={meta.badge}>{meta.label}</Badge>
        <span className={clsx("ml-auto text-[10px] sm:hidden", downloaded ? "text-present" : "text-ink-muted")}>{downloaded ? "Téléchargé ici" : "À télécharger"}</span>
      </div>
      <div className="min-w-0 flex-1 sm:min-w-[220px]">
        <p className="truncate font-mono text-xs text-ink" title={doc.file_name}>
          {doc.file_name}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-muted">
          <span className="tnum whitespace-nowrap">{formatBytes(doc.size_bytes)}</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap">téléversée le {formatMediumDay(doc.uploaded_at)}</span>
          {doc.expires_on && (
            <>
              <span aria-hidden="true">·</span>
              <span className={clsx("whitespace-nowrap", expired && "font-medium text-absent")}>
                {expired ? "expirée le" : "valide jusqu'au"} {formatMediumDay(doc.expires_on)}
              </span>
            </>
          )}
        </p>
      </div>

      <span
        className={clsx(
          "flex items-center gap-1.5 text-[11px] sm:w-[112px] sm:justify-end",
          doc.verified_at ? "text-present" : "text-ink-muted",
        )}
        title={doc.verified_at ? `Vérifiée le ${formatMediumDay(doc.verified_at)}` : "Pas encore vérifiée par un RH"}
      >
        <span className={clsx("size-1.5 rounded-full", doc.verified_at ? "bg-present" : "bg-border-strong")} />
        {doc.verified_at ? "Vérifiée RH" : "À vérifier"}
      </span>

      <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto">
        <span className={clsx("mr-auto hidden text-[10px] sm:inline", downloaded ? "text-present" : "text-ink-muted")}>{downloaded ? "Téléchargé ici" : "À télécharger"}</span>
        <Button size="sm" variant="ghost" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" onClick={onDownload}>
          {downloaded ? "À nouveau" : "Télécharger"}
        </Button>
        {canVerify && (
          <Button size="sm" variant="ghost" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" disabled={busy} onClick={() => onVerify(!doc.verified_at)}>
            {doc.verified_at ? "Annuler la vérif." : "Vérifier"}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="min-h-10 flex-1 sm:min-h-0 sm:flex-none" disabled={busy} onClick={onRemove} aria-label={`Retirer ${doc.file_name}`}>
          Retirer
        </Button>
      </div>
    </li>
  );
}

function monthDays(bounds: { from: string; to: string }): string[] {
  const days: string[] = [];
  const cursor = new Date(`${bounds.from}T00:00:00`);
  const end = new Date(`${bounds.to}T00:00:00`);
  while (cursor <= end) {
    days.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function monthGroups(bounds: { from: string; to: string }): Array<{ label: string; days: string[] }> {
  const grouped = new Map<string, string[]>();
  for (const day of monthDays(bounds)) {
    const month = day.slice(0, 7);
    grouped.set(month, [...(grouped.get(month) ?? []), day]);
  }
  return [...grouped].map(([month, days]) => ({
    label: formatMediumDay(`${month}-01`).replace(/^1\s+/, ""),
    days,
  }));
}

function calendarDayCount(from: string, to: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return 0;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || new Date(start).toISOString().slice(0, 10) !== from || new Date(end).toISOString().slice(0, 10) !== to || end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

function shiftMonthsISO(iso: string, offset: number): string {
  const [year = 0, month = 1, day = 1] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + offset, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}`;
}

function extension(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match?.[1]?.toLowerCase() ?? "pdf";
}

function humanAction(action: string): string {
  const [domain, value] = action.split(".");
  const labels: Record<string, string> = {
    present: "marqué présent",
    absent: "marqué absent",
    leave: "posé en congé",
    rest: "placé en repos",
    efface: "saisie effacée",
    televerse: "pièce téléversée",
    verifie: "pièce vérifiée",
    supprime: "pièce retirée",
  };
  return `${domain === "pointage" ? "Pointage" : "Document"} — ${labels[value ?? ""] ?? value ?? action}`;
}
