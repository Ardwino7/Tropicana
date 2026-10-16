alter table public.employees add column if not exists rib text;

comment on column public.employees.rib is
  'RIB bancaire saisi en texte dans la fiche salarié, pas en pièce jointe.';
