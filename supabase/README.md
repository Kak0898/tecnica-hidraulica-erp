# Base de Datos ERP

Este esquema prepara Supabase como base central del ERP:

- Multiempresa
- Clientes y contactos
- Equipos/maquinaria con QR
- Repuestos
- Empresas asociadas
- Flota de vehiculos y vencimientos
- Productos comerciales y publicaciones multicanal
- Cotizaciones
- Documentos de cotizacion/presupuesto
- Ordenes de trabajo
- Auditorias
- Historial tecnico por equipo
- Archivos
- CRM comercial
- WhatsApp automatico
- Registro de consultas IA

## Instalacion en Supabase

1. Crear un proyecto nuevo en Supabase.
2. Ir a SQL Editor.
3. Ejecutar el archivo `supabase/schema.sql`.
4. Activar Authentication.
5. Crear el primer usuario desde Supabase Auth.
6. Ejecutar el SQL de bootstrap cambiando el `user_id`.

## Importante

`schema.sql` esta pensado como inicializacion de una base limpia para el ERP.

Al comienzo elimina, si existen, las tablas propias del ERP (`machines`, `clientes`, `cotizaciones`, `ordenes_trabajo`, etc.) y las vuelve a crear con la estructura correcta. Esto evita errores cuando una tabla antigua ya existia sin columnas nuevas como `empresa_id`.

No ejecutar este archivo sobre una base con datos reales que se quieran conservar. Para una base productiva habria que usar migraciones incrementales.

## Modulo de cotizaciones

La app estatica copiada desde el sistema de cotizaciones fue integrada como modulo del ERP en:

`public/modulos/cotizaciones`

Para mantener la compatibilidad funcional sin perder el modelo ERP, se agregaron:

- `cotizacion_documentos`: guarda el documento completo, pre-cotizacion, cotizacion final, totales y JSON original.
- `erp_counters`: maneja folios por empresa.
- `next_erp_pre_cotizacion()`: genera folio de presupuesto.
- `next_erp_cotizacion()`: genera folio final de cotizacion.
- `emit_erp_cotizacion(bigint)`: convierte presupuesto guardado en cotizacion emitida.

Mas adelante, cuando el flujo este consolidado, `cotizacion_documentos` puede sincronizarse con las tablas normalizadas `cotizaciones` y `cotizacion_items`.

## Bootstrap primera empresa

Despues de crear el primer usuario, copiar su UUID desde Supabase Auth y ejecutar:

```sql
insert into public.empresas (nombre, rut, slug, email, telefono, direccion)
values (
  'Técnica Hidráulica Ltda.',
  null,
  'tecnica-hidraulica',
  null,
  null,
  null
)
returning id;
```

Luego usar el `id` retornado y el UUID del usuario:

```sql
insert into public.usuarios_empresas (empresa_id, user_id, rol)
values (
  'PEGAR_EMPRESA_ID',
  'PEGAR_AUTH_USER_ID',
  'owner'
);
```

Con eso, las tablas que usan `empresa_id default public.current_empresa_id()` podran insertar registros desde el frontend aunque las pantallas todavia no envien `empresa_id` explicitamente.

## Nota de transicion

Las tablas `machines` y `spare_parts` mantienen `unique (code)` para que las pantallas actuales sigan funcionando con `upsert(..., { onConflict: 'code' })`.

Cuando la app tenga selector de empresa y envie `empresa_id`, convendra cambiar esos upserts a:

```ts
upsert(payload, { onConflict: 'empresa_id,code' })
```

En ese momento se podra eliminar la restriccion global `unique (code)` y permitir codigos repetidos entre empresas distintas.
