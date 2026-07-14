-- Módulos de empresas relacionadas y flota vehicular.
-- Requiere que 01_base... y 09_personas... ya estén instalados.

create table if not exists public.empresas_asociadas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  tipo text not null default 'proveedor' check (tipo in ('cliente', 'proveedor', 'contratista', 'taller', 'leasing', 'partner', 'otra')),
  razon_social text not null,
  nombre_fantasia text,
  rut text,
  contacto_nombre text,
  contacto_cargo text,
  email text,
  telefono text,
  direccion text,
  sitio_web text,
  servicios text,
  estado text not null default 'activa' check (estado in ('activa', 'inactiva')),
  notas text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, rut)
);

create table if not exists public.vehiculos_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  empresa_asociada_id uuid references public.empresas_asociadas(id) on delete set null,
  conductor_id uuid references public.personas(id) on delete set null,
  patente text not null,
  tipo text not null default 'camioneta' check (tipo in ('camioneta', 'automovil', 'camion', 'furgon', 'moto', 'maquinaria', 'otro')),
  propiedad text not null default 'propio' check (propiedad in ('propio', 'leasing', 'arrendado', 'comodato')),
  marca text not null,
  modelo text not null,
  anio smallint check (anio is null or anio between 1900 and 2200),
  color text,
  combustible text,
  kilometraje numeric not null default 0 check (kilometraje >= 0),
  estado text not null default 'operativo' check (estado in ('operativo', 'mantenimiento', 'fuera_servicio', 'vendido')),
  ubicacion text,
  revision_tecnica_vencimiento date,
  permiso_circulacion_vencimiento date,
  seguro_vencimiento date,
  mantencion_proxima_fecha date,
  mantencion_proximo_km numeric check (mantencion_proximo_km is null or mantencion_proximo_km >= 0),
  notas text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, patente)
);

create index if not exists idx_empresas_asociadas_empresa_tipo on public.empresas_asociadas(empresa_id, tipo, estado);
create index if not exists idx_vehiculos_empresa_estado on public.vehiculos_empresa(empresa_id, estado);
create index if not exists idx_vehiculos_empresa_conductor on public.vehiculos_empresa(conductor_id);
create index if not exists idx_vehiculos_empresa_asociada on public.vehiculos_empresa(empresa_asociada_id);
create index if not exists idx_vehiculos_empresa_vencimientos on public.vehiculos_empresa(empresa_id, revision_tecnica_vencimiento, permiso_circulacion_vencimiento, seguro_vencimiento);

create or replace function public.validar_relaciones_vehiculo()
returns trigger
language plpgsql
security definer
set search_path = public
as '
begin
  if new.empresa_asociada_id is not null and not exists (
    select 1 from public.empresas_asociadas ea
    where ea.id = new.empresa_asociada_id and ea.empresa_id = new.empresa_id
  ) then
    raise exception ''La empresa asociada no pertenece a la empresa activa'';
  end if;

  if new.conductor_id is not null and not exists (
    select 1 from public.personas p
    where p.id = new.conductor_id and p.empresa_id = new.empresa_id and p.activo = true
  ) then
    raise exception ''El conductor no pertenece a la empresa activa'';
  end if;

  return new;
end;
';

drop trigger if exists set_empresas_asociadas_updated_at on public.empresas_asociadas;
create trigger set_empresas_asociadas_updated_at before update on public.empresas_asociadas for each row execute function public.set_updated_at();
drop trigger if exists set_vehiculos_empresa_updated_at on public.vehiculos_empresa;
create trigger set_vehiculos_empresa_updated_at before update on public.vehiculos_empresa for each row execute function public.set_updated_at();
drop trigger if exists validar_relaciones_vehiculo on public.vehiculos_empresa;
create trigger validar_relaciones_vehiculo before insert or update on public.vehiculos_empresa for each row execute function public.validar_relaciones_vehiculo();

alter table public.empresas_asociadas enable row level security;
alter table public.vehiculos_empresa enable row level security;

drop policy if exists "empresas_asociadas tenant access" on public.empresas_asociadas;
create policy "empresas_asociadas tenant access" on public.empresas_asociadas
for all to authenticated
using (public.is_empresa_member(empresa_id))
with check (public.is_empresa_member(empresa_id));

drop policy if exists "vehiculos_empresa tenant access" on public.vehiculos_empresa;
create policy "vehiculos_empresa tenant access" on public.vehiculos_empresa
for all to authenticated
using (public.is_empresa_member(empresa_id))
with check (public.is_empresa_member(empresa_id));

grant select, insert, update, delete on public.empresas_asociadas to authenticated;
grant select, insert, update, delete on public.vehiculos_empresa to authenticated;

notify pgrst, 'reload schema';
