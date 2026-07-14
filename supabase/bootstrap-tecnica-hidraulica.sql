-- Reemplazar PEGAR_AUTH_USER_ID por el UUID del primer usuario creado en Supabase Auth.

with empresa as (
  insert into public.empresas (
    nombre,
    rut,
    slug,
    email,
    telefono,
    direccion
  )
  values (
    'Técnica Hidráulica Ltda.',
    null,
    'tecnica-hidraulica',
    null,
    null,
    null
  )
  on conflict (slug) do update
    set nombre = excluded.nombre,
        updated_at = now()
  returning id
)
insert into public.usuarios_empresas (
  empresa_id,
  user_id,
  rol
)
select
  empresa.id,
  'PEGAR_AUTH_USER_ID'::uuid,
  'owner'
from empresa
on conflict (empresa_id, user_id) do update
  set rol = excluded.rol,
      activo = true,
      updated_at = now();
