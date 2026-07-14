# SQL Editor Supabase

Si Supabase muestra:

`Unable to find snippet with ID ...`

No es un error del SQL. Es una pestaña vieja del SQL Editor intentando abrir un snippet que no existe en ese proyecto.

## Que hacer

1. Cerrar esa pestaña con `Close tab`.
2. Ir a `SQL Editor`.
3. Crear una consulta nueva con `New query`.
4. Ejecutar estos archivos en orden:

   1. `01_base_empresas_clientes_equipos.sql`
   2. `02_cotizaciones_ot_modulos.sql`
   3. `03_indices_rls_permisos.sql`

Cada archivo debe terminar con `Success. No rows returned` o similar.

Ejecuta el archivo completo, sin seleccionar solo una parte del texto. Si se ejecuta una seleccion parcial que termina justo en una funcion, PostgreSQL puede responder con `unterminated dollar-quoted string` o errores parecidos.

La version actual evita `$$` en las funciones para que el SQL Editor de Supabase sea menos sensible al copiar y pegar.

## Alternativa

Tambien se puede ejecutar todo de una vez con:

`supabase/schema.sql`

Pero si el SQL Editor queda pegado con snippets viejos, usar los 3 archivos separados suele ser mas estable.

## Importante

Estos scripts son para una base nueva o de prueba. Eliminan y recrean tablas del ERP.

## Patches incrementales

Si ya ejecutaste los archivos 01, 02 y 03, no necesitas repetirlos para habilitar multiempresa avanzada.

Ejecuta solo:

`05_multiempresa_crear_y_seleccionar.sql`

Ese patch agrega:

- Empresa activa por usuario.
- Funcion para crear otra empresa y asociarte como owner.
- Funcion para cambiar la empresa activa.

Para habilitar logo y datos comerciales por empresa, ejecuta tambien:

`06_branding_empresa_logo_datos.sql`

Ese patch agrega campos de branding en `empresas` y crea el bucket publico `empresa-assets` para logos.

Para que las cotizaciones creen o vinculen automaticamente clientes y contactos, ejecuta:

`07_sync_cotizaciones_clientes_contactos.sql`

Ese patch agrega un trigger sobre `cotizacion_documentos` que sincroniza `clientes` y `contactos` al guardar una cotizacion.

Para crear ordenes de trabajo desde una cotizacion emitida, ejecuta:

`08_crear_ot_desde_cotizacion.sql`

Ese patch agrega la funcion `crear_ot_desde_cotizacion_documento(doc_id)` usada por la pantalla de Ordenes.

Para habilitar el modulo de personas, pagos, honorarios, liquidaciones y documentos, ejecuta:

`09_personas_pagos_honorarios.sql`

Ese patch agrega `personas`, `pagos_personas` y `documentos_personas` con RLS por empresa.

Para completar Google Ads y el control detallado de horas extra, ejecuta:

`10_google_ads_horas_extra.sql`

Ese patch es no destructivo y agrega campañas, métricas diarias, recomendaciones automáticas y horas extra asociables a una liquidación.

Para habilitar empresas asociadas y la flota de vehículos, ejecuta:

`11_flota_empresas_asociadas.sql`

Ese patch es no destructivo y agrega el directorio de empresas relacionadas, vehículos, conductores, asignaciones, kilometraje y vencimientos. Requiere haber ejecutado antes `09_personas_pagos_honorarios.sql`.
