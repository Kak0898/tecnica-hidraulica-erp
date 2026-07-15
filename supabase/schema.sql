create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

drop table if exists public.ia_consultas cascade;
drop table if exists public.publicaciones_productos cascade;
drop table if exists public.productos_comerciales cascade;
drop table if exists public.vehiculos_empresa cascade;
drop table if exists public.empresas_asociadas cascade;
drop table if exists public.whatsapp_mensajes cascade;
drop table if exists public.crm_oportunidades cascade;
drop table if exists public.google_ads_recomendaciones cascade;
drop table if exists public.google_ads_metricas_diarias cascade;
drop table if exists public.google_ads_campanas cascade;
drop table if exists public.horas_extra cascade;
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
drop table if exists public.perfiles_usuarios cascade;
drop table if exists public.usuarios_empresas cascade;
drop table if exists public.usuario_permisos cascade;
drop table if exists public.empresas cascade;

drop function if exists public.current_empresa_id() cascade;
drop function if exists public.is_empresa_member(uuid) cascade;
drop function if exists public.is_empresa_admin(uuid) cascade;
drop function if exists public.empresa_has_members(uuid) cascade;
drop function if exists public.generar_recomendaciones_google_ads(date) cascade;
drop function if exists public.has_module_permission(uuid, text) cascade;
drop function if exists public.has_any_module_permission(uuid, text[]) cascade;
drop function if exists public.mis_permisos_empresa(uuid) cascade;
drop function if exists public.listar_usuarios_empresa(uuid) cascade;
drop function if exists public.guardar_permisos_usuario(uuid, text, text, text[]) cascade;
drop function if exists public.cambiar_estado_usuario_empresa(uuid, uuid, boolean) cascade;
drop function if exists public.listar_usuarios_empresa_detalle(uuid) cascade;
drop function if exists public.actualizar_nombre_usuario_empresa(uuid, uuid, text) cascade;

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
  permisos_inicializados boolean not null default false,
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

create table if not exists public.cotizacion_items (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
  tipo text not null default 'servicio' check (tipo in ('servicio', 'repuesto', 'mano_obra', 'traslado', 'otro')),
  codigo text,
  descripcion text not null,
  cantidad numeric(18,4) not null default 1,
  precio_unitario numeric(18,4) not null default 0,
  descuento numeric(18,4) not null default 0,
  total numeric(18,4) not null default 0,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.cotizacion_documentos (
  id bigint generated by default as identity primary key,
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  cotizacion_id uuid references public.cotizaciones(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  contacto_id uuid references public.contactos(id) on delete set null,
  equipo_id uuid references public.machines(id) on delete set null,
  tipo text not null default 'PRE-COTIZACION',
  estado text not null default 'pre_cotizacion',
  pre_numero text,
  numero bigint,
  fecha_emision date,
  fecha_vcto date,
  rut_empresa text,
  cliente_nombre text,
  cliente_contacto text,
  cliente_rut text,
  cliente_direccion text,
  cliente_giro text,
  cliente_comuna text,
  cliente_telefono text,
  cliente_ciudad text,
  cliente_email text,
  referencia text,
  observaciones text,
  garantia text,
  condiciones text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(18,4) not null default 0,
  neto numeric(18,4) not null default 0,
  iva numeric(18,4) not null default 0,
  total numeric(18,4) not null default 0,
  data jsonb not null default '{}'::jsonb,
  emitida_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, numero),
  unique (empresa_id, pre_numero)
);

create or replace function public.next_erp_pre_cotizacion()
returns text
language plpgsql
security invoker
set search_path = public
as '
declare
  target_empresa_id uuid;
  next_num bigint;
begin
  target_empresa_id := public.current_empresa_id();

  if target_empresa_id is null then
    raise exception ''Usuario sin empresa activa'';
  end if;

  insert into public.erp_counters (empresa_id, key, last_value)
  values (target_empresa_id, ''pre_cotizacion'', 0)
  on conflict (empresa_id, key) do nothing;

  update public.erp_counters
  set last_value = last_value + 1,
      updated_at = now()
  where empresa_id = target_empresa_id
    and key = ''pre_cotizacion''
  returning last_value into next_num;

  return ''PRE-'' || lpad(next_num::text, 5, ''0'');
end;
';

create or replace function public.next_erp_cotizacion()
returns bigint
language plpgsql
security invoker
set search_path = public
as '
declare
  target_empresa_id uuid;
  next_num bigint;
begin
  target_empresa_id := public.current_empresa_id();

  if target_empresa_id is null then
    raise exception ''Usuario sin empresa activa'';
  end if;

  insert into public.erp_counters (empresa_id, key, last_value)
  values (target_empresa_id, ''cotizacion'', 11865)
  on conflict (empresa_id, key) do nothing;

  update public.erp_counters
  set last_value = last_value + 1,
      updated_at = now()
  where empresa_id = target_empresa_id
    and key = ''cotizacion''
  returning last_value into next_num;

  return next_num;
end;
';

create or replace function public.emit_erp_cotizacion(doc_id bigint)
returns public.cotizacion_documentos
language sql
security invoker
set search_path = public
as '
  with target as (
    select id, numero
    from public.cotizacion_documentos
    where id = $1
      -- En esta etapa del esquema los permisos por módulo todavía no existen.
      -- La migración de permisos redefine esta función más abajo con el control
      -- específico de cotizaciones.
      and public.is_empresa_member(empresa_id)
    for update
  ),
  next_number as (
    select
      case
        when exists (select 1 from target where numero is null)
        then public.next_erp_cotizacion()
      end as numero
  ),
  updated as (
    update public.cotizacion_documentos cd
    set numero = coalesce(cd.numero, next_number.numero),
        tipo = ''COTIZACION'',
        estado = ''cotizacion_emitida'',
        emitida_at = coalesce(cd.emitida_at, now()),
        updated_at = now(),
        data = coalesce(cd.data, ''{}''::jsonb)
          || jsonb_build_object(
            ''numero'', coalesce(cd.numero, next_number.numero)::text,
            ''tipo'', ''COTIZACION'',
            ''estado'', ''cotizacion_emitida'',
            ''numeroReservado'', true,
            ''dirty'', false,
            ''savedAt'', now()::text
          )
    from target, next_number
    where cd.id = target.id
    returning cd.*
  )
  select *
  from updated
';

create or replace function public.sync_cotizacion_documento_relaciones()
returns trigger
language plpgsql
security definer
set search_path = public
as '
begin
  if new.empresa_id is null then
    return new;
  end if;

  if new.cliente_id is null and nullif(trim(coalesce(new.cliente_nombre, '''')), '''') is not null then
    if nullif(trim(coalesce(new.cliente_rut, '''')), '''') is not null then
      new.cliente_id := (
        with upserted as (
          insert into public.clientes (
            empresa_id,
            razon_social,
            rut,
            giro,
            email,
            telefono,
            direccion,
            comuna,
            ciudad
          )
          values (
            new.empresa_id,
            trim(new.cliente_nombre),
            trim(new.cliente_rut),
            nullif(trim(coalesce(new.cliente_giro, '''')), ''''),
            nullif(trim(coalesce(new.cliente_email, '''')), ''''),
            nullif(trim(coalesce(new.cliente_telefono, '''')), ''''),
            nullif(trim(coalesce(new.cliente_direccion, '''')), ''''),
            nullif(trim(coalesce(new.cliente_comuna, '''')), ''''),
            nullif(trim(coalesce(new.cliente_ciudad, '''')), '''')
          )
          on conflict (empresa_id, rut) do update
            set razon_social = excluded.razon_social,
                giro = coalesce(excluded.giro, public.clientes.giro),
                email = coalesce(excluded.email, public.clientes.email),
                telefono = coalesce(excluded.telefono, public.clientes.telefono),
                direccion = coalesce(excluded.direccion, public.clientes.direccion),
                comuna = coalesce(excluded.comuna, public.clientes.comuna),
                ciudad = coalesce(excluded.ciudad, public.clientes.ciudad),
                updated_at = now()
          returning id
        )
        select id from upserted
      );
    else
      new.cliente_id := (
        select id
        from public.clientes
        where empresa_id = new.empresa_id
          and lower(razon_social) = lower(trim(new.cliente_nombre))
        order by created_at asc
        limit 1
      );

      if new.cliente_id is null then
        new.cliente_id := (
          with inserted as (
            insert into public.clientes (
              empresa_id,
              razon_social,
              email,
              telefono,
              direccion,
              comuna,
              ciudad
            )
            values (
              new.empresa_id,
              trim(new.cliente_nombre),
              nullif(trim(coalesce(new.cliente_email, '''')), ''''),
              nullif(trim(coalesce(new.cliente_telefono, '''')), ''''),
              nullif(trim(coalesce(new.cliente_direccion, '''')), ''''),
              nullif(trim(coalesce(new.cliente_comuna, '''')), ''''),
              nullif(trim(coalesce(new.cliente_ciudad, '''')), '''')
            )
            returning id
          )
          select id from inserted
        );
      end if;
    end if;
  end if;

  if new.cliente_id is not null
    and new.contacto_id is null
    and nullif(trim(coalesce(new.cliente_contacto, '''')), '''') is not null then

    if nullif(trim(coalesce(new.cliente_email, '''')), '''') is not null then
      new.contacto_id := (
        select id
        from public.contactos
        where empresa_id = new.empresa_id
          and cliente_id = new.cliente_id
          and lower(email) = lower(trim(new.cliente_email))
        order by created_at asc
        limit 1
      );
    end if;

    if new.contacto_id is null then
      new.contacto_id := (
        select id
        from public.contactos
        where empresa_id = new.empresa_id
          and cliente_id = new.cliente_id
          and lower(nombre) = lower(trim(new.cliente_contacto))
        order by created_at asc
        limit 1
      );
    end if;

    if new.contacto_id is null then
      new.contacto_id := (
        with inserted as (
          insert into public.contactos (
            empresa_id,
            cliente_id,
            nombre,
            email,
            telefono,
            principal
          )
          values (
            new.empresa_id,
            new.cliente_id,
            trim(new.cliente_contacto),
            nullif(trim(coalesce(new.cliente_email, '''')), ''''),
            nullif(trim(coalesce(new.cliente_telefono, '''')), ''''),
            true
          )
          returning id
        )
        select id from inserted
      );
    end if;
  end if;

  return new;
end;
';

create table if not exists public.ordenes_trabajo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  contacto_id uuid references public.contactos(id) on delete set null,
  equipo_id uuid references public.machines(id) on delete set null,
  cotizacion_id uuid references public.cotizaciones(id) on delete set null,
  folio text not null,
  titulo text,
  estado text not null default 'recibida' check (estado in ('recibida', 'diagnostico', 'esperando_aprobacion', 'en_reparacion', 'pruebas', 'lista', 'entregada', 'cerrada', 'cancelada')),
  prioridad text not null default 'normal' check (prioridad in ('baja', 'normal', 'alta', 'urgente')),
  descripcion_problema text,
  diagnostico text,
  solucion text,
  responsable_id uuid references auth.users(id),
  fecha_ingreso timestamptz not null default now(),
  fecha_prometida date,
  fecha_cierre timestamptz,
  horas_estimadas numeric,
  horas_reales numeric,
  costo_estimado numeric,
  costo_real numeric,
  precio_final numeric,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, folio)
);

create or replace function public.crear_ot_desde_cotizacion_documento(doc_id bigint)
returns public.ordenes_trabajo
language sql
security invoker
set search_path = public
as '
  with documento as (
    select *
    from public.cotizacion_documentos
    where id = $1
      and public.is_empresa_member(empresa_id)
  ),
  preparada as (
    select
      documento.*,
      ''OT-'' || coalesce(documento.numero::text, documento.pre_numero, documento.id::text) as folio_ot
    from documento
  ),
  creada as (
    insert into public.ordenes_trabajo (
      empresa_id,
      cliente_id,
      contacto_id,
      equipo_id,
      cotizacion_id,
      folio,
      titulo,
      estado,
      prioridad,
      descripcion_problema,
      created_by
    )
    select
      preparada.empresa_id,
      preparada.cliente_id,
      preparada.contacto_id,
      preparada.equipo_id,
      preparada.cotizacion_id,
      preparada.folio_ot,
      ''Servicio desde cotización '' || coalesce(preparada.numero::text, preparada.pre_numero, preparada.id::text),
      ''recibida'',
      ''normal'',
      nullif(trim(coalesce(preparada.referencia, preparada.observaciones, '''')), ''''),
      auth.uid()
    from preparada
    where not exists (
      select 1
      from public.ordenes_trabajo ot
      where ot.empresa_id = preparada.empresa_id
        and ot.folio = preparada.folio_ot
    )
    returning *
  ),
  existente as (
    select ot.*
    from public.ordenes_trabajo ot
    join preparada on preparada.empresa_id = ot.empresa_id
      and preparada.folio_ot = ot.folio
  )
  select *
  from creada
  union all
  select *
  from existente
  limit 1
';


create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  equipo_id uuid references public.machines(id) on delete set null,
  title text not null,
  audit_type text not null default 'inventario' check (audit_type in ('inventario', 'mantencion', 'seguridad', 'general')),
  status text not null default 'pendiente' check (status in ('pendiente', 'en_proceso', 'completada', 'observada')),
  responsible text,
  scheduled_date date,
  completed_date date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipo_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  equipo_id uuid not null references public.machines(id) on delete cascade,
  orden_trabajo_id uuid references public.ordenes_trabajo(id) on delete set null,
  cotizacion_id uuid references public.cotizaciones(id) on delete set null,
  audit_id uuid references public.audits(id) on delete set null,
  tipo text not null default 'nota' check (tipo in ('ingreso', 'diagnostico', 'reparacion', 'prueba', 'entrega', 'auditoria', 'cambio_estado', 'foto', 'repuesto', 'nota')),
  titulo text not null,
  descripcion text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.archivos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  entidad_tipo text not null check (entidad_tipo in ('cliente', 'equipo', 'cotizacion', 'orden_trabajo', 'auditoria', 'evento')),
  entidad_id uuid not null,
  bucket text not null default 'erp',
  path text not null,
  nombre text not null,
  mime_type text,
  size_bytes bigint,
  descripcion text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.import_logs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  import_type text not null,
  total_rows integer not null default 0,
  success_rows integer not null default 0,
  error_rows integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

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

create or replace function public.generar_recomendaciones_google_ads(p_fecha date default current_date)
returns integer
language plpgsql
security invoker
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
  select
    m.empresa_id,
    m.campana_id,
    m.fecha,
    ''alta'',
    ''Revisar conversiones sin resultados'',
    ''La campaña '' || c.nombre || '' registra '' || m.clics || '' clics y ninguna conversión. Revisar medición, términos y página de destino.''
  from public.google_ads_metricas_diarias m
  join public.google_ads_campanas c on c.id = m.campana_id
  where m.empresa_id = target_empresa_id and m.fecha = p_fecha and m.clics >= 20 and m.conversiones = 0
  on conflict (empresa_id, campana_id, fecha, titulo) do nothing;
  get diagnostics affected = row_count;
  total_inserted := total_inserted + affected;

  insert into public.google_ads_recomendaciones (empresa_id, campana_id, fecha, prioridad, titulo, detalle)
  select
    m.empresa_id,
    m.campana_id,
    m.fecha,
    ''media'',
    ''Mejorar anuncios con CTR bajo'',
    ''La campaña '' || c.nombre || '' tiene CTR bajo 3%. Probar títulos más específicos y agregar búsquedas irrelevantes como negativas.''
  from public.google_ads_metricas_diarias m
  join public.google_ads_campanas c on c.id = m.campana_id
  where m.empresa_id = target_empresa_id and m.fecha = p_fecha and m.impresiones >= 100
    and (m.clics::numeric / nullif(m.impresiones, 0)) * 100 < 3
  on conflict (empresa_id, campana_id, fecha, titulo) do nothing;
  get diagnostics affected = row_count;
  total_inserted := total_inserted + affected;

  insert into public.google_ads_recomendaciones (empresa_id, campana_id, fecha, prioridad, titulo, detalle)
  select
    m.empresa_id,
    m.campana_id,
    m.fecha,
    ''media'',
    ''Revisar limitación por presupuesto'',
    ''La campaña '' || c.nombre || '' pierde '' || round(m.perdida_presupuesto, 1) || ''% de impresiones por presupuesto. Priorizar horarios y términos que convierten antes de aumentarlo.''
  from public.google_ads_metricas_diarias m
  join public.google_ads_campanas c on c.id = m.campana_id
  where m.empresa_id = target_empresa_id and m.fecha = p_fecha and m.perdida_presupuesto >= 15
  on conflict (empresa_id, campana_id, fecha, titulo) do nothing;
  get diagnostics affected = row_count;
  total_inserted := total_inserted + affected;

  insert into public.google_ads_recomendaciones (empresa_id, campana_id, fecha, prioridad, titulo, detalle)
  select
    m.empresa_id,
    m.campana_id,
    m.fecha,
    ''alta'',
    ''CPA sobre el objetivo'',
    ''La campaña '' || c.nombre || '' supera en más de 25% su CPA objetivo. Revisar términos, ubicaciones y ofertas.''
  from public.google_ads_metricas_diarias m
  join public.google_ads_campanas c on c.id = m.campana_id
  where m.empresa_id = target_empresa_id and m.fecha = p_fecha and m.conversiones > 0 and c.objetivo_cpa > 0
    and (m.costo / nullif(m.conversiones, 0)) > c.objetivo_cpa * 1.25
  on conflict (empresa_id, campana_id, fecha, titulo) do nothing;
  get diagnostics affected = row_count;
  total_inserted := total_inserted + affected;

  return total_inserted;
end;
';

create table if not exists public.crm_oportunidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  contacto_id uuid references public.contactos(id) on delete set null,
  cotizacion_id uuid references public.cotizaciones(id) on delete set null,
  nombre text not null,
  etapa text not null default 'prospecto' check (etapa in ('prospecto', 'contactado', 'cotizando', 'negociacion', 'ganada', 'perdida')),
  valor_estimado numeric not null default 0,
  probabilidad integer not null default 0 check (probabilidad between 0 and 100),
  fecha_cierre_estimada date,
  responsable_id uuid references auth.users(id),
  notas text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_mensajes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  contacto_id uuid references public.contactos(id) on delete set null,
  orden_trabajo_id uuid references public.ordenes_trabajo(id) on delete set null,
  cotizacion_id uuid references public.cotizaciones(id) on delete set null,
  telefono text not null,
  plantilla text,
  mensaje text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'fallido', 'cancelado')),
  provider_message_id text,
  error text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.ia_consultas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  equipo_id uuid references public.machines(id) on delete set null,
  orden_trabajo_id uuid references public.ordenes_trabajo(id) on delete set null,
  tipo text not null default 'tecnica',
  pregunta text not null,
  respuesta text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_usuarios_empresas_user on public.usuarios_empresas(user_id);
create index if not exists idx_usuario_empresa_activa_empresa on public.usuario_empresa_activa(empresa_id);
create index if not exists idx_clientes_empresa on public.clientes(empresa_id);
create index if not exists idx_contactos_cliente on public.contactos(cliente_id);
create index if not exists idx_machines_empresa on public.machines(empresa_id);
create index if not exists idx_machines_cliente on public.machines(cliente_id);
create index if not exists idx_machines_qr_token on public.machines(qr_token);
create index if not exists idx_spare_parts_empresa on public.spare_parts(empresa_id);
create index if not exists idx_erp_counters_empresa_key on public.erp_counters(empresa_id, key);
create index if not exists idx_cotizaciones_empresa_estado on public.cotizaciones(empresa_id, estado);
create index if not exists idx_cotizacion_documentos_empresa_estado on public.cotizacion_documentos(empresa_id, estado);
create index if not exists idx_cotizacion_documentos_numero on public.cotizacion_documentos(empresa_id, numero);
create index if not exists idx_ordenes_empresa_estado on public.ordenes_trabajo(empresa_id, estado);
create index if not exists idx_eventos_equipo_created on public.equipo_eventos(equipo_id, created_at desc);
create index if not exists idx_archivos_entidad on public.archivos(entidad_tipo, entidad_id);
create index if not exists idx_personas_empresa_tipo on public.personas(empresa_id, tipo_relacion);
create index if not exists idx_pagos_personas_empresa_periodo on public.pagos_personas(empresa_id, periodo);
create index if not exists idx_documentos_personas_persona on public.documentos_personas(persona_id);
create index if not exists idx_horas_extra_empresa_fecha on public.horas_extra(empresa_id, fecha desc);
create index if not exists idx_horas_extra_persona_estado on public.horas_extra(persona_id, estado);
create index if not exists idx_google_ads_campanas_empresa on public.google_ads_campanas(empresa_id, estado);
create index if not exists idx_google_ads_metricas_empresa_fecha on public.google_ads_metricas_diarias(empresa_id, fecha desc);
create index if not exists idx_google_ads_recomendaciones_estado on public.google_ads_recomendaciones(empresa_id, estado, fecha desc);
create index if not exists idx_crm_empresa_etapa on public.crm_oportunidades(empresa_id, etapa);

drop trigger if exists set_empresas_updated_at on public.empresas;
create trigger set_empresas_updated_at before update on public.empresas for each row execute function public.set_updated_at();
drop trigger if exists set_usuarios_empresas_updated_at on public.usuarios_empresas;
create trigger set_usuarios_empresas_updated_at before update on public.usuarios_empresas for each row execute function public.set_updated_at();
drop trigger if exists set_usuario_empresa_activa_updated_at on public.usuario_empresa_activa;
create trigger set_usuario_empresa_activa_updated_at before update on public.usuario_empresa_activa for each row execute function public.set_updated_at();
drop trigger if exists set_clientes_updated_at on public.clientes;
create trigger set_clientes_updated_at before update on public.clientes for each row execute function public.set_updated_at();
drop trigger if exists set_contactos_updated_at on public.contactos;
create trigger set_contactos_updated_at before update on public.contactos for each row execute function public.set_updated_at();
drop trigger if exists set_machines_updated_at on public.machines;
create trigger set_machines_updated_at before update on public.machines for each row execute function public.set_updated_at();
drop trigger if exists set_spare_parts_updated_at on public.spare_parts;
create trigger set_spare_parts_updated_at before update on public.spare_parts for each row execute function public.set_updated_at();
drop trigger if exists set_erp_counters_updated_at on public.erp_counters;
create trigger set_erp_counters_updated_at before update on public.erp_counters for each row execute function public.set_updated_at();
drop trigger if exists set_cotizaciones_updated_at on public.cotizaciones;
create trigger set_cotizaciones_updated_at before update on public.cotizaciones for each row execute function public.set_updated_at();
drop trigger if exists set_cotizacion_documentos_updated_at on public.cotizacion_documentos;
create trigger set_cotizacion_documentos_updated_at before update on public.cotizacion_documentos for each row execute function public.set_updated_at();
drop trigger if exists sync_cotizacion_documento_relaciones on public.cotizacion_documentos;
create trigger sync_cotizacion_documento_relaciones before insert or update on public.cotizacion_documentos for each row execute function public.sync_cotizacion_documento_relaciones();
drop trigger if exists set_ordenes_trabajo_updated_at on public.ordenes_trabajo;
create trigger set_ordenes_trabajo_updated_at before update on public.ordenes_trabajo for each row execute function public.set_updated_at();
drop trigger if exists set_audits_updated_at on public.audits;
create trigger set_audits_updated_at before update on public.audits for each row execute function public.set_updated_at();
drop trigger if exists set_crm_oportunidades_updated_at on public.crm_oportunidades;
create trigger set_crm_oportunidades_updated_at before update on public.crm_oportunidades for each row execute function public.set_updated_at();
drop trigger if exists set_personas_updated_at on public.personas;
create trigger set_personas_updated_at before update on public.personas for each row execute function public.set_updated_at();
drop trigger if exists set_pagos_personas_updated_at on public.pagos_personas;
create trigger set_pagos_personas_updated_at before update on public.pagos_personas for each row execute function public.set_updated_at();
drop trigger if exists set_horas_extra_updated_at on public.horas_extra;
create trigger set_horas_extra_updated_at before update on public.horas_extra for each row execute function public.set_updated_at();
drop trigger if exists set_google_ads_campanas_updated_at on public.google_ads_campanas;
create trigger set_google_ads_campanas_updated_at before update on public.google_ads_campanas for each row execute function public.set_updated_at();
drop trigger if exists set_google_ads_metricas_updated_at on public.google_ads_metricas_diarias;
create trigger set_google_ads_metricas_updated_at before update on public.google_ads_metricas_diarias for each row execute function public.set_updated_at();

alter table public.empresas enable row level security;
alter table public.usuarios_empresas enable row level security;
alter table public.usuario_empresa_activa enable row level security;
alter table public.clientes enable row level security;
alter table public.contactos enable row level security;
alter table public.machines enable row level security;
alter table public.spare_parts enable row level security;
alter table public.erp_counters enable row level security;
alter table public.cotizaciones enable row level security;
alter table public.cotizacion_items enable row level security;
alter table public.cotizacion_documentos enable row level security;
alter table public.ordenes_trabajo enable row level security;
alter table public.audits enable row level security;
alter table public.equipo_eventos enable row level security;
alter table public.archivos enable row level security;
alter table public.import_logs enable row level security;
alter table public.personas enable row level security;
alter table public.pagos_personas enable row level security;
alter table public.documentos_personas enable row level security;
alter table public.horas_extra enable row level security;
alter table public.google_ads_campanas enable row level security;
alter table public.google_ads_metricas_diarias enable row level security;
alter table public.google_ads_recomendaciones enable row level security;
alter table public.crm_oportunidades enable row level security;
alter table public.whatsapp_mensajes enable row level security;
alter table public.ia_consultas enable row level security;

drop policy if exists "empresas select by member" on public.empresas;
create policy "empresas select by member" on public.empresas for select to authenticated using (public.is_empresa_member(id));
drop policy if exists "empresas insert authenticated" on public.empresas;
create policy "empresas insert authenticated" on public.empresas for insert to authenticated with check (true);
drop policy if exists "empresas update by admin" on public.empresas;
create policy "empresas update by admin" on public.empresas for update to authenticated using (public.is_empresa_admin(id)) with check (public.is_empresa_admin(id));

drop policy if exists "usuarios_empresas select by member" on public.usuarios_empresas;
create policy "usuarios_empresas select by member" on public.usuarios_empresas for select to authenticated using (public.is_empresa_member(empresa_id) or user_id = auth.uid());
drop policy if exists "usuarios_empresas insert bootstrap or admin" on public.usuarios_empresas;
create policy "usuarios_empresas insert bootstrap or admin" on public.usuarios_empresas
for insert to authenticated
with check (
  public.is_empresa_admin(empresa_id)
  or (
    user_id = auth.uid()
    and rol = 'owner'
    and public.empresa_has_members(empresa_id) = false
  )
);
drop policy if exists "usuarios_empresas update by admin" on public.usuarios_empresas;
create policy "usuarios_empresas update by admin" on public.usuarios_empresas for update to authenticated using (public.is_empresa_admin(empresa_id)) with check (public.is_empresa_admin(empresa_id));

drop policy if exists "usuario_empresa_activa own access" on public.usuario_empresa_activa;
create policy "usuario_empresa_activa own access" on public.usuario_empresa_activa for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_empresa_member(empresa_id));

drop policy if exists "clientes tenant access" on public.clientes;
create policy "clientes tenant access" on public.clientes for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "contactos tenant access" on public.contactos;
create policy "contactos tenant access" on public.contactos for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "machines tenant access" on public.machines;
create policy "machines tenant access" on public.machines for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "spare_parts tenant access" on public.spare_parts;
create policy "spare_parts tenant access" on public.spare_parts for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "erp_counters tenant access" on public.erp_counters;
create policy "erp_counters tenant access" on public.erp_counters for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "cotizaciones tenant access" on public.cotizaciones;
create policy "cotizaciones tenant access" on public.cotizaciones for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "cotizacion_items tenant access" on public.cotizacion_items;
create policy "cotizacion_items tenant access" on public.cotizacion_items for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "cotizacion_documentos tenant access" on public.cotizacion_documentos;
create policy "cotizacion_documentos tenant access" on public.cotizacion_documentos for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "ordenes_trabajo tenant access" on public.ordenes_trabajo;
create policy "ordenes_trabajo tenant access" on public.ordenes_trabajo for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "audits tenant access" on public.audits;
create policy "audits tenant access" on public.audits for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "equipo_eventos tenant access" on public.equipo_eventos;
create policy "equipo_eventos tenant access" on public.equipo_eventos for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "archivos tenant access" on public.archivos;
create policy "archivos tenant access" on public.archivos for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "import_logs tenant access" on public.import_logs;
create policy "import_logs tenant access" on public.import_logs for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "personas tenant access" on public.personas;
create policy "personas tenant access" on public.personas for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "pagos_personas tenant access" on public.pagos_personas;
create policy "pagos_personas tenant access" on public.pagos_personas for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "documentos_personas tenant access" on public.documentos_personas;
create policy "documentos_personas tenant access" on public.documentos_personas for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "horas_extra tenant access" on public.horas_extra;
create policy "horas_extra tenant access" on public.horas_extra for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "google_ads_campanas tenant access" on public.google_ads_campanas;
create policy "google_ads_campanas tenant access" on public.google_ads_campanas for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "google_ads_metricas tenant access" on public.google_ads_metricas_diarias;
create policy "google_ads_metricas tenant access" on public.google_ads_metricas_diarias for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "google_ads_recomendaciones tenant access" on public.google_ads_recomendaciones;
create policy "google_ads_recomendaciones tenant access" on public.google_ads_recomendaciones for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "crm_oportunidades tenant access" on public.crm_oportunidades;
create policy "crm_oportunidades tenant access" on public.crm_oportunidades for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "whatsapp_mensajes tenant access" on public.whatsapp_mensajes;
create policy "whatsapp_mensajes tenant access" on public.whatsapp_mensajes for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "ia_consultas tenant access" on public.ia_consultas;
create policy "ia_consultas tenant access" on public.ia_consultas for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));

drop policy if exists "machines public qr read" on public.machines;
create policy "machines public qr read" on public.machines for select to anon using (qr_enabled = true and public_view_enabled = true);

insert into storage.buckets (id, name, public)
values ('erp', 'erp', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('empresa-assets', 'empresa-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "empresa_assets public read" on storage.objects;
create policy "empresa_assets public read" on storage.objects for select using (bucket_id = 'empresa-assets');
drop policy if exists "empresa_assets authenticated insert" on storage.objects;
create policy "empresa_assets authenticated insert" on storage.objects for insert to authenticated with check (bucket_id = 'empresa-assets');
drop policy if exists "empresa_assets authenticated update" on storage.objects;
create policy "empresa_assets authenticated update" on storage.objects for update to authenticated using (bucket_id = 'empresa-assets') with check (bucket_id = 'empresa-assets');
drop policy if exists "empresa_assets authenticated delete" on storage.objects;
create policy "empresa_assets authenticated delete" on storage.objects for delete to authenticated using (bucket_id = 'empresa-assets');

grant execute on function public.next_erp_pre_cotizacion() to authenticated;
grant execute on function public.next_erp_cotizacion() to authenticated;
grant execute on function public.emit_erp_cotizacion(bigint) to authenticated;
grant execute on function public.crear_ot_desde_cotizacion_documento(bigint) to authenticated;
grant execute on function public.bootstrap_empresa_tecnica_hidraulica() to authenticated;
grant execute on function public.create_empresa_owner(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.set_empresa_activa(uuid) to authenticated;
grant execute on function public.generar_recomendaciones_google_ads(date) to authenticated;

-- Empresas asociadas y flota vehicular
create table if not exists public.empresas_asociadas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  tipo text not null default 'proveedor' check (tipo in ('cliente', 'proveedor', 'contratista', 'taller', 'leasing', 'partner', 'otra')),
  razon_social text not null,
  nombre_fantasia text,
  rut text,
  contacto_nombre text,
  contacto_cargo text,
  email text,
  telefono text,
  direccion text,
  sitio_web text,
  servicios text,
  estado text not null default 'activa' check (estado in ('activa', 'inactiva')),
  notas text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, rut)
);

create table if not exists public.vehiculos_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  empresa_asociada_id uuid references public.empresas_asociadas(id) on delete set null,
  conductor_id uuid references public.personas(id) on delete set null,
  patente text not null,
  tipo text not null default 'camioneta' check (tipo in ('camioneta', 'automovil', 'camion', 'furgon', 'moto', 'maquinaria', 'otro')),
  propiedad text not null default 'propio' check (propiedad in ('propio', 'leasing', 'arrendado', 'comodato')),
  marca text not null,
  modelo text not null,
  anio smallint check (anio is null or anio between 1900 and 2200),
  color text,
  combustible text,
  kilometraje numeric not null default 0 check (kilometraje >= 0),
  estado text not null default 'operativo' check (estado in ('operativo', 'mantenimiento', 'fuera_servicio', 'vendido')),
  ubicacion text,
  revision_tecnica_vencimiento date,
  permiso_circulacion_vencimiento date,
  seguro_vencimiento date,
  mantencion_proxima_fecha date,
  mantencion_proximo_km numeric check (mantencion_proximo_km is null or mantencion_proximo_km >= 0),
  notas text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, patente)
);

create index if not exists idx_empresas_asociadas_empresa_tipo on public.empresas_asociadas(empresa_id, tipo, estado);
create index if not exists idx_vehiculos_empresa_estado on public.vehiculos_empresa(empresa_id, estado);
create index if not exists idx_vehiculos_empresa_conductor on public.vehiculos_empresa(conductor_id);
create index if not exists idx_vehiculos_empresa_asociada on public.vehiculos_empresa(empresa_asociada_id);
create index if not exists idx_vehiculos_empresa_vencimientos on public.vehiculos_empresa(empresa_id, revision_tecnica_vencimiento, permiso_circulacion_vencimiento, seguro_vencimiento);

create or replace function public.validar_relaciones_vehiculo()
returns trigger
language plpgsql
security definer
set search_path = public
as '
begin
  if new.empresa_asociada_id is not null and not exists (
    select 1 from public.empresas_asociadas ea
    where ea.id = new.empresa_asociada_id and ea.empresa_id = new.empresa_id
  ) then
    raise exception ''La empresa asociada no pertenece a la empresa activa'';
  end if;

  if new.conductor_id is not null and not exists (
    select 1 from public.personas p
    where p.id = new.conductor_id and p.empresa_id = new.empresa_id and p.activo = true
  ) then
    raise exception ''El conductor no pertenece a la empresa activa'';
  end if;

  return new;
end;
';

drop trigger if exists set_empresas_asociadas_updated_at on public.empresas_asociadas;
create trigger set_empresas_asociadas_updated_at before update on public.empresas_asociadas for each row execute function public.set_updated_at();
drop trigger if exists set_vehiculos_empresa_updated_at on public.vehiculos_empresa;
create trigger set_vehiculos_empresa_updated_at before update on public.vehiculos_empresa for each row execute function public.set_updated_at();
drop trigger if exists validar_relaciones_vehiculo on public.vehiculos_empresa;
create trigger validar_relaciones_vehiculo before insert or update on public.vehiculos_empresa for each row execute function public.validar_relaciones_vehiculo();

alter table public.empresas_asociadas enable row level security;
alter table public.vehiculos_empresa enable row level security;

drop policy if exists "empresas_asociadas tenant access" on public.empresas_asociadas;
create policy "empresas_asociadas tenant access" on public.empresas_asociadas for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "vehiculos_empresa tenant access" on public.vehiculos_empresa;
create policy "vehiculos_empresa tenant access" on public.vehiculos_empresa for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));

grant select, insert, update, delete on public.empresas_asociadas to authenticated;
grant select, insert, update, delete on public.vehiculos_empresa to authenticated;

notify pgrst, 'reload schema';

-- Perfiles de usuario y administracion de cuentas (patch 16).
-- El catalogo se declara aqui para que las funciones de detalle puedan
-- validarse; el patch de permisos completa sus indices, trigger y politicas.
create table if not exists public.usuario_permisos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  modulo text not null check (modulo in (
    'dashboard', 'google_ads', 'clientes', 'empresas_asociadas',
    'presupuestos', 'cotizaciones', 'publicaciones', 'ordenes',
    'crm', 'whatsapp', 'personas_pagos', 'flota', 'maquinaria',
    'repuestos', 'epp_ropa', 'auditorias', 'importar_excel',
    'ia', 'configuracion', 'usuarios_permisos'
  )),
  permitido boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, user_id, modulo)
);

create table if not exists public.perfiles_usuarios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text not null check (length(trim(nombre_completo)) >= 2),
  creado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_perfiles_usuarios_nombre
  on public.perfiles_usuarios(lower(nombre_completo));

drop trigger if exists set_perfiles_usuarios_updated_at on public.perfiles_usuarios;
create trigger set_perfiles_usuarios_updated_at
before update on public.perfiles_usuarios
for each row execute function public.set_updated_at();

insert into public.perfiles_usuarios (user_id, nombre_completo, creado_por)
select
  au.id,
  coalesce(
    nullif(trim(au.raw_user_meta_data ->> 'erp_nombre'), ''),
    nullif(trim(au.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(au.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(au.email, 'Usuario TH'), '@', 1)
  ),
  au.id
from auth.users au
where exists (
  select 1
  from public.usuarios_empresas ue
  where ue.user_id = au.id
)
on conflict (user_id) do nothing;

alter table public.perfiles_usuarios enable row level security;

drop policy if exists "perfiles own or shared admin read" on public.perfiles_usuarios;
create policy "perfiles own or shared admin read"
on public.perfiles_usuarios for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.usuarios_empresas target_membership
    where target_membership.user_id = perfiles_usuarios.user_id
      and public.is_empresa_admin(target_membership.empresa_id)
  )
);

drop policy if exists "perfiles own or shared admin insert" on public.perfiles_usuarios;
create policy "perfiles own or shared admin insert"
on public.perfiles_usuarios for insert to authenticated
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.usuarios_empresas target_membership
    where target_membership.user_id = perfiles_usuarios.user_id
      and public.is_empresa_admin(target_membership.empresa_id)
  )
);

drop policy if exists "perfiles own or shared admin update" on public.perfiles_usuarios;
create policy "perfiles own or shared admin update"
on public.perfiles_usuarios for update to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.usuarios_empresas target_membership
    where target_membership.user_id = perfiles_usuarios.user_id
      and public.is_empresa_admin(target_membership.empresa_id)
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.usuarios_empresas target_membership
    where target_membership.user_id = perfiles_usuarios.user_id
      and public.is_empresa_admin(target_membership.empresa_id)
  )
);

create or replace function public.listar_usuarios_empresa_detalle(p_empresa_id uuid)
returns table (
  user_id uuid,
  email text,
  nombre_completo text,
  rol text,
  activo boolean,
  modulos text[]
)
language sql
stable
security definer
set search_path = public, auth
as '
  select
    ue.user_id,
    au.email::text,
    coalesce(
      nullif(trim(pu.nombre_completo), ''''),
      nullif(trim(au.raw_user_meta_data ->> ''erp_nombre''), ''''),
      nullif(trim(au.raw_user_meta_data ->> ''full_name''), ''''),
      nullif(trim(au.raw_user_meta_data ->> ''name''), ''''),
      split_part(coalesce(au.email, ''Usuario TH''), ''@'', 1)
    )::text as nombre_completo,
    ue.rol,
    ue.activo,
    case
      when ue.rol in (''owner'', ''admin'') then array[
        ''dashboard'', ''google_ads'', ''clientes'', ''empresas_asociadas'',
        ''presupuestos'', ''cotizaciones'', ''publicaciones'', ''ordenes'',
        ''crm'', ''whatsapp'', ''personas_pagos'', ''flota'', ''maquinaria'',
        ''repuestos'', ''epp_ropa'', ''auditorias'', ''importar_excel'',
        ''ia'', ''configuracion'', ''usuarios_permisos''
      ]::text[]
      else coalesce((
        select array_agg(up.modulo order by up.modulo)
        from public.usuario_permisos up
        where up.empresa_id = ue.empresa_id
          and up.user_id = ue.user_id
          and up.permitido = true
      ), array[]::text[])
    end as modulos
  from public.usuarios_empresas ue
  join auth.users au on au.id = ue.user_id
  left join public.perfiles_usuarios pu on pu.user_id = ue.user_id
  where ue.empresa_id = p_empresa_id
    and public.is_empresa_admin(p_empresa_id)
  order by
    case ue.rol when ''owner'' then 0 when ''admin'' then 1 else 2 end,
    lower(coalesce(pu.nombre_completo, au.email))
';

create or replace function public.actualizar_nombre_usuario_empresa(
  p_empresa_id uuid,
  p_user_id uuid,
  p_nombre_completo text
)
returns boolean
language sql
security definer
set search_path = public
as '
  with allowed as (
    select ue.user_id
    from public.usuarios_empresas ue
    where ue.empresa_id = p_empresa_id
      and ue.user_id = p_user_id
      and public.is_empresa_admin(p_empresa_id)
      and length(trim(coalesce(p_nombre_completo, ''''))) >= 2
    limit 1
  ),
  written as (
    insert into public.perfiles_usuarios (user_id, nombre_completo, creado_por)
    select allowed.user_id, trim(p_nombre_completo), auth.uid()
    from allowed
    on conflict (user_id) do update
      set nombre_completo = excluded.nombre_completo,
          updated_at = now()
    returning user_id
  )
  select exists(select 1 from written)
';

grant select, insert, update on public.perfiles_usuarios to authenticated;
grant execute on function public.listar_usuarios_empresa_detalle(uuid) to authenticated;
grant execute on function public.actualizar_nombre_usuario_empresa(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- Inventario EPP/ropa y tallas de trabajadores
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

-- Catálogo comercial y publicaciones por plataforma
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

-- Usuarios y permisos por módulo para cada empresa.
-- Requiere haber ejecutado los parches anteriores, incluido 14_epp_ropa_inventario.sql.

alter table public.usuarios_empresas
  add column if not exists permisos_inicializados boolean not null default false;

create table if not exists public.usuario_permisos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  modulo text not null check (modulo in (
    'dashboard', 'google_ads', 'clientes', 'empresas_asociadas',
    'presupuestos', 'cotizaciones', 'publicaciones', 'ordenes',
    'crm', 'whatsapp', 'personas_pagos', 'flota', 'maquinaria',
    'repuestos', 'epp_ropa', 'auditorias', 'importar_excel',
    'ia', 'configuracion', 'usuarios_permisos'
  )),
  permitido boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, user_id, modulo)
);

create index if not exists idx_usuario_permisos_empresa_usuario
  on public.usuario_permisos(empresa_id, user_id);

drop trigger if exists set_usuario_permisos_updated_at on public.usuario_permisos;
create trigger set_usuario_permisos_updated_at
before update on public.usuario_permisos
for each row execute function public.set_updated_at();

create or replace function public.has_module_permission(target_empresa_id uuid, target_module text)
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
      and (
        ue.rol in (''owner'', ''admin'')
        or (target_module not in (''configuracion'', ''usuarios_permisos'') and exists (
          select 1
          from public.usuario_permisos up
          where up.empresa_id = target_empresa_id
            and up.user_id = auth.uid()
            and up.modulo = target_module
            and up.permitido = true
        ))
      )
  )
';

create or replace function public.has_any_module_permission(target_empresa_id uuid, target_modules text[])
returns boolean
language sql
stable
security definer
set search_path = public
as '
  select exists (
    select 1
    from unnest(coalesce(target_modules, array[]::text[])) as requested(module_key)
    where public.has_module_permission(target_empresa_id, requested.module_key)
  )
';

create or replace function public.mis_permisos_empresa(p_empresa_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as '
  with membership as (
    select ue.rol
    from public.usuarios_empresas ue
    where ue.empresa_id = p_empresa_id
      and ue.user_id = auth.uid()
      and ue.activo = true
    limit 1
  ),
  permission_list as (
    select coalesce(array_agg(up.modulo order by up.modulo), array[]::text[]) as modulos
    from public.usuario_permisos up
    where up.empresa_id = p_empresa_id
      and up.user_id = auth.uid()
      and up.permitido = true
  )
  select coalesce(
    (
      select to_jsonb(access_result)
      from (
        select
          membership.rol,
          membership.rol in (''owner'', ''admin'') as is_admin,
          case
            when membership.rol in (''owner'', ''admin'') then array[
              ''dashboard'', ''google_ads'', ''clientes'', ''empresas_asociadas'',
              ''presupuestos'', ''cotizaciones'', ''publicaciones'', ''ordenes'',
              ''crm'', ''whatsapp'', ''personas_pagos'', ''flota'', ''maquinaria'',
              ''repuestos'', ''epp_ropa'', ''auditorias'', ''importar_excel'',
              ''ia'', ''configuracion'', ''usuarios_permisos''
            ]::text[]
            else permission_list.modulos
          end as modulos
        from membership
        cross join permission_list
      ) access_result
    ),
    to_jsonb(empty_result)
  )
  from (
    select
      null::text as rol,
      false as is_admin,
      array[]::text[] as modulos
  ) empty_result
';

create or replace function public.listar_usuarios_empresa(p_empresa_id uuid)
returns table (
  user_id uuid,
  email text,
  rol text,
  activo boolean,
  modulos text[]
)
language sql
stable
security definer
set search_path = public, auth
as '
  select
    ue.user_id,
    au.email::text,
    ue.rol,
    ue.activo,
    case
      when ue.rol in (''owner'', ''admin'') then array[
        ''dashboard'', ''google_ads'', ''clientes'', ''empresas_asociadas'',
        ''presupuestos'', ''cotizaciones'', ''publicaciones'', ''ordenes'',
        ''crm'', ''whatsapp'', ''personas_pagos'', ''flota'', ''maquinaria'',
        ''repuestos'', ''epp_ropa'', ''auditorias'', ''importar_excel'',
        ''ia'', ''configuracion'', ''usuarios_permisos''
      ]::text[]
      else coalesce((
        select array_agg(up.modulo order by up.modulo)
        from public.usuario_permisos up
        where up.empresa_id = ue.empresa_id
          and up.user_id = ue.user_id
          and up.permitido = true
      ), array[]::text[])
    end as modulos
  from public.usuarios_empresas ue
  join auth.users au on au.id = ue.user_id
  where ue.empresa_id = p_empresa_id
    and public.is_empresa_admin(p_empresa_id)
  order by
    case ue.rol when ''owner'' then 0 when ''admin'' then 1 else 2 end,
    lower(au.email)
';

create or replace function public.guardar_permisos_usuario(
  p_empresa_id uuid,
  p_email text,
  p_rol text,
  p_modulos text[] default array[]::text[]
)
returns uuid
language sql
security definer
set search_path = public, auth
as '
  with target as (
    select au.id as user_id
    from auth.users au
    where lower(au.email) = lower(trim(coalesce(p_email, '''')))
      and p_rol = any(array[''admin'', ''operador'']::text[])
      and public.is_empresa_admin(p_empresa_id)
    limit 1
  ),
  prepared as (
    select
      target.user_id,
      coalesce((
        select ue.rol
        from public.usuarios_empresas ue
        where ue.empresa_id = p_empresa_id
          and ue.user_id = target.user_id
        limit 1
      ), '''') as existing_role
    from target
  ),
  authorized as (
    select
      prepared.user_id,
      case when prepared.existing_role = ''owner'' then ''owner'' else p_rol end as requested_role
    from prepared
    where not (
      prepared.user_id = auth.uid()
      and prepared.existing_role = any(array[''owner'', ''admin'']::text[])
      and p_rol <> ''admin''
    )
  ),
  membership_write as (
    insert into public.usuarios_empresas (
      empresa_id, user_id, rol, activo, permisos_inicializados
    )
    select
      p_empresa_id, authorized.user_id, authorized.requested_role, true, true
    from authorized
    on conflict (empresa_id, user_id) do update
      set rol = excluded.rol,
          activo = true,
          permisos_inicializados = true,
          updated_at = now()
    returning user_id, rol
  ),
  permission_write as (
    insert into public.usuario_permisos (empresa_id, user_id, modulo, permitido)
    select
      p_empresa_id,
      membership_write.user_id,
      module_catalog.modulo,
      case
        when membership_write.rol in (''owner'', ''admin'') then false
        else module_catalog.modulo = any(coalesce(p_modulos, array[]::text[]))
      end
    from membership_write
    cross join unnest(array[
      ''dashboard'', ''google_ads'', ''clientes'', ''empresas_asociadas'',
      ''presupuestos'', ''cotizaciones'', ''publicaciones'', ''ordenes'',
      ''crm'', ''whatsapp'', ''personas_pagos'', ''flota'', ''maquinaria'',
      ''repuestos'', ''epp_ropa'', ''auditorias'', ''importar_excel'', ''ia''
    ]::text[]) as module_catalog(modulo)
    on conflict (empresa_id, user_id, modulo) do update
      set permitido = excluded.permitido,
          updated_at = now()
    returning user_id
  ),
  company_write as (
    insert into public.usuario_empresa_activa (user_id, empresa_id)
    select membership_write.user_id, p_empresa_id
    from membership_write
    on conflict (user_id) do nothing
    returning user_id
  )
  select membership_write.user_id
  from membership_write
  where (select count(*) from permission_write) >= 0
    and (select count(*) from company_write) >= 0
  limit 1
';

create or replace function public.cambiar_estado_usuario_empresa(
  p_empresa_id uuid,
  p_user_id uuid,
  p_activo boolean
)
returns boolean
language sql
security definer
set search_path = public
as '
  with updated as (
    update public.usuarios_empresas ue
    set activo = p_activo,
        updated_at = now()
    where ue.empresa_id = p_empresa_id
      and ue.user_id = p_user_id
      and public.is_empresa_admin(p_empresa_id)
      and (p_activo or p_user_id <> auth.uid())
      and (p_activo or ue.rol <> ''owner'')
    returning true as changed
  )
  select exists(select 1 from updated)
';

-- usuario.general administra los permisos cuando ya pertenece a la empresa.
update public.usuarios_empresas ue
set rol = case when ue.rol = 'owner' then 'owner' else 'admin' end,
    activo = true,
    permisos_inicializados = true,
    updated_at = now()
from auth.users au
where au.id = ue.user_id
  and lower(au.email) = 'usuario.general@tecnicahidraulica.cl';

-- Conserva el acceso actual de miembros existentes la primera vez que se instala.
insert into public.usuario_permisos (empresa_id, user_id, modulo, permitido)
select ue.empresa_id, ue.user_id, module_list.modulo, true
from public.usuarios_empresas ue
cross join unnest(array[
  'dashboard', 'google_ads', 'clientes', 'empresas_asociadas',
  'presupuestos', 'cotizaciones', 'publicaciones', 'ordenes',
  'crm', 'whatsapp', 'personas_pagos', 'flota', 'maquinaria',
  'repuestos', 'epp_ropa', 'auditorias', 'importar_excel',
  'ia'
]::text[]) as module_list(modulo)
where ue.activo = true
  and ue.rol not in ('owner', 'admin')
  and ue.permisos_inicializados = false
on conflict (empresa_id, user_id, modulo) do nothing;

update public.usuarios_empresas
set permisos_inicializados = true
where permisos_inicializados = false;

alter table public.usuario_permisos enable row level security;

drop policy if exists "usuario_permisos own or admin read" on public.usuario_permisos;
create policy "usuario_permisos own or admin read"
on public.usuario_permisos for select to authenticated
using (user_id = auth.uid() or public.is_empresa_admin(empresa_id));

drop policy if exists "usuario_permisos admin write" on public.usuario_permisos;
create policy "usuario_permisos admin write"
on public.usuario_permisos for all to authenticated
using (public.is_empresa_admin(empresa_id))
with check (public.is_empresa_admin(empresa_id));

-- Las políticas siguientes protegen los datos, además de ocultar el menú.
drop policy if exists "clientes tenant access" on public.clientes;
create policy "clientes tenant access" on public.clientes for all to authenticated using (public.has_module_permission(empresa_id, 'clientes')) with check (public.has_module_permission(empresa_id, 'clientes'));
drop policy if exists "contactos tenant access" on public.contactos;
create policy "contactos tenant access" on public.contactos for all to authenticated using (public.has_module_permission(empresa_id, 'clientes')) with check (public.has_module_permission(empresa_id, 'clientes'));
drop policy if exists "machines tenant access" on public.machines;
create policy "machines tenant access" on public.machines for all to authenticated using (public.has_module_permission(empresa_id, 'maquinaria')) with check (public.has_module_permission(empresa_id, 'maquinaria'));
drop policy if exists "spare_parts tenant access" on public.spare_parts;
create policy "spare_parts tenant access" on public.spare_parts for all to authenticated using (public.has_module_permission(empresa_id, 'repuestos')) with check (public.has_module_permission(empresa_id, 'repuestos'));

-- Lecturas auxiliares necesarias para que un módulo funcione sin entregar
-- permisos de escritura ni mostrar la sección auxiliar en el menú.
drop policy if exists "clientes shared module read" on public.clientes;
create policy "clientes shared module read" on public.clientes for select to authenticated
using (public.has_any_module_permission(empresa_id, array['presupuestos', 'cotizaciones', 'ordenes', 'crm', 'whatsapp']));
drop policy if exists "contactos shared module read" on public.contactos;
create policy "contactos shared module read" on public.contactos for select to authenticated
using (public.has_any_module_permission(empresa_id, array['presupuestos', 'cotizaciones', 'ordenes', 'crm', 'whatsapp']));
drop policy if exists "machines shared module read" on public.machines;
create policy "machines shared module read" on public.machines for select to authenticated
using (public.has_any_module_permission(empresa_id, array['dashboard', 'ordenes', 'auditorias', 'ia']));
drop policy if exists "spare_parts shared module read" on public.spare_parts;
create policy "spare_parts shared module read" on public.spare_parts for select to authenticated
using (public.has_module_permission(empresa_id, 'dashboard'));

drop policy if exists "erp_counters tenant access" on public.erp_counters;
create policy "erp_counters tenant access" on public.erp_counters for all to authenticated
using (
  (key = 'pre_cotizacion' and public.has_any_module_permission(empresa_id, array['presupuestos', 'cotizaciones']))
  or (key = 'cotizacion' and public.has_module_permission(empresa_id, 'cotizaciones'))
)
with check (
  (key = 'pre_cotizacion' and public.has_any_module_permission(empresa_id, array['presupuestos', 'cotizaciones']))
  or (key = 'cotizacion' and public.has_module_permission(empresa_id, 'cotizaciones'))
);
drop policy if exists "cotizaciones tenant access" on public.cotizaciones;
create policy "cotizaciones tenant access" on public.cotizaciones for all to authenticated using (public.has_module_permission(empresa_id, 'cotizaciones')) with check (public.has_module_permission(empresa_id, 'cotizaciones'));
drop policy if exists "cotizacion_items tenant access" on public.cotizacion_items;
create policy "cotizacion_items tenant access" on public.cotizacion_items for all to authenticated using (public.has_module_permission(empresa_id, 'cotizaciones')) with check (public.has_module_permission(empresa_id, 'cotizaciones'));
drop policy if exists "cotizacion_documentos tenant access" on public.cotizacion_documentos;
drop policy if exists "cotizacion_documentos module select" on public.cotizacion_documentos;
drop policy if exists "cotizacion_documentos module insert" on public.cotizacion_documentos;
drop policy if exists "cotizacion_documentos module update" on public.cotizacion_documentos;
drop policy if exists "cotizacion_documentos module delete" on public.cotizacion_documentos;
create policy "cotizacion_documentos module select" on public.cotizacion_documentos for select to authenticated
using (
  public.has_module_permission(empresa_id, 'cotizaciones')
  or (public.has_module_permission(empresa_id, 'presupuestos') and numero is null and tipo in ('PRESUPUESTO', 'PRE-COTIZACION'))
  or (public.has_module_permission(empresa_id, 'ordenes') and numero is not null)
);
create policy "cotizacion_documentos module insert" on public.cotizacion_documentos for insert to authenticated
with check (
  public.has_module_permission(empresa_id, 'cotizaciones')
  or (public.has_module_permission(empresa_id, 'presupuestos') and numero is null and tipo in ('PRESUPUESTO', 'PRE-COTIZACION'))
);
create policy "cotizacion_documentos module update" on public.cotizacion_documentos for update to authenticated
using (
  public.has_module_permission(empresa_id, 'cotizaciones')
  or (public.has_module_permission(empresa_id, 'presupuestos') and numero is null and tipo in ('PRESUPUESTO', 'PRE-COTIZACION'))
)
with check (
  public.has_module_permission(empresa_id, 'cotizaciones')
  or (public.has_module_permission(empresa_id, 'presupuestos') and numero is null and tipo in ('PRESUPUESTO', 'PRE-COTIZACION'))
);
create policy "cotizacion_documentos module delete" on public.cotizacion_documentos for delete to authenticated
using (
  public.has_module_permission(empresa_id, 'cotizaciones')
  or (public.has_module_permission(empresa_id, 'presupuestos') and numero is null and tipo in ('PRESUPUESTO', 'PRE-COTIZACION'))
);

drop policy if exists "ordenes_trabajo tenant access" on public.ordenes_trabajo;
create policy "ordenes_trabajo tenant access" on public.ordenes_trabajo for all to authenticated using (public.has_module_permission(empresa_id, 'ordenes')) with check (public.has_module_permission(empresa_id, 'ordenes'));
drop policy if exists "ordenes_trabajo ia read" on public.ordenes_trabajo;
create policy "ordenes_trabajo ia read" on public.ordenes_trabajo for select to authenticated using (public.has_module_permission(empresa_id, 'ia'));
drop policy if exists "audits tenant access" on public.audits;
create policy "audits tenant access" on public.audits for all to authenticated using (public.has_module_permission(empresa_id, 'auditorias')) with check (public.has_module_permission(empresa_id, 'auditorias'));
drop policy if exists "equipo_eventos tenant access" on public.equipo_eventos;
create policy "equipo_eventos tenant access" on public.equipo_eventos for all to authenticated using (public.has_any_module_permission(empresa_id, array['maquinaria', 'ordenes', 'auditorias'])) with check (public.has_any_module_permission(empresa_id, array['maquinaria', 'ordenes', 'auditorias']));
drop policy if exists "archivos tenant access" on public.archivos;
create policy "archivos tenant access" on public.archivos for all to authenticated using (public.has_any_module_permission(empresa_id, array['maquinaria', 'ordenes', 'auditorias', 'personas_pagos'])) with check (public.has_any_module_permission(empresa_id, array['maquinaria', 'ordenes', 'auditorias', 'personas_pagos']));
drop policy if exists "import_logs tenant access" on public.import_logs;
create policy "import_logs tenant access" on public.import_logs for all to authenticated using (public.has_module_permission(empresa_id, 'importar_excel')) with check (public.has_module_permission(empresa_id, 'importar_excel'));

drop policy if exists "personas tenant access" on public.personas;
create policy "personas tenant access" on public.personas for all to authenticated using (public.has_module_permission(empresa_id, 'personas_pagos')) with check (public.has_module_permission(empresa_id, 'personas_pagos'));
drop policy if exists "personas shared module read" on public.personas;
create policy "personas shared module read" on public.personas for select to authenticated using (public.has_any_module_permission(empresa_id, array['flota', 'epp_ropa']));
drop policy if exists "pagos_personas tenant access" on public.pagos_personas;
create policy "pagos_personas tenant access" on public.pagos_personas for all to authenticated using (public.has_module_permission(empresa_id, 'personas_pagos')) with check (public.has_module_permission(empresa_id, 'personas_pagos'));
drop policy if exists "documentos_personas tenant access" on public.documentos_personas;
create policy "documentos_personas tenant access" on public.documentos_personas for all to authenticated using (public.has_module_permission(empresa_id, 'personas_pagos')) with check (public.has_module_permission(empresa_id, 'personas_pagos'));
drop policy if exists "horas_extra tenant access" on public.horas_extra;
create policy "horas_extra tenant access" on public.horas_extra for all to authenticated using (public.has_module_permission(empresa_id, 'personas_pagos')) with check (public.has_module_permission(empresa_id, 'personas_pagos'));

drop policy if exists "google_ads_campanas tenant access" on public.google_ads_campanas;
create policy "google_ads_campanas tenant access" on public.google_ads_campanas for all to authenticated using (public.has_module_permission(empresa_id, 'google_ads')) with check (public.has_module_permission(empresa_id, 'google_ads'));
drop policy if exists "google_ads_metricas tenant access" on public.google_ads_metricas_diarias;
create policy "google_ads_metricas tenant access" on public.google_ads_metricas_diarias for all to authenticated using (public.has_module_permission(empresa_id, 'google_ads')) with check (public.has_module_permission(empresa_id, 'google_ads'));
drop policy if exists "google_ads_recomendaciones tenant access" on public.google_ads_recomendaciones;
create policy "google_ads_recomendaciones tenant access" on public.google_ads_recomendaciones for all to authenticated using (public.has_module_permission(empresa_id, 'google_ads')) with check (public.has_module_permission(empresa_id, 'google_ads'));

drop policy if exists "crm_oportunidades tenant access" on public.crm_oportunidades;
create policy "crm_oportunidades tenant access" on public.crm_oportunidades for all to authenticated using (public.has_module_permission(empresa_id, 'crm')) with check (public.has_module_permission(empresa_id, 'crm'));
drop policy if exists "whatsapp_mensajes tenant access" on public.whatsapp_mensajes;
create policy "whatsapp_mensajes tenant access" on public.whatsapp_mensajes for all to authenticated using (public.has_module_permission(empresa_id, 'whatsapp')) with check (public.has_module_permission(empresa_id, 'whatsapp'));
drop policy if exists "ia_consultas tenant access" on public.ia_consultas;
create policy "ia_consultas tenant access" on public.ia_consultas for all to authenticated using (public.has_module_permission(empresa_id, 'ia')) with check (public.has_module_permission(empresa_id, 'ia'));

drop policy if exists "empresas_asociadas tenant access" on public.empresas_asociadas;
create policy "empresas_asociadas tenant access" on public.empresas_asociadas for all to authenticated using (public.has_module_permission(empresa_id, 'empresas_asociadas')) with check (public.has_module_permission(empresa_id, 'empresas_asociadas'));
drop policy if exists "empresas_asociadas flota read" on public.empresas_asociadas;
create policy "empresas_asociadas flota read" on public.empresas_asociadas for select to authenticated using (public.has_module_permission(empresa_id, 'flota'));
drop policy if exists "vehiculos_empresa tenant access" on public.vehiculos_empresa;
create policy "vehiculos_empresa tenant access" on public.vehiculos_empresa for all to authenticated using (public.has_module_permission(empresa_id, 'flota')) with check (public.has_module_permission(empresa_id, 'flota'));

drop policy if exists "epp_items tenant access" on public.epp_items;
create policy "epp_items tenant access" on public.epp_items for all to authenticated using (public.has_module_permission(empresa_id, 'epp_ropa')) with check (public.has_module_permission(empresa_id, 'epp_ropa'));
drop policy if exists "epp_worker_sizes tenant access" on public.epp_worker_sizes;
create policy "epp_worker_sizes tenant access" on public.epp_worker_sizes for all to authenticated using (public.has_module_permission(empresa_id, 'epp_ropa')) with check (public.has_module_permission(empresa_id, 'epp_ropa'));

drop policy if exists "productos_comerciales tenant access" on public.productos_comerciales;
create policy "productos_comerciales tenant access" on public.productos_comerciales for all to authenticated using (public.has_module_permission(empresa_id, 'publicaciones')) with check (public.has_module_permission(empresa_id, 'publicaciones'));
drop policy if exists "publicaciones_productos tenant access" on public.publicaciones_productos;
create policy "publicaciones_productos tenant access" on public.publicaciones_productos for all to authenticated using (public.has_module_permission(empresa_id, 'publicaciones')) with check (public.has_module_permission(empresa_id, 'publicaciones'));

grant select, insert, update, delete on public.usuario_permisos to authenticated;
grant execute on function public.has_module_permission(uuid, text) to authenticated;
grant execute on function public.has_any_module_permission(uuid, text[]) to authenticated;
grant execute on function public.mis_permisos_empresa(uuid) to authenticated;
grant execute on function public.listar_usuarios_empresa(uuid) to authenticated;
grant execute on function public.guardar_permisos_usuario(uuid, text, text, text[]) to authenticated;
grant execute on function public.cambiar_estado_usuario_empresa(uuid, uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
