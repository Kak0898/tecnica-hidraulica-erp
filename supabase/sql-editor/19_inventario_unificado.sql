-- Habilita el permiso para la vista unificada de inventario.
-- Es incremental, idempotente y no modifica los registros existentes.

begin;

insert into public.sistema_modulos (clave, nombre, grupo, orden, activo, solo_admin)
values ('inventario', 'Inventario movil', 'operaciones', 305, true, false)
on conflict (clave) do update
set nombre = excluded.nombre,
    grupo = excluded.grupo,
    orden = excluded.orden,
    activo = true,
    solo_admin = false,
    updated_at = now();

commit;

notify pgrst, 'reload schema';
