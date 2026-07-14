create table if not exists public.personas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  tipo_relacion text not null default 'contrato' check (tipo_relacion in ('contrato', 'honorarios', 'proveedor', 'externo')),
  rut text,
  nombre text not null,
  email text,
  telefono text,
  direccion text,
  cargo text,
  centro_costo text,
  banco text,
  tipo_cuenta text,
  numero_cuenta text,
  activo boolean not null default true,
  notas text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, rut)
);

create table if not exists public.pagos_personas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete cascade,
  periodo date not null default date_trunc('month', now())::date,
  tipo_pago text not null default 'sueldo' check (tipo_pago in ('sueldo', 'honorario', 'anticipo', 'bono', 'reembolso', 'comision', 'otro')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'pagado', 'anulado')),
  bruto numeric not null default 0,
  retencion numeric not null default 0,
  descuentos numeric not null default 0,
  liquido numeric not null default 0,
  fecha_pago date,
  numero_documento text,
  documento_url text,
  comprobante_url text,
  notas text,
  detalle jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pagos_personas
  add column if not exists detalle jsonb not null default '{}'::jsonb;

create table if not exists public.documentos_personas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete cascade,
  pago_id uuid references public.pagos_personas(id) on delete set null,
  tipo text not null default 'liquidacion' check (tipo in ('liquidacion', 'boleta_honorarios', 'contrato', 'anexo', 'comprobante', 'otro')),
  periodo date,
  nombre text not null,
  url text,
  notas text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_personas_empresa_tipo on public.personas(empresa_id, tipo_relacion);
create index if not exists idx_pagos_personas_empresa_periodo on public.pagos_personas(empresa_id, periodo);
create index if not exists idx_documentos_personas_persona on public.documentos_personas(persona_id);

drop trigger if exists set_personas_updated_at on public.personas;
create trigger set_personas_updated_at before update on public.personas for each row execute function public.set_updated_at();
drop trigger if exists set_pagos_personas_updated_at on public.pagos_personas;
create trigger set_pagos_personas_updated_at before update on public.pagos_personas for each row execute function public.set_updated_at();

alter table public.personas enable row level security;
alter table public.pagos_personas enable row level security;
alter table public.documentos_personas enable row level security;

drop policy if exists "personas tenant access" on public.personas;
create policy "personas tenant access" on public.personas for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "pagos_personas tenant access" on public.pagos_personas;
create policy "pagos_personas tenant access" on public.pagos_personas for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "documentos_personas tenant access" on public.documentos_personas;
create policy "documentos_personas tenant access" on public.documentos_personas for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));

notify pgrst, 'reload schema';
