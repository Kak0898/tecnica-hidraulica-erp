import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en .env.')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: ['1', 'true', 'require'].includes(String(process.env.DATABASE_SSL || '').toLowerCase()) ? { rejectUnauthorized: false } : undefined,
})

try {
  const identity = await pool.query(`select rolsuper from pg_roles where rolname = current_user`)
  const isSuperuser = identity.rows[0]?.rolsuper === true
  const authRole = await pool.query(`select 1 from pg_roles where rolname = 'authenticated'`)
  if (!isSuperuser && !authRole.rowCount) {
    throw new Error('Falta el rol PostgreSQL authenticated. Créalo como postgres y ejecuta: grant authenticated to USUARIO_BASE;')
  }
  if (!isSuperuser) {
    const membership = await pool.query(`select pg_has_role(current_user, 'authenticated', 'member') as allowed`)
    if (membership.rows[0]?.allowed !== true) {
      throw new Error('El usuario de DATABASE_URL no pertenece al rol authenticated. Ejecuta como postgres: grant authenticated to USUARIO_BASE;')
    }
  }
  const existing = await pool.query(`select to_regclass('public.empresas') as table_name`)
  if (existing.rows[0]?.table_name && process.env.ALLOW_DATABASE_RESET !== 'true') {
    throw new Error('La base ya contiene TH Control. Para recrearla conscientemente define ALLOW_DATABASE_RESET=true; esta acción elimina los datos actuales.')
  }
  const schema = await readFile(path.join(root, 'database/postgresql.sql'), 'utf8')
  console.log('Instalando esquema PostgreSQL completo...')
  await pool.query(schema)
  console.log('Esquema PostgreSQL instalado correctamente.')
} finally {
  await pool.end()
}
