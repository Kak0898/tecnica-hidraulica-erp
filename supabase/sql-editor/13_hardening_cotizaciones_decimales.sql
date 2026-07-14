-- Patch incremental: corrige montos decimales en presupuestos y cotizaciones.
-- Es no destructivo: conserva documentos existentes y admite CLP/UF.

alter table if exists public.cotizacion_documentos
  alter column subtotal type numeric(18,4) using subtotal::numeric,
  alter column neto type numeric(18,4) using neto::numeric,
  alter column iva type numeric(18,4) using iva::numeric,
  alter column total type numeric(18,4) using total::numeric;

alter table if exists public.cotizaciones
  alter column subtotal type numeric(18,4) using subtotal::numeric,
  alter column descuento type numeric(18,4) using descuento::numeric,
  alter column impuesto type numeric(18,4) using impuesto::numeric,
  alter column total type numeric(18,4) using total::numeric;

alter table if exists public.cotizacion_items
  alter column cantidad type numeric(18,4) using cantidad::numeric,
  alter column precio_unitario type numeric(18,4) using precio_unitario::numeric,
  alter column descuento type numeric(18,4) using descuento::numeric,
  alter column total type numeric(18,4) using total::numeric;

-- Compatibilidad con versiones anteriores que guardaban en public.th_documentos.
-- Solo convierte columnas monetarias que todavía sean enteros; nunca toca id, folio o numero.
do '
declare
  column_name_to_fix text;
begin
  if to_regclass(''public.th_documentos'') is null then
    return;
  end if;

  for column_name_to_fix in
    select c.column_name
    from information_schema.columns c
    where c.table_schema = ''public''
      and c.table_name = ''th_documentos''
      and c.data_type in (''bigint'', ''integer'', ''smallint'')
      and c.column_name = any (array[
        ''subtotal'', ''neto'', ''iva'', ''impuesto'', ''impuestos'', ''total'',
        ''descuento'', ''recargo'', ''precio'', ''precio_unitario'', ''valor_unitario'',
        ''total_neto'', ''total_iva'', ''total_documento'',
        ''monto_neto'', ''monto_iva'', ''monto_total''
      ])
  loop
    execute format(
      ''alter table public.th_documentos alter column %I type numeric(18,4) using %I::numeric'',
      column_name_to_fix,
      column_name_to_fix
    );
  end loop;
end;
' language plpgsql;

notify pgrst, 'reload schema';
