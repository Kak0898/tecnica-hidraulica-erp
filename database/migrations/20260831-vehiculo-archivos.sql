begin;

create table if not exists public.vehiculo_archivos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  vehiculo_id uuid not null references public.vehiculos_empresa(id) on delete cascade,
  tipo text not null default 'otro' check (tipo in ('padron', 'revision_tecnica', 'permiso_circulacion', 'soap', 'seguro', 'mantencion', 'foto', 'otro')),
  nombre text not null,
  fecha_emision date,
  fecha_vencimiento date,
  descripcion text,
  archivo_path text not null,
  archivo_nombre text not null,
  archivo_tipo text,
  archivo_tamano bigint not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vehiculo_archivos_empresa_vehiculo
  on public.vehiculo_archivos(empresa_id, vehiculo_id, created_at desc);
create index if not exists idx_vehiculo_archivos_vencimiento
  on public.vehiculo_archivos(empresa_id, tipo, fecha_vencimiento);

create or replace function public.validar_relaciones_vehiculo_archivo()
returns trigger
language plpgsql
security definer
set search_path = public
as '
begin
  if not exists (
    select 1 from public.vehiculos_empresa v
    where v.id = new.vehiculo_id and v.empresa_id = new.empresa_id
  ) then
    raise exception ''El archivo no pertenece a un vehiculo de la empresa activa'';
  end if;
  return new;
end;
';

drop trigger if exists set_vehiculo_archivos_updated_at on public.vehiculo_archivos;
create trigger set_vehiculo_archivos_updated_at
before update on public.vehiculo_archivos
for each row execute function public.set_updated_at();

drop trigger if exists validar_relaciones_vehiculo_archivo on public.vehiculo_archivos;
create trigger validar_relaciones_vehiculo_archivo
before insert or update on public.vehiculo_archivos
for each row execute function public.validar_relaciones_vehiculo_archivo();

alter table public.vehiculo_archivos enable row level security;

drop policy if exists "vehiculo archivos access" on public.vehiculo_archivos;
create policy "vehiculo archivos access" on public.vehiculo_archivos for all to authenticated
using (public.has_module_permission(empresa_id, 'flota'))
with check (public.has_module_permission(empresa_id, 'flota'));

insert into storage.buckets (id, name, public)
values ('vehiculos-archivos', 'vehiculos-archivos', false)
on conflict (id) do update set public = false;

create or replace function public.vehiculo_archivos_storage_empresa_id(object_name text)
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

drop policy if exists "vehiculo archivos storage read" on storage.objects;
create policy "vehiculo archivos storage read" on storage.objects for select to authenticated
using (
  bucket_id = 'vehiculos-archivos'
  and public.has_module_permission(public.vehiculo_archivos_storage_empresa_id(name), 'flota')
);

drop policy if exists "vehiculo archivos storage insert" on storage.objects;
create policy "vehiculo archivos storage insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'vehiculos-archivos'
  and public.has_module_permission(public.vehiculo_archivos_storage_empresa_id(name), 'flota')
);

drop policy if exists "vehiculo archivos storage update" on storage.objects;
create policy "vehiculo archivos storage update" on storage.objects for update to authenticated
using (
  bucket_id = 'vehiculos-archivos'
  and public.has_module_permission(public.vehiculo_archivos_storage_empresa_id(name), 'flota')
)
with check (
  bucket_id = 'vehiculos-archivos'
  and public.has_module_permission(public.vehiculo_archivos_storage_empresa_id(name), 'flota')
);

drop policy if exists "vehiculo archivos storage delete" on storage.objects;
create policy "vehiculo archivos storage delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'vehiculos-archivos'
  and public.has_module_permission(public.vehiculo_archivos_storage_empresa_id(name), 'flota')
);

grant select, insert, update, delete on public.vehiculo_archivos to authenticated;
grant execute on function public.vehiculo_archivos_storage_empresa_id(text) to authenticated;

notify pgrst, 'reload schema';

commit;
