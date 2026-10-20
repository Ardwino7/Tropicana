import { supabase } from "@/lib/supabase";
import type {
  Attendance,
  AttendanceStatus,
  AuditEntry,
  DailyAttendance,
  DossierStatus,
  Employee,
  EmployeeDocument,
  Profile,
  Zone,
  ZoneAttendance,
} from "@/types/domain";

/**
 * Toute la surface d'accès aux données. Les pages ne touchent jamais `supabase`
 * directement : c'est ce qui permet de relire d'un coup d'œil ce que l'application
 * demande au serveur, et de raisonner sur ce que la RLS autorise vraiment.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function unwrap<T>(result: { data: T | null; error: { message: string; code?: string } | null }, context: string): T {
  if (result.error) throw new ApiError(`${context} — ${result.error.message}`, result.error.code);
  return result.data as T;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function fetchZones(): Promise<Zone[]> {
  const { data, error } = await supabase.from("zones").select("code, name, sort_order").order("sort_order");
  return unwrap({ data, error }, "chargement des groupes");
}

export async function fetchEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, matricule, full_name, cin, rib, position, zone_code, hire_date, contract_type, contract_end_date, status, source_row, created_at, updated_at")
    .order("zone_code")
    .order("matricule");
  return unwrap({ data, error }, "chargement de l'effectif");
}

export async function fetchEmployee(id: string): Promise<Employee> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, matricule, full_name, cin, rib, position, zone_code, hire_date, contract_type, contract_end_date, status, source_row, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ApiError(`chargement de la fiche — ${error.message}`, error.code);
  if (!data) throw new ApiError("Ce salarié n'existe pas ou a été retiré du référentiel.", "PGRST116");
  return data as Employee;
}

/** Une journée de pointage : uniquement les lignes saisies. Le reste est « non saisi ». */
export async function fetchAttendanceDay(day: string): Promise<Attendance[]> {
  const { data, error } = await supabase
    .from("attendances")
    .select("id, employee_id, day, status, note, recorded_by, recorded_at, updated_at")
    .eq("day", day);
  return unwrap({ data, error }, "chargement du pointage");
}

export async function fetchAttendanceRange(from: string, to: string): Promise<Attendance[]> {
  const { data, error } = await supabase
    .from("attendances")
    .select("id, employee_id, day, status, note, recorded_by, recorded_at, updated_at")
    .gte("day", from)
    .lte("day", to)
    .order("day");
  return unwrap({ data, error }, "chargement des pointages du mois");
}

export async function fetchEmployeeAttendanceRange(employeeId: string, from: string, to: string): Promise<Attendance[]> {
  const { data, error } = await supabase
    .from("attendances")
    .select("id, employee_id, day, status, note, recorded_by, recorded_at, updated_at")
    .eq("employee_id", employeeId)
    .gte("day", from)
    .lte("day", to)
    .order("day");
  return unwrap({ data, error }, "chargement du suivi des présences");
}

export async function fetchDossierStatuses(): Promise<DossierStatus[]> {
  const { data, error } = await supabase
    .from("employee_dossier_status")
    .select("employee_id, matricule, full_name, zone_code, has_cin, has_contract, has_cin_doc, has_medical, has_insurance, has_expired_document, document_count, has_rib, has_photo, has_warning");
  return unwrap({ data, error }, "chargement de l'état des dossiers");
}

export async function fetchDailyAttendance(from: string, to: string): Promise<DailyAttendance[]> {
  const { data, error } = await supabase
    .from("daily_attendance")
    .select("day, present, absent, leave, rest, recorded")
    .gte("day", from)
    .lte("day", to)
    .order("day");
  return unwrap({ data, error }, "chargement de la synthèse quotidienne");
}

export async function fetchZoneAttendance(): Promise<ZoneAttendance[]> {
  const { data, error } = await supabase
    .from("zone_attendance")
    .select("zone_code, headcount, present, absent, leave, rest, recorded");
  return unwrap({ data, error }, "chargement de la synthèse par groupe");
}

export async function fetchDocuments(employeeId: string): Promise<EmployeeDocument[]> {
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, employee_id, kind, storage_path, file_name, original_name, mime_type, size_bytes, label, expires_on, uploaded_by, uploaded_at, verified_by, verified_at, updated_at",
    )
    .eq("employee_id", employeeId)
    .order("uploaded_at", { ascending: false });
  return unwrap({ data, error }, "chargement des pièces");
}

export async function fetchAuditTrail(employeeId: string): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, actor_label, employee_id, action, detail, created_at")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(40);
  return unwrap({ data, error }, "chargement de l'historique");
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("id, email, full_name, role, employee_id").eq("id", userId).maybeSingle();
  if (error) throw new ApiError(`chargement du profil — ${error.message}`, error.code);
  return data as Profile | null;
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

export interface AttendanceWrite {
  employeeId: string;
  day: string;
  status: AttendanceStatus | null;
  recordedBy: string | null;
}

/**
 * `status: null` efface la cellule : on revient à « non saisi », qui n'est pas un
 * statut mais l'absence de ligne. Conserver une ligne blanche fausserait tout décompte.
 */
export async function writeAttendance({ employeeId, day, status, recordedBy }: AttendanceWrite): Promise<void> {
  if (status === null) {
    const { error } = await supabase.from("attendances").delete().eq("employee_id", employeeId).eq("day", day);
    if (error) throw new ApiError(`effacement du pointage — ${error.message}`, error.code);
    return;
  }
  const { error } = await supabase.from("attendances").upsert(
    { employee_id: employeeId, day, status, recorded_by: recordedBy, note: null },
    { onConflict: "employee_id,day" },
  );
  if (error) throw new ApiError(`enregistrement du pointage — ${error.message}`, error.code);
}

/**
 * Marque plusieurs salariés d'un coup. Une seule requête : « tout marquer présent »
 * sur un groupe de 26 personnes ne doit pas déclencher 26 allers-retours.
 */
export async function writeAttendances(records: AttendanceWrite[]): Promise<void> {
  if (records.length === 0) return;
  const deletes = records.filter((record) => record.status === null);
  const ups = records.filter((record) => record.status !== null);

  if (ups.length) {
    const { error } = await supabase.from("attendances").upsert(
      ups.map((record) => ({
        employee_id: record.employeeId,
        day: record.day,
        status: record.status,
        recorded_by: record.recordedBy,
        note: null,
      })),
      { onConflict: "employee_id,day" },
    );
    if (error) throw new ApiError(`enregistrement du pointage — ${error.message}`, error.code);
  }
  for (const record of deletes) await writeAttendance(record);
}

export interface EmployeeInput {
  id?: string;
  matricule: string;
  full_name: string;
  cin: string | null;
  rib: string | null;
  position: string;
  zone_code: string;
  hire_date: string | null;
  contract_type: Employee["contract_type"];
  contract_end_date: string | null;
}

export async function saveEmployee(input: EmployeeInput): Promise<Employee> {
  const row = {
    matricule: input.matricule,
    full_name: input.full_name,
    cin: input.cin,
    rib: input.rib,
    position: input.position,
    zone_code: input.zone_code,
    hire_date: input.hire_date,
    contract_type: input.contract_type,
    contract_end_date: input.contract_end_date,
  };
  const query = input.id
    ? supabase.from("employees").update(row).eq("id", input.id)
    : supabase.from("employees").insert({ ...row, status: "active" });
  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw new ApiError(`enregistrement du salarié — ${error.message}`, error.code);
  if (!data) throw new ApiError("Enregistrement refusé par le serveur (politique d'accès).", "42501");
  return data as Employee;
}

/** L'archivage remplace la suppression : un effectif partant reste dans l'historique. */
export async function setEmployeeStatus(id: string, status: Employee["status"]): Promise<void> {
  const { error } = await supabase.from("employees").update({ status }).eq("id", id);
  if (error) throw new ApiError(`mise à jour du statut — ${error.message}`, error.code);
}

export interface DocumentUpload {
  employeeId: string;
  kind: EmployeeDocument["kind"];
  file: File;
  fileName: string;
  expiresOn: string | null;
  uploadedBy: string | null;
}

/**
 * Deux temps : l'objet dans Storage, puis la ligne `documents`. Si la seconde échoue,
 * l'objet orphelin est retiré — sinon le bucket se remplit de fichiers sans dossier.
 */
export async function uploadDocument({ employeeId, kind, file, fileName, expiresOn, uploadedBy }: DocumentUpload): Promise<EmployeeDocument> {
  let path = `${employeeId}/${fileName}`;
  let name = fileName;
  const storage = supabase.storage.from("documents");

  let put = await storage.upload(path, file, { contentType: file.type || "application/pdf", upsert: false });
  if (put.error && /already exists|duplicate/i.test(put.error.message)) {
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
    name = fileName.replace(/\.([a-z0-9]+)$/i, `_${stamp}.$1`);
    path = `${employeeId}/${name}`;
    put = await storage.upload(path, file, { contentType: file.type || "application/pdf", upsert: false });
  }
  if (put.error) throw new ApiError(`téléversement — ${put.error.message}`);

  const { data, error } = await supabase
    .from("documents")
    .insert({
      employee_id: employeeId,
      kind,
      storage_path: path,
      file_name: name,
      original_name: file.name,
      mime_type: file.type || "application/pdf",
      size_bytes: file.size,
      expires_on: expiresOn,
      uploaded_by: uploadedBy,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    await storage.remove([path]);
    throw new ApiError(error ? `enregistrement de la pièce — ${error.message}` : "enregistrement de la pièce refusé.", error?.code);
  }
  return data as EmployeeDocument;
}

export async function setDocumentVerified(id: string, verified: boolean, by: string | null): Promise<void> {
  const patch = verified ? { verified_by: by, verified_at: new Date().toISOString() } : { verified_by: null, verified_at: null };
  const { error } = await supabase.from("documents").update(patch).eq("id", id);
  if (error) throw new ApiError(`vérification de la pièce — ${error.message}`, error.code);
}

export async function renameDocumentLabel(id: string, label: string | null): Promise<void> {
  const { error } = await supabase.from("documents").update({ label }).eq("id", id);
  if (error) throw new ApiError(`annotation de la pièce — ${error.message}`, error.code);
}

export async function deleteDocument(id: string, storagePath: string): Promise<void> {
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) throw new ApiError(`suppression de la pièce — ${error.message}`, error.code);
  // Un objet restant ne bloque rien : la ligne est partie, le fichier devient invisible
  // à l'application. On tente le nettoyage sans en faire une condition de succès.
  await supabase.storage.from("documents").remove([storagePath]);
}

/** URL courte, recalculée à chaque ouverture : un lien de téléchargement ne se met pas en cache. */
export async function createDownloadUrl(storagePath: string, fileName: string): Promise<string> {
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(storagePath, 120, { download: fileName });
  if (error) throw new ApiError(`lien de téléchargement — ${error.message}`);
  if (!data?.signedUrl) throw new ApiError("Le serveur n'a pas délivré de lien de téléchargement.");
  return data.signedUrl;
}

/** URL signée courte pour afficher une image privée dans la fiche salarié. */
export async function createDocumentPreviewUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(storagePath, 120);
  if (error) throw new ApiError(`aperçu de la pièce — ${error.message}`);
  if (!data?.signedUrl) throw new ApiError("Le serveur n'a pas délivré de lien d'aperçu.");
  return data.signedUrl;
}

export interface NewZone {
  code: string;
  name: string;
  sort_order: number;
}

export async function createZone(input: NewZone): Promise<void> {
  const { error } = await supabase.from("zones").insert(input);
  if (error) throw new ApiError(`création du groupe — ${error.message}`, error.code);
}
