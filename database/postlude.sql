-- Tablas y permisos utilizados por la API Node.js propia.
create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_reset_tokens_user
  on public.password_reset_tokens(user_id, expires_at desc);

-- Datos comerciales y reglas personales de vendedores.
alter table public.empresas
  add column if not exists transferencia_banco text,
  add column if not exists transferencia_rut text,
  add column if not exists transferencia_tipo_cuenta text,
  add column if not exists transferencia_numero_cuenta text,
  add column if not exists transferencia_email_fallback text,
  add column if not exists transferencia_asunto_template text,
  add column if not exists comision_arriendo_mensual numeric not null default 0,
  add column if not exists comision_trabajo_hidraulico_pct numeric(7,4) not null default 0,
  add column if not exists comision_venta_apilador numeric not null default 0;

alter table public.personas
  add column if not exists rol_trabajador text not null default 'general';
alter table public.personas
  drop constraint if exists personas_rol_trabajador_check;
alter table public.personas
  add constraint personas_rol_trabajador_check check (
    rol_trabajador in ('general', 'vendedor', 'tecnico', 'administrativo', 'supervisor', 'jefatura')
  );

alter table public.cotizacion_documentos
  drop constraint if exists cotizacion_documentos_empresa_id_numero_key,
  add column if not exists vendedor_nombre text,
  add column if not exists vendedor_email text,
  add column if not exists asunto_transferencia text,
  add column if not exists serie_cotizacion text not null default 'TH',
  add column if not exists origen_documento text not null default 'sistema',
  add column if not exists importacion_uid text,
  add column if not exists importacion_archivo text,
  add column if not exists vendedor_id uuid references public.personas(id) on delete set null;

alter table public.cotizacion_documentos
  drop constraint if exists cotizacion_documentos_origen_check;
alter table public.cotizacion_documentos
  add constraint cotizacion_documentos_origen_check check (origen_documento in ('sistema', 'importado'));

create index if not exists idx_cotizacion_documentos_folio_fecha
  on public.cotizacion_documentos(empresa_id, numero, fecha_emision desc);
create unique index if not exists uq_cotizacion_documentos_importacion
  on public.cotizacion_documentos(empresa_id, importacion_uid)
  where importacion_uid is not null;

update public.empresas
set transferencia_banco = coalesce(nullif(transferencia_banco, ''), 'Banco de Chile'),
    transferencia_rut = coalesce(nullif(transferencia_rut, ''), '76.171.450-3'),
    transferencia_tipo_cuenta = coalesce(nullif(transferencia_tipo_cuenta, ''), 'Cuenta corriente'),
    transferencia_numero_cuenta = coalesce(nullif(transferencia_numero_cuenta, ''), '9010944505'),
    transferencia_email_fallback = coalesce(nullif(transferencia_email_fallback, ''), 'francodareck@tecnicahidraulica.cl'),
    transferencia_asunto_template = coalesce(nullif(transferencia_asunto_template, ''), 'Pago {{folio}} - {{vendedor}}'),
    comision_arriendo_mensual = case when comision_arriendo_mensual = 0 then 35000 else comision_arriendo_mensual end,
    comision_trabajo_hidraulico_pct = case when comision_trabajo_hidraulico_pct = 0 then 6 else comision_trabajo_hidraulico_pct end,
    comision_venta_apilador = case when comision_venta_apilador = 0 then 600000 else comision_venta_apilador end
where lower(coalesce(slug, '')) in ('tecnica-hidraulica', 'th', 'tecnica-hidraulica-ltda')
   or lower(coalesce(nombre, '')) like '%técnica hidráulica%'
   or lower(coalesce(nombre, '')) like '%tecnica hidraulica%';

update public.personas
set rol_trabajador = 'vendedor', updated_at = now()
where lower(nombre) like '%franco%'
   or coalesce(configuracion_extra ->> 'rol_trabajador', '') = 'vendedor';

update public.personas
set configuracion_extra = jsonb_set(coalesce(configuracion_extra, '{}'::jsonb), '{rol_trabajador}', to_jsonb(rol_trabajador), true)
where coalesce(configuracion_extra ->> 'rol_trabajador', '') is distinct from rol_trabajador;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select, update on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select, update on sequences to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;
