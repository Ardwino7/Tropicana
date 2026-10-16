import { useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import {
  createDocumentPreviewUrl,
  createDownloadUrl,
  deleteDocument,
  fetchAuditTrail,
  fetchAttendanceDay,
  fetchAttendanceRange,
  fetchDailyAttendance,
  fetchDossierStatuses,
  fetchEmployee,
  fetchEmployeeAttendanceRange,
  fetchEmployees,
  fetchProfile,
  fetchZoneAttendance,
  fetchDocuments,
  fetchZones,
  saveEmployee,
  setDocumentVerified,
  setEmployeeStatus,
  renameDocumentLabel,
  uploadDocument,
  writeAttendance,
  writeAttendances,
  type AttendanceWrite,
  type EmployeeInput,
} from "@/data/api";
import { useToast } from "@/components/Toast";
import type { Attendance } from "@/types/domain";

export const keys = {
  zones: ["zones"] as const,
  employees: ["employees"] as const,
  employee: (id: string) => ["employees", id] as const,
  pointage: (day: string) => ["pointage", day] as const,
  month: (from: string, to: string) => ["pointage-range", from, to] as const,
  dossiers: ["dossiers"] as const,
  daily: (from: string, to: string) => ["daily", from, to] as const,
  zoneAttendance: ["zone-attendance"] as const,
  documents: (employeeId: string) => ["documents", employeeId] as const,
  audit: (employeeId: string) => ["audit", employeeId] as const,
  profile: (userId: string) => ["profile", userId] as const,
};

/** Clés à rafraîchir dès qu'une saisie ou qu'une pièce change. */
const monthOf = (day: string) => [
  keys.daily(`${day.slice(0, 7)}-01`, `${day.slice(0, 7)}-31`),
  keys.month(`${day.slice(0, 7)}-01`, `${day.slice(0, 7)}-31`),
  keys.zoneAttendance,
  keys.dossiers,
];

export const zonesQuery = () =>
  queryOptions({ queryKey: keys.zones, queryFn: fetchZones, staleTime: Infinity });

export const employeesQuery = () =>
  queryOptions({ queryKey: keys.employees, queryFn: fetchEmployees, staleTime: 60_000 });

export const employeeQuery = (id: string) =>
  queryOptions({ queryKey: keys.employee(id), queryFn: () => fetchEmployee(id), enabled: Boolean(id) });

export const dayQuery = (day: string) =>
  queryOptions({ queryKey: keys.pointage(day), queryFn: () => fetchAttendanceDay(day), staleTime: 15_000 });

export const monthRangeQuery = (from: string, to: string) =>
  queryOptions({ queryKey: keys.month(from, to), queryFn: () => fetchAttendanceRange(from, to) });

export const employeeAttendanceRangeQuery = (employeeId: string, from: string, to: string, enabled = true) =>
  queryOptions({
    queryKey: ["employee-attendance", employeeId, from, to],
    queryFn: () => fetchEmployeeAttendanceRange(employeeId, from, to),
    enabled: Boolean(employeeId) && enabled,
  });

export const dossiersQuery = () => queryOptions({ queryKey: keys.dossiers, queryFn: fetchDossierStatuses });

export const dailyRangeQuery = (from: string, to: string) =>
  queryOptions({ queryKey: keys.daily(from, to), queryFn: () => fetchDailyAttendance(from, to) });

export const zoneAttendanceQuery = () => queryOptions({ queryKey: keys.zoneAttendance, queryFn: fetchZoneAttendance });

export const documentsQuery = (employeeId: string) =>
  queryOptions({ queryKey: keys.documents(employeeId), queryFn: () => fetchDocuments(employeeId), enabled: Boolean(employeeId) });

export const documentPreviewQuery = (storagePath: string | null) =>
  queryOptions({
    queryKey: ["document-preview", storagePath],
    queryFn: () => createDocumentPreviewUrl(storagePath as string),
    enabled: Boolean(storagePath),
    staleTime: 90_000,
    retry: false,
  });

export const auditQuery = (employeeId: string) =>
  queryOptions({ queryKey: keys.audit(employeeId), queryFn: () => fetchAuditTrail(employeeId), enabled: Boolean(employeeId) });

export const profileQuery = (userId: string | null) =>
  queryOptions({
    queryKey: keys.profile(userId ?? "anon"),
    queryFn: () => fetchProfile(userId as string),
    enabled: Boolean(userId),
    staleTime: Infinity,
  });

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

type DayCell = Attendance;
type Edit = Omit<AttendanceWrite, "day">;

/** Application d'une ou plusieurs éditions au cache de la journée (saisie optimiste). */
function patchDay(cells: DayCell[] | undefined, day: string, edits: Edit[]): DayCell[] {
  const index = new Map((cells ?? []).map((cell) => [cell.employee_id, cell]));
  const stamp = new Date().toISOString();
  for (const edit of edits) {
    if (edit.status === null) {
      index.delete(edit.employeeId);
      continue;
    }
    const existing = index.get(edit.employeeId);
    index.set(edit.employeeId, {
      id: existing?.id ?? "optimiste",
      employee_id: edit.employeeId,
      day,
      status: edit.status,
      note: existing?.note ?? null,
      recorded_by: edit.recordedBy,
      recorded_at: stamp,
      updated_at: stamp,
    });
  }
  return [...index.values()];
}

function useDayWrite(key: readonly string[], day: string, apply: (edits: Edit[]) => Promise<unknown>) {
  const client = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (edits: Edit[]) => apply(edits),

    onMutate: async (edits) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<DayCell[]>(key);
      client.setQueryData(key, patchDay(before, day, edits));
      return { before };
    },

    onError: (error, _edits, context) => {
      if (context?.before !== undefined) client.setQueryData(key, context.before);
      toast.danger(error instanceof Error ? error.message : "Saisie impossible.");
    },

    onSettled: () => {
      client.invalidateQueries({ queryKey: key });
      for (const prefix of monthOf(day)) client.invalidateQueries({ queryKey: prefix });
    },
  });
}

/**
 * Saisie optimiste : la cellule change au clic, pas à la réponse réseau. Un chef de
 * service qui marque 89 présences ne doit jamais attendre entre deux clics — mais il
 * doit voir la cellule revenir en arrière si le serveur refuse.
 */
export function useAttendanceWrite(day: string) {
  const key = keys.pointage(day);
  return useDayWrite(key, day, (edits) => Promise.all(edits.map((edit) => writeAttendance({ ...edit, day }))));
}

/** Variante groupée : un seul appel PostgREST pour tout un groupe. */
export function useBulkAttendanceWrite(day: string) {
  const key = keys.pointage(day);
  return useDayWrite(key, day, (edits) => writeAttendances(edits.map((edit) => ({ ...edit, day }))));
}

/** Saisie sur une période : un upsert groupé, puis rafraîchissement de chaque journée touchée. */
export function useAttendancePeriodWrite() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: writeAttendances,
    onSuccess: (_result, records) => {
      const days = [...new Set(records.map((record) => record.day))];
      for (const day of days) {
        client.invalidateQueries({ queryKey: keys.pointage(day) });
        for (const prefix of monthOf(day)) client.invalidateQueries({ queryKey: prefix });
      }
      toast.success(`${records.length} pointage${records.length > 1 ? "s" : ""} enregistré${records.length > 1 ? "s" : ""} sur la période.`);
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : "Saisie sur la période impossible."),
  });
}

export function useSaveEmployee() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: EmployeeInput) => saveEmployee(input),
    onSuccess: (employee, input) => {
      client.invalidateQueries({ queryKey: keys.employees });
      client.invalidateQueries({ queryKey: keys.employee(employee.id) });
      client.invalidateQueries({ queryKey: keys.dossiers });
      toast.success(input.id ? "Fiche mise à jour." : `${employee.full_name} ajouté à l'effectif.`);
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : "Enregistrement impossible."),
  });
}

export function useSetEmployeeStatus() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: { id: string; status: "active" | "archived" }) => setEmployeeStatus(input.id, input.status),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.employees });
      client.invalidateQueries({ queryKey: keys.dossiers });
      toast.success("Effectif mis à jour.");
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : "Mise à jour impossible."),
  });
}

export function useUploadDocument(employeeId: string) {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: Omit<Parameters<typeof uploadDocument>[0], "employeeId">) =>
      uploadDocument({ ...input, employeeId }),
    onSuccess: (document) => {
      client.invalidateQueries({ queryKey: keys.documents(employeeId) });
      client.invalidateQueries({ queryKey: keys.dossiers });
      toast.success(`${document.file_name} ajouté au dossier.`);
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : "Téléversement impossible."),
  });
}

export function useVerifyDocument(employeeId: string) {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: { id: string; verified: boolean; by: string | null }) =>
      setDocumentVerified(input.id, input.verified, input.by),
    onSuccess: (_data, input) => {
      client.invalidateQueries({ queryKey: keys.documents(employeeId) });
      client.invalidateQueries({ queryKey: keys.dossiers });
      toast.success(input.verified ? "Pièce vérifiée." : "Vérification retirée.");
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : "Vérification refusée (rôle RH requis)."),
  });
}

export function useRenameDocumentLabel(employeeId: string) {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: { id: string; label: string | null }) => renameDocumentLabel(input.id, input.label),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.documents(employeeId) }),
    onError: (error) => toast.danger(error instanceof Error ? error.message : "Annotation impossible."),
  });
}

export function useDeleteDocument(employeeId: string) {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: { id: string; storagePath: string }) => deleteDocument(input.id, input.storagePath),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.documents(employeeId) });
      client.invalidateQueries({ queryKey: keys.dossiers });
      toast.success("Pièce retirée du dossier.");
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : "Suppression refusée."),
  });
}

/**
 * Le lien signé expire en 2 minutes : on le demande au moment du clic et on laisse le
 * navigateur ouvrir l'URL, plutôt que de transiter par un blob en mémoire.
 */
export function useDownloadDocument() {
  const toast = useToast();
  return useMutation({
    mutationFn: (input: { storagePath: string; fileName: string }) => createDownloadUrl(input.storagePath, input.fileName),
    onSuccess: (url, input) => {
      const link = document.createElement("a");
      link.href = url;
      link.download = input.fileName;
      link.rel = "noopener";
      link.click();
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : "Téléchargement impossible."),
  });
}
