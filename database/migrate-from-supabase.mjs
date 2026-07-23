import 'dotenv/config'
import pg from 'pg'

if (!process.env.SUPABASE_DATABASE_URL) throw new Error('Falta SUPABASE_DATABASE_URL en .env.')
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en .env.')
if (process.env.SUPABASE_DATABASE_URL === process.env.DATABASE_URL) throw new Error('La base de origen y destino no pueden ser la misma.')

const ssl = (name) => ['1', 'true', 'require'].includes(String(process.env[name] || '').toLowerCase()) ? { rejectUnauthorized: false } : undefined
const source = new pg.Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: ssl('SUPABASE_DATABASE_SSL') || { rejectUnauthorized: false } })
const target = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: ssl('DATABASE_SSL') })
const targetClient = await target.connect()

const tables = [
  'empresas', 'usuarios_empresas', 'usuario_empresa_activa', 'perfiles_usuarios', 'usuario_permisos',
  'clientes', 'contactos', 'machines', 'spare_parts', 'erp_counters', 'cotizaciones',
  'cotizacion_items', 'cotizacion_documentos', 'ordenes_trabajo', 'audits', 'equipo_eventos',
  'archivos', 'import_logs', 'rrhh_centros_costo', 'rrhh_cargos', 'personas',
  'pagos_personas', 'documentos_personas', 'horas_extra',
  'google_ads_campanas', 'google_ads_metricas_diarias', 'google_ads_recomendaciones',
  'crm_oportunidades', 'whatsapp_mensajes', 'ia_consultas', 'empresas_asociadas', 'vehiculos_empresa',
  'epp_items', 'epp_worker_sizes', 'productos_comerciales', 'publicaciones_productos',
  'rrhh_contratos', 'rrhh_anexos', 'rrhh_ausencias',
  'rrhh_saldos_vacaciones', 'rrhh_tipos_documento', 'rrhh_documentos_empleado', 'rrhh_alertas', 'rrhh_eventos',
]

function quote(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`Identificador inválido: ${value}`)
  return `"${value}"`
}

async function columns(pool, schema, table) {
  const result = await pool.query(
    `select column_name from information_schema.columns where table_schema = $1 and table_name = $2 order by ordinal_position`,
    [schema, table],
  )
  return result.rows.map((row) => row.column_name)
}

async function copyRows(schema, table, { selectSql = null, exclude = [] } = {}) {
  const sourceColumns = await columns(source, schema, table)
  const targetColumns = await columns(targetClient, schema, table)
  if (!sourceColumns.length || !targetColumns.length) return 0
  const shared = sourceColumns.filter((column) => targetColumns.includes(column) && !exclude.includes(column))
  if (!shared.length) return 0
  const result = await source.query(selectSql || `select ${shared.map(quote).join(', ')} from ${quote(schema)}.${quote(table)}`)
  let copied = 0
  for (let offset = 0; offset < result.rows.length; offset += 100) {
    const batch = result.rows.slice(offset, offset + 100)
    if (!batch.length) continue
    const params = []
    const values = batch.map((row) => `(${shared.map((column) => { params.push(row[column]); return `$${params.length}` }).join(', ')})`)
    const inserted = await targetClient.query(
      `insert into ${quote(schema)}.${quote(table)} (${shared.map(quote).join(', ')}) values ${values.join(', ')} on conflict do nothing`,
      params,
    )
    copied += inserted.rowCount || 0
  }
  return copied
}

async function restorePersonSupervisors() {
  const sourceColumns = await columns(source, 'public', 'personas')
  const targetColumns = await columns(targetClient, 'public', 'personas')
  if (!sourceColumns.includes('supervisor_id') || !targetColumns.includes('supervisor_id')) return 0
  const supervisors = await source.query(`select id, supervisor_id from public.personas where supervisor_id is not null`)
  let updated = 0
  for (const row of supervisors.rows) {
    const result = await targetClient.query(
      `update public.personas set supervisor_id = $2 where id = $1 and exists (select 1 from public.personas where id = $2)`,
      [row.id, row.supervisor_id],
    )
    updated += result.rowCount || 0
  }
  return updated
}

try {
  await targetClient.query('begin')
  const users = await copyRows('auth', 'users', {
    selectSql: `select id, email, encrypted_password, raw_user_meta_data, email_confirmed_at, last_sign_in_at, created_at, updated_at from auth.users`,
  })
  console.log(`auth.users: ${users}`)
  for (const table of tables) {
    const count = await copyRows('public', table, table === 'personas' ? { exclude: ['supervisor_id'] } : {})
    console.log(`${table}: ${count}`)
  }
  const supervisors = await restorePersonSupervisors()
  if (supervisors) console.log(`personas.supervisor_id: ${supervisors}`)
  await targetClient.query(`select setval(pg_get_serial_sequence('public.cotizacion_documentos', 'id'), greatest(coalesce((select max(id) from public.cotizacion_documentos), 1), 1), true)`)
  await targetClient.query('commit')
  console.log('Migración de datos finalizada. Ejecuta npm run storage:migrate:supabase para copiar archivos.')
} catch (error) {
  await targetClient.query('rollback')
  throw error
} finally {
  targetClient.release()
  await source.end()
  await target.end()
}
