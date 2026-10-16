-- Pointage effectifs — schéma initial
-- Exécuteur : Supabase (SQL editor ou `supabase db push`)
--
-- Décisions de modélisation issues du classeur source :
--   * `not_recorded` n'est PAS un statut stocké : l'absence de ligne vaut « non saisi ».
--     Cela évite 89 × 31 lignes vides et rend `count(*)` honnête.
--   * La CIN est nullable (14 salariés du référentiel n'en ont pas) mais unique quand elle existe.
--   * Un salarié n'est jamais supprimé physiquement : `status = 'archivé'`.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('chef_de_service', 'rh');

create type public.attendance_status as enum ('present', 'absent', 'leave', 'rest');

create type public.document_kind as enum (
  'contract',
  'cin',
  'rib',
  'medical',
  'insurance',
  'other'
);

create type public.contract_type as enum ('cdi', 'cdd', 'stage', 'interim');

create type public.employee_status as enum ('active', 'archived');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.zones (
  code text primary key check (length(trim(code)) > 0),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on column public.zones.code is
  'Code du groupe tel que saisi dans le classeur source ("Z1", "EQ ELAGAGE", …).';

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  matricule text not null unique check (matricule ~ '^EMP[0-9]{3,5}$'),
  full_name text not null check (length(trim(full_name)) > 1),
  cin text unique check (cin is null or length(trim(cin)) >= 4),
  position text not null,
  zone_code text not null references public.zones (code),
  hire_date date,
  contract_type public.contract_type,
  contract_end_date date,
  status public.employee_status not null default 'active',
  source_row integer,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  constraint contract_end_coherent check (
    contract_end_date is null or hire_date is null or contract_end_date > hire_date
  )
);

create index employees_zone_idx on public.employees (zone_code, status);
create index employees_name_trgm_idx on public.employees
  using gin (full_name extensions.gin_trgm_ops);
create index employees_cin_trgm_idx on public.employees
  using gin (coalesce(cin, '') extensions.gin_trgm_ops);

comment on column public.employees.cin is
  'NULL = dossier incomplet. La valeur texte "CIN manquante" du classeur n''est jamais importée.';

create table public.attendances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  day date not null,
  status public.attendance_status not null,
  note text,
  recorded_by uuid references auth.users (id) on delete set null,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, day)
);

create index attendances_day_idx on public.attendances (day, status);
create index attendances_employee_idx on public.attendances (employee_id, day desc);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  kind public.document_kind not null,
  storage_path text not null unique,
  file_name text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  label text,
  expires_on date,
  uploaded_by uuid references auth.users (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint verification_coherent check (
    (verified_at is null and verified_by is null) or (verified_at is not null and verified_by is not null)
  )
);

create index documents_employee_idx on public.documents (employee_id, uploaded_at desc);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.app_role not null default 'chef_de_service',
  employee_id uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_label text not null default 'système',
  employee_id uuid references public.employees (id) on delete cascade,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_employee_idx on public.audit_log (employee_id, created_at desc);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Fonctions utilitaires
-- ---------------------------------------------------------------------------

-- `security definer` : sans cela, la politique de `profiles` qui appelle cette
-- fonction devrait se relire elle-même et RLS récursion.
create or replace function public.auth_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid()),
    'chef_de_service'::public.app_role
  );
$$;

create or replace function public.auth_is_rh()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.auth_app_role() = 'rh'::public.app_role;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger employees_touch
  before update on public.employees
  for each row execute function public.touch_updated_at();

create trigger attendances_touch
  before update on public.attendances
  for each row execute function public.touch_updated_at();

create trigger documents_touch
  before update on public.documents
  for each row execute function public.touch_updated_at();

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Profil créé automatiquement à l'inscription ; le rôle est corrigé ensuite par
-- le script de seed ou par un RH.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, '?'), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Journal d'audit
-- ---------------------------------------------------------------------------

create or replace function public.log_attendance_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee uuid := coalesce(new.employee_id, old.employee_id);
  v_status public.attendance_status := coalesce(new.status, old.status);
begin
  if tg_op = 'DELETE' then
    insert into public.audit_log (actor_id, actor_label, employee_id, action, detail)
    values (
      auth.uid(),
      coalesce(auth.jwt () ->> 'email', 'système'),
      v_employee,
      'pointage.efface',
      jsonb_build_object('day', old.day, 'previous', old.status)
    );
  elsif tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and old.status is distinct from new.status) then
    insert into public.audit_log (actor_id, actor_label, employee_id, action, detail)
    values (
      auth.uid(),
      coalesce(auth.jwt () ->> 'email', 'système'),
      v_employee,
      'pointage.' || lower(v_status::text),
      jsonb_build_object(
        'day', coalesce(new.day, old.day),
        'previous', case when tg_op = 'UPDATE' then old.status::text else null end
      )
    );
  end if;
  return coalesce(new, old);
end;
$$;

create trigger attendances_audit
  after insert or update or delete on public.attendances
  for each row execute function public.log_attendance_change();

create or replace function public.log_document_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, actor_label, employee_id, action, detail)
    values (
      auth.uid(),
      coalesce(auth.jwt () ->> 'email', 'système'),
      new.employee_id,
      'document.televerse',
      jsonb_build_object('file', new.file_name, 'kind', new.kind)
    );
  elsif tg_op = 'UPDATE' and old.verified_at is null and new.verified_at is not null then
    insert into public.audit_log (actor_id, actor_label, employee_id, action, detail)
    values (
      auth.uid(),
      coalesce(auth.jwt () ->> 'email', 'système'),
      new.employee_id,
      'document.verifie',
      jsonb_build_object('file', new.file_name)
    );
  elsif tg_op = 'DELETE' then
    insert into public.audit_log (actor_id, actor_label, employee_id, action, detail)
    values (
      auth.uid(),
      coalesce(auth.jwt () ->> 'email', 'système'),
      old.employee_id,
      'document.supprime',
      jsonb_build_object('file', old.file_name)
    );
  end if;
  return coalesce(new, old);
end;
$$;

create trigger documents_audit
  after insert or update or delete on public.documents
  for each row execute function public.log_document_change();

-- Une politique WITH CHECK ne voit que la ligne NEW : elle ne peut pas interdire
-- à un chef de service d'effacer une vérification existante. D'où ce garde-fou.
create or replace function public.guard_document_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.auth_is_rh() and (
    new.verified_by is distinct from old.verified_by
    or new.verified_at is distinct from old.verified_at
  ) then
    raise exception 'seul un RH peut vérifier ou dé-vérifier un document';
  end if;
  return new;
end;
$$;

create trigger documents_verification_guard
  before update on public.documents
  for each row execute function public.guard_document_verification();

-- ---------------------------------------------------------------------------
-- Vues d'agrégation (le tableau de bord RH ne fait jamais d'arithmétique client)
-- ---------------------------------------------------------------------------

create or replace view public.daily_attendance as
select
  a.day,
  count(*) filter (where a.status = 'present') as present,
  count(*) filter (where a.status = 'absent') as absent,
  count(*) filter (where a.status = 'leave') as leave,
  count(*) filter (where a.status = 'rest') as rest,
  count(*) as recorded
from public.attendances a
group by a.day;

create or replace view public.zone_attendance as
select
  e.zone_code,
  count(distinct e.id) filter (where e.status = 'active') as headcount,
  count(*) filter (where a.status = 'present') as present,
  count(*) filter (where a.status = 'absent') as absent,
  count(*) filter (where a.status = 'leave') as leave,
  count(*) filter (where a.status = 'rest') as rest,
  count(a.id) as recorded
from public.employees e
left join public.attendances a on a.employee_id = e.id
group by e.zone_code;

-- Complétude alignée sur l'interface : CIN au référentiel et les quatre pièces requises.
create or replace view public.employee_dossier_status as
select
  e.id as employee_id,
  e.matricule,
  e.full_name,
  e.zone_code,
  e.cin is not null as has_cin,
  count(d.id) filter (where d.kind = 'contract') > 0 as has_contract,
  count(d.id) filter (where d.kind = 'cin') > 0 as has_cin_doc,
  count(d.id) filter (where d.kind = 'medical') > 0 as has_medical,
  count(d.id) filter (
    where d.expires_on is not null and d.expires_on < current_date
  ) > 0 as has_expired_document,
  count(d.id) as document_count,
  count(d.id) filter (where d.kind = 'insurance') > 0 as has_insurance
from public.employees e
left join public.documents d on d.employee_id = e.id
where e.status = 'active'
group by e.id;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.zones enable row level security;
alter table public.employees enable row level security;
alter table public.attendances enable row level security;
alter table public.documents enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;
-- Les vues agrégées laissent passer la RLS de l'appelant (`security_invoker`) :
-- sans cela, une vue appartient à `postgres` et contournerait silencieusement les politiques.
alter view public.daily_attendance set (security_invoker = true);
alter view public.zone_attendance set (security_invoker = true);
alter view public.employee_dossier_status set (security_invoker = true);

-- zones : lecture pour tous les connectés, écriture RH
create policy zones_read on public.zones
  for select to authenticated using (true);
create policy zones_write on public.zones
  for update to authenticated
  using (public.auth_is_rh()) with check (public.auth_is_rh());

-- employees : le chef de service gère l'effectif ; l'archivage remplace la suppression
create policy employees_read on public.employees
  for select to authenticated using (true);
create policy employees_insert on public.employees
  for insert to authenticated
  with check (true);
create policy employees_update on public.employees
  for update to authenticated
  using (true) with check (true);
-- Pas de politique DELETE : la suppression physique est interdite aux deux rôles.

-- attendances : saisie libre pour les deux rôles
create policy attendances_read on public.attendances
  for select to authenticated using (true);
create policy attendances_write on public.attendances
  for insert to authenticated
  with check (true);
create policy attendances_update on public.attendances
  for update to authenticated
  using (true) with check (true);
create policy attendances_delete on public.attendances
  for delete to authenticated
  using (true);

-- documents : upload pour tous, vérification réservée aux RH
create policy documents_read on public.documents
  for select to authenticated using (true);
create policy documents_insert on public.documents
  for insert to authenticated
  with check (true);
create policy documents_update on public.documents
  for update to authenticated
  using (true) with check (true);
  -- La colonne `verified_*` est protégée par le trigger `documents_verification_guard`.
create policy documents_delete on public.documents
  for delete to authenticated
  using (public.auth_is_rh() or uploaded_by = auth.uid());

-- profiles : lecture pour tous les connectés, écriture réservée aux RH.
-- La création passe par le trigger `handle_new_user`, donc hors RLS.
create policy profiles_read on public.profiles
  for select to authenticated using (true);
create policy profiles_write on public.profiles
  for update to authenticated
  using (public.auth_is_rh())
  with check (public.auth_is_rh());

-- audit_log : en écriture uniquement via les triggers security definer
create policy audit_read on public.audit_log
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf','image/jpeg','image/png'];

create policy "documents read" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents');

create policy "documents upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents');

create policy "documents replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');

create policy "documents remove" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (public.auth_is_rh() or owner = (auth.uid())::text));

-- ---------------------------------------------------------------------------
-- Temps réel sur la grille de pointage
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.attendances;
    exception when duplicate_object then
      null;
    end;
  end if;
end;
$$;
