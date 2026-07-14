# TH Control · Técnica Hidráulica

Base inicial del ERP propio para Técnica Hidráulica Ltda., preparada para evolucionar hacia una plataforma modular y multiempresa.

La versión actual incluye acceso por correo y contraseña, base multiempresa con seguridad por usuario, presupuestos/cotizaciones separados, órdenes de trabajo, Google Ads, trabajadores, horas extra, anticipos, pagos, liquidaciones, empresas asociadas, flota de vehículos y publicaciones multicanal de productos.

## Objetivo

Centralizar la operación técnica y comercial en una sola plataforma conectada a Supabase:

- Historial de equipos
- Inventario de maquinaria
- Repuestos
- Auditorías
- Cotizaciones
- Órdenes de trabajo
- Portal clientes
- QR por equipo
- WhatsApp automático
- Dashboard gerencial
- CRM comercial
- IA técnica
- Google Ads con métricas y recomendaciones diarias
- Trabajadores, horas extra, anticipos y liquidaciones
- Catálogo comercial y enlaces de publicaciones por producto

## Puesta en marcha

### 1. Base de datos

Para una base Supabase nueva, ejecutar completo:

`supabase/schema.sql`

Este archivo es el SQL integral y recrea las tablas del ERP. Para una base existente con datos, no volver a ejecutar `schema.sql`; ejecutar solamente:

el patch incremental más reciente requerido, por ejemplo:

`supabase/sql-editor/13_hardening_cotizaciones_decimales.sql`

### 2. Usuario y contraseña

En Supabase ir a Authentication > Users, crear el usuario interno de TH con correo y contraseña, e iniciar sesión desde TH Control. Al entrar por primera vez, usar Configuración para asociar la empresa base.

No se habilitó registro público: las cuentas las controla la administración de TH.

### 3. Variables del sistema

Copiar `.env.example` a `.env` y completar:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 4. Ejecutar

```bash
npm install
npm run dev
```

## Módulos incluidos

Esta primera base conserva los módulos funcionales heredados:

- Maquinaria
- Repuestos
- Auditorías
- Importación Excel/CSV
- Dashboard
- OCR de placas
- Cotizaciones, integrado como módulo estático en `public/modulos/cotizaciones`

El siguiente trabajo técnico es convertir esta base en un módulo ERP conectado:

1. Alinear el esquema Supabase con los campos reales usados por el frontend.
2. Agregar soporte multiempresa con `empresa_id`.
3. Agregar clientes y contactos.
4. Asociar equipos a clientes.
5. Crear historial técnico por equipo.
6. Preparar QR por equipo.
7. Conectar cotizaciones y órdenes de trabajo.

## Remuneraciones

La calculadora usa parámetros referenciales y editables para Chile 2026. La liquidación final debe verificarse en Previred o con asesoría contable, especialmente UF, impuesto único, mutualidad y cambios previsionales según el período.

## Deploy Vercel

Agregar variables de entorno en Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
