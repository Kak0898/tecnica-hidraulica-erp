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

grant execute on function public.crear_ot_desde_cotizacion_documento(bigint) to authenticated;
notify pgrst, 'reload schema';
