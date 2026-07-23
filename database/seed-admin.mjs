import 'dotenv/config'
import bcrypt from 'bcryptjs'
import pg from 'pg'
import { randomUUID } from 'node:crypto'

const required = ['DATABASE_URL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_NAME', 'COMPANY_NAME', 'COMPANY_SLUG']
for (const name of required) if (!process.env[name]) throw new Error(`Falta ${name} en .env.`)
if (process.env.ADMIN_PASSWORD.length < 8) throw new Error('ADMIN_PASSWORD debe tener al menos 8 caracteres.')

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: ['1', 'true', 'require'].includes(String(process.env.DATABASE_SSL || '').toLowerCase()) ? { rejectUnauthorized: false } : undefined,
})
const client = await pool.connect()

try {
  await client.query('begin')
  const email = process.env.ADMIN_EMAIL.trim().toLowerCase()
  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12)
  const existingUser = await client.query(`select id from auth.users where lower(email) = $1 limit 1`, [email])
  const userId = existingUser.rows[0]?.id || randomUUID()
  const metadata = { erp_nombre: process.env.ADMIN_NAME.trim(), full_name: process.env.ADMIN_NAME.trim(), erp_requiere_cambio_clave: false }
  if (existingUser.rowCount) {
    await client.query(`update auth.users set encrypted_password = $2, raw_user_meta_data = $3::jsonb, email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = $1`, [userId, passwordHash, JSON.stringify(metadata)])
  } else {
    await client.query(`insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, $4::jsonb, now())`, [userId, email, passwordHash, JSON.stringify(metadata)])
  }

  const company = await client.query(
    `insert into public.empresas (nombre, razon_social, slug)
     values ($1, $1, $2)
     on conflict (slug) do update set nombre = excluded.nombre, updated_at = now()
     returning id`,
    [process.env.COMPANY_NAME.trim(), process.env.COMPANY_SLUG.trim().toLowerCase()],
  )
  const companyId = company.rows[0].id
  await client.query(
    `insert into public.usuarios_empresas (empresa_id, user_id, rol, activo, permisos_inicializados)
     values ($1, $2, 'owner', true, true)
     on conflict (empresa_id, user_id) do update set rol = 'owner', activo = true, permisos_inicializados = true, updated_at = now()`,
    [companyId, userId],
  )
  await client.query(
    `insert into public.usuario_empresa_activa (user_id, empresa_id) values ($1, $2)
     on conflict (user_id) do update set empresa_id = excluded.empresa_id, updated_at = now()`,
    [userId, companyId],
  )
  await client.query(
    `insert into public.perfiles_usuarios (user_id, nombre_completo, creado_por)
     values ($1, $2, $1)
     on conflict (user_id) do update set nombre_completo = excluded.nombre_completo, updated_at = now()`,
    [userId, process.env.ADMIN_NAME.trim()],
  )
  await client.query('commit')
  console.log(`Administrador preparado: ${email}`)
  console.log(`Empresa preparada: ${process.env.COMPANY_NAME.trim()}`)
} catch (error) {
  await client.query('rollback')
  throw error
} finally {
  client.release()
  await pool.end()
}
