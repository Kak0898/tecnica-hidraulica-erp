begin;

insert into public.sistema_modulos (clave, nombre, grupo, orden, activo, solo_admin)
values ('cpanel_hosting', 'cPanel y hosting', 'sistema', 920, true, true)
on conflict (clave) do update
set nombre = excluded.nombre,
    grupo = excluded.grupo,
    orden = excluded.orden,
    activo = true,
    solo_admin = true;

create table if not exists public.hosting_credenciales (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  servicio text not null default 'cpanel',
  url text not null default 'https://cpanel.tecnicahidraulica.cl/',
  usuario text not null,
  password_ciphertext text not null,
  password_iv text not null,
  password_tag text not null,
  notas text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hosting_credenciales_servicio_check check (servicio in ('cpanel')),
  constraint hosting_credenciales_empresa_servicio_key unique (empresa_id, servicio)
);

create index if not exists idx_hosting_credenciales_empresa
  on public.hosting_credenciales(empresa_id, servicio);

drop trigger if exists set_hosting_credenciales_updated_at on public.hosting_credenciales;
create trigger set_hosting_credenciales_updated_at
before update on public.hosting_credenciales
for each row execute function public.set_updated_at();

alter table public.hosting_credenciales enable row level security;

drop policy if exists "hosting credenciales admin read" on public.hosting_credenciales;
create policy "hosting credenciales admin read"
on public.hosting_credenciales for select to authenticated
using (public.is_empresa_admin(empresa_id));

drop policy if exists "hosting credenciales admin write" on public.hosting_credenciales;
create policy "hosting credenciales admin write"
on public.hosting_credenciales for all to authenticated
using (public.is_empresa_admin(empresa_id))
with check (public.is_empresa_admin(empresa_id));

grant select, insert, update, delete on public.hosting_credenciales to authenticated;

insert into public.usuario_permisos (empresa_id, user_id, modulo, permitido)
select ue.empresa_id, ue.user_id, 'cpanel_hosting', true
from public.usuarios_empresas ue
where ue.activo = true
  and ue.rol in ('owner', 'admin')
on conflict (empresa_id, user_id, modulo) do update set permitido = true, updated_at = now();

notify pgrst, 'reload schema';

commit;
