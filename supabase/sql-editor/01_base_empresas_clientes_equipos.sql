create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

drop table if exists public.ia_consultas cascade;
drop table if exists public.publicaciones_productos cascade;
drop table if exists public.productos_comerciales cascade;
drop table if exists public.vehiculos_empresa cascade;
drop table if exists public.empresas_asociadas cascade;
drop table if exists public.whatsapp_mensajes cascade;
drop table if exists public.crm_oportunidades cascade;
drop table if exists public.documentos_personas cascade;
drop table if exists public.pagos_personas cascade;
drop table if exists public.personas cascade;
drop table if exists public.import_logs cascade;
drop table if exists public.archivos cascade;
drop table if exists public.equipo_eventos cascade;
drop table if exists public.audits cascade;
drop table if exists public.ordenes_trabajo cascade;
drop table if exists public.cotizacion_items cascade;
drop table if exists public.cotizacion_documentos cascade;
drop table if exists public.cotizaciones cascade;
drop table if exists public.erp_counters cascade;
drop table if exists public.spare_parts cascade;
drop table if exists public.machines cascade;
drop table if exists public.contactos cascade;
drop table if exists public.clientes cascade;
drop table if exists public.usuario_empresa_activa cascade;
drop table if exists public.usuarios_empresas cascade;
drop table if exists public.empresas cascade;

drop function if exists public.current_empresa_id() cascade;
drop function if exists public.is_empresa_member(uuid) cascade;
drop function if exists public.is_empresa_admin(uuid) cascade;
drop function if exists public.empresa_has_members(uuid) cascade;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as '
begin
  new.updated_at = now();
  return new;
end;
';

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  razon_social text,
  rut text,
  slug text unique not null,
  email text,
  telefono text,
  direccion text,
  website text,
  logo_url text,
  logo_path text,
  descripcion_corta text,
  firma_nombre text,
  firma_cargo text,
  firma_email text,
  firma_telefono text,
  firma_celular text,
  condiciones_default text,
  observaciones_default text,
  rubro text default 'servicio_tecnico_hidraulico',
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usuarios_empresas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rol text not null default 'operador' check (rol in ('owner', 'admin', 'gerencia', 'comercial', 'taller', 'tecnico', 'cliente', 'operador')),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, user_id)
);

create table if not exists public.usuario_empresa_activa (
  user_id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create or replace function public.current_empresa_id()
returns uuid
language sql
stable
security definer
set search_path = public
as '
  select coalesce(
    (
      select uea.empresa_id
      from public.usuario_empresa_activa uea
      join public.usuarios_empresas ue
        on ue.empresa_id = uea.empresa_id
       and ue.user_id = uea.user_id
       and ue.activo = true
      where uea.user_id = auth.uid()
      limit 1
    ),
    (
      select ue.empresa_id
      from public.usuarios_empresas ue
      where ue.user_id = auth.uid()
        and ue.activo = true
      order by ue.created_at asc
      limit 1
    )
  )
';

create or replace function public.is_empresa_member(target_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as '
  select exists (
    select 1
    from public.usuarios_empresas ue
    where ue.empresa_id = target_empresa_id
      and ue.user_id = auth.uid()
      and ue.activo = true
  )
';

create or replace function public.is_empresa_admin(target_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as '
  select exists (
    select 1
    from public.usuarios_empresas ue
    where ue.empresa_id = target_empresa_id
      and ue.user_id = auth.uid()
      and ue.activo = true
      and ue.rol in (''owner'', ''admin'')
  )
';

create or replace function public.empresa_has_members(target_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as '
  select exists (
    select 1
    from public.usuarios_empresas ue
    where ue.empresa_id = target_empresa_id
  )
';

create or replace function public.bootstrap_empresa_tecnica_hidraulica()
returns public.usuarios_empresas
language plpgsql
security definer
set search_path = public
as '
declare
  target_user_id uuid;
  target_empresa_id uuid;
  membership public.usuarios_empresas;
begin
  target_user_id := auth.uid();

  if target_user_id is null then
    raise exception ''Usuario no autenticado'';
  end if;

  insert into public.empresas (
    nombre,
    slug,
    rubro
  )
  values (
    ''Técnica Hidráulica Ltda.'',
    ''tecnica-hidraulica'',
    ''servicio_tecnico_hidraulico''
  )
  on conflict (slug) do update
    set nombre = excluded.nombre,
        rubro = excluded.rubro,
        updated_at = now()
  returning id into target_empresa_id;

  if public.empresa_has_members(target_empresa_id) then
    raise exception ''La empresa ya tiene usuarios asociados'';
  end if;

  insert into public.usuarios_empresas (
    empresa_id,
    user_id,
    rol
  )
  values (
    target_empresa_id,
    target_user_id,
    ''owner''
  )
  on conflict (empresa_id, user_id) do update
    set rol = excluded.rol,
        activo = true,
        updated_at = now()
  returning * into membership;

  insert into public.usuario_empresa_activa (user_id, empresa_id)
  values (target_user_id, target_empresa_id)
  on conflict (user_id) do update
    set empresa_id = excluded.empresa_id,
        updated_at = now();

  return membership;
end;
';

create or replace function public.create_empresa_owner(
  p_nombre text,
  p_slug text,
  p_rut text default null,
  p_email text default null,
  p_telefono text default null,
  p_direccion text default null,
  p_rubro text default 'servicio_tecnico_hidraulico'
)
returns public.usuarios_empresas
language plpgsql
security definer
set search_path = public
as '
declare
  target_user_id uuid;
  target_empresa_id uuid;
  clean_slug text;
  membership public.usuarios_empresas;
begin
  target_user_id := auth.uid();

  if target_user_id is null then
    raise exception ''Usuario no autenticado'';
  end if;

  clean_slug := lower(regexp_replace(trim(coalesce(p_slug, p_nombre)), ''[^a-zA-Z0-9]+'', ''-'', ''g''));
  clean_slug := trim(both ''-'' from clean_slug);

  if clean_slug = '''' or trim(coalesce(p_nombre, '''')) = '''' then
    raise exception ''Nombre y slug son obligatorios'';
  end if;

  insert into public.empresas (
    nombre,
    rut,
    slug,
    email,
    telefono,
    direccion,
    rubro
  )
  values (
    trim(p_nombre),
    nullif(trim(coalesce(p_rut, '''')), ''''),
    clean_slug,
    nullif(trim(coalesce(p_email, '''')), ''''),
    nullif(trim(coalesce(p_telefono, '''')), ''''),
    nullif(trim(coalesce(p_direccion, '''')), ''''),
    coalesce(nullif(trim(coalesce(p_rubro, '''')), ''''), ''servicio_tecnico_hidraulico'')
  )
  returning id into target_empresa_id;

  insert into public.usuarios_empresas (
    empresa_id,
    user_id,
    rol
  )
  values (
    target_empresa_id,
    target_user_id,
    ''owner''
  )
  returning * into membership;

  insert into public.usuario_empresa_activa (user_id, empresa_id)
  values (target_user_id, target_empresa_id)
  on conflict (user_id) do update
    set empresa_id = excluded.empresa_id,
        updated_at = now();

  return membership;
end;
';

create or replace function public.set_empresa_activa(p_empresa_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as '
declare
  target_user_id uuid;
begin
  target_user_id := auth.uid();

  if target_user_id is null then
    raise exception ''Usuario no autenticado'';
  end if;

  if not public.is_empresa_member(p_empresa_id) then
    raise exception ''No tienes acceso a esta empresa'';
  end if;

  insert into public.usuario_empresa_activa (user_id, empresa_id)
  values (target_user_id, p_empresa_id)
  on conflict (user_id) do update
    set empresa_id = excluded.empresa_id,
        updated_at = now();

  return p_empresa_id;
end;
';

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  razon_social text not null,
  nombre_fantasia text,
  rut text,
  giro text,
  email text,
  telefono text,
  direccion text,
  comuna text,
  ciudad text,
  region text,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo', 'prospecto')),
  notas text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, rut)
);

create table if not exists public.contactos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nombre text not null,
  cargo text,
  email text,
  telefono text,
  whatsapp text,
  principal boolean not null default false,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  contacto_id uuid references public.contactos(id) on delete set null,
  code text not null,
  name text not null,
  conteo text,
  brand text,
  model text,
  color text,
  serial text,
  serial_number text,
  tipo text,
  category text,
  anio integer,
  location text,
  ubicacion_cliente text,
  status text not null default 'activo',
  estado_fisico text not null default 'buen estado',
  estado_detalle text,
  disponibilidad text,
  tipo_bateria text,
  alto_bateria numeric,
  ancho_bateria numeric,
  largo numeric,
  altura numeric,
  last_maintenance date,
  next_maintenance date,
  purchase_value numeric,
  qr_token text unique not null default encode(gen_random_bytes(16), 'hex'),
  qr_enabled boolean not null default true,
  public_view_enabled boolean not null default false,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code),
  unique (empresa_id, code)
);

create table if not exists public.spare_parts (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  code text not null,
  name text not null,
  brand text,
  category text,
  compatible_machine text,
  stock integer not null default 0,
  min_stock integer not null default 1,
  unit_cost numeric,
  unit_price numeric,
  unit text not null default 'unidad',
  supplier text,
  location text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code),
  unique (empresa_id, code)
);

create table if not exists public.erp_counters (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  key text not null,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (empresa_id, key)
);

create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  contacto_id uuid references public.contactos(id) on delete set null,
  equipo_id uuid references public.machines(id) on delete set null,
  folio text not null,
  titulo text,
  estado text not null default 'borrador' check (estado in ('borrador', 'enviada', 'aprobada', 'rechazada', 'vencida', 'convertida')),
  moneda text not null default 'CLP',
  subtotal numeric(18,4) not null default 0,
  descuento numeric(18,4) not null default 0,
  impuesto numeric(18,4) not null default 0,
  total numeric(18,4) not null default 0,
  validez_dias integer not null default 15,
  fecha_emision date not null default current_date,
  fecha_vencimiento date,
  condiciones text,
  observaciones text,
  pdf_path text,
  created_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, folio)
);
