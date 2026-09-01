begin;

create table if not exists public.correo_credenciales (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text,
  correo text not null,
  usuario text not null,
  password_ciphertext text not null,
  password_iv text not null,
  password_tag text not null,
  imap_host text default 'mail.tecnicahidraulica.cl',
  smtp_host text default 'mail.tecnicahidraulica.cl',
  notas text,
  activo boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint correo_credenciales_correo_check check (position('@' in correo) > 1),
  constraint correo_credenciales_empresa_correo_key unique (empresa_id, correo)
);

create index if not exists idx_correo_credenciales_empresa
  on public.correo_credenciales(empresa_id, activo desc, correo);

drop trigger if exists set_correo_credenciales_updated_at on public.correo_credenciales;
create trigger set_correo_credenciales_updated_at
before update on public.correo_credenciales
for each row execute function public.set_updated_at();

alter table public.correo_credenciales enable row level security;

drop policy if exists "correo credenciales admin read" on public.correo_credenciales;
create policy "correo credenciales admin read"
on public.correo_credenciales for select to authenticated
using (public.is_empresa_admin(empresa_id));

drop policy if exists "correo credenciales admin write" on public.correo_credenciales;
create policy "correo credenciales admin write"
on public.correo_credenciales for all to authenticated
using (public.is_empresa_admin(empresa_id))
with check (public.is_empresa_admin(empresa_id));

grant select, insert, update, delete on public.correo_credenciales to authenticated;

notify pgrst, 'reload schema';

commit;
