-- Creacion administrada de usuarios y perfiles visibles en TH Control.
-- Ejecutar despues de 15_usuarios_permisos_modulos.sql.
-- Es incremental e idempotente: se puede volver a ejecutar sin borrar datos.

begin;

create table if not exists public.perfiles_usuarios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text not null check (length(trim(nombre_completo)) >= 2),
  creado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_perfiles_usuarios_nombre
  on public.perfiles_usuarios(lower(nombre_completo));

drop trigger if exists set_perfiles_usuarios_updated_at on public.perfiles_usuarios;
create trigger set_perfiles_usuarios_updated_at
before update on public.perfiles_usuarios
for each row execute function public.set_updated_at();

-- Recupera nombres ya guardados en los metadatos de Authentication.
insert into public.perfiles_usuarios (user_id, nombre_completo, creado_por)
select
  au.id,
  coalesce(
    nullif(trim(au.raw_user_meta_data ->> 'erp_nombre'), ''),
    nullif(trim(au.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(au.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(au.email, 'Usuario TH'), '@', 1)
  ),
  au.id
from auth.users au
where exists (
  select 1
  from public.usuarios_empresas ue
  where ue.user_id = au.id
)
on conflict (user_id) do nothing;

alter table public.perfiles_usuarios enable row level security;

drop policy if exists "perfiles own or shared admin read" on public.perfiles_usuarios;
create policy "perfiles own or shared admin read"
on public.perfiles_usuarios for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.usuarios_empresas target_membership
    where target_membership.user_id = perfiles_usuarios.user_id
      and public.is_empresa_admin(target_membership.empresa_id)
  )
);

drop policy if exists "perfiles own or shared admin insert" on public.perfiles_usuarios;
create policy "perfiles own or shared admin insert"
on public.perfiles_usuarios for insert to authenticated
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.usuarios_empresas target_membership
    where target_membership.user_id = perfiles_usuarios.user_id
      and public.is_empresa_admin(target_membership.empresa_id)
  )
);

drop policy if exists "perfiles own or shared admin update" on public.perfiles_usuarios;
create policy "perfiles own or shared admin update"
on public.perfiles_usuarios for update to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.usuarios_empresas target_membership
    where target_membership.user_id = perfiles_usuarios.user_id
      and public.is_empresa_admin(target_membership.empresa_id)
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.usuarios_empresas target_membership
    where target_membership.user_id = perfiles_usuarios.user_id
      and public.is_empresa_admin(target_membership.empresa_id)
  )
);

create or replace function public.listar_usuarios_empresa_detalle(p_empresa_id uuid)
returns table (
  user_id uuid,
  email text,
  nombre_completo text,
  rol text,
  activo boolean,
  modulos text[]
)
language sql
stable
security definer
set search_path = public, auth
as '
  select
    ue.user_id,
    au.email::text,
    coalesce(
      nullif(trim(pu.nombre_completo), ''''),
      nullif(trim(au.raw_user_meta_data ->> ''erp_nombre''), ''''),
      nullif(trim(au.raw_user_meta_data ->> ''full_name''), ''''),
      nullif(trim(au.raw_user_meta_data ->> ''name''), ''''),
      split_part(coalesce(au.email, ''Usuario TH''), ''@'', 1)
    )::text as nombre_completo,
    ue.rol,
    ue.activo,
    case
      when ue.rol in (''owner'', ''admin'') then array[
        ''dashboard'', ''google_ads'', ''clientes'', ''empresas_asociadas'',
        ''presupuestos'', ''cotizaciones'', ''publicaciones'', ''ordenes'',
        ''crm'', ''whatsapp'', ''personas_pagos'', ''flota'', ''maquinaria'',
        ''repuestos'', ''epp_ropa'', ''auditorias'', ''importar_excel'',
        ''ia'', ''configuracion'', ''usuarios_permisos''
      ]::text[]
      else coalesce((
        select array_agg(up.modulo order by up.modulo)
        from public.usuario_permisos up
        where up.empresa_id = ue.empresa_id
          and up.user_id = ue.user_id
          and up.permitido = true
      ), array[]::text[])
    end as modulos
  from public.usuarios_empresas ue
  join auth.users au on au.id = ue.user_id
  left join public.perfiles_usuarios pu on pu.user_id = ue.user_id
  where ue.empresa_id = p_empresa_id
    and public.is_empresa_admin(p_empresa_id)
  order by
    case ue.rol when ''owner'' then 0 when ''admin'' then 1 else 2 end,
    lower(coalesce(pu.nombre_completo, au.email))
';

create or replace function public.actualizar_nombre_usuario_empresa(
  p_empresa_id uuid,
  p_user_id uuid,
  p_nombre_completo text
)
returns boolean
language sql
security definer
set search_path = public
as '
  with allowed as (
    select ue.user_id
    from public.usuarios_empresas ue
    where ue.empresa_id = p_empresa_id
      and ue.user_id = p_user_id
      and public.is_empresa_admin(p_empresa_id)
      and length(trim(coalesce(p_nombre_completo, ''''))) >= 2
    limit 1
  ),
  written as (
    insert into public.perfiles_usuarios (user_id, nombre_completo, creado_por)
    select allowed.user_id, trim(p_nombre_completo), auth.uid()
    from allowed
    on conflict (user_id) do update
      set nombre_completo = excluded.nombre_completo,
          updated_at = now()
    returning user_id
  )
  select exists(select 1 from written)
';

grant select, insert, update on public.perfiles_usuarios to authenticated;
grant execute on function public.listar_usuarios_empresa_detalle(uuid) to authenticated;
grant execute on function public.actualizar_nombre_usuario_empresa(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
