begin;

insert into public.sistema_modulos (clave, nombre, grupo, orden, activo, solo_admin)
values ('documentos_empresa', 'Archivo documental', 'administracion', 470, true, false)
on conflict (clave) do update
set nombre = excluded.nombre,
    grupo = excluded.grupo,
    orden = excluded.orden,
    activo = true,
    solo_admin = false;

create table if not exists public.documentos_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null,
  fecha_emision date not null,
  categoria text,
  descripcion text,
  archivo_path text not null,
  archivo_nombre text not null,
  archivo_tipo text,
  archivo_tamano bigint not null default 0,
  estado text not null default 'vigente' check (estado in ('vigente', 'archivado')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_documentos_empresa_empresa_fecha
  on public.documentos_empresa(empresa_id, fecha_emision desc, created_at desc);

drop trigger if exists set_documentos_empresa_updated_at on public.documentos_empresa;
create trigger set_documentos_empresa_updated_at
before update on public.documentos_empresa
for each row execute function public.set_updated_at();

alter table public.documentos_empresa enable row level security;

drop policy if exists "documentos empresa read" on public.documentos_empresa;
create policy "documentos empresa read" on public.documentos_empresa for select to authenticated
using (public.has_module_permission(empresa_id, 'documentos_empresa'));

drop policy if exists "documentos empresa write" on public.documentos_empresa;
create policy "documentos empresa write" on public.documentos_empresa for all to authenticated
using (public.has_module_permission(empresa_id, 'documentos_empresa'))
with check (public.has_module_permission(empresa_id, 'documentos_empresa'));

insert into storage.buckets (id, name, public)
values ('documentos-empresa', 'documentos-empresa', false)
on conflict (id) do update set public = false;

create or replace function public.documentos_empresa_storage_empresa_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public
as '
declare
  parsed_id uuid;
begin
  begin
    parsed_id := split_part(coalesce(object_name, ''''), ''/'', 1)::uuid;
  exception when others then
    return null;
  end;
  return parsed_id;
end;
';

drop policy if exists "documentos empresa storage read" on storage.objects;
create policy "documentos empresa storage read" on storage.objects for select to authenticated
using (
  bucket_id = 'documentos-empresa'
  and public.has_module_permission(public.documentos_empresa_storage_empresa_id(name), 'documentos_empresa')
);

drop policy if exists "documentos empresa storage insert" on storage.objects;
create policy "documentos empresa storage insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'documentos-empresa'
  and public.has_module_permission(public.documentos_empresa_storage_empresa_id(name), 'documentos_empresa')
);

drop policy if exists "documentos empresa storage update" on storage.objects;
create policy "documentos empresa storage update" on storage.objects for update to authenticated
using (
  bucket_id = 'documentos-empresa'
  and public.has_module_permission(public.documentos_empresa_storage_empresa_id(name), 'documentos_empresa')
)
with check (
  bucket_id = 'documentos-empresa'
  and public.has_module_permission(public.documentos_empresa_storage_empresa_id(name), 'documentos_empresa')
);

drop policy if exists "documentos empresa storage delete" on storage.objects;
create policy "documentos empresa storage delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'documentos-empresa'
  and public.has_module_permission(public.documentos_empresa_storage_empresa_id(name), 'documentos_empresa')
);

grant select, insert, update, delete on public.documentos_empresa to authenticated;
grant execute on function public.documentos_empresa_storage_empresa_id(text) to authenticated;

insert into public.usuario_permisos (empresa_id, user_id, modulo, permitido)
select ue.empresa_id, ue.user_id, 'documentos_empresa', true
from public.usuarios_empresas ue
where ue.activo = true
  and ue.rol in ('owner', 'admin')
on conflict (empresa_id, user_id, modulo) do update set permitido = true;

notify pgrst, 'reload schema';

commit;
