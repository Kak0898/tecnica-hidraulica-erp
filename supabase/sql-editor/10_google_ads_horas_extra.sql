-- Migración no destructiva para bases TH ERP existentes.
-- Requiere que ya existan empresas, personas, pagos_personas,
-- current_empresa_id(), is_empresa_member() y set_updated_at().

create table if not exists public.horas_extra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete cascade,
  pago_id uuid references public.pagos_personas(id) on delete set null,
  fecha date not null default current_date,
  horas numeric(7,2) not null check (horas > 0),
  valor_hora numeric not null default 0 check (valor_hora >= 0),
  factor numeric(4,2) not null default 1.5 check (factor >= 1.5),
  monto numeric not null default 0 check (monto >= 0),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'liquidada', 'anulada')),
  notas text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.google_ads_campanas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  google_campaign_id text,
  nombre text not null,
  tipo text not null default 'busqueda' check (tipo in ('busqueda', 'performance_max', 'display', 'video', 'shopping', 'otro')),
  estado text not null default 'habilitada' check (estado in ('habilitada', 'pausada', 'finalizada')),
  presupuesto_diario numeric not null default 0 check (presupuesto_diario >= 0),
  objetivo_cpa numeric not null default 0 check (objetivo_cpa >= 0),
  objetivo_roas numeric not null default 0 check (objetivo_roas >= 0),
  url_google_ads text,
  notas text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, google_campaign_id)
);

create table if not exists public.google_ads_metricas_diarias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  campana_id uuid not null references public.google_ads_campanas(id) on delete cascade,
  fecha date not null default current_date,
  impresiones bigint not null default 0 check (impresiones >= 0),
  clics bigint not null default 0 check (clics >= 0),
  costo numeric not null default 0 check (costo >= 0),
  conversiones numeric(12,2) not null default 0 check (conversiones >= 0),
  valor_conversiones numeric not null default 0 check (valor_conversiones >= 0),
  cuota_impresiones numeric(6,2) not null default 0 check (cuota_impresiones between 0 and 100),
  perdida_presupuesto numeric(6,2) not null default 0 check (perdida_presupuesto between 0 and 100),
  fuente text not null default 'manual' check (fuente in ('manual', 'api', 'importacion')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campana_id, fecha)
);

create table if not exists public.google_ads_recomendaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  campana_id uuid references public.google_ads_campanas(id) on delete cascade,
  fecha date not null default current_date,
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  titulo text not null,
  detalle text not null,
  fuente text not null default 'automatica' check (fuente in ('automatica', 'manual', 'google')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aplicada', 'descartada')),
  resuelta_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (empresa_id, campana_id, fecha, titulo)
);

create index if not exists idx_horas_extra_empresa_fecha on public.horas_extra(empresa_id, fecha desc);
create index if not exists idx_horas_extra_persona_estado on public.horas_extra(persona_id, estado);
create index if not exists idx_google_ads_campanas_empresa on public.google_ads_campanas(empresa_id, estado);
create index if not exists idx_google_ads_metricas_empresa_fecha on public.google_ads_metricas_diarias(empresa_id, fecha desc);
create index if not exists idx_google_ads_recomendaciones_estado on public.google_ads_recomendaciones(empresa_id, estado, fecha desc);

drop trigger if exists set_horas_extra_updated_at on public.horas_extra;
create trigger set_horas_extra_updated_at before update on public.horas_extra for each row execute function public.set_updated_at();
drop trigger if exists set_google_ads_campanas_updated_at on public.google_ads_campanas;
create trigger set_google_ads_campanas_updated_at before update on public.google_ads_campanas for each row execute function public.set_updated_at();
drop trigger if exists set_google_ads_metricas_updated_at on public.google_ads_metricas_diarias;
create trigger set_google_ads_metricas_updated_at before update on public.google_ads_metricas_diarias for each row execute function public.set_updated_at();

alter table public.horas_extra enable row level security;
alter table public.google_ads_campanas enable row level security;
alter table public.google_ads_metricas_diarias enable row level security;
alter table public.google_ads_recomendaciones enable row level security;

drop policy if exists "horas_extra tenant access" on public.horas_extra;
create policy "horas_extra tenant access" on public.horas_extra for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "google_ads_campanas tenant access" on public.google_ads_campanas;
create policy "google_ads_campanas tenant access" on public.google_ads_campanas for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "google_ads_metricas tenant access" on public.google_ads_metricas_diarias;
create policy "google_ads_metricas tenant access" on public.google_ads_metricas_diarias for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "google_ads_recomendaciones tenant access" on public.google_ads_recomendaciones;
create policy "google_ads_recomendaciones tenant access" on public.google_ads_recomendaciones for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));

create or replace function public.generar_recomendaciones_google_ads(p_fecha date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as '
declare
  target_empresa_id uuid;
  affected integer;
  total_inserted integer := 0;
begin
  target_empresa_id := public.current_empresa_id();
  if target_empresa_id is null then
    raise exception ''Usuario sin empresa activa'';
  end if;

  insert into public.google_ads_recomendaciones (empresa_id, campana_id, fecha, prioridad, titulo, detalle)
  select m.empresa_id, m.campana_id, m.fecha, ''alta'', ''Revisar conversiones sin resultados'',
    ''La campaña '' || c.nombre || '' registra '' || m.clics || '' clics y ninguna conversión. Revisar medición, términos y página de destino.''
  from public.google_ads_metricas_diarias m join public.google_ads_campanas c on c.id = m.campana_id
  where m.empresa_id = target_empresa_id and m.fecha = p_fecha and m.clics >= 20 and m.conversiones = 0
  on conflict (empresa_id, campana_id, fecha, titulo) do nothing;
  get diagnostics affected = row_count; total_inserted := total_inserted + affected;

  insert into public.google_ads_recomendaciones (empresa_id, campana_id, fecha, prioridad, titulo, detalle)
  select m.empresa_id, m.campana_id, m.fecha, ''media'', ''Mejorar anuncios con CTR bajo'',
    ''La campaña '' || c.nombre || '' tiene CTR bajo 3%. Probar títulos más específicos y agregar búsquedas irrelevantes como negativas.''
  from public.google_ads_metricas_diarias m join public.google_ads_campanas c on c.id = m.campana_id
  where m.empresa_id = target_empresa_id and m.fecha = p_fecha and m.impresiones >= 100 and (m.clics::numeric / nullif(m.impresiones, 0)) * 100 < 3
  on conflict (empresa_id, campana_id, fecha, titulo) do nothing;
  get diagnostics affected = row_count; total_inserted := total_inserted + affected;

  insert into public.google_ads_recomendaciones (empresa_id, campana_id, fecha, prioridad, titulo, detalle)
  select m.empresa_id, m.campana_id, m.fecha, ''media'', ''Revisar limitación por presupuesto'',
    ''La campaña '' || c.nombre || '' pierde '' || round(m.perdida_presupuesto, 1) || ''% de impresiones por presupuesto. Priorizar horarios y términos que convierten antes de aumentarlo.''
  from public.google_ads_metricas_diarias m join public.google_ads_campanas c on c.id = m.campana_id
  where m.empresa_id = target_empresa_id and m.fecha = p_fecha and m.perdida_presupuesto >= 15
  on conflict (empresa_id, campana_id, fecha, titulo) do nothing;
  get diagnostics affected = row_count; total_inserted := total_inserted + affected;

  insert into public.google_ads_recomendaciones (empresa_id, campana_id, fecha, prioridad, titulo, detalle)
  select m.empresa_id, m.campana_id, m.fecha, ''alta'', ''CPA sobre el objetivo'',
    ''La campaña '' || c.nombre || '' supera en más de 25% su CPA objetivo. Revisar términos, ubicaciones y ofertas.''
  from public.google_ads_metricas_diarias m join public.google_ads_campanas c on c.id = m.campana_id
  where m.empresa_id = target_empresa_id and m.fecha = p_fecha and m.conversiones > 0 and c.objetivo_cpa > 0 and (m.costo / nullif(m.conversiones, 0)) > c.objetivo_cpa * 1.25
  on conflict (empresa_id, campana_id, fecha, titulo) do nothing;
  get diagnostics affected = row_count; total_inserted := total_inserted + affected;

  return total_inserted;
end;
';

grant execute on function public.generar_recomendaciones_google_ads(date) to authenticated;
notify pgrst, 'reload schema';
