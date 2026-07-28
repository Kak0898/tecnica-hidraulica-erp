import 'dotenv/config'
import pg from 'pg'
import { configurePostgresTypes } from './postgres-types.mjs'

const { Pool, types } = pg

// PostgreSQL DATE debe viajar como YYYY-MM-DD. Si se convierte a Date de
// JavaScript, JSON lo transforma en timestamp y rompe inputs type="date".
configurePostgresTypes(types)

function sslConfig() {
  const value = String(process.env.DATABASE_SSL || '').toLowerCase()
  if (!['1', 'true', 'require'].includes(value)) return undefined
  return { rejectUnauthorized: false }
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig(),
  max: Number(process.env.DATABASE_POOL_SIZE || 12),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

pool.on('error', (error) => {
  console.error('[postgres] conexión inactiva con error:', error.message)
})

export async function withUserTransaction(userId, callback) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query("select set_config('app.current_user_id', $1, true)", [userId])
    // La API aplica permisos por módulo y PostgreSQL vuelve a validarlos mediante RLS.
    // El usuario configurado en DATABASE_URL debe pertenecer al rol `authenticated`.
    await client.query('set local role authenticated')
    const result = await callback(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function getActiveCompany(userId) {
  const result = await pool.query(
    `select coalesce(
       (select uea.empresa_id
          from public.usuario_empresa_activa uea
          join public.usuarios_empresas ue
            on ue.empresa_id = uea.empresa_id
           and ue.user_id = uea.user_id
           and ue.activo = true
         where uea.user_id = $1
         limit 1),
       (select ue.empresa_id
          from public.usuarios_empresas ue
         where ue.user_id = $1 and ue.activo = true
         order by ue.created_at asc
         limit 1)
     ) as empresa_id`,
    [userId],
  )
  return result.rows[0]?.empresa_id || null
}

export async function getCompanyAccess(userId, companyId) {
  if (!companyId) return null
  const membership = await pool.query(
    `select ue.rol, ue.activo,
            coalesce(array_agg(up.modulo) filter (where up.permitido = true), array[]::text[]) as modulos
       from public.usuarios_empresas ue
       left join public.usuario_permisos up
         on up.empresa_id = ue.empresa_id and up.user_id = ue.user_id
      where ue.user_id = $1 and ue.empresa_id = $2
      group by ue.rol, ue.activo
      limit 1`,
    [userId, companyId],
  )
  const row = membership.rows[0]
  if (!row?.activo) return null
  return {
    role: row.rol,
    isAdmin: ['owner', 'admin'].includes(row.rol),
    modules: new Set(row.modulos || []),
  }
}

export function databaseError(error) {
  const code = error?.code || 'POSTGRES_ERROR'
  if (code === '23505') return { status: 409, code, message: 'Ya existe un registro con esos datos.' }
  if (code === '23503') return { status: 409, code, message: 'El registro está relacionado con otros datos y no puede procesarse de esa forma.' }
  if (code === '23514') return { status: 400, code, message: `Los datos no cumplen una validación: ${error.constraint || error.message}` }
  if (code === '22P02') return { status: 400, code, message: 'Uno de los valores tiene un formato inválido.' }
  if (code === '42501') return { status: 403, code, message: 'No tienes permisos para realizar esta operación.' }
  return { status: 400, code, message: error?.message || 'Error de base de datos.' }
}
