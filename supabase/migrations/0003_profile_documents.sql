-- Add the employee photo document kind. The view update is in the next migration
-- so this enum value commits before SQL references it.
alter type public.document_kind add value if not exists 'photo';
