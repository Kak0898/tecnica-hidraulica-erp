import 'dotenv/config'
import pg from 'pg'

if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en .env.')

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: ['1', 'true', 'require'].includes(String(process.env.DATABASE_SSL || '').toLowerCase())
    ? { rejectUnauthorized: false }
    : undefined,
})

const commercial = {
  transferencia_banco: 'Banco de Chile',
  transferencia_rut: '76.171.450-3',
  transferencia_tipo_cuenta: 'Cuenta corriente',
  transferencia_numero_cuenta: '9010944505',
  transferencia_email_fallback: 'francodareck@tecnicahidraulica.cl',
  transferencia_asunto_template: 'Pago {{folio}} - {{vendedor}}',
  comision_arriendo_mensual: 35000,
  comision_trabajo_hidraulico_pct: 6,
  comision_venta_apilador: 600000,
}

const client = await pool.connect()
try {
  await client.query('begin')
  const companyResult = await client.query(`
    select id
    from public.empresas
    where lower(coalesce(slug, '')) in ('tecnica-hidraulica', 'th', 'tecnica-hidraulica-ltda')
       or lower(coalesce(nombre, '')) like '%técnica hidráulica%'
       or lower(coalesce(nombre, '')) like '%tecnica hidraulica%'
    order by created_at
    limit 1
  `)
  const companyId = companyResult.rows[0]?.id
  if (!companyId) throw new Error('No se encontró la empresa Técnica Hidráulica.')

  const commercialJson = JSON.stringify(commercial)
  await client.query(`
    update public.personas
    set rol_trabajador = 'vendedor',
        configuracion_extra = coalesce(configuracion_extra, '{}'::jsonb)
          || jsonb_build_object('rol_trabajador', 'vendedor', 'comercial', $2::jsonb),
        updated_at = now()
    where empresa_id = $1
      and lower(nombre) like '%franco%'
  `, [companyId, commercialJson])

  const users = await client.query(`
    select u.id,
           u.email,
           coalesce(
             nullif(trim(pu.nombre_completo), ''),
             nullif(trim(u.raw_user_meta_data ->> 'erp_nombre'), ''),
             split_part(u.email, '@', 1)
           ) as nombre
    from auth.users u
    left join public.perfiles_usuarios pu on pu.user_id = u.id
    where lower(u.email) in ('ventas@tecnicahidraulica.cl', 'usuario.general@tecnicahidraulica.cl')
  `)

  for (const user of users.rows) {
    const existing = await client.query(`
      select id, configuracion_extra
      from public.personas
      where empresa_id = $1 and usuario_id = $2
      limit 1
    `, [companyId, user.id])
    if (existing.rowCount) {
      await client.query(`
        update public.personas
        set rol_trabajador = 'vendedor',
            configuracion_extra = coalesce(configuracion_extra, '{}'::jsonb)
              || jsonb_build_object('rol_trabajador', 'vendedor', 'comercial', $3::jsonb),
            email = coalesce(nullif(email, ''), $2),
            updated_at = now()
        where id = $1
      `, [existing.rows[0].id, user.email, commercialJson])
    } else {
      await client.query(`
        insert into public.personas (
          empresa_id, tipo_relacion, nombre, email, cargo, activo,
          estado_laboral, usuario_id, configuracion_extra, rol_trabajador
        ) values ($1, 'contrato', $2, $3, 'Vendedor', true, 'activo', $4,
          jsonb_build_object('rol_trabajador', 'vendedor', 'comercial', $5::jsonb), 'vendedor')
      `, [companyId, user.nombre, user.email, user.id, commercialJson])
    }
  }

  await client.query('commit')
  console.log('Vendedores configurados: Usuario General, Rafael y Franco.')
} catch (error) {
  await client.query('rollback')
  throw error
} finally {
  client.release()
  await pool.end()
}
