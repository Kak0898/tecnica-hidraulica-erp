create or replace function public.bootstrap_empresa_tecnica_hidraulica()
returns public.usuarios_empresas
language plpgsql
security definer
set search_path = public
as '
declare
  target_user_id uuid;
  target_empresa_id uuid;
  membership public.usuarios_empresas;
begin
  target_user_id := auth.uid();

  if target_user_id is null then
    raise exception ''Usuario no autenticado'';
  end if;

  insert into public.empresas (
    nombre,
    slug,
    rubro
  )
  values (
    ''Técnica Hidráulica Ltda.'',
    ''tecnica-hidraulica'',
    ''servicio_tecnico_hidraulico''
  )
  on conflict (slug) do update
    set nombre = excluded.nombre,
        rubro = excluded.rubro,
        updated_at = now()
  returning id into target_empresa_id;

  if public.empresa_has_members(target_empresa_id) then
    raise exception ''La empresa ya tiene usuarios asociados'';
  end if;

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
  on conflict (empresa_id, user_id) do update
    set rol = excluded.rol,
        activo = true,
        updated_at = now()
  returning * into membership;

  return membership;
end;
';

grant execute on function public.bootstrap_empresa_tecnica_hidraulica() to authenticated;
notify pgrst, 'reload schema';
