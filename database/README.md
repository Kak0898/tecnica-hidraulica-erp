# PostgreSQL propio

## Crear usuario y base

Ejemplo para PostgreSQL instalado en Ubuntu o Debian:

```bash
sudo -u postgres psql
```

```sql
create user intranet with password 'CAMBIAR_CLAVE_SEGURA' bypassrls;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end
$$;
grant authenticated to intranet;
grant usage on schema auth to authenticated;
grant select, insert, update, delete on auth.users to authenticated;
create database intranet owner intranet;
\q
```

Los roles se crean una sola vez por servidor PostgreSQL. Si el usuario ya existe,
prepáralo con `alter role intranet bypassrls;`, los `grant` anteriores y una clave
segura. `intranet` es un rol técnico exclusivo del servidor: nunca se entrega al
navegador. La API cambia localmente al rol `authenticated` para que PostgreSQL
aplique las políticas RLS en cada petición de usuario.

Configura la misma conexión en `DATABASE_URL`, ejecuta `npm run db:init` y luego `npm run db:seed`.

## SQL integral

`postgresql.sql` se genera uniendo la compatibilidad para PostgreSQL estándar, el esquema completo del ERP, Recursos Humanos y los permisos de la API.

Para regenerarlo después de modificar alguno de esos archivos:

```bash
npm run db:schema
npm run db:smoke
```

La prueba `db:smoke` levanta un PostgreSQL embebido temporal, instala el SQL
integral y comprueba permisos de importación y aislamiento entre empresas.

También puede instalarse directamente:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/postgresql.sql
```

El SQL integral es destructivo para las tablas del ERP y debe utilizarse sobre una base vacía. Para una instalación con datos se deben preparar migraciones incrementales.
