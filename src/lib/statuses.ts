import type { CellStatus, AttendanceStatus, DocumentKind } from "@/types/domain";

export interface StatusMeta {
  label: string;
  /** Libellé long, utilisé dans les `title` et les lecteurs d'écran. */
  description: string;
  selected: string;
  idle: string;
  dot: string;
  bar: string;
  text: string;
}

export const ATTENDANCE_STATUSES = ["present", "absent", "leave", "rest"] as const satisfies readonly AttendanceStatus[];

export const STATUS_META: Record<CellStatus, StatusMeta> = {
  present: {
    label: "Présent",
    description: "Présent au poste ce jour",
    selected: "bg-present-soft border-present text-present",
    idle: "bg-surface border-border text-ink-muted hover:border-border-strong hover:text-ink-secondary",
    dot: "bg-present",
    bar: "fill-present",
    text: "text-present",
  },
  absent: {
    label: "Absent",
    description: "Absence non justifiée",
    selected: "bg-absent-soft border-absent text-absent",
    idle: "bg-surface border-border text-ink-muted hover:border-border-strong hover:text-ink-secondary",
    dot: "bg-absent",
    bar: "fill-absent",
    text: "text-absent",
  },
  leave: {
    label: "Congé",
    description: "Congé posé et validé",
    selected: "bg-leave-soft border-leave text-leave",
    idle: "bg-surface border-border text-ink-muted hover:border-border-strong hover:text-ink-secondary",
    dot: "bg-leave",
    bar: "fill-leave",
    text: "text-leave",
  },
  rest: {
    label: "Repos",
    description: "Jour de repos hebdomadaire",
    selected: "bg-rest-soft border-rest text-rest",
    idle: "bg-surface border-border text-ink-muted hover:border-border-strong hover:text-ink-secondary",
    dot: "bg-rest",
    bar: "fill-rest",
    text: "text-rest",
  },
  not_recorded: {
    label: "Non saisi",
    description: "Aucune saisie pour ce jour",
    selected: "bg-rest-soft border-rest text-rest",
    idle: "bg-surface border-dashed border-border-strong text-ink-muted hover:border-ink-muted",
    dot: "bg-border-strong",
    bar: "fill-border-strong",
    text: "text-ink-muted",
  },
};

export const DOCUMENT_KINDS: readonly DocumentKind[] = [
  "contract",
  "cin",
  "photo",
  "medical",
  "insurance",
  "other",
];

export const DOCUMENT_KIND_META: Record<DocumentKind, { label: string; badge: string; prefix: string }> = {
  contract: { label: "Contrat", badge: "bg-brand-soft text-brand", prefix: "CONTRAT" },
  cin: { label: "CIN", badge: "bg-brand-soft text-brand", prefix: "CIN" },
  rib: { label: "RIB", badge: "bg-brand-soft text-brand", prefix: "RIB" },
  photo: { label: "Photo", badge: "bg-brand-soft text-brand", prefix: "PHOTO" },
  medical: { label: "Certificat médical", badge: "bg-brand-soft text-brand", prefix: "CERTIFICAT_MEDICAL" },
  insurance: { label: "Assurance", badge: "bg-brand-soft text-brand", prefix: "ASSURANCE" },
  other: { label: "Autre", badge: "bg-rest-soft text-ink-secondary", prefix: "DOCUMENT" },
};

/** Documents nécessaires pour qu'un dossier salarié soit complet. */
export const REQUIRED_KINDS: readonly DocumentKind[] = ["cin", "contract", "photo", "medical"];
