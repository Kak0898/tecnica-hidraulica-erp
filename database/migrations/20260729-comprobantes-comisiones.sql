begin;

insert into public.sistema_modulos (clave, nombre, grupo, orden, activo, solo_admin)
values ('comprobantes_comisiones', 'Comprobantes y comisiones', 'comercial', 135, true, false)
on conflict (clave) do update
set nombre = excluded.nombre,
    grupo = excluded.grupo,
    orden = excluded.orden,
    activo = true,
    solo_admin = false,
    updated_at = now();

-- Los administradores ya tienen acceso por rol. A los usuarios operativos se
-- les conserva acceso cuando ya manejaban cotizaciones o remuneraciones.
insert into public.usuario_permisos (empresa_id, user_id, modulo, permitido)
select distinct ue.empresa_id, ue.user_id, 'comprobantes_comisiones', true
from public.usuarios_empresas ue
where ue.activo = true
  and (
    ue.rol in ('owner', 'admin')
    or exists (
      select 1
      from public.usuario_permisos current_permission
      where current_permission.empresa_id = ue.empresa_id
        and current_permission.user_id = ue.user_id
        and current_permission.modulo in ('cotizaciones', 'personas_pagos')
        and current_permission.permitido = true
    )
  )
on conflict (empresa_id, user_id, modulo) do update
set permitido = true,
    updated_at = now();

commit;
