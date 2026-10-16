-- Expose the required RIB/photo flags to the shared dossier completeness rule.
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
  count(d.id) filter (where d.kind = 'insurance') > 0 as has_insurance,
  count(d.id) filter (where d.kind = 'rib') > 0 as has_rib,
  count(d.id) filter (where d.kind = 'photo') > 0 as has_photo
from public.employees e
left join public.documents d on d.employee_id = e.id
where e.status = 'active'
group by e.id;

alter view public.employee_dossier_status set (security_invoker = true);
