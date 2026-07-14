-- Permite reutilizar códigos en empresas distintas y conserva la unicidad
-- dentro de cada empresa. Es seguro ejecutarlo más de una vez.

alter table public.machines
  drop constraint if exists machines_code_key;

alter table public.spare_parts
  drop constraint if exists spare_parts_code_key;

create unique index if not exists machines_empresa_code_uidx
  on public.machines (empresa_id, code);

create unique index if not exists spare_parts_empresa_code_uidx
  on public.spare_parts (empresa_id, code);
