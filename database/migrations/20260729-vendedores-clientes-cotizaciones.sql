begin;

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

alter table public.empresas
  drop constraint if exists empresas_comision_arriendo_check,
  add constraint empresas_comision_arriendo_check check (comision_arriendo_mensual >= 0),
  drop constraint if exists empresas_comision_hidraulica_check,
  add constraint empresas_comision_hidraulica_check check (comision_trabajo_hidraulico_pct between 0 and 100),
  drop constraint if exists empresas_comision_apilador_check,
  add constraint empresas_comision_apilador_check check (comision_venta_apilador >= 0);

alter table public.personas
  add column if not exists rol_trabajador text not null default 'general';

alter table public.personas
  drop constraint if exists personas_rol_trabajador_check,
  add constraint personas_rol_trabajador_check check (
    rol_trabajador in ('general', 'vendedor', 'tecnico', 'administrativo', 'supervisor', 'jefatura')
  );

alter table public.cotizacion_documentos
  add column if not exists vendedor_nombre text,
  add column if not exists vendedor_email text,
  add column if not exists asunto_transferencia text;

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

update public.personas p
set rol_trabajador = 'vendedor',
    cargo = coalesce(nullif(p.cargo, ''), 'Vendedor'),
    updated_at = now()
where lower(p.nombre) like '%franco%'
   or p.usuario_id in (
     select u.id
     from auth.users u
     where lower(u.email) in ('ventas@tecnicahidraulica.cl', 'usuario.general@tecnicahidraulica.cl')
   );

insert into public.personas (
  empresa_id, tipo_relacion, nombre, email, cargo, rol_trabajador, usuario_id, activo, estado_laboral
)
select
  ue.empresa_id,
  'contrato',
  coalesce(nullif(trim(pu.nombre_completo), ''), nullif(trim(u.raw_user_meta_data ->> 'erp_nombre'), ''), split_part(u.email, '@', 1)),
  u.email,
  'Vendedor',
  'vendedor',
  u.id,
  true,
  'activo'
from auth.users u
join public.usuarios_empresas ue on ue.user_id = u.id and ue.activo = true
left join public.perfiles_usuarios pu on pu.user_id = u.id
where lower(u.email) in ('ventas@tecnicahidraulica.cl', 'usuario.general@tecnicahidraulica.cl')
  and not exists (
    select 1
    from public.personas p
    where p.empresa_id = ue.empresa_id and p.usuario_id = u.id
  );

grant select, insert, update, delete on public.empresas, public.personas, public.cotizacion_documentos to authenticated;

notify pgrst, 'reload schema';

commit;
