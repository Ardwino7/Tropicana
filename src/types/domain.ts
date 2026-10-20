/** Miroir TypeScript du schéma `public` — voir supabase/migrations/0001_init.sql. */

export type AppRole = "chef_de_service" | "rh";
export type AttendanceStatus = "present" | "absent" | "leave" | "rest";
export type DocumentKind = "contract" | "cin" | "rib" | "photo" | "medical" | "insurance" | "warning" | "other";
export type ContractType = "cdi" | "cdd" | "stage" | "interim";
export type EmployeeStatus = "active" | "archived";

/** `not_recorded` n'existe pas en base : c'est l'absence de ligne. */
export type CellStatus = AttendanceStatus | "not_recorded";

export interface Zone {
  code: string;
  name: string;
  sort_order: number;
}

export interface Employee {
  id: string;
  matricule: string;
  full_name: string;
  cin: string | null;
  rib: string | null;
  position: string;
  zone_code: string;
  hire_date: string | null;
  contract_type: ContractType | null;
  contract_end_date: string | null;
  status: EmployeeStatus;
  source_row: number | null;
  created_at: string;
  updated_at: string;
}

export interface Attendance {
  id: string;
  employee_id: string;
  day: string;
  status: AttendanceStatus;
  note: string | null;
  recorded_by: string | null;
  recorded_at: string;
  updated_at: string;
}

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  kind: DocumentKind;
  storage_path: string;
  file_name: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  label: string | null;
  expires_on: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  verified_by: string | null;
  verified_at: string | null;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  employee_id: string | null;
}

export interface AuditEntry {
  id: number;
  actor_label: string;
  employee_id: string | null;
  action: string;
  detail: { day?: string; previous?: string; file?: string; kind?: string };
  created_at: string;
}

export interface DailyAttendance {
  day: string;
  present: number;
  absent: number;
  leave: number;
  rest: number;
  recorded: number;
}

export interface ZoneAttendance {
  zone_code: string;
  headcount: number;
  present: number;
  absent: number;
  leave: number;
  rest: number;
  recorded: number;
}

export interface DossierStatus {
  employee_id: string;
  matricule: string;
  full_name: string;
  zone_code: string;
  has_cin: boolean;
  has_contract: boolean;
  has_cin_doc: boolean;
  has_medical: boolean;
  has_insurance: boolean;
  has_rib: boolean;
  has_photo: boolean;
  has_warning: boolean;
  has_expired_document: boolean;
  document_count: number;
}

/** Ligne de la grille de pointage : salarié + sa cellule du jour, fusionnés côté client. */
export interface PointageRow {
  employee: Employee;
  status: CellStatus;
  note: string | null;
  recordedAt: string | null;
  dossierIncomplete: boolean;
}
