alter table public.ordenes_trabajo
  add column if not exists cotizacion_documento_id bigint references public.cotizacion_documentos(id) on delete set null,
  add column if not exists nota_tecnica text,
  add column if not exists cliente_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists items jsonb not null default '[]'::jsonb;

create index if not exists idx_ordenes_trabajo_cotizacion_documento
  on public.ordenes_trabajo(empresa_id, cotizacion_documento_id);

create or replace function public.crear_ot_desde_cotizacion_documento(doc_id bigint)
returns public.ordenes_trabajo
language sql
security definer
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
      cotizacion_documento_id,
      folio,
      titulo,
      estado,
      prioridad,
      descripcion_problema,
      nota_tecnica,
      cliente_snapshot,
      items,
      created_by
    )
    select
      preparada.empresa_id,
      preparada.cliente_id,
      preparada.contacto_id,
      preparada.equipo_id,
      preparada.cotizacion_id,
      preparada.id,
      preparada.folio_ot,
      ''Servicio desde cotización '' || coalesce(preparada.numero::text, preparada.pre_numero, preparada.id::text),
      ''recibida'',
      ''normal'',
      nullif(trim(coalesce(preparada.referencia, preparada.observaciones, '''')), ''''),
      nullif(trim(coalesce(preparada.observaciones, preparada.referencia, '''')), ''''),
      jsonb_build_object(
        ''razon_social'', coalesce(preparada.cliente_nombre, ''''),
        ''rut'', coalesce(preparada.cliente_rut, ''''),
        ''direccion'', coalesce(preparada.cliente_direccion, ''''),
        ''ciudad'', trim(both '' / '' from concat_ws('' / '', nullif(preparada.cliente_comuna, ''''), nullif(preparada.cliente_ciudad, ''''))),
        ''telefono'', coalesce(preparada.cliente_telefono, ''''),
        ''email'', coalesce(preparada.cliente_email, '''')
      ),
      coalesce(preparada.items, ''[]''::jsonb),
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
    update public.ordenes_trabajo ot
    set cotizacion_documento_id = coalesce(ot.cotizacion_documento_id, preparada.id),
        cliente_snapshot = case when ot.cliente_snapshot = ''{}''::jsonb then jsonb_build_object(
          ''razon_social'', coalesce(preparada.cliente_nombre, ''''),
          ''rut'', coalesce(preparada.cliente_rut, ''''),
          ''direccion'', coalesce(preparada.cliente_direccion, ''''),
          ''ciudad'', trim(both '' / '' from concat_ws('' / '', nullif(preparada.cliente_comuna, ''''), nullif(preparada.cliente_ciudad, ''''))),
          ''telefono'', coalesce(preparada.cliente_telefono, ''''),
          ''email'', coalesce(preparada.cliente_email, '''')
        ) else ot.cliente_snapshot end,
        items = case when ot.items = ''[]''::jsonb then coalesce(preparada.items, ''[]''::jsonb) else ot.items end,
        nota_tecnica = coalesce(ot.nota_tecnica, nullif(trim(coalesce(preparada.observaciones, preparada.referencia, '''')), '''')),
        updated_at = now()
    from preparada
    where ot.empresa_id = preparada.empresa_id
      and ot.folio = preparada.folio_ot
    returning ot.*
  )
  select *
  from creada
  union all
  select *
  from existente
  limit 1
';

grant execute on function public.crear_ot_desde_cotizacion_documento(bigint) to authenticated;
notify pgrst, 'reload schema';
