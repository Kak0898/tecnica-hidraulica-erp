begin;

alter table public.personas
  add column if not exists rol_trabajador text not null default 'general';

alter table public.personas
  drop constraint if exists personas_rol_trabajador_check,
  add constraint personas_rol_trabajador_check check (
    rol_trabajador in ('general', 'vendedor', 'tecnico', 'administrativo', 'supervisor', 'jefatura')
  );

-- El folio comercial puede repetirse en historiales provenientes de distintas
-- series o años. La identidad real del documento sigue siendo su id interno.
alter table public.cotizacion_documentos
  drop constraint if exists cotizacion_documentos_empresa_id_numero_key;

alter table public.cotizacion_documentos
  add column if not exists serie_cotizacion text not null default 'TH',
  add column if not exists origen_documento text not null default 'sistema',
  add column if not exists importacion_uid text,
  add column if not exists importacion_archivo text,
  add column if not exists vendedor_id uuid references public.personas(id) on delete set null;

alter table public.cotizacion_documentos
  drop constraint if exists cotizacion_documentos_origen_check,
  add constraint cotizacion_documentos_origen_check
    check (origen_documento in ('sistema', 'importado'));

create index if not exists idx_cotizacion_documentos_folio_fecha
  on public.cotizacion_documentos(empresa_id, numero, fecha_emision desc);

create unique index if not exists uq_cotizacion_documentos_importacion
  on public.cotizacion_documentos(empresa_id, importacion_uid)
  where importacion_uid is not null;

-- Mantiene compatibilidad con fichas creadas antes de existir la columna
-- rol_trabajador. Desde ahora la columna es la fuente principal del rol.
update public.personas
set rol_trabajador = 'vendedor',
    updated_at = now()
where coalesce(configuracion_extra ->> 'rol_trabajador', '') = 'vendedor'
  and rol_trabajador <> 'vendedor';

update public.personas
set configuracion_extra = jsonb_set(
      coalesce(configuracion_extra, '{}'::jsonb),
      '{rol_trabajador}',
      to_jsonb(rol_trabajador),
      true
    ),
    updated_at = now()
where coalesce(configuracion_extra ->> 'rol_trabajador', '') is distinct from rol_trabajador;

grant select, insert, update, delete on public.cotizacion_documentos, public.personas to authenticated;
grant usage, select, update on sequence public.cotizacion_documentos_id_seq to authenticated;

notify pgrst, 'reload schema';

commit;
