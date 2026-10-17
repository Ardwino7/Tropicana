/**
 * ============================================================================
 *  FIXTURES DE DÉVELOPPEMENT — jamais expédiées au navigateur en production.
 * ============================================================================
 *  Supabase expose une API HTTP (PostgREST + GoTrue + Storage). Ce module
 *  intercepte `fetch` et répond à ces trois API en mémoire, à partir d'un référentiel
 *  fictif propre à la démo. Il sert à une seule chose : pouvoir ouvrir l'application et
 *  vérifier les écrans sans projet Supabase branché.
 *
 *  Activation :  VITE_MOCK_API=1 npm run dev
 *  Le code applicatif n'a aucune branche « mode démo » : il ignore que ces réponses
 *  ne viennent pas de votre projet.
 * ==========================================================================*/

import employeesRaw from "./fixtures/employees.json";
import attendancesRaw from "./fixtures/attendances.json";
import type { AttendanceStatus, DocumentKind } from "@/types/domain";

const USERS = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    email: "chef.service@pointage.demo",
    password: "pointage-demo",
    full_name: "Nadia El Fassi",
    role: "chef_de_service",
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    email: "rh@pointage.demo",
    password: "pointage-demo",
    full_name: "Karim Benali",
    role: "rh",
  },
] as const;

const ZONES: Record<string, { name: string; position: string; order: number }> = {
  Z1: { name: "Zone 1 — exploitation", position: "Agent d'exploitation", order: 10 },
  Z2: { name: "Zone 2 — exploitation", position: "Agent d'exploitation", order: 20 },
  Z3: { name: "Zone 3 — exploitation", position: "Agent d'exploitation", order: 30 },
  "EQ ELAGAGE": { name: "Équipe élagage", position: "Agent d'élagage", order: 40 },
  "EQ MOBILE": { name: "Équipe mobile", position: "Agent d'équipe mobile", order: 50 },
  "CONDUCTEUR CAMMION": { name: "Conducteurs camion", position: "Conducteur camion", order: 60 },
  "CONDUCTEUR CAMMION CITERNE": { name: "Conducteurs camion citerne", position: "Conducteur camion citerne", order: 70 },
  "CHEF DE D'EQUIPE": { name: "Chefs d'équipe", position: "Chef d'équipe", order: 80 },
  "chef de projet": { name: "Encadrement de projet", position: "Chef de projet", order: 90 },
  "TECHNICIEN HYDROLIQUE": { name: "Techniciens hydroliques", position: "Technicien hydrolique", order: 100 },
  "TECHNICIEN PAYSAGISTE": { name: "Techniciens paysagistes", position: "Technicien paysagiste", order: 110 },
  LAROSSAGE: { name: "Larossage", position: "Agent de lavage", order: 120 },
  MAGASINIER: { name: "Magasin", position: "Magasinier", order: 130 },
  PLOMBIER: { name: "Plomberie", position: "Plombier", order: 140 },
};

const KIND_PREFIX: Record<DocumentKind, string> = {
  contract: "CONTRAT",
  cin: "CIN",
  rib: "RIB",
  photo: "PHOTO",
  medical: "VISITE",
  insurance: "ASSURANCE",
  other: "DOCUMENT",
};

type Row = Record<string, unknown>;
interface SeedAttendance {
  employeeId: string;
  date: string;
  status: AttendanceStatus;
}
interface Tables {
  zones: Row[];
  employees: Row[];
  attendances: Row[];
  documents: Row[];
  profiles: Row[];
  audit_log: Row[];
}
const store: Tables = { zones: [], employees: [], attendances: [], documents: [], profiles: [], audit_log: [] };
const files = new Map<string, Uint8Array>();
const fileTypes = new Map<string, string>();

/** Accès par nom de relation, comme le ferait PostgREST — `undefined` si la table n'existe pas. */
function rowsOf(table: string): Row[] | undefined {
  for (const name of Object.keys(store) as Array<keyof Tables>) {
    if (name === table) return store[name];
  }
  return undefined;
}

const pad = (value: number, width = 6) => String(value).padStart(width, "0");
const employeeId = (index: number) => `e0000000-0000-4000-8000-${pad(index)}`;

function today(): Date {
  return new Date();
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}
function shift(days: number): string {
  const d = today();
  d.setDate(d.getDate() + days);
  return iso(d);
}
function fnv(input: string): number {
  let h = 0x811c9dc5;
  for (const ch of input) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Génération du jeu de données
// ---------------------------------------------------------------------------

function reset() {
  const monthStart = `${iso(today()).slice(0, 7)}-01`;
  store.zones = Object.entries(ZONES).map(([code, zone]) => ({ code, name: zone.name, sort_order: zone.order }));
  store.profiles = USERS.map((user) => ({
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    employee_id: null,
  }));

  store.employees = employeesRaw.map((source, index) => {
    const zone = ZONES[String(source.zone)] ?? { name: String(source.zone), position: "Agent", order: 900 };
    const cin = String(source.cin ?? "").trim();
    return {
      id: employeeId(index + 1),
      matricule: source.id,
      full_name: source.fullName,
      cin: !cin || /manquant/i.test(cin) ? null : cin.toUpperCase(),
      rib: null,
      position: zone.position,
      zone_code: source.zone,
      hire_date: null,
      contract_type: null,
      contract_end_date: null,
      status: "active",
      created_at: "2026-01-05T08:00:00Z",
      updated_at: "2026-01-05T08:00:00Z",
    };
  });

  const seedAttendances = attendancesRaw as SeedAttendance[];
  const real = new Map(
    seedAttendances
      .map((cell) => ({ ...cell, date: `${monthStart.slice(0, 7)}-${String(cell.date).slice(-2)}` }))
      .filter((cell) => cell.date <= iso(today()))
      .map((cell) => [`${cell.employeeId}|${cell.date}`, cell.status as AttendanceStatus]),
  );

  const rows: Row[] = [];
  for (let day = 1; day <= today().getDate(); day += 1) {
    const date = `${monthStart.slice(0, 7)}-${pad(day, 2)}`;
    const weekday = new Date(`${date}T00:00:00`).getDay();
    for (const employee of store.employees) {
      const matricule = employee.matricule as string;
      const isToday = date === iso(today());
      if (isToday && !real.has(`${matricule}|${date}`) && fnv(`${matricule}|saisie`) % 100 < 15) continue;
      const forced = real.get(`${matricule}|${date}`);
      let status: AttendanceStatus = forced ?? "present";
      if (!forced) {
        if (weekday === 0) status = "rest";
        else if (weekday === 6 && fnv(`${matricule}|sam`) % 100 < 45) status = "rest";
        else {
          const roll = fnv(`${matricule}|${date}`) % 1000;
          status = roll < 24 ? "absent" : roll < 64 ? "leave" : "present";
        }
      }
      rows.push({
        id: `00000000-0000-4000-8000-${pad(rows.length + 1)}`,
        employee_id: employee.id,
        day: date,
        status,
        note: null,
        recorded_by: USERS[0].id,
        recorded_at: `${date}T07:4${(rows.length % 6)}:00Z`,
        updated_at: `${date}T07:4${(rows.length % 6)}:00Z`,
      });
    }
  }
  store.attendances = rows;

  files.clear();
  fileTypes.clear();
  store.documents = [];
  for (const [index, employee] of store.employees.entries()) {
    if (fnv(`${employee.matricule}|dossier`) % 6 !== 0) continue;
    const kinds: DocumentKind[] = ["contract", "cin", "rib", "medical", "insurance"];
    for (const [slot, kind] of kinds.entries()) {
      if (kind === "cin" && !employee.cin) continue;
      if (slot === 2 && index % 7 === 3) continue;
      const signedOn = shift(-(30 + slot * 19 + (index % 5) * 7));
      const name = `${KIND_PREFIX[kind]}_${String(employee.cin ?? "SANS-CIN").toUpperCase()}_${slug(String(employee.full_name))}_${signedOn}.pdf`;
      const path = `${employee.id}/${name}`;
      const expires = kind === "medical" ? shift(index % 6 === 0 ? -21 : 90 + index * 4) : kind === "insurance" ? `${iso(today()).slice(0, 4)}-12-31` : null;
      const pdf = buildPdf([
        "Pointage effectifs - piece de demonstration",
        "",
        `Salarie : ${employee.full_name}`,
        `Matricule : ${employee.matricule}`,
        employee.cin ? `CIN : ${employee.cin}` : "CIN : non renseignee au referentiel",
        `Poste : ${employee.position}`,
        `Groupe : ${employee.zone_code}`,
        `Type de piece : ${KIND_PREFIX[kind]}`,
        `Remise le : ${signedOn}`,
        expires ? `Valide jusqu'au : ${expires}` : "Piece sans date de validite",
        "",
        "Document genere par les fixtures de developpement.",
      ]);
      files.set(path, pdf);
      fileTypes.set(path, "application/pdf");
      const verified = (kind === "contract" || kind === "cin") && index % 3 !== 1;
      store.documents.push({
        id: `d0000000-0000-4000-8000-${pad(store.documents.length + 1)}`,
        employee_id: employee.id,
        kind,
        storage_path: path,
        file_name: name,
        original_name: `${kind}-${String(employee.matricule).toLowerCase()}.pdf`,
        mime_type: "application/pdf",
        size_bytes: pdf.byteLength,
        label: null,
        expires_on: expires,
        uploaded_by: USERS[0].id,
        uploaded_at: `${signedOn}T10:15:00Z`,
        verified_by: verified ? USERS[1].id : null,
        verified_at: verified ? `${signedOn}T14:02:00Z` : null,
        updated_at: `${signedOn}T14:02:00Z`,
      });
    }
  }

  store.audit_log = store.attendances.slice(-12).map((row, index) => ({
    id: index + 1,
    actor_id: USERS[0].id,
    actor_label: USERS[0].email,
    employee_id: row.employee_id,
    action: `pointage.${row.status}`,
    detail: { day: row.day },
    created_at: row.recorded_at,
  }));
}

function slug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, 40);
}

function buildPdf(lines: string[]): Uint8Array {
  const escape = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/([\\()])/g, "\\$1");
  const body = `BT\n/F1 12 Tf\n16 TL\n60 780 Td\n${lines.map((line) => `(${escape(line)}) Tj\nT*\n`).join("")}ET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${body.length} >>\nstream\n${body}endstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const startxref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

// ---------------------------------------------------------------------------
// Vues dérivées — les mêmes que les vues SQL côté serveur
// ---------------------------------------------------------------------------

function view(name: string): Row[] {
  if (name === "employee_dossier_status") {
    return store.employees
      .filter((employee) => employee.status === "active")
      .map((employee) => {
        const docs = store.documents.filter((doc) => doc.employee_id === employee.id);
        const has = (kind: DocumentKind) => docs.some((doc) => doc.kind === kind);
        return {
          employee_id: employee.id,
          matricule: employee.matricule,
          full_name: employee.full_name,
          zone_code: employee.zone_code,
          has_cin: Boolean(employee.cin),
          has_contract: has("contract"),
          has_cin_doc: has("cin"),
          has_medical: has("medical"),
          has_insurance: has("insurance"),
          has_rib: Boolean(employee.rib),
          has_photo: has("photo"),
          has_expired_document: docs.some((doc) => doc.expires_on && String(doc.expires_on) < iso(today())),
          document_count: docs.length,
        };
      });
  }
  if (name === "daily_attendance") {
    const byDay = new Map<string, Row>();
    for (const row of store.attendances) {
      const day = String(row.day);
      const bucket = byDay.get(day) ?? { day, present: 0, absent: 0, leave: 0, rest: 0, recorded: 0 };
      bucket[row.status as string] = (bucket[row.status as string] as number) + 1;
      bucket.recorded = (bucket.recorded as number) + 1;
      byDay.set(day, bucket);
    }
    return [...byDay.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)));
  }
  if (name === "zone_attendance") {
    return store.zones.map((zone) => {
      const members = store.employees.filter((e) => e.zone_code === zone.code && e.status === "active");
      const ids = new Set(members.map((member) => member.id));
      const rows = store.attendances.filter((row) => ids.has(row.employee_id as string));
      const count = (status: string) => rows.filter((row) => row.status === status).length;
      return {
        zone_code: zone.code,
        headcount: members.length,
        present: count("present"),
        absent: count("absent"),
        leave: count("leave"),
        rest: count("rest"),
        recorded: rows.length,
      };
    });
  }
  return [];
}

// ---------------------------------------------------------------------------
// Mini-moteur PostgREST
// ---------------------------------------------------------------------------

function applyFilters(rows: Row[], params: URLSearchParams): Row[] {
  let out = rows;
  for (const [column, value] of params) {
    if (["select", "order", "on_conflict", "columns"].includes(column)) continue;
    out = out.filter((row) => matchFilter(row, column, value));
  }
  return out;
}

function matchFilter(row: Row, column: string, expression: string): boolean {
  const parts = expression.split(".");
  const operator = parts[0];
  const value = parts.slice(1).join(".");
  const cell = row[column];
  switch (operator) {
    case "eq":
      return String(cell ?? "") === value;
    case "neq":
      return String(cell ?? "") !== value;
    case "gt":
      return String(cell ?? "") > value;
    case "gte":
      return String(cell ?? "") >= value;
    case "lt":
      return String(cell ?? "") < value;
    case "lte":
      return String(cell ?? "") <= value;
    case "is":
      return value === "null" ? cell === null || cell === undefined : cell === value;
    case "in":
      return value.replace(/^\(|\)$/g, "").split(",").includes(`"${cell}"`) || value.replace(/^\(|\)$/g, "").split(",").includes(String(cell));
    case "or":
      return value
        .split(",")
        .some((clause) => {
          const [col, ...rest] = clause.split(".");
          return col ? matchFilter(row, col, rest.join(".")) : false;
        });
    default:
      return true;
  }
}

function applyOrder(rows: Row[], order: string | null): Row[] {
  if (!order) return rows;
  const specs = order.split(",").map((entry) => {
    const [column, direction] = entry.split(".");
    return { column: column ?? "", desc: direction === "desc" };
  });
  return [...rows].sort((a, b) => {
    for (const spec of specs) {
      const left = a[spec.column];
      const right = b[spec.column];
      if (left === right) continue;
      const compare = String(left ?? "").localeCompare(String(right ?? ""), "fr", { numeric: true });
      return spec.desc ? -compare : compare;
    }
    return 0;
  });
}

function primaryColumn(table: string): string {
  if (table === "zones") return "code";
  if (table === "employees") return "matricule";
  if (table === "attendances") return "id";
  return "id";
}

function respond(table: string, params: URLSearchParams, method: string, body: Row | Row[], headers: Headers): Response {
  const isView = ["employee_dossier_status", "daily_attendance", "zone_attendance"].includes(table);
  const prefer = headers.get("prefer") ?? "";

  if (isView) return json(view(table), params);

  const source = rowsOf(table);
  if (!source) return error(404, `La relation publique.${table} n'existe pas dans les fixtures.`, "42P01");

  if (method === "GET" || method === "HEAD") {
    const rows = applyOrder(applyFilters(source, params), params.get("order"));
    const limit = Number(params.get("limit") ?? 0);
    return json(limit > 0 ? rows.slice(0, limit) : rows, params);
  }

  if (method === "POST") {
    const incoming = Array.isArray(body) ? body : [body];
    const conflict = params.get("on_conflict")?.split(",") ?? [primaryColumn(table)];
    const written: Row[] = [];
    for (const raw of incoming) {
      const row = stamp(raw, table);
      const existing = source.find((candidate) => conflict.every((column) => candidate[column] === row[column]));
      if (existing) Object.assign(existing, row);
      else source.push(row);
      written.push(existing ?? row);
    }
    return json(prefer.includes("return=representation") ? written : [], params, 201);
  }

  if (method === "PATCH") {
    const target = applyFilters(source, params);
    const patch = Array.isArray(body) ? (body[0] ?? {}) : body;
    for (const row of target) Object.assign(row, patch, { updated_at: new Date().toISOString() });
    return json(prefer.includes("return=representation") ? target : [], params);
  }

  if (method === "DELETE") {
    const doomed = applyFilters(source, params);
    source.splice(0, source.length, ...source.filter((row) => !doomed.includes(row)));
    if (table === "documents") for (const doc of doomed) files.delete(String(doc.storage_path));
    return json(prefer.includes("return=representation") ? doomed : [], params);
  }

  return error(405, `Méthode ${method} non prise en charge par les fixtures.`, "405");
}

function stamp(row: Row, table: string): Row {
  const now = new Date().toISOString();
  const id =
    table === "zones"
      ? undefined
      : table === "audit_log"
        ? store.audit_log.length + 1
        : `f${crypto.randomUUID().slice(1)}`;
  return {
    created_at: now,
    updated_at: now,
    ...(table === "attendances" ? { recorded_at: now, note: null } : {}),
    ...(table === "employees" ? { status: "active", source_row: null, hire_date: null, contract_type: null, contract_end_date: null } : {}),
    ...(table === "documents" ? { label: null, uploaded_at: now, verified_by: null, verified_at: null } : {}),
    ...row,
    ...(id === undefined ? {} : { id }),
  };
}

function json(rows: Row[], params: URLSearchParams, status = 200): Response {
  return new Response(JSON.stringify(rows), {
    status,
    headers: {
      "content-type": "application/json",
      "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
      "x-robots-tag": params.has("apikey") ? "fixtures" : "passthrough",
    },
  });
}

function error(status: number, message: string, code: string): Response {
  return new Response(JSON.stringify({ code, message, details: null, hint: null }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Auth (GoTrue) et Storage
// ---------------------------------------------------------------------------

const b64url = (input: string) => btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function issueToken(user: (typeof USERS)[number]): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const header = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      aud: "authenticated",
      role: "authenticated",
      session_id: "fixtures",
      email: user.email,
      email_confirmed_at: new Date().toISOString(),
      phone: "",
      sub: user.id,
      user_metadata: { full_name: user.full_name },
      app_metadata: { provider: "email", providers: ["email"] },
      iat: exp - 3600,
      exp,
    }),
  );
  return `${header}.${payload}.fixtures`;
}

function userFromRequest(authorization: string | null) {
  const payload = authorization?.split(" ")[1]?.split(".")[1];
  if (!payload) return null;
  try {
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: string };
    return USERS.find((user) => user.id === decoded.sub) ?? null;
  } catch {
    return null;
  }
}

async function handle(request: Request, pathname: string, params: URLSearchParams): Promise<Response> {
  // --- Auth ---------------------------------------------------------------
  if (pathname.startsWith("/auth/v1/")) {
    const tail = pathname.slice("/auth/v1".length);
    if (tail === "/token" && request.method === "POST") {
      const body = (await request.json()) as { email?: string; password?: string };
      const user = USERS.find((candidate) => candidate.email === body.email?.toLowerCase().trim());
      if (!user || user.password !== body.password)
        return new Response(JSON.stringify({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      return new Response(
        JSON.stringify({
          access_token: issueToken(user),
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "fixtures-refresh",
          user: {
            id: user.id,
            aud: "authenticated",
            role: "authenticated",
            email: user.email,
            email_confirmed_at: new Date().toISOString(),
            phone: "",
            user_metadata: { full_name: user.full_name },
            app_metadata: { provider: "email", providers: ["email"] },
            created_at: "2026-01-05T08:00:00Z",
            updated_at: "2026-01-05T08:00:00Z",
            is_anonymous: false,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (tail === "/user") {
      const user = userFromRequest(request.headers.get("authorization"));
      if (!user) return new Response(JSON.stringify({ message: "Security method after_authenticate should be trusted" }), { status: 401 });
      return new Response(
        JSON.stringify({
          id: user.id,
          aud: "authenticated",
          role: "authenticated",
          email: user.email,
          user_metadata: { full_name: user.full_name },
          app_metadata: { provider: "email", providers: ["email"] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (tail === "/logout") return new Response(null, { status: 204 });
    if (tail === "/settings") return new Response(JSON.stringify({ external: {}, disable_signup: false }), { status: 200, headers: { "content-type": "application/json" } });
    return error(404, `Endpoint auth ${tail} non implémenté dans les fixtures.`, "404");
  }

  // --- Storage ------------------------------------------------------------
  if (pathname.startsWith("/storage/v1/")) {
    const tail = pathname.slice("/storage/v1".length);
    // Le POST délivre le lien signé, le GET sur ce même lien rend les octets : sans ce
    // garde, la requête de téléchargement retombait sur le JSON de signature.
    if (tail.startsWith("/object/sign/") && request.method !== "GET") {
      const path = decodeURIComponent(tail.slice("/object/sign/documents/".length));
      if (!files.has(path)) return error(404, `Objet introuvable : ${path}`, "404");
      return new Response(JSON.stringify({ signedURL: `${tail}?token=fixtures` }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (tail.startsWith("/object/sign/") || params.get("token") === "fixtures") {
      const path = decodeURIComponent(tail.replace(/^\/object\/sign\/documents\//, "").replace(/^\/object\/documents\//, ""));
      const bytes = files.get(path);
      if (!bytes) return error(404, `Objet introuvable : ${path}`, "404");
      return new Response(bytes.slice() as unknown as BodyInit, { status: 200, headers: { "content-type": fileTypes.get(path) ?? "application/pdf", "content-length": String(bytes.byteLength) } });
    }
    if (tail.startsWith("/object/documents/")) {
      const path = decodeURIComponent(tail.slice("/object/documents/".length));
      if (request.method === "POST" || request.method === "PUT") {
        const bytes = new Uint8Array(await request.arrayBuffer());
        files.set(path, bytes);
        fileTypes.set(path, request.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream");
        return new Response(JSON.stringify({ Key: `documents/${path}`, Id: crypto.randomUUID() }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (request.method === "GET") {
        const bytes = files.get(path);
        if (!bytes) return error(404, `Objet introuvable : ${path}`, "404");
        return new Response(bytes.slice() as unknown as BodyInit, { status: 200, headers: { "content-type": fileTypes.get(path) ?? "application/pdf" } });
      }
      const doomed = path.split(",").map((entry) => entry.trim());
      for (const entry of doomed) {
        files.delete(entry);
        fileTypes.delete(entry);
      }
      return new Response(JSON.stringify(doomed.map((entry) => ({ bucketId: "documents", id: crypto.randomUUID(), name: entry.split("/").pop(), owner: "fixtures", version: "1" }))), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return error(404, `Chemin storage ${tail} non implémenté dans les fixtures.`, "404");
  }

  // --- PostgREST ----------------------------------------------------------
  if (pathname.startsWith("/rest/v1/")) {
    const table = pathname.slice("/rest/v1/".length).replace(/^\//, "");
    if (!table) return error(404, "Aucune relation demandée.", "404");
    const body = request.method === "GET" || request.method === "DELETE" ? ({} as Row) : ((await request.json()) as Row | Row[]);
    return respond(table, params, request.method, body, request.headers);
  }

  return error(404, `Chemin ${pathname} inconnu des fixtures.`, "404");
}

// ---------------------------------------------------------------------------
// Installation
// ---------------------------------------------------------------------------

export function installMockApi(): void {
  reset();
  const realFetch = globalThis.fetch.bind(globalThis);
  const marker = "/__mock";

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input as string | URL, init);
    const url = new URL(request.url, window.location.href);
    if (!url.pathname.startsWith(marker)) return realFetch(input as RequestInfo, init);

    const pathname = url.pathname.slice(marker.length);
    const params = new URLSearchParams(url.searchParams);

    await new Promise((resolve) => setTimeout(resolve, 60 + (fnv(pathname + request.method) % 90)));
    try {
      return await handle(request, pathname, params);
    } catch (cause) {
      console.error("[fixtures]", cause);
      return error(500, `Fixture invalide : ${cause instanceof Error ? cause.message : String(cause)}`, "500");
    }
  };

  console.info(
    "[fixtures] Jeu de données local installé : %d salariés, %d pointages, %d pièces. Utilisateurs : %s",
    store.employees.length,
    store.attendances.length,
    store.documents.length,
    USERS.map((user) => user.email).join(" / "),
  );
}
