begin;

create or replace function public.eliminar_empresa_confirmada(
  p_empresa_id uuid,
  p_fecha_confirmacion text
)
returns boolean
language plpgsql
security definer
set search_path = public
as '
declare
  target_user_id uuid;
  target_date date;
begin
  target_user_id := auth.uid();

  if target_user_id is null then
    raise exception ''Usuario no autenticado'';
  end if;

  if p_empresa_id is null then
    raise exception ''Empresa obligatoria'';
  end if;

  begin
    target_date := p_fecha_confirmacion::date;
  exception when others then
    raise exception ''Para eliminar la empresa debes ingresar la fecha de hoy'';
  end;

  if target_date <> current_date then
    raise exception ''La fecha de confirmacion no coincide con la fecha de hoy'';
  end if;

  if not public.is_empresa_admin(p_empresa_id) then
    raise exception ''Solo un administrador de esta empresa puede eliminarla'';
  end if;

  if not exists (select 1 from public.empresas e where e.id = p_empresa_id) then
    raise exception ''La empresa no existe'';
  end if;

  delete from public.empresas e
  where e.id = p_empresa_id;

  return true;
end;
';

grant execute on function public.eliminar_empresa_confirmada(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
