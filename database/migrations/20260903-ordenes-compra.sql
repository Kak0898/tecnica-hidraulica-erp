begin;

insert into public.sistema_modulos (clave, nombre, grupo, orden, activo, solo_admin)
values ('ordenes_compra', 'Ordenes de compra', 'comercial', 132, true, false)
on conflict (clave) do update
set nombre = excluded.nombre,
    grupo = excluded.grupo,
    orden = excluded.orden,
    activo = true,
    solo_admin = false,
    updated_at = now();

create table if not exists public.ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  proveedor_id uuid references public.empresas_asociadas(id) on delete set null,
  numero text not null,
  fecha_emision date not null default current_date,
  fecha_entrega date,
  proveedor_snapshot jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(18,4) not null default 0,
  iva numeric(18,4) not null default 0,
  total numeric(18,4) not null default 0,
  moneda text not null default 'CLP',
  condiciones text,
  observaciones text,
  estado text not null default 'borrador' check (estado in ('borrador', 'emitida', 'anulada')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, numero)
);

create index if not exists idx_ordenes_compra_empresa_fecha
  on public.ordenes_compra(empresa_id, fecha_emision desc, created_at desc);

create index if not exists idx_ordenes_compra_proveedor
  on public.ordenes_compra(proveedor_id);

drop trigger if exists set_ordenes_compra_updated_at on public.ordenes_compra;
create trigger set_ordenes_compra_updated_at
before update on public.ordenes_compra
for each row execute function public.set_updated_at();

create or replace function public.validar_proveedor_orden_compra()
returns trigger
language plpgsql
security definer
set search_path = public
as '
begin
  if new.proveedor_id is not null and not exists (
    select 1
    from public.empresas_asociadas proveedor
    where proveedor.id = new.proveedor_id
      and proveedor.empresa_id = new.empresa_id
  ) then
    raise exception ''El proveedor no pertenece a la empresa activa'';
  end if;
  return new;
end;
';

drop trigger if exists validar_proveedor_orden_compra on public.ordenes_compra;
create trigger validar_proveedor_orden_compra
before insert or update on public.ordenes_compra
for each row execute function public.validar_proveedor_orden_compra();

alter table public.ordenes_compra enable row level security;

drop policy if exists "ordenes compra read" on public.ordenes_compra;
create policy "ordenes compra read" on public.ordenes_compra for select to authenticated
using (public.has_module_permission(empresa_id, 'ordenes_compra'));

drop policy if exists "ordenes compra write" on public.ordenes_compra;
create policy "ordenes compra write" on public.ordenes_compra for all to authenticated
using (public.has_module_permission(empresa_id, 'ordenes_compra'))
with check (public.has_module_permission(empresa_id, 'ordenes_compra'));

grant select, insert, update, delete on public.ordenes_compra to authenticated;
grant execute on function public.validar_proveedor_orden_compra() to authenticated;

insert into public.usuario_permisos (empresa_id, user_id, modulo, permitido)
select ue.empresa_id, ue.user_id, 'ordenes_compra', true
from public.usuarios_empresas ue
where ue.activo = true
  and (
    ue.rol in ('owner', 'admin')
    or exists (
      select 1
      from public.usuario_permisos current_permission
      where current_permission.empresa_id = ue.empresa_id
        and current_permission.user_id = ue.user_id
        and current_permission.modulo in ('cotizaciones', 'empresas_asociadas')
        and current_permission.permitido = true
    )
  )
on conflict (empresa_id, user_id, modulo) do update
set permitido = true,
    updated_at = now();

notify pgrst, 'reload schema';

commit;
