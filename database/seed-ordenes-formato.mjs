import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en .env.')

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: ['1', 'true', 'require'].includes(String(process.env.DATABASE_SSL || '').toLowerCase())
    ? { rejectUnauthorized: false }
    : undefined,
})

try {
  const root = path.dirname(fileURLToPath(import.meta.url))
  const sql = await readFile(path.join(root, 'migrations', '20260803-ordenes-trabajo-printable.sql'), 'utf8')
  await pool.query(sql)
  console.log('Formato imprimible y datos copiados de OT habilitados.')
} finally {
  await pool.end()
}
