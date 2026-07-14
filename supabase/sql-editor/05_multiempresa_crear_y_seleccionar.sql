create table if not exists public.usuario_empresa_activa (
  user_id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create or replace function public.current_empresa_id()
returns uuid
language sql
stable
security definer
set search_path = public
as '
  select coalesce(
    (
      select uea.empresa_id
      from public.usuario_empresa_activa uea
      join public.usuarios_empresas ue
        on ue.empresa_id = uea.empresa_id
       and ue.user_id = uea.user_id
       and ue.activo = true
      where uea.user_id = auth.uid()
      limit 1
    ),
    (
      select ue.empresa_id
      from public.usuarios_empresas ue
      where ue.user_id = auth.uid()
        and ue.activo = true
      order by ue.created_at asc
      limit 1
    )
  )
';

create or replace function public.create_empresa_owner(
  p_nombre text,
  p_slug text,
  p_rut text default null,
  p_email text default null,
  p_telefono text default null,
  p_direccion text default null,
  p_rubro text default 'servicio_tecnico_hidraulico'
)
returns public.usuarios_empresas
language plpgsql
security definer
set search_path = public
as '
declare
  target_user_id uuid;
  target_empresa_id uuid;
  clean_slug text;
  membership public.usuarios_empresas;
begin
  target_user_id := auth.uid();

  if target_user_id is null then
    raise exception ''Usuario no autenticado'';
  end if;

  clean_slug := lower(regexp_replace(trim(coalesce(p_slug, p_nombre)), ''[^a-zA-Z0-9]+'', ''-'', ''g''));
  clean_slug := trim(both ''-'' from clean_slug);

  if clean_slug = '''' or trim(coalesce(p_nombre, '''')) = '''' then
    raise exception ''Nombre y slug son obligatorios'';
  end if;

  insert into public.empresas (
    nombre,
    rut,
    slug,
    email,
    telefono,
    direccion,
    rubro
  )
  values (
    trim(p_nombre),
    nullif(trim(coalesce(p_rut, '''')), ''''),
    clean_slug,
    nullif(trim(coalesce(p_email, '''')), ''''),
    nullif(trim(coalesce(p_telefono, '''')), ''''),
    nullif(trim(coalesce(p_direccion, '''')), ''''),
    coalesce(nullif(trim(coalesce(p_rubro, '''')), ''''), ''servicio_tecnico_hidraulico'')
  )
  returning id into target_empresa_id;

  insert into public.usuarios_empresas (
    empresa_id,
    user_id,
    rol
  )
  values (
    target_empresa_id,
    target_user_id,
    ''owner''
  )
  returning * into membership;

  insert into public.usuario_empresa_activa (user_id, empresa_id)
  values (target_user_id, target_empresa_id)
  on conflict (user_id) do update
    set empresa_id = excluded.empresa_id,
        updated_at = now();

  return membership;
end;
';

create or replace function public.set_empresa_activa(p_empresa_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as '
declare
  target_user_id uuid;
begin
  target_user_id := auth.uid();

  if target_user_id is null then
    raise exception ''Usuario no autenticado'';
  end if;

  if not public.is_empresa_member(p_empresa_id) then
    raise exception ''No tienes acceso a esta empresa'';
  end if;

  insert into public.usuario_empresa_activa (user_id, empresa_id)
  values (target_user_id, p_empresa_id)
  on conflict (user_id) do update
    set empresa_id = excluded.empresa_id,
        updated_at = now();

  return p_empresa_id;
end;
';

create index if not exists idx_usuario_empresa_activa_empresa on public.usuario_empresa_activa(empresa_id);

drop trigger if exists set_usuario_empresa_activa_updated_at on public.usuario_empresa_activa;
create trigger set_usuario_empresa_activa_updated_at before update on public.usuario_empresa_activa for each row execute function public.set_updated_at();

alter table public.usuario_empresa_activa enable row level security;

drop policy if exists "usuario_empresa_activa own access" on public.usuario_empresa_activa;
create policy "usuario_empresa_activa own access" on public.usuario_empresa_activa for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_empresa_member(empresa_id));

grant execute on function public.create_empresa_owner(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.set_empresa_activa(uuid) to authenticated;
notify pgrst, 'reload schema';
