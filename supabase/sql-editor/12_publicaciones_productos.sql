-- Patch incremental: catálogo comercial y publicaciones por plataforma.
-- Seguro para una base existente: no elimina tablas ni datos del ERP.

create table if not exists public.productos_comerciales (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  tipo text not null default 'maquinaria' check (tipo in ('maquinaria', 'repuesto', 'servicio', 'vehiculo', 'otro')),
  sku text,
  nombre text not null,
  descripcion text,
  precio numeric check (precio is null or precio >= 0),
  moneda text not null default 'CLP' check (moneda in ('CLP', 'UF', 'USD')),
  stock numeric check (stock is null or stock >= 0),
  imagen_url text,
  estado text not null default 'borrador' check (estado in ('borrador', 'publicado', 'pausado', 'vendido')),
  notas text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, sku)
);

create table if not exists public.publicaciones_productos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  producto_id uuid not null references public.productos_comerciales(id) on delete cascade,
  plataforma text not null default 'sitio_web' check (plataforma in ('sitio_web', 'mercado_libre', 'facebook_marketplace', 'instagram', 'yapo', 'linkedin', 'google_business', 'whatsapp_catalogo', 'tiktok', 'chileautos', 'otra')),
  titulo text,
  url text not null check (length(trim(url)) > 0),
  estado text not null default 'activa' check (estado in ('activa', 'pausada', 'finalizada', 'eliminada')),
  precio_publicado numeric check (precio_publicado is null or precio_publicado >= 0),
  moneda text not null default 'CLP' check (moneda in ('CLP', 'UF', 'USD')),
  fecha_publicacion date,
  fecha_vencimiento date,
  visitas integer not null default 0 check (visitas >= 0),
  consultas integer not null default 0 check (consultas >= 0),
  notas text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (producto_id, url)
);

create index if not exists idx_productos_comerciales_empresa_estado on public.productos_comerciales(empresa_id, estado, tipo);
create index if not exists idx_publicaciones_productos_empresa_estado on public.publicaciones_productos(empresa_id, estado, plataforma);
create index if not exists idx_publicaciones_productos_producto on public.publicaciones_productos(producto_id);

create or replace function public.validar_publicacion_producto()
returns trigger
language plpgsql
security definer
set search_path = public
as '
begin
  if not exists (
    select 1
    from public.productos_comerciales p
    where p.id = new.producto_id and p.empresa_id = new.empresa_id
  ) then
    raise exception ''El producto no pertenece a la empresa activa'';
  end if;
  return new;
end;
';

drop trigger if exists set_productos_comerciales_updated_at on public.productos_comerciales;
create trigger set_productos_comerciales_updated_at before update on public.productos_comerciales for each row execute function public.set_updated_at();
drop trigger if exists set_publicaciones_productos_updated_at on public.publicaciones_productos;
create trigger set_publicaciones_productos_updated_at before update on public.publicaciones_productos for each row execute function public.set_updated_at();
drop trigger if exists validar_publicacion_producto on public.publicaciones_productos;
create trigger validar_publicacion_producto before insert or update on public.publicaciones_productos for each row execute function public.validar_publicacion_producto();

alter table public.productos_comerciales enable row level security;
alter table public.publicaciones_productos enable row level security;

drop policy if exists "productos_comerciales tenant access" on public.productos_comerciales;
create policy "productos_comerciales tenant access" on public.productos_comerciales for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "publicaciones_productos tenant access" on public.publicaciones_productos;
create policy "publicaciones_productos tenant access" on public.publicaciones_productos for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));

grant select, insert, update, delete on public.productos_comerciales to authenticated;
grant select, insert, update, delete on public.publicaciones_productos to authenticated;

notify pgrst, 'reload schema';
