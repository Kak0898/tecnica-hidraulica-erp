-- Base escalable de Recursos Humanos para bases existentes.
-- Ejecutar despues de 15_usuarios_permisos_modulos.sql y
-- 16_creacion_usuarios_perfiles.sql. Es incremental e idempotente.

begin;

-- Catalogo de modulos: evita tener que reescribir restricciones cada vez que
-- el producto incorpora una nueva seccion.
create table if not exists public.sistema_modulos (
  clave text primary key,
  nombre text not null,
  grupo text not null,
  orden integer not null default 0,
  activo boolean not null default true,
  solo_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.sistema_modulos (clave, nombre, grupo, orden, solo_admin)
values
  ('dashboard', 'Dashboard', 'vision_general', 10, false),
  ('google_ads', 'Google Ads', 'vision_general', 20, false),
  ('clientes', 'Clientes', 'comercial', 100, false),
  ('empresas_asociadas', 'Empresas asociadas', 'comercial', 110, false),
  ('presupuestos', 'Presupuestos', 'comercial', 120, false),
  ('cotizaciones', 'Cotizaciones', 'comercial', 130, false),
  ('publicaciones', 'Publicaciones', 'comercial', 140, false),
  ('ordenes', 'Ordenes de trabajo', 'comercial', 150, false),
  ('crm', 'CRM', 'comercial', 160, false),
  ('whatsapp', 'WhatsApp', 'comercial', 170, false),
  ('rrhh_personas', 'Equipo y fichas', 'rrhh', 200, false),
  ('rrhh_contratos', 'Contratos y anexos', 'rrhh', 210, false),
  ('rrhh_ausencias', 'Ausencias y licencias', 'rrhh', 220, false),
  ('rrhh_documentos', 'Documentos y alertas', 'rrhh', 230, false),
  ('personas_pagos', 'Remuneraciones y pagos', 'rrhh', 240, false),
  ('flota', 'Flota de vehiculos', 'operaciones', 300, false),
  ('maquinaria', 'Maquinaria', 'operaciones', 310, false),
  ('repuestos', 'Repuestos', 'operaciones', 320, false),
  ('epp_ropa', 'EPP y ropa', 'operaciones', 330, false),
  ('auditorias', 'Auditorias', 'operaciones', 340, false),
  ('importar_excel', 'Importar Excel', 'operaciones', 350, false),
  ('ia', 'IA Tecnica', 'sistema', 400, false),
  ('configuracion', 'Configuracion', 'sistema', 900, true),
  ('usuarios_permisos', 'Usuarios y permisos', 'sistema', 910, true)
on conflict (clave) do update
set nombre = excluded.nombre,
    grupo = excluded.grupo,
    orden = excluded.orden,
    solo_admin = excluded.solo_admin,
    activo = true,
    updated_at = now();

alter table public.usuario_permisos
  drop constraint if exists usuario_permisos_modulo_check;
alter table public.usuario_permisos
  drop constraint if exists usuario_permisos_modulo_fkey;
alter table public.usuario_permisos
  add constraint usuario_permisos_modulo_fkey
  foreign key (modulo) references public.sistema_modulos(clave);

drop trigger if exists set_sistema_modulos_updated_at on public.sistema_modulos;
create trigger set_sistema_modulos_updated_at
before update on public.sistema_modulos
for each row execute function public.set_updated_at();

alter table public.sistema_modulos enable row level security;
drop policy if exists "sistema_modulos authenticated read" on public.sistema_modulos;
create policy "sistema_modulos authenticated read"
on public.sistema_modulos for select to authenticated using (true);

-- Catalogos configurables por empresa.
create table if not exists public.rrhh_centros_costo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  descripcion text,
  activo boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, codigo)
);

create table if not exists public.rrhh_cargos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nombre text not null,
  descripcion text,
  activo boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nombre)
);

-- Se conserva la tabla personas para mantener compatibles pagos, flota y EPP.
alter table public.personas
  add column if not exists codigo_empleado text,
  add column if not exists fecha_nacimiento date,
  add column if not exists nacionalidad text,
  add column if not exists estado_civil text,
  add column if not exists comuna text,
  add column if not exists region text,
  add column if not exists contacto_emergencia_nombre text,
  add column if not exists contacto_emergencia_telefono text,
  add column if not exists contacto_emergencia_relacion text,
  add column if not exists fecha_ingreso date,
  add column if not exists fecha_termino date,
  add column if not exists estado_laboral text not null default 'activo',
  add column if not exists tipo_contrato text,
  add column if not exists jornada text,
  add column if not exists horas_semanales numeric(5,2),
  add column if not exists sueldo_base numeric not null default 0,
  add column if not exists moneda char(3) not null default 'CLP',
  add column if not exists afp text,
  add column if not exists salud_tipo text,
  add column if not exists salud_institucion text,
  add column if not exists cargo_id uuid references public.rrhh_cargos(id) on delete set null,
  add column if not exists centro_costo_id uuid references public.rrhh_centros_costo(id) on delete set null,
  add column if not exists supervisor_id uuid references public.personas(id) on delete set null,
  add column if not exists usuario_id uuid references auth.users(id) on delete set null,
  add column if not exists configuracion_extra jsonb not null default '{}'::jsonb;

alter table public.personas
  drop constraint if exists personas_estado_laboral_check;
alter table public.personas
  add constraint personas_estado_laboral_check check (
    estado_laboral in ('activo', 'licencia', 'vacaciones', 'suspendido', 'desvinculado')
  );
alter table public.personas
  drop constraint if exists personas_horas_semanales_check;
alter table public.personas
  add constraint personas_horas_semanales_check check (
    horas_semanales is null or (horas_semanales >= 0 and horas_semanales <= 80)
  );
alter table public.personas
  drop constraint if exists personas_sueldo_base_check;
alter table public.personas
  add constraint personas_sueldo_base_check check (sueldo_base >= 0);

update public.personas
set estado_laboral = 'desvinculado'
where activo = false and estado_laboral = 'activo';

create unique index if not exists uq_personas_codigo_empleado
  on public.personas(empresa_id, codigo_empleado)
  where codigo_empleado is not null;
create unique index if not exists uq_personas_usuario
  on public.personas(empresa_id, usuario_id)
  where usuario_id is not null;
create index if not exists idx_personas_estado_laboral
  on public.personas(empresa_id, estado_laboral, activo);

create table if not exists public.rrhh_contratos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete restrict,
  numero text,
  tipo text not null default 'indefinido' check (tipo in ('indefinido', 'plazo_fijo', 'obra_faena', 'part_time', 'practica', 'honorarios', 'otro')),
  estado text not null default 'borrador' check (estado in ('borrador', 'pendiente_firma', 'vigente', 'vencido', 'terminado', 'anulado')),
  fecha_inicio date not null,
  fecha_termino date,
  fecha_firma date,
  cargo_id uuid references public.rrhh_cargos(id) on delete set null,
  centro_costo_id uuid references public.rrhh_centros_costo(id) on delete set null,
  cargo_nombre text,
  centro_costo_nombre text,
  jornada text,
  horas_semanales numeric(5,2) check (horas_semanales is null or (horas_semanales >= 0 and horas_semanales <= 80)),
  sueldo_base numeric not null default 0 check (sueldo_base >= 0),
  moneda char(3) not null default 'CLP',
  funciones text,
  documento_url text,
  alerta_dias integer not null default 45 check (alerta_dias between 0 and 365),
  notas text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fecha_termino is null or fecha_termino >= fecha_inicio)
);

create unique index if not exists uq_rrhh_contratos_numero
  on public.rrhh_contratos(empresa_id, numero)
  where numero is not null;
create index if not exists idx_rrhh_contratos_persona
  on public.rrhh_contratos(persona_id, fecha_inicio desc);
create index if not exists idx_rrhh_contratos_vencimiento
  on public.rrhh_contratos(empresa_id, estado, fecha_termino);

create table if not exists public.rrhh_anexos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete restrict,
  contrato_id uuid not null references public.rrhh_contratos(id) on delete restrict,
  tipo text not null default 'modificacion' check (tipo in ('remuneracion', 'cargo', 'jornada', 'lugar_trabajo', 'plazo', 'funciones', 'teletrabajo', 'modificacion', 'otro')),
  estado text not null default 'borrador' check (estado in ('borrador', 'pendiente_firma', 'vigente', 'anulado')),
  fecha_emision date not null default current_date,
  fecha_vigencia date not null default current_date,
  titulo text not null,
  descripcion text,
  cambios jsonb not null default '{}'::jsonb,
  documento_url text,
  fecha_firma date,
  notas text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rrhh_anexos_contrato
  on public.rrhh_anexos(contrato_id, fecha_vigencia desc);

create table if not exists public.rrhh_ausencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete restrict,
  tipo text not null check (tipo in ('vacaciones', 'licencia_medica', 'permiso_con_goce', 'permiso_sin_goce', 'inasistencia', 'fuero', 'suspension', 'otro')),
  estado text not null default 'pendiente' check (estado in ('borrador', 'pendiente', 'aprobada', 'rechazada', 'cerrada', 'anulada')),
  fecha_inicio date not null,
  fecha_termino date not null,
  dias numeric(7,2) not null default 0 check (dias >= 0),
  folio text,
  emisor text,
  motivo text,
  documento_url text,
  aprobado_por uuid references auth.users(id) on delete set null,
  aprobado_at timestamptz,
  notas text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fecha_termino >= fecha_inicio)
);

create index if not exists idx_rrhh_ausencias_persona_fecha
  on public.rrhh_ausencias(persona_id, fecha_inicio desc);
create index if not exists idx_rrhh_ausencias_estado
  on public.rrhh_ausencias(empresa_id, estado, fecha_termino);

create table if not exists public.rrhh_saldos_vacaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete cascade,
  periodo smallint not null check (periodo between 2000 and 2200),
  dias_otorgados numeric(7,2) not null default 15 check (dias_otorgados >= 0),
  dias_ajuste numeric(7,2) not null default 0,
  notas text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, persona_id, periodo)
);

create table if not exists public.rrhh_tipos_documento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nombre text not null,
  categoria text not null default 'personal' check (categoria in ('personal', 'contrato', 'anexo', 'licencia', 'remuneracion', 'seguridad', 'previsional', 'otro')),
  obligatorio boolean not null default false,
  vence boolean not null default false,
  vigencia_dias integer check (vigencia_dias is null or vigencia_dias >= 0),
  alcance text not null default 'todos' check (alcance in ('todos', 'contrato', 'honorarios', 'cargo', 'personalizado')),
  activo boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nombre)
);

create table if not exists public.rrhh_documentos_empleado (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete restrict,
  tipo_documento_id uuid references public.rrhh_tipos_documento(id) on delete set null,
  entidad_tipo text check (entidad_tipo is null or entidad_tipo in ('persona', 'contrato', 'anexo', 'ausencia', 'pago')),
  entidad_id uuid,
  nombre text not null,
  estado text not null default 'vigente' check (estado in ('pendiente', 'vigente', 'vencido', 'rechazado', 'archivado')),
  fecha_emision date,
  fecha_vencimiento date,
  url text,
  verificado_por uuid references auth.users(id) on delete set null,
  verificado_at timestamptz,
  notas text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fecha_vencimiento is null or fecha_emision is null or fecha_vencimiento >= fecha_emision)
);

create index if not exists idx_rrhh_documentos_persona
  on public.rrhh_documentos_empleado(persona_id, fecha_vencimiento);
create index if not exists idx_rrhh_documentos_vencimiento
  on public.rrhh_documentos_empleado(empresa_id, estado, fecha_vencimiento);

create table if not exists public.rrhh_alertas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  clave text not null,
  tipo text not null check (tipo in ('contrato_vencimiento', 'documento_vencimiento', 'documento_faltante', 'ausencia_termino', 'accion_manual')),
  entidad_tipo text,
  entidad_id uuid,
  persona_id uuid references public.personas(id) on delete cascade,
  titulo text not null,
  detalle text,
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'vista', 'resuelta', 'descartada')),
  fecha_vencimiento date,
  asignado_a uuid references auth.users(id) on delete set null,
  resuelto_por uuid references auth.users(id) on delete set null,
  resuelto_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, clave)
);

create index if not exists idx_rrhh_alertas_estado
  on public.rrhh_alertas(empresa_id, estado, prioridad, fecha_vencimiento);

create table if not exists public.rrhh_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  persona_id uuid references public.personas(id) on delete set null,
  entidad_tipo text not null,
  entidad_id uuid not null,
  accion text not null,
  titulo text not null,
  detalle text,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rrhh_eventos_entidad
  on public.rrhh_eventos(empresa_id, entidad_tipo, entidad_id, created_at desc);
create index if not exists idx_rrhh_eventos_persona
  on public.rrhh_eventos(persona_id, created_at desc);

-- Valida que las relaciones no crucen empresas.
create or replace function public.validar_relacion_rrhh()
returns trigger
language plpgsql
security definer
set search_path = public
as '
declare
  relation_data jsonb;
  related_empresa uuid;
  related_id uuid;
begin
  relation_data := to_jsonb(new);
  related_id := nullif(relation_data ->> ''persona_id'', '''')::uuid;
  if related_id is not null then
    select p.empresa_id into related_empresa from public.personas p where p.id = related_id;
    if related_empresa is null or related_empresa <> new.empresa_id then
      raise exception ''La persona no pertenece a la empresa activa'';
    end if;
  end if;

  related_id := nullif(relation_data ->> ''contrato_id'', '''')::uuid;
  if related_id is not null then
    select c.empresa_id into related_empresa from public.rrhh_contratos c where c.id = related_id;
    if related_empresa is null or related_empresa <> new.empresa_id then
      raise exception ''El contrato no pertenece a la empresa activa'';
    end if;
  end if;

  related_id := nullif(relation_data ->> ''tipo_documento_id'', '''')::uuid;
  if related_id is not null then
    select td.empresa_id into related_empresa from public.rrhh_tipos_documento td where td.id = related_id;
    if related_empresa is null or related_empresa <> new.empresa_id then
      raise exception ''El tipo de documento no pertenece a la empresa activa'';
    end if;
  end if;

  return new;
end;
';

create or replace function public.validar_persona_rrhh()
returns trigger
language plpgsql
security definer
set search_path = public
as '
begin
  if new.supervisor_id is not null and not exists (
    select 1 from public.personas p
    where p.id = new.supervisor_id and p.empresa_id = new.empresa_id
  ) then
    raise exception ''El supervisor no pertenece a la empresa activa'';
  end if;
  if new.cargo_id is not null and not exists (
    select 1 from public.rrhh_cargos c
    where c.id = new.cargo_id and c.empresa_id = new.empresa_id
  ) then
    raise exception ''El cargo no pertenece a la empresa activa'';
  end if;
  if new.centro_costo_id is not null and not exists (
    select 1 from public.rrhh_centros_costo cc
    where cc.id = new.centro_costo_id and cc.empresa_id = new.empresa_id
  ) then
    raise exception ''El centro de costo no pertenece a la empresa activa'';
  end if;
  return new;
end;
';

drop trigger if exists validar_persona_rrhh on public.personas;
create trigger validar_persona_rrhh
before insert or update on public.personas
for each row execute function public.validar_persona_rrhh();

drop trigger if exists validar_relacion_rrhh_contratos on public.rrhh_contratos;
create trigger validar_relacion_rrhh_contratos before insert or update on public.rrhh_contratos
for each row execute function public.validar_relacion_rrhh();
drop trigger if exists validar_relacion_rrhh_anexos on public.rrhh_anexos;
create trigger validar_relacion_rrhh_anexos before insert or update on public.rrhh_anexos
for each row execute function public.validar_relacion_rrhh();
drop trigger if exists validar_relacion_rrhh_ausencias on public.rrhh_ausencias;
create trigger validar_relacion_rrhh_ausencias before insert or update on public.rrhh_ausencias
for each row execute function public.validar_relacion_rrhh();
drop trigger if exists validar_relacion_rrhh_saldos on public.rrhh_saldos_vacaciones;
create trigger validar_relacion_rrhh_saldos before insert or update on public.rrhh_saldos_vacaciones
for each row execute function public.validar_relacion_rrhh();
drop trigger if exists validar_relacion_rrhh_documentos on public.rrhh_documentos_empleado;
create trigger validar_relacion_rrhh_documentos before insert or update on public.rrhh_documentos_empleado
for each row execute function public.validar_relacion_rrhh();

-- Auditoria generica e inmutable para cambios de RR.HH.
create or replace function public.registrar_evento_rrhh()
returns trigger
language plpgsql
security definer
set search_path = public
as '
declare
  row_data jsonb;
  event_action text;
begin
  row_data := case when tg_op = ''DELETE'' then to_jsonb(old) else to_jsonb(new) end;
  event_action := case tg_op when ''INSERT'' then ''creado'' when ''UPDATE'' then ''actualizado'' else ''eliminado'' end;

  insert into public.rrhh_eventos (
    empresa_id, persona_id, entidad_tipo, entidad_id, accion, titulo, metadata, actor_id
  ) values (
    (row_data ->> ''empresa_id'')::uuid,
    nullif(row_data ->> ''persona_id'', '''')::uuid,
    tg_table_name,
    (row_data ->> ''id'')::uuid,
    event_action,
    replace(tg_table_name, ''_'', '' '') || '' '' || event_action,
    jsonb_strip_nulls(jsonb_build_object(
      ''estado'', coalesce(row_data ->> ''estado'', row_data ->> ''estado_laboral''),
      ''persona_id'', row_data ->> ''persona_id''
    )),
    auth.uid()
  );

  if tg_op = ''DELETE'' then return old; end if;
  return new;
end;
';

drop trigger if exists audit_rrhh_personas on public.personas;
create trigger audit_rrhh_personas after insert or update or delete on public.personas
for each row execute function public.registrar_evento_rrhh();
drop trigger if exists audit_rrhh_contratos on public.rrhh_contratos;
create trigger audit_rrhh_contratos after insert or update or delete on public.rrhh_contratos
for each row execute function public.registrar_evento_rrhh();
drop trigger if exists audit_rrhh_anexos on public.rrhh_anexos;
create trigger audit_rrhh_anexos after insert or update or delete on public.rrhh_anexos
for each row execute function public.registrar_evento_rrhh();
drop trigger if exists audit_rrhh_ausencias on public.rrhh_ausencias;
create trigger audit_rrhh_ausencias after insert or update or delete on public.rrhh_ausencias
for each row execute function public.registrar_evento_rrhh();
drop trigger if exists audit_rrhh_documentos on public.rrhh_documentos_empleado;
create trigger audit_rrhh_documentos after insert or update or delete on public.rrhh_documentos_empleado
for each row execute function public.registrar_evento_rrhh();

-- Mantiene updated_at sin duplicar logica.
do '
declare
  table_name text;
begin
  foreach table_name in array array[
    ''rrhh_centros_costo'', ''rrhh_cargos'', ''rrhh_contratos'', ''rrhh_anexos'',
    ''rrhh_ausencias'', ''rrhh_saldos_vacaciones'', ''rrhh_tipos_documento'',
    ''rrhh_documentos_empleado'', ''rrhh_alertas''
  ] loop
    execute format(''drop trigger if exists set_%I_updated_at on public.%I'', table_name, table_name);
    execute format(''create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()'', table_name, table_name);
  end loop;
end
';

-- Genera recordatorios sin duplicarlos. Se invoca desde Documentos y alertas.
create or replace function public.sincronizar_alertas_rrhh(p_empresa_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as '
declare
  target_empresa uuid;
  affected integer;
  total_affected integer := 0;
begin
  target_empresa := coalesce(p_empresa_id, public.current_empresa_id());
  if target_empresa is null or not public.is_empresa_member(target_empresa) then
    raise exception ''Usuario sin acceso a la empresa seleccionada'';
  end if;

  insert into public.rrhh_alertas (
    empresa_id, clave, tipo, entidad_tipo, entidad_id, persona_id,
    titulo, detalle, prioridad, fecha_vencimiento
  )
  select
    c.empresa_id,
    ''contrato:'' || c.id || '':vencimiento'',
    ''contrato_vencimiento'', ''contrato'', c.id, c.persona_id,
    ''Contrato por vencer: '' || p.nombre,
    ''El contrato finaliza el '' || to_char(c.fecha_termino, ''DD/MM/YYYY'') || ''.'',
    case when c.fecha_termino <= current_date + 10 then ''alta'' else ''media'' end,
    c.fecha_termino
  from public.rrhh_contratos c
  join public.personas p on p.id = c.persona_id
  where c.empresa_id = target_empresa
    and c.estado in (''vigente'', ''pendiente_firma'')
    and c.fecha_termino is not null
    and c.fecha_termino <= current_date + greatest(c.alerta_dias, 0)
  on conflict (empresa_id, clave) do update
  set titulo = excluded.titulo,
      detalle = excluded.detalle,
      prioridad = excluded.prioridad,
      fecha_vencimiento = excluded.fecha_vencimiento,
      updated_at = now();
  get diagnostics affected = row_count;
  total_affected := total_affected + affected;

  insert into public.rrhh_alertas (
    empresa_id, clave, tipo, entidad_tipo, entidad_id, persona_id,
    titulo, detalle, prioridad, fecha_vencimiento
  )
  select
    d.empresa_id,
    ''documento:'' || d.id || '':vencimiento'',
    ''documento_vencimiento'', ''documento'', d.id, d.persona_id,
    ''Documento por vencer: '' || d.nombre,
    ''Documento de '' || p.nombre || '' con vencimiento '' || to_char(d.fecha_vencimiento, ''DD/MM/YYYY'') || ''.'',
    case when d.fecha_vencimiento <= current_date + 7 then ''alta'' else ''media'' end,
    d.fecha_vencimiento
  from public.rrhh_documentos_empleado d
  join public.personas p on p.id = d.persona_id
  where d.empresa_id = target_empresa
    and d.estado in (''vigente'', ''pendiente'')
    and d.fecha_vencimiento is not null
    and d.fecha_vencimiento <= current_date + 30
  on conflict (empresa_id, clave) do update
  set titulo = excluded.titulo,
      detalle = excluded.detalle,
      prioridad = excluded.prioridad,
      fecha_vencimiento = excluded.fecha_vencimiento,
      updated_at = now();
  get diagnostics affected = row_count;
  total_affected := total_affected + affected;

  insert into public.rrhh_alertas (
    empresa_id, clave, tipo, entidad_tipo, entidad_id, persona_id,
    titulo, detalle, prioridad
  )
  select
    p.empresa_id,
    ''persona:'' || p.id || '':documento:'' || td.id,
    ''documento_faltante'', ''persona'', p.id, p.id,
    ''Documento faltante: '' || td.nombre,
    p.nombre || '' no tiene un documento vigente de este tipo.'',
    ''media''
  from public.personas p
  cross join public.rrhh_tipos_documento td
  where p.empresa_id = target_empresa
    and td.empresa_id = target_empresa
    and p.activo = true
    and td.activo = true
    and td.obligatorio = true
    and (td.alcance = ''todos'' or td.alcance = p.tipo_relacion)
    and not exists (
      select 1 from public.rrhh_documentos_empleado d
      where d.persona_id = p.id
        and d.tipo_documento_id = td.id
        and d.estado = ''vigente''
        and (d.fecha_vencimiento is null or d.fecha_vencimiento >= current_date)
    )
  on conflict (empresa_id, clave) do update
  set titulo = excluded.titulo,
      detalle = excluded.detalle,
      updated_at = now();
  get diagnostics affected = row_count;
  total_affected := total_affected + affected;

  insert into public.rrhh_alertas (
    empresa_id, clave, tipo, entidad_tipo, entidad_id, persona_id,
    titulo, detalle, prioridad, fecha_vencimiento
  )
  select
    a.empresa_id,
    ''ausencia:'' || a.id || '':termino'',
    ''ausencia_termino'', ''ausencia'', a.id, a.persona_id,
    ''Ausencia próxima a finalizar: '' || p.nombre,
    ''La ausencia finaliza el '' || to_char(a.fecha_termino, ''DD/MM/YYYY'') || ''.'',
    ''baja'', a.fecha_termino
  from public.rrhh_ausencias a
  join public.personas p on p.id = a.persona_id
  where a.empresa_id = target_empresa
    and a.estado = ''aprobada''
    and a.fecha_termino between current_date and current_date + 3
  on conflict (empresa_id, clave) do update
  set titulo = excluded.titulo,
      detalle = excluded.detalle,
      fecha_vencimiento = excluded.fecha_vencimiento,
      updated_at = now();
  get diagnostics affected = row_count;
  total_affected := total_affected + affected;

  -- Cierra recordatorios automáticos cuya condición ya dejó de existir. Las
  -- alertas resueltas o descartadas manualmente no se vuelven a abrir.
  update public.rrhh_alertas alert
  set estado = ''resuelta'',
      resuelto_por = auth.uid(),
      resuelto_at = now(),
      updated_at = now()
  where alert.empresa_id = target_empresa
    and alert.estado in (''pendiente'', ''vista'')
    and (
      (alert.tipo = ''contrato_vencimiento'' and not exists (
        select 1 from public.rrhh_contratos c
        where c.id = alert.entidad_id
          and c.empresa_id = target_empresa
          and c.estado in (''vigente'', ''pendiente_firma'')
          and c.fecha_termino is not null
          and c.fecha_termino <= current_date + greatest(c.alerta_dias, 0)
      ))
      or (alert.tipo = ''documento_vencimiento'' and not exists (
        select 1 from public.rrhh_documentos_empleado d
        where d.id = alert.entidad_id
          and d.empresa_id = target_empresa
          and d.estado in (''vigente'', ''pendiente'')
          and d.fecha_vencimiento is not null
          and d.fecha_vencimiento <= current_date + 30
      ))
      or (alert.tipo = ''documento_faltante'' and not exists (
        select 1
        from public.personas p
        cross join public.rrhh_tipos_documento td
        where p.id = alert.persona_id
          and p.empresa_id = target_empresa
          and td.empresa_id = target_empresa
          and alert.clave = ''persona:'' || p.id || '':documento:'' || td.id
          and p.activo = true
          and td.activo = true
          and td.obligatorio = true
          and (td.alcance = ''todos'' or td.alcance = p.tipo_relacion)
          and not exists (
            select 1 from public.rrhh_documentos_empleado d
            where d.persona_id = p.id
              and d.tipo_documento_id = td.id
              and d.estado = ''vigente''
              and (d.fecha_vencimiento is null or d.fecha_vencimiento >= current_date)
          )
      ))
      or (alert.tipo = ''ausencia_termino'' and not exists (
        select 1 from public.rrhh_ausencias absence
        where absence.id = alert.entidad_id
          and absence.empresa_id = target_empresa
          and absence.estado = ''aprobada''
          and absence.fecha_termino between current_date and current_date + 3
      ))
    );
  get diagnostics affected = row_count;
  total_affected := total_affected + affected;

  return total_affected;
end;
';

-- Vincula opcionalmente una cuenta de acceso con su ficha laboral.
create or replace function public.vincular_usuario_persona(
  p_empresa_id uuid,
  p_user_id uuid,
  p_persona_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as '
begin
  if not public.is_empresa_admin(p_empresa_id) then return false; end if;
  if not exists (
    select 1 from public.usuarios_empresas ue
    where ue.empresa_id = p_empresa_id and ue.user_id = p_user_id
  ) then return false; end if;
  if p_persona_id is not null and not exists (
    select 1 from public.personas p
    where p.id = p_persona_id and p.empresa_id = p_empresa_id
  ) then return false; end if;

  update public.personas
  set usuario_id = null, updated_at = now()
  where empresa_id = p_empresa_id and usuario_id = p_user_id;

  if p_persona_id is not null then
    update public.personas
    set usuario_id = p_user_id, updated_at = now()
    where id = p_persona_id and empresa_id = p_empresa_id;
  end if;
  return true;
end;
';

-- Los administradores reciben el catalogo activo; los operadores conservan
-- solamente las filas que les fueron asignadas.
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
    select coalesce(array_agg(up.modulo order by sm.orden), array[]::text[]) as modulos
    from public.usuario_permisos up
    join public.sistema_modulos sm on sm.clave = up.modulo and sm.activo = true
    where up.empresa_id = p_empresa_id
      and up.user_id = auth.uid()
      and up.permitido = true
  ),
  admin_modules as (
    select coalesce(array_agg(sm.clave order by sm.orden), array[]::text[]) as modulos
    from public.sistema_modulos sm where sm.activo = true
  )
  select coalesce(
    (
      select jsonb_build_object(
        ''rol'', membership.rol,
        ''is_admin'', membership.rol in (''owner'', ''admin''),
        ''modulos'', case when membership.rol in (''owner'', ''admin'') then admin_modules.modulos else permission_list.modulos end
      )
      from membership cross join permission_list cross join admin_modules
    ),
    jsonb_build_object(''rol'', null, ''is_admin'', false, ''modulos'', array[]::text[])
  )
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
    select target.user_id, coalesce((
      select ue.rol from public.usuarios_empresas ue
      where ue.empresa_id = p_empresa_id and ue.user_id = target.user_id limit 1
    ), '''') as existing_role
    from target
  ),
  authorized as (
    select prepared.user_id,
      case when prepared.existing_role = ''owner'' then ''owner'' else p_rol end as requested_role
    from prepared
    where not (
      prepared.user_id = auth.uid()
      and prepared.existing_role = any(array[''owner'', ''admin'']::text[])
      and p_rol <> ''admin''
    )
  ),
  membership_write as (
    insert into public.usuarios_empresas (empresa_id, user_id, rol, activo, permisos_inicializados)
    select p_empresa_id, authorized.user_id, authorized.requested_role, true, true
    from authorized
    on conflict (empresa_id, user_id) do update
      set rol = excluded.rol, activo = true, permisos_inicializados = true, updated_at = now()
    returning user_id, rol
  ),
  permission_write as (
    insert into public.usuario_permisos (empresa_id, user_id, modulo, permitido)
    select p_empresa_id, membership_write.user_id, sm.clave,
      case when membership_write.rol in (''owner'', ''admin'') then false
           else sm.clave = any(coalesce(p_modulos, array[]::text[])) end
    from membership_write
    cross join public.sistema_modulos sm
    where sm.activo = true and sm.solo_admin = false
    on conflict (empresa_id, user_id, modulo) do update
      set permitido = excluded.permitido, updated_at = now()
    returning user_id
  ),
  company_write as (
    insert into public.usuario_empresa_activa (user_id, empresa_id)
    select membership_write.user_id, p_empresa_id from membership_write
    on conflict (user_id) do nothing
    returning user_id
  )
  select membership_write.user_id from membership_write
  where (select count(*) from permission_write) >= 0
    and (select count(*) from company_write) >= 0
  limit 1
';

drop function if exists public.listar_usuarios_empresa_detalle(uuid);
create function public.listar_usuarios_empresa_detalle(p_empresa_id uuid)
returns table (
  user_id uuid,
  email text,
  nombre_completo text,
  rol text,
  activo boolean,
  modulos text[],
  persona_id uuid,
  persona_nombre text
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
      split_part(coalesce(au.email, ''Usuario''), ''@'', 1)
    )::text,
    ue.rol,
    ue.activo,
    case when ue.rol in (''owner'', ''admin'') then (
      select coalesce(array_agg(sm.clave order by sm.orden), array[]::text[])
      from public.sistema_modulos sm where sm.activo = true
    ) else coalesce((
      select array_agg(up.modulo order by sm.orden)
      from public.usuario_permisos up
      join public.sistema_modulos sm on sm.clave = up.modulo
      where up.empresa_id = ue.empresa_id
        and up.user_id = ue.user_id
        and up.permitido = true
        and sm.activo = true
    ), array[]::text[]) end,
    p.id,
    p.nombre
  from public.usuarios_empresas ue
  join auth.users au on au.id = ue.user_id
  left join public.perfiles_usuarios pu on pu.user_id = ue.user_id
  left join public.personas p on p.empresa_id = ue.empresa_id and p.usuario_id = ue.user_id
  where ue.empresa_id = p_empresa_id
    and public.is_empresa_admin(p_empresa_id)
  order by case ue.rol when ''owner'' then 0 when ''admin'' then 1 else 2 end,
    lower(coalesce(pu.nombre_completo, au.email))
';

-- Tipos documentales iniciales por empresa. Luego cada cliente puede editarlos.
insert into public.rrhh_tipos_documento (
  empresa_id, nombre, categoria, obligatorio, vence, alcance
)
select e.id, seed.nombre, seed.categoria, seed.obligatorio, seed.vence, seed.alcance
from public.empresas e
cross join (values
  ('Cedula de identidad', 'personal', true, true, 'todos'),
  ('Contrato de trabajo', 'contrato', true, false, 'contrato'),
  ('Certificado de afiliacion AFP', 'previsional', true, false, 'contrato'),
  ('Certificado de salud', 'previsional', true, false, 'contrato'),
  ('Reglamento interno firmado', 'seguridad', false, false, 'contrato')
) as seed(nombre, categoria, obligatorio, vence, alcance)
on conflict (empresa_id, nombre) do nothing;

-- RLS y permisos por seccion.
alter table public.rrhh_centros_costo enable row level security;
alter table public.rrhh_cargos enable row level security;
alter table public.rrhh_contratos enable row level security;
alter table public.rrhh_anexos enable row level security;
alter table public.rrhh_ausencias enable row level security;
alter table public.rrhh_saldos_vacaciones enable row level security;
alter table public.rrhh_tipos_documento enable row level security;
alter table public.rrhh_documentos_empleado enable row level security;
alter table public.rrhh_alertas enable row level security;
alter table public.rrhh_eventos enable row level security;

drop policy if exists "personas tenant access" on public.personas;
drop policy if exists "personas rrhh read" on public.personas;
create policy "personas rrhh read" on public.personas for select to authenticated
using (public.has_any_module_permission(empresa_id, array[
  'rrhh_personas', 'rrhh_contratos', 'rrhh_ausencias', 'rrhh_documentos',
  'personas_pagos', 'flota', 'epp_ropa'
]));
drop policy if exists "personas rrhh write" on public.personas;
create policy "personas rrhh write" on public.personas for all to authenticated
using (public.has_any_module_permission(empresa_id, array['rrhh_personas', 'personas_pagos']))
with check (public.has_any_module_permission(empresa_id, array['rrhh_personas', 'personas_pagos']));

drop policy if exists "rrhh catalogos read" on public.rrhh_centros_costo;
create policy "rrhh catalogos read" on public.rrhh_centros_costo for select to authenticated
using (public.has_any_module_permission(empresa_id, array['rrhh_personas', 'rrhh_contratos', 'rrhh_ausencias', 'rrhh_documentos', 'personas_pagos']));
drop policy if exists "rrhh centros write" on public.rrhh_centros_costo;
create policy "rrhh centros write" on public.rrhh_centros_costo for all to authenticated
using (public.has_module_permission(empresa_id, 'rrhh_personas'))
with check (public.has_module_permission(empresa_id, 'rrhh_personas'));

drop policy if exists "rrhh cargos read" on public.rrhh_cargos;
create policy "rrhh cargos read" on public.rrhh_cargos for select to authenticated
using (public.has_any_module_permission(empresa_id, array['rrhh_personas', 'rrhh_contratos', 'rrhh_ausencias', 'rrhh_documentos', 'personas_pagos']));
drop policy if exists "rrhh cargos write" on public.rrhh_cargos;
create policy "rrhh cargos write" on public.rrhh_cargos for all to authenticated
using (public.has_module_permission(empresa_id, 'rrhh_personas'))
with check (public.has_module_permission(empresa_id, 'rrhh_personas'));

drop policy if exists "rrhh contratos access" on public.rrhh_contratos;
create policy "rrhh contratos access" on public.rrhh_contratos for all to authenticated
using (public.has_module_permission(empresa_id, 'rrhh_contratos'))
with check (public.has_module_permission(empresa_id, 'rrhh_contratos'));
drop policy if exists "rrhh anexos access" on public.rrhh_anexos;
create policy "rrhh anexos access" on public.rrhh_anexos for all to authenticated
using (public.has_module_permission(empresa_id, 'rrhh_contratos'))
with check (public.has_module_permission(empresa_id, 'rrhh_contratos'));

drop policy if exists "rrhh ausencias access" on public.rrhh_ausencias;
create policy "rrhh ausencias access" on public.rrhh_ausencias for all to authenticated
using (public.has_module_permission(empresa_id, 'rrhh_ausencias'))
with check (public.has_module_permission(empresa_id, 'rrhh_ausencias'));
drop policy if exists "rrhh saldos access" on public.rrhh_saldos_vacaciones;
create policy "rrhh saldos access" on public.rrhh_saldos_vacaciones for all to authenticated
using (public.has_module_permission(empresa_id, 'rrhh_ausencias'))
with check (public.has_module_permission(empresa_id, 'rrhh_ausencias'));

drop policy if exists "rrhh tipos documento read" on public.rrhh_tipos_documento;
create policy "rrhh tipos documento read" on public.rrhh_tipos_documento for select to authenticated
using (public.has_any_module_permission(empresa_id, array['rrhh_documentos', 'rrhh_contratos', 'personas_pagos']));
drop policy if exists "rrhh tipos documento write" on public.rrhh_tipos_documento;
create policy "rrhh tipos documento write" on public.rrhh_tipos_documento for all to authenticated
using (public.has_module_permission(empresa_id, 'rrhh_documentos'))
with check (public.has_module_permission(empresa_id, 'rrhh_documentos'));
drop policy if exists "rrhh documentos read" on public.rrhh_documentos_empleado;
create policy "rrhh documentos read" on public.rrhh_documentos_empleado for select to authenticated
using (public.has_any_module_permission(empresa_id, array['rrhh_documentos', 'rrhh_contratos', 'personas_pagos']));
drop policy if exists "rrhh documentos write" on public.rrhh_documentos_empleado;
create policy "rrhh documentos write" on public.rrhh_documentos_empleado for all to authenticated
using (public.has_module_permission(empresa_id, 'rrhh_documentos'))
with check (public.has_module_permission(empresa_id, 'rrhh_documentos'));

drop policy if exists "rrhh alertas access" on public.rrhh_alertas;
create policy "rrhh alertas access" on public.rrhh_alertas for all to authenticated
using (public.has_any_module_permission(empresa_id, array['rrhh_personas', 'rrhh_contratos', 'rrhh_ausencias', 'rrhh_documentos', 'personas_pagos']))
with check (public.has_any_module_permission(empresa_id, array['rrhh_personas', 'rrhh_contratos', 'rrhh_ausencias', 'rrhh_documentos', 'personas_pagos']));
drop policy if exists "rrhh eventos read" on public.rrhh_eventos;
create policy "rrhh eventos read" on public.rrhh_eventos for select to authenticated
using (public.has_any_module_permission(empresa_id, array['rrhh_personas', 'rrhh_contratos', 'rrhh_ausencias', 'rrhh_documentos', 'personas_pagos']));

-- Archivos laborales privados. La primera carpeta siempre corresponde a la
-- empresa, por ejemplo: empresa_id/persona_id/archivo.pdf.
insert into storage.buckets (id, name, public)
values ('rrhh-documentos', 'rrhh-documentos', false)
on conflict (id) do update set public = false;

create or replace function public.rrhh_storage_empresa_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public
as '
declare
  parsed_id uuid;
begin
  begin
    parsed_id := split_part(coalesce(object_name, ''''), ''/'', 1)::uuid;
  exception when others then
    return null;
  end;
  return parsed_id;
end;
';

drop policy if exists "rrhh storage read" on storage.objects;
create policy "rrhh storage read" on storage.objects for select to authenticated
using (
  bucket_id = 'rrhh-documentos'
  and public.has_any_module_permission(
    public.rrhh_storage_empresa_id(name),
    array['rrhh_documentos', 'rrhh_contratos', 'personas_pagos']
  )
);

drop policy if exists "rrhh storage insert" on storage.objects;
create policy "rrhh storage insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'rrhh-documentos'
  and public.has_module_permission(public.rrhh_storage_empresa_id(name), 'rrhh_documentos')
);

drop policy if exists "rrhh storage update" on storage.objects;
create policy "rrhh storage update" on storage.objects for update to authenticated
using (
  bucket_id = 'rrhh-documentos'
  and public.has_module_permission(public.rrhh_storage_empresa_id(name), 'rrhh_documentos')
)
with check (
  bucket_id = 'rrhh-documentos'
  and public.has_module_permission(public.rrhh_storage_empresa_id(name), 'rrhh_documentos')
);

drop policy if exists "rrhh storage delete" on storage.objects;
create policy "rrhh storage delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'rrhh-documentos'
  and public.has_module_permission(public.rrhh_storage_empresa_id(name), 'rrhh_documentos')
);

grant select on public.sistema_modulos to authenticated;
grant select, insert, update, delete on
  public.rrhh_centros_costo,
  public.rrhh_cargos,
  public.rrhh_contratos,
  public.rrhh_anexos,
  public.rrhh_ausencias,
  public.rrhh_saldos_vacaciones,
  public.rrhh_tipos_documento,
  public.rrhh_documentos_empleado,
  public.rrhh_alertas
to authenticated;
grant select on public.rrhh_eventos to authenticated;
grant execute on function public.sincronizar_alertas_rrhh(uuid) to authenticated;
grant execute on function public.vincular_usuario_persona(uuid, uuid, uuid) to authenticated;
grant execute on function public.listar_usuarios_empresa_detalle(uuid) to authenticated;
grant execute on function public.rrhh_storage_empresa_id(text) to authenticated;

notify pgrst, 'reload schema';

commit;
