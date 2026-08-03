import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const database = new PGlite({ extensions: { pgcrypto } })
const adminId = '11111111-1111-4111-8111-111111111111'
const importerId = '22222222-2222-4222-8222-222222222222'
const companyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherCompanyId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

async function asUser(userId, callback) {
  await database.exec('begin')
  try {
    await database.query("select set_config('app.current_user_id', $1, true)", [userId])
    await database.exec('set local role authenticated')
    await callback()
    await database.exec('commit')
  } catch (error) {
    await database.exec('rollback')
    throw error
  }
}

try {
  const schema = await readFile(path.join(root, 'database/postgresql.sql'), 'utf8')
  await database.exec(schema)
  const commissionImportMigration = await readFile(path.join(root, 'database/migrations/20260729-comisiones-personales-importacion-cotizaciones.sql'), 'utf8')
  await database.exec(commissionImportMigration)

  const tables = await database.query(
    `select count(*)::int as count from information_schema.tables where table_schema = 'public'`,
  )
  assert.equal(tables.rows[0]?.count, 46, 'El esquema debe crear las 46 tablas públicas esperadas.')

  // La conexión privada de la API puede preparar cuentas y consultar membresías.
  // Cada petición de usuario cambia después al rol `authenticated`, donde RLS
  // vuelve a aislar empresas y permisos.
  await database.exec(`create role intranet_service login inherit bypassrls`)
  await database.exec(`grant authenticated to intranet_service`)
  await database.exec(`set role intranet_service`)

  await database.query(
    `insert into auth.users (id, email) values ($1, $2), ($3, $4)`,
    [adminId, 'admin@test.cl', importerId, 'importador@test.cl'],
  )
  await database.query(
    `insert into public.empresas (id, nombre, slug) values ($1, $2, $3), ($4, $5, $6)`,
    [companyId, 'Empresa A', 'empresa-a', otherCompanyId, 'Empresa B', 'empresa-b'],
  )
  await database.query(
    `insert into public.usuarios_empresas
       (empresa_id, user_id, rol, activo, permisos_inicializados)
     values ($1, $2, 'owner', true, true), ($1, $3, 'operador', true, true)`,
    [companyId, adminId, importerId],
  )
  await database.query(
    `insert into public.usuario_empresa_activa (user_id, empresa_id) values ($1, $3), ($2, $3)`,
    [adminId, importerId, companyId],
  )
  await database.query(
    `insert into public.usuario_permisos (empresa_id, user_id, modulo, permitido)
     values ($1, $2, 'importar_excel', true)`,
    [companyId, importerId],
  )

  await asUser(adminId, async () => {
    await database.query(
      `insert into public.machines (empresa_id, code, name) values ($1, 'QA-ADMIN', 'Equipo admin')`,
      [companyId],
    )
    await database.query(
      `insert into public.cotizacion_documentos
         (empresa_id, tipo, estado, numero, cliente_nombre, items, data, subtotal, neto, iva, total)
       values
         ($1, 'COTIZACIÓN', 'cotizacion_emitida', 1, 'Cliente creado desde cotización', '[]', '{}', 2, 2, 0.38, 2.38),
         ($1, 'COTIZACIÓN', 'cotizacion_emitida', 1, 'Cliente histórico mismo folio', '[]', '{}', 3, 3, 0.57, 3.57)`,
      [companyId],
    )
  })

  await asUser(importerId, async () => {
    await database.query(
      `insert into public.machines (empresa_id, code, name) values ($1, 'QA-IMPORT', 'Equipo importado')`,
      [companyId],
    )
    await database.query(
      `insert into public.spare_parts (empresa_id, code, name) values ($1, 'REP-QA', 'Repuesto importado')`,
      [companyId],
    )
    await database.query(
      `insert into public.epp_items (empresa_id, code, name, category, talla)
       values ($1, 'EPP-QA', 'Casco', 'proteccion_cabeza', 'UNICA')`,
      [companyId],
    )
  })

  await assert.rejects(
    asUser(importerId, async () => {
      await database.query(
        `insert into public.machines (empresa_id, code, name) values ($1, 'NO-DEBE', 'Empresa ajena')`,
        [otherCompanyId],
      )
    }),
    (error) => error?.code === '42501',
    'RLS debe impedir que un usuario escriba en otra empresa.',
  )

  const counts = await database.query(
    `select
       (select count(*)::int from public.machines) as machines,
       (select count(*)::int from public.spare_parts) as spare_parts,
       (select count(*)::int from public.epp_items) as epp_items,
       (select count(*)::int from public.cotizacion_documentos) as quotes,
       (select count(*)::int from public.cotizacion_documentos where numero = 1) as repeated_quote_numbers,
       (select count(*)::int from public.clientes where razon_social = 'Cliente creado desde cotización') as quote_clients`,
  )
  assert.deepEqual(counts.rows[0], { machines: 2, spare_parts: 1, epp_items: 1, quotes: 2, repeated_quote_numbers: 2, quote_clients: 1 })
  console.log('PostgreSQL smoke test correcto: esquema, cotizaciones, importación y aislamiento multiempresa.')
} finally {
  await database.close()
}
