import { format, isValid, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * Le référentiel vient d'une saisie humaine : « MOHAMED », « mohammed smaili » et
 * « Mohammed Lahlal » désignent la même convention d'affichage. On normalise à
 * l'affichage et au nommage de fichier, jamais dans la base, pour rester fidèle
 * à la source.
 */
export function displayName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .split(/(\s|-)/)
    .map((part) => {
      if (part === "" || part === " " || part === "-") return part;
      if (part.length <= 2) return part.toUpperCase();
      if (!/[a-z]/.test(part)) return part.charAt(0) + part.slice(1).toLowerCase();
      return part
        .split(/(?<=[a-z])(?=[A-Z])/)
        .map((w) => (w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
        .join("");
    })
    .join("");
}

export function initials(raw: string): string {
  const words = displayName(raw).split(" ").filter(Boolean);
  const first = words[0]?.[0] ?? "?";
  const last = words.length > 1 ? words[words.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

/** Particule utilisable dans un nom de fichier, sans accents ni séparateurs ambiguës. */
export function fileSlug(raw: string): string {
  return displayName(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, 40);
}

/**
 * Nommage automatique imposé aux téléversements : TYPE_CIN_NOM_date.ext
 * Un fichier « scan001.pdf » retrouvé dans un dossier salarié n'a aucune valeur
 * probante ; la convention doit porter la réponse à elle seule.
 */
export function buildFileName(prefix: string, cin: string | null, name: string, isoDate: string, ext: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : format(new Date(), "yyyy-MM-dd");
  return `${prefix}_${(cin ?? "SANS-CIN").toUpperCase()}_${fileSlug(name) || "SALARIE"}_${date}.${ext}`;
}

/**
 * Une colonne d'horodatage mal remplie ne doit jamais faire tomber l'écran : la date
 * d'aujourd'hui sert de dernier recours, et le libellé reste lisible.
 */
export function parseDay(iso: string | null | undefined): Date {
  if (!iso) return new Date();
  const d = parseISO(iso);
  return isValid(d) ? d : new Date();
}

export function formatLongDay(iso: string): string {
  return format(parseDay(iso), "EEEE d MMMM yyyy", { locale: fr });
}

export function formatMediumDay(iso: string): string {
  return format(parseDay(iso), "d MMMM yyyy", { locale: fr });
}

export function formatShortDay(iso: string): string {
  return format(parseDay(iso), "d MMM.", { locale: fr });
}

export function formatWeekday(iso: string): string {
  return format(parseDay(iso), "EEE", { locale: fr }).toUpperCase();
}

export function formatMonth(iso: string): string {
  const d = parseDay(iso);
  return format(d, "MMMM yyyy", { locale: fr }).replace(/^\p{L}/u, (c) => c.toUpperCase());
}

export function formatTimestamp(iso: string | null | undefined): string {
  return format(parseDay(iso), "d MMM.", { locale: fr }) + " · " + format(parseDay(iso), "HH:mm", { locale: fr });
}

export function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Décalage en jours calendaires, en conservant le format ISO attendu par PostgREST. */
export function addDaysISO(iso: string, days: number): string {
  const base = parseDay(iso);
  return toISODate(new Date(base.getTime() + days * 86_400_000));
}

/** Premier et dernier jour du mois contenant `iso`. */
export function monthBounds(iso: string): { from: string; to: string } {
  const base = parseDay(iso);
  const from = new Date(base.getFullYear(), base.getMonth(), 1);
  const to = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { from: toISODate(from), to: toISODate(to) };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["o", "Ko", "Mo", "Go"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1).replace(".", ",")} ${units[exponent]}`;
}

/** `ratio` entre 0 et 1 ; renvoie « — » si le dénominateur est nul. */
export function formatRate(numerator: number, denominator: number, digits = 1): string {
  if (!denominator) return "—";
  return `${((numerator / denominator) * 100).toFixed(digits).replace(".", ",")} %`;
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count > 1 ? (plural ?? `${singular}s`) : singular;
}
