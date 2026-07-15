-- Inventario EPP/ropa y tallas de trabajadores.
-- Patch incremental, seguro para ejecutar más de una vez.

create table if not exists public.epp_items (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  code text not null,
  category text not null,
  name text not null,
  talla text,
  color text,
  stock integer not null default 0 check (stock >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  location text,
  estado text not null default 'disponible' check (estado in ('disponible', 'agotado', 'reservado', 'entregado', 'baja')),
  notes text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, code)
);

create table if not exists public.epp_worker_sizes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  persona_id uuid references public.personas(id) on delete set null,
  nombre text not null,
  talla_polera text,
  talla_pantalon text,
  talla_zapato text,
  talla_overol text,
  talla_geologo text,
  notes text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nombre)
);

create index if not exists idx_epp_items_empresa_categoria on public.epp_items(empresa_id, category, estado);
create index if not exists idx_epp_items_stock on public.epp_items(empresa_id, stock, min_stock);
create index if not exists idx_epp_worker_sizes_empresa on public.epp_worker_sizes(empresa_id, nombre);
create index if not exists idx_epp_worker_sizes_persona on public.epp_worker_sizes(persona_id);

drop trigger if exists set_epp_items_updated_at on public.epp_items;
create trigger set_epp_items_updated_at before update on public.epp_items for each row execute function public.set_updated_at();
drop trigger if exists set_epp_worker_sizes_updated_at on public.epp_worker_sizes;
create trigger set_epp_worker_sizes_updated_at before update on public.epp_worker_sizes for each row execute function public.set_updated_at();

alter table public.epp_items enable row level security;
alter table public.epp_worker_sizes enable row level security;

drop policy if exists "epp_items tenant access" on public.epp_items;
create policy "epp_items tenant access" on public.epp_items for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "epp_worker_sizes tenant access" on public.epp_worker_sizes;
create policy "epp_worker_sizes tenant access" on public.epp_worker_sizes for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));

grant select, insert, update, delete on public.epp_items to authenticated;
grant select, insert, update, delete on public.epp_worker_sizes to authenticated;

notify pgrst, 'reload schema';
