# Intranet TH Control

Sistema interno multiempresa para Técnica Hidráulica. Esta versión funciona con una arquitectura propia:

```text
React + Vite → API Node.js → PostgreSQL
```

El navegador nunca recibe la contraseña de PostgreSQL. La API valida la sesión, la empresa activa y los permisos por módulo antes de leer o modificar información.

## Módulos incluidos

- Dashboard y Google Ads.
- Clientes, empresas asociadas, presupuestos y cotizaciones.
- Publicaciones, órdenes de trabajo, CRM y WhatsApp.
- Fichas de trabajadores, contratos, anexos, ausencias, documentos y alertas.
- Horas extra, anticipos, pagos y liquidaciones.
- Flota, maquinaria, repuestos, EPP, auditorías e importación Excel.
- Usuarios, roles y permisos por empresa.
- Registro de consultas técnicas.

## Requisitos

- Node.js 20 o superior.
- PostgreSQL 15 o superior.
- Una base vacía cuyo propietario sea el usuario definido en `DATABASE_URL`.
- Ese usuario técnico debe usar `BYPASSRLS` y pertenecer al rol PostgreSQL
  `authenticated` (consulta `database/README.md`). La API cambia a
  `authenticated` dentro de cada operación del usuario para aplicar RLS.

## Instalación rápida

Primero crea el usuario, los roles RLS y la base siguiendo
[`database/README.md`](database/README.md). Luego instala la aplicación:

```bash
cd /var/www/desarrollo/intranet
cp .env.example .env
nano .env
npm install
npm run db:schema
npm run db:init
npm run db:seed
npm run dev
```

La aplicación quedará disponible en `http://IP_DEL_SERVIDOR:5173`. La API utiliza el puerto `3001` y Vite la conecta automáticamente mediante proxy.

## Variables principales

```env
VITE_API_URL=/api
PORT=3001
TRUST_PROXY=1
DATABASE_URL=postgresql://intranet:CLAVE@127.0.0.1:5432/intranet
DATABASE_SSL=false
JWT_SECRET=SECRETO_ALEATORIO_DE_AL_MENOS_32_CARACTERES
UPLOAD_DIR=./uploads

ADMIN_EMAIL=admin@empresa.cl
ADMIN_PASSWORD=CONTRASENA_TEMPORAL
ADMIN_NAME=Administrador General
COMPANY_NAME=Técnica Hidráulica Ltda.
COMPANY_SLUG=tecnica-hidraulica
```

No publiques `.env` ni uses la contraseña de PostgreSQL en variables `VITE_*`.

## Base de datos

- `database/postgresql.sql`: SQL integral para PostgreSQL independiente.
- `npm run db:init`: instala el SQL sobre una base nueva.
- `npm run db:seed`: crea o actualiza el primer propietario y la empresa inicial.
- `supabase/sql-editor`: conserva el historial de parches del sistema anterior.

`db:init` se detiene si detecta una instalación existente. Solo permite una recreación destructiva cuando se define conscientemente `ALLOW_DATABASE_RESET=true`.

## Migrar la información del Supabase anterior

Primero instala el esquema en una base PostgreSQL vacía. Después completa en `.env`:

```env
SUPABASE_DATABASE_URL=postgresql://...
SUPABASE_URL=https://PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=CLAVE_PRIVADA_SOLO_EN_EL_SERVIDOR
```

Ejecuta:

```bash
npm run db:migrate:supabase
npm run storage:migrate:supabase
```

El primer comando copia usuarios, hashes de contraseña y datos empresariales. El segundo descarga logos y documentos privados al directorio `uploads`.

## Desarrollo y producción

```bash
# Desarrollo: API y Vite juntos
npm run dev

# Validación y compilación
npm run build

# Servir la compilación desde Node.js
npm start
```

En un servidor se recomienda ejecutar `npm start` mediante systemd o PM2 y utilizar Nginx como proxy HTTPS hacia `127.0.0.1:3001`.

Para trabajar desde VS Code y actualizar el servidor de desarrollo con Git,
consulta [`deploy/git-auto-deploy.md`](deploy/git-auto-deploy.md). El flujo
recomendado es hacer cambios en tu Mac, ejecutar `npm run build`, subir con
`git push` y luego correr `npm run deploy:dev` dentro del servidor.

## Seguridad

- Contraseñas cifradas con bcrypt.
- Sesiones firmadas mediante JWT.
- Autorización por empresa, rol y módulo en la API.
- Políticas RLS conservadas en PostgreSQL como segunda barrera.
- Archivos de RR.HH. privados mediante enlaces temporales firmados.
- Creación de usuarios administrada por propietarios y administradores.

## Remuneraciones

La calculadora contiene parámetros referenciales para Chile 2026. La liquidación definitiva debe validarse con Previred o asesoría contable, especialmente UF, impuesto único, mutualidad y cambios previsionales.
