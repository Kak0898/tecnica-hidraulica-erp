import 'dotenv/config'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import multer from 'multer'
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { authenticate, createFileToken, createSession, publicUser, verifyFileToken } from './auth.mjs'
import { canManageCredentials, validateCredentialChange } from './admin-users.mjs'
import { databaseError, getActiveCompany, getCompanyAccess, pool, withUserTransaction } from './db.mjs'
import { fetchGoogleAdsMetrics, googleAdsConfiguration, persistGoogleAdsRows } from './google-ads.mjs'
import { calculateCommission, commercialRules, quoteNetAmount, receiptFilename, validateCommercialRules } from './commissions.mjs'
import { ALL_MODULES, hasAnyModule, RPC_ALLOWLIST, SET_RETURNING_RPCS } from './policies.mjs'
import { executeDataQuery } from './query.mjs'
import { formatRut, isValidRut } from '../shared/rut.js'
import { normalizeQuoteImportRow } from '../shared/quote-import.js'

if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en .env.')
if (String(process.env.JWT_SECRET || '').length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres.')

const app = express()
const port = Number(process.env.PORT || 3001)
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const uploadRoot = path.resolve(rootDir, process.env.UPLOAD_DIR || 'uploads')
const transferReceiptBucket = 'comprobantes-transferencia'
const documentRoot = path.resolve(process.env.DOCUMENT_ROOT || process.env.TRANSFER_RECEIPT_DIR || path.resolve(rootDir, '..', 'doc'))
const transferReceiptRoot = path.resolve(documentRoot, 'cotizaciones')
const employeeDocumentRoot = path.resolve(documentRoot, 'empleado')
const companyDocumentBucket = 'documentos-empresa'
const companyDocumentRoot = path.resolve(documentRoot, 'empresa')
const vehicleFileBucket = 'vehiculos-archivos'
const vehicleFileRoot = path.resolve(documentRoot, 'vehiculos')
const displayStoragePath = (value) => String(value).replace(/^\/private\/var(?=\/)/, '/var')
const maxUploadBytes = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 15)) * 1024 * 1024
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxUploadBytes, files: 1 } })
const credentialsKey = createHash('sha256').update(String(process.env.CREDENTIALS_SECRET || process.env.JWT_SECRET)).digest()
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de acceso. Espera 15 minutos antes de volver a intentarlo.' },
})

app.disable('x-powered-by')
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : Number(process.env.TRUST_PROXY))
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: true, credentials: false, allowedHeaders: ['Authorization', 'Content-Type'] }))
app.use(express.json({ limit: '12mb' }))

app.get('/api/health', async (_req, res) => {
  try {
    const result = await pool.query(`select current_database() as database, to_regclass('public.empresas') is not null as schema_ready`)
    res.json({ ok: true, database: result.rows[0]?.database, schema_ready: result.rows[0]?.schema_ready === true })
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message })
  }
})

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' })
  try {
    const result = await pool.query(
      `select id, email, encrypted_password, raw_user_meta_data
         from auth.users
        where lower(email) = $1
        limit 1`,
      [email],
    )
    const user = result.rows[0]
    const valid = user?.encrypted_password && await bcrypt.compare(password, user.encrypted_password)
    if (!valid) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' })
    const active = await pool.query(
      `select 1 from public.usuarios_empresas where user_id = $1 and activo = true limit 1`,
      [user.id],
    )
    if (!active.rowCount) return res.status(403).json({ error: 'La cuenta no tiene acceso activo a ninguna empresa.' })
    await pool.query(`update auth.users set last_sign_in_at = now(), updated_at = now() where id = $1`, [user.id])
    res.json({ session: createSession(user) })
  } catch (error) {
    const formatted = databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: formatted.code })
  }
})

app.post('/api/auth/request-reset', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!email) return res.status(400).json({ error: 'Ingresa el correo de la cuenta.' })
  res.status(503).json({ error: 'La recuperación automática por correo todavía no está configurada. Solicita a un administrador una contraseña temporal.' })
})

app.get('/api/auth/session', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `select id, email, raw_user_meta_data from auth.users where id = $1 limit 1`,
      [req.user.id],
    )
    if (!result.rowCount) return res.status(401).json({ error: 'La cuenta ya no existe.' })
    res.json({ user: publicUser(result.rows[0]) })
  } catch (error) {
    const formatted = databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: formatted.code })
  }
})

app.patch('/api/auth/user', authenticate, async (req, res) => {
  const password = req.body?.password == null ? null : String(req.body.password)
  const metadata = req.body?.data && typeof req.body.data === 'object' ? req.body.data : null
  if (password != null && password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' })
  try {
    const current = await pool.query(`select raw_user_meta_data from auth.users where id = $1`, [req.user.id])
    if (!current.rowCount) return res.status(404).json({ error: 'Usuario no encontrado.' })
    const mergedMetadata = metadata ? { ...(current.rows[0].raw_user_meta_data || {}), ...metadata } : current.rows[0].raw_user_meta_data || {}
    const hash = password == null ? null : await bcrypt.hash(password, 12)
    if (hash) mergedMetadata.erp_auth_version = Number(mergedMetadata.erp_auth_version || 0) + 1
    const result = await pool.query(
      `update auth.users
          set encrypted_password = coalesce($2, encrypted_password),
              raw_user_meta_data = $3::jsonb,
              updated_at = now()
        where id = $1
        returning id, email, raw_user_meta_data`,
      [req.user.id, hash, JSON.stringify(mergedMetadata)],
    )
    res.json({ user: publicUser(result.rows[0]), session: createSession(result.rows[0]) })
  } catch (error) {
    const formatted = databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: formatted.code })
  }
})

app.post('/api/data/query', authenticate, async (req, res) => {
  try {
    res.json(await executeDataQuery(req.user.id, req.body))
  } catch (error) {
    console.error('[api/data/query]', {
      table: req.body?.table,
      action: req.body?.action,
      code: error?.code,
      message: error?.message,
      detail: error?.detail,
    })
    const formatted = error.status
      ? { status: error.status, code: error.code || 'API_ERROR', message: error.message }
      : databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: formatted.code })
  }
})

const RPC_PARAMETERS = {
  actualizar_nombre_usuario_empresa: ['p_empresa_id', 'p_user_id', 'p_nombre_completo'],
  bootstrap_empresa_tecnica_hidraulica: [],
  cambiar_estado_usuario_empresa: ['p_empresa_id', 'p_user_id', 'p_activo'],
  crear_ot_desde_cotizacion_documento: ['doc_id'],
  create_empresa_owner: ['p_nombre', 'p_slug', 'p_rut', 'p_email', 'p_telefono', 'p_direccion', 'p_rubro'],
  eliminar_empresa_confirmada: ['p_empresa_id', 'p_fecha_confirmacion'],
  generar_recomendaciones_google_ads: ['p_fecha'],
  guardar_permisos_usuario: ['p_empresa_id', 'p_email', 'p_rol', 'p_modulos'],
  listar_usuarios_empresa_detalle: ['p_empresa_id'],
  mis_permisos_empresa: ['p_empresa_id'],
  next_erp_cotizacion: [],
  next_erp_pre_cotizacion: [],
  set_empresa_activa: ['p_empresa_id'],
  sincronizar_alertas_rrhh: ['p_empresa_id'],
  vincular_usuario_persona: ['p_empresa_id', 'p_user_id', 'p_persona_id'],
}

app.post('/api/rpc/:name', authenticate, async (req, res) => {
  const name = req.params.name
  if (!RPC_ALLOWLIST.has(name)) return res.status(404).json({ error: 'Operación segura no disponible.' })
  const parameterNames = RPC_PARAMETERS[name] || []
  const values = parameterNames.map((key) => req.body?.[key] ?? null)
  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ')
  try {
    const data = await withUserTransaction(req.user.id, async (client) => {
      if (SET_RETURNING_RPCS.has(name)) {
        return (await client.query(`select * from public.${name}(${placeholders})`, values)).rows
      }
      const result = await client.query(`select to_jsonb(public.${name}(${placeholders})) as result`, values)
      return result.rows[0]?.result ?? null
    })
    res.json({ data })
  } catch (error) {
    const formatted = databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: formatted.code })
  }
})

app.post('/api/functions/crear-usuario-empresa', authenticate, async (req, res) => {
  const companyId = String(req.body?.empresa_id || '')
  const fullName = String(req.body?.nombre_completo || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const role = req.body?.rol === 'admin' ? 'admin' : 'operador'
  const modules = [...new Set((Array.isArray(req.body?.modulos) ? req.body.modulos : []).filter((module) => ALL_MODULES.includes(module)))]
  const personId = req.body?.persona_id || null
  if (!companyId || fullName.length < 2 || !email || password.length < 8) {
    return res.status(400).json({ error: 'Empresa, nombre, correo y contraseña temporal de 8 caracteres son obligatorios.' })
  }
  if (role === 'operador' && !modules.length) return res.status(400).json({ error: 'Selecciona al menos una sección para el usuario.' })
  try {
    const access = await getCompanyAccess(req.user.id, companyId)
    if (!access?.isAdmin) return res.status(403).json({ error: 'Solo un administrador puede crear usuarios.' })
    const client = await pool.connect()
    try {
      await client.query('begin')
      const existing = await client.query(`select id from auth.users where lower(email) = $1 limit 1`, [email])
      if (existing.rowCount) throw Object.assign(new Error('Ya existe una cuenta con ese correo.'), { status: 409 })
      if (personId) {
        const person = await client.query(`select id from public.personas where id = $1 and empresa_id = $2 and usuario_id is null`, [personId, companyId])
        if (!person.rowCount) throw Object.assign(new Error('La ficha laboral seleccionada no está disponible.'), { status: 409 })
      }
      const userId = randomUUID()
      const passwordHash = await bcrypt.hash(password, 12)
      const metadata = {
        erp_nombre: fullName,
        full_name: fullName,
        erp_requiere_cambio_clave: true,
      }
      await client.query(
        `insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at)
         values ($1, $2, $3, $4::jsonb, now())`,
        [userId, email, passwordHash, JSON.stringify(metadata)],
      )
      await client.query(
        `insert into public.usuarios_empresas (empresa_id, user_id, rol, activo, permisos_inicializados)
         values ($1, $2, $3, true, true)`,
        [companyId, userId, role],
      )
      await client.query(
        `insert into public.usuario_empresa_activa (user_id, empresa_id) values ($1, $2)`,
        [userId, companyId],
      )
      await client.query(
        `insert into public.perfiles_usuarios (user_id, nombre_completo, creado_por)
         values ($1, $2, $3)`,
        [userId, fullName, req.user.id],
      )
      const moduleRows = await client.query(`select clave from public.sistema_modulos where activo = true and solo_admin = false`)
      for (const row of moduleRows.rows) {
        await client.query(
          `insert into public.usuario_permisos (empresa_id, user_id, modulo, permitido)
           values ($1, $2, $3, $4)
           on conflict (empresa_id, user_id, modulo) do update set permitido = excluded.permitido, updated_at = now()`,
          [companyId, userId, row.clave, role === 'operador' && modules.includes(row.clave)],
        )
      }
      if (personId) await client.query(`update public.personas set usuario_id = $1, updated_at = now() where id = $2 and empresa_id = $3`, [userId, personId, companyId])
      await client.query('commit')
      res.status(201).json({ data: { user_id: userId, email } })
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    const formatted = error.status
      ? { status: error.status, code: 'USER_CREATE_ERROR', message: error.message }
      : databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: formatted.code })
  }
})

app.post('/api/functions/actualizar-credenciales-usuario', authenticate, async (req, res) => {
  const companyId = String(req.body?.empresa_id || '')
  const targetUserId = String(req.body?.user_id || '')
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (!companyId || !targetUserId) return res.status(400).json({ error: 'Empresa y usuario son obligatorios.' })

  try {
    const callerAccess = await getCompanyAccess(req.user.id, companyId)
    if (!callerAccess?.isAdmin) return res.status(403).json({ error: 'Solo un administrador puede cambiar credenciales.' })
    const targetResult = await pool.query(
      `select u.id, u.email, u.encrypted_password, u.raw_user_meta_data, ue.rol
         from auth.users u
         join public.usuarios_empresas ue on ue.user_id = u.id
        where u.id = $1 and ue.empresa_id = $2
        limit 1`,
      [targetUserId, companyId],
    )
    if (!targetResult.rowCount) return res.status(404).json({ error: 'El usuario no pertenece a la empresa activa.' })
    const target = targetResult.rows[0]
    if (!canManageCredentials(callerAccess.role, target.rol, target.id === req.user.id)) {
      return res.status(403).json({ error: 'No puedes cambiar las credenciales de ese usuario. El propietario protege las cuentas administrativas.' })
    }
    const validation = validateCredentialChange({ email, password, currentEmail: target.email })
    if (validation) return res.status(400).json({ error: validation })

    const passwordHash = password ? await bcrypt.hash(password, 12) : null
    const metadata = {
      ...(target.raw_user_meta_data || {}),
      erp_auth_version: Number(target.raw_user_meta_data?.erp_auth_version || 0) + 1,
      ...(password ? { erp_requiere_cambio_clave: true } : {}),
    }
    const updated = await pool.query(
      `update auth.users
          set email = $2,
              encrypted_password = coalesce($3, encrypted_password),
              raw_user_meta_data = $4::jsonb,
              updated_at = now()
        where id = $1
        returning id, email`,
      [target.id, email, passwordHash, JSON.stringify(metadata)],
    )
    console.info('[usuarios] credenciales actualizadas', { actor: req.user.id, target: target.id, companyId, emailChanged: email !== target.email, passwordChanged: Boolean(password) })
    res.json({ data: { user_id: updated.rows[0].id, email: updated.rows[0].email, password_changed: Boolean(password) } })
  } catch (error) {
    const formatted = databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: formatted.code })
  }
})

function encryptSecret(value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', credentialsKey, iv)
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  }
}

function decryptSecret(row) {
  const decipher = createDecipheriv('aes-256-gcm', credentialsKey, Buffer.from(row.password_iv, 'base64'))
  decipher.setAuthTag(Buffer.from(row.password_tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(row.password_ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

async function requireAdminCompany(userId, companyId) {
  const access = await getCompanyAccess(userId, companyId)
  if (!access?.isAdmin) throw Object.assign(new Error('Solo administradores pueden ver o administrar credenciales.'), { status: 403 })
  return access
}

async function validateCurrentPassword(userId, password) {
  const result = await pool.query(`select encrypted_password from auth.users where id = $1 limit 1`, [userId])
  const valid = result.rows[0]?.encrypted_password && await bcrypt.compare(String(password || ''), result.rows[0].encrypted_password)
  if (!valid) throw Object.assign(new Error('La contraseña de tu cuenta no coincide.'), { status: 401 })
}

app.post('/api/functions/hosting-credentials-get', authenticate, async (req, res) => {
  const companyId = String(req.body?.empresa_id || '')
  if (!companyId) return res.status(400).json({ error: 'Empresa obligatoria.' })
  try {
    await requireAdminCompany(req.user.id, companyId)
    const result = await pool.query(`
      select hc.id, hc.servicio, hc.url, hc.usuario, hc.notas, hc.updated_at,
             hc.password_ciphertext is not null as tiene_password,
             coalesce(pu.nombre_completo, au.email) as actualizado_por
        from public.hosting_credenciales hc
        left join public.perfiles_usuarios pu on pu.user_id = hc.updated_by
        left join auth.users au on au.id = hc.updated_by
       where hc.empresa_id = $1 and hc.servicio = 'cpanel'
       limit 1
    `, [companyId])
    const row = result.rows[0]
    res.json({ data: row ? {
      id: row.id,
      servicio: row.servicio,
      url: row.url,
      usuario: row.usuario,
      notas: row.notas,
      updated_at: row.updated_at,
      tiene_password: row.tiene_password,
      actualizado_por: row.actualizado_por,
    } : null })
  } catch (error) {
    const formatted = error.status
      ? { status: error.status, code: 'HOSTING_CREDENTIALS_ERROR', message: error.message }
      : databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: formatted.code })
  }
})

app.post('/api/functions/hosting-credentials-save', authenticate, async (req, res) => {
  const companyId = String(req.body?.empresa_id || '')
  const url = String(req.body?.url || 'https://cpanel.tecnicahidraulica.cl/').trim()
  const usuario = String(req.body?.usuario || '').trim()
  const password = String(req.body?.password || '')
  const notas = String(req.body?.notas || '').trim()
  if (!companyId) return res.status(400).json({ error: 'Empresa obligatoria.' })
  if (!usuario) return res.status(400).json({ error: 'Ingresa el usuario de cPanel.' })
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'La URL debe comenzar con http:// o https://.' })

  try {
    await requireAdminCompany(req.user.id, companyId)
    const current = await pool.query(`select id, password_ciphertext from public.hosting_credenciales where empresa_id = $1 and servicio = 'cpanel' limit 1`, [companyId])
    if (!current.rowCount && !password) return res.status(400).json({ error: 'Ingresa la contraseña de cPanel para crear la credencial.' })
    const encrypted = password ? encryptSecret(password) : null
    const result = await pool.query(`
      insert into public.hosting_credenciales (
        empresa_id, servicio, url, usuario, password_ciphertext, password_iv, password_tag, notas, created_by, updated_by
      ) values (
        $1, 'cpanel', $2, $3, $4, $5, $6, $7, $8, $8
      )
      on conflict (empresa_id, servicio) do update set
        url = excluded.url,
        usuario = excluded.usuario,
        password_ciphertext = coalesce(excluded.password_ciphertext, public.hosting_credenciales.password_ciphertext),
        password_iv = coalesce(excluded.password_iv, public.hosting_credenciales.password_iv),
        password_tag = coalesce(excluded.password_tag, public.hosting_credenciales.password_tag),
        notas = excluded.notas,
        updated_by = excluded.updated_by,
        updated_at = now()
      returning id, servicio, url, usuario, notas, updated_at, password_ciphertext is not null as tiene_password
    `, [companyId, url, usuario, encrypted?.ciphertext || null, encrypted?.iv || null, encrypted?.tag || null, notas || null, req.user.id])
    res.json({ data: result.rows[0] })
  } catch (error) {
    const formatted = error.status
      ? { status: error.status, code: 'HOSTING_CREDENTIALS_ERROR', message: error.message }
      : databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: formatted.code })
  }
})

app.post('/api/functions/hosting-credentials-reveal', authenticate, async (req, res) => {
  const companyId = String(req.body?.empresa_id || '')
  const currentPassword = String(req.body?.current_password || '')
  if (!companyId || !currentPassword) return res.status(400).json({ error: 'Empresa y contraseña actual son obligatorias.' })
  try {
    await requireAdminCompany(req.user.id, companyId)
    await validateCurrentPassword(req.user.id, currentPassword)
    const result = await pool.query(`
      select id, url, usuario, password_ciphertext, password_iv, password_tag
        from public.hosting_credenciales
       where empresa_id = $1 and servicio = 'cpanel'
       limit 1
    `, [companyId])
    if (!result.rowCount) return res.status(404).json({ error: 'Todavía no hay credenciales de cPanel guardadas.' })
    const row = result.rows[0]
    res.json({ data: { id: row.id, url: row.url, usuario: row.usuario, password: decryptSecret(row) } })
  } catch (error) {
    const formatted = error.status
      ? { status: error.status, code: 'HOSTING_CREDENTIALS_ERROR', message: error.message }
      : databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: formatted.code })
  }
})

app.post('/api/functions/hosting-email-credentials-list', authenticate, async (req, res) => {
  const companyId = String(req.body?.empresa_id || '')
  if (!companyId) return res.status(400).json({ error: 'Empresa obligatoria.' })
  try {
    await requireAdminCompany(req.user.id, companyId)
    const result = await pool.query(`
      select ec.id, ec.nombre, ec.correo, ec.usuario, ec.imap_host, ec.smtp_host, ec.notas,
             ec.activo, ec.updated_at, ec.password_ciphertext is not null as tiene_password,
             coalesce(pu.nombre_completo, au.email) as actualizado_por
        from public.correo_credenciales ec
        left join public.perfiles_usuarios pu on pu.user_id = ec.updated_by
        left join auth.users au on au.id = ec.updated_by
       where ec.empresa_id = $1
       order by ec.activo desc, ec.correo asc
    `, [companyId])
    res.json({ data: result.rows })
  } catch (error) {
    const formatted = error.status
      ? { status: error.status, code: 'EMAIL_CREDENTIALS_ERROR', message: error.message }
      : databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: formatted.code })
  }
})

app.post('/api/functions/hosting-email-credentials-save', authenticate, async (req, res) => {
  const companyId = String(req.body?.empresa_id || '')
  const id = String(req.body?.id || '')
  const nombre = String(req.body?.nombre || '').trim()
  const correo = String(req.body?.correo || '').trim().toLowerCase()
  const usuario = String(req.body?.usuario || correo).trim()
  const password = String(req.body?.password || '')
  const imapHost = String(req.body?.imap_host || 'mail.tecnicahidraulica.cl').trim()
  const smtpHost = String(req.body?.smtp_host || 'mail.tecnicahidraulica.cl').trim()
  const notas = String(req.body?.notas || '').trim()
  const activo = req.body?.activo !== false
  if (!companyId) return res.status(400).json({ error: 'Empresa obligatoria.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return res.status(400).json({ error: 'Ingresa un correo válido.' })
  if (!usuario) return res.status(400).json({ error: 'Ingresa el usuario del correo.' })

  try {
    await requireAdminCompany(req.user.id, companyId)
    const current = id
      ? await pool.query(`select id from public.correo_credenciales where id = $1 and empresa_id = $2 limit 1`, [id, companyId])
      : { rowCount: 0 }
    if (id && !current.rowCount) return res.status(404).json({ error: 'La credencial de correo no existe.' })
    if (!id && !password) return res.status(400).json({ error: 'Ingresa la contraseña del correo para crear el registro.' })
    const encrypted = password ? encryptSecret(password) : null
    const result = id
      ? await pool.query(`
          update public.correo_credenciales set
            nombre = $3,
            correo = $4,
            usuario = $5,
            password_ciphertext = coalesce($6, password_ciphertext),
            password_iv = coalesce($7, password_iv),
            password_tag = coalesce($8, password_tag),
            imap_host = $9,
            smtp_host = $10,
            notas = $11,
            activo = $12,
            updated_by = $13,
            updated_at = now()
          where id = $1 and empresa_id = $2
          returning id, nombre, correo, usuario, imap_host, smtp_host, notas, activo, updated_at,
                    password_ciphertext is not null as tiene_password
        `, [id, companyId, nombre || null, correo, usuario, encrypted?.ciphertext || null, encrypted?.iv || null, encrypted?.tag || null, imapHost || null, smtpHost || null, notas || null, activo, req.user.id])
      : await pool.query(`
          insert into public.correo_credenciales (
            empresa_id, nombre, correo, usuario, password_ciphertext, password_iv, password_tag,
            imap_host, smtp_host, notas, activo, created_by, updated_by
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12
          )
          returning id, nombre, correo, usuario, imap_host, smtp_host, notas, activo, updated_at,
                    password_ciphertext is not null as tiene_password
        `, [companyId, nombre || null, correo, usuario, encrypted?.ciphertext, encrypted?.iv, encrypted?.tag, imapHost || null, smtpHost || null, notas || null, activo, req.user.id])
    res.json({ data: result.rows[0] })
  } catch (error) {
    const formatted = error.status
      ? { status: error.status, code: 'EMAIL_CREDENTIALS_ERROR', message: error.message }
      : databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: formatted.code })
  }
})

app.post('/api/functions/hosting-email-credentials-reveal', authenticate, async (req, res) => {
  const companyId = String(req.body?.empresa_id || '')
  const id = String(req.body?.id || '')
  const currentPassword = String(req.body?.current_password || '')
  if (!companyId || !id || !currentPassword) return res.status(400).json({ error: 'Empresa, correo y contraseña actual son obligatorios.' })
  try {
    await requireAdminCompany(req.user.id, companyId)
    await validateCurrentPassword(req.user.id, currentPassword)
    const result = await pool.query(`
      select id, correo, usuario, password_ciphertext, password_iv, password_tag
        from public.correo_credenciales
       where id = $1 and empresa_id = $2
       limit 1
    `, [id, companyId])
    if (!result.rowCount) return res.status(404).json({ error: 'La credencial de correo no existe.' })
    const row = result.rows[0]
    res.json({ data: { id: row.id, correo: row.correo, usuario: row.usuario, password: decryptSecret(row) } })
  } catch (error) {
    const formatted = error.status
      ? { status: error.status, code: 'EMAIL_CREDENTIALS_ERROR', message: error.message }
      : databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: formatted.code })
  }
})

app.post('/api/functions/hosting-email-credentials-delete', authenticate, async (req, res) => {
  const companyId = String(req.body?.empresa_id || '')
  const id = String(req.body?.id || '')
  if (!companyId || !id) return res.status(400).json({ error: 'Empresa y correo son obligatorios.' })
  try {
    await requireAdminCompany(req.user.id, companyId)
    const result = await pool.query(`delete from public.correo_credenciales where id = $1 and empresa_id = $2 returning id`, [id, companyId])
    if (!result.rowCount) return res.status(404).json({ error: 'La credencial de correo no existe.' })
    res.json({ data: { id } })
  } catch (error) {
    const formatted = error.status
      ? { status: error.status, code: 'EMAIL_CREDENTIALS_ERROR', message: error.message }
      : databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: formatted.code })
  }
})

app.post('/api/functions/estado-google-ads', authenticate, async (req, res) => {
  try {
    const companyId = await getActiveCompany(req.user.id)
    const access = await getCompanyAccess(req.user.id, companyId)
    if (!companyId || !hasAnyModule(access, ['google_ads'])) return res.status(403).json({ error: 'No tienes acceso a Google Ads.' })
    const config = googleAdsConfiguration()
    const latest = await withUserTransaction(req.user.id, async (client) => (await client.query(
      `select max(fecha) filter (where fuente = 'api') as ultima_fecha_api,
              max(updated_at) filter (where fuente = 'api') as ultima_sincronizacion
         from public.google_ads_metricas_diarias
        where empresa_id = $1`,
      [companyId],
    )).rows[0])
    res.json({ data: {
      configured: config.configured,
      missing: config.missing,
      api_version: config.apiVersion,
      customer_suffix: config.customerId ? config.customerId.slice(-4) : '',
      ultima_fecha_api: latest?.ultima_fecha_api || null,
      ultima_sincronizacion: latest?.ultima_sincronizacion || null,
    } })
  } catch (error) {
    const formatted = databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: formatted.code })
  }
})

app.post('/api/functions/sincronizar-google-ads', authenticate, async (req, res) => {
  const endDate = String(req.body?.fecha_fin || new Date().toISOString().slice(0, 10))
  const defaultStart = new Date(`${endDate}T00:00:00Z`)
  defaultStart.setUTCDate(defaultStart.getUTCDate() - 29)
  const startDate = String(req.body?.fecha_inicio || defaultStart.toISOString().slice(0, 10))
  try {
    const companyId = await getActiveCompany(req.user.id)
    const access = await getCompanyAccess(req.user.id, companyId)
    if (!companyId || !hasAnyModule(access, ['google_ads'])) return res.status(403).json({ error: 'No tienes acceso a Google Ads.' })
    const rows = await fetchGoogleAdsMetrics({ startDate, endDate })
    const result = await withUserTransaction(req.user.id, (client) => persistGoogleAdsRows(client, { companyId, userId: req.user.id, rows }))
    res.json({ data: { ...result, start_date: startDate, end_date: endDate } })
  } catch (error) {
    const status = error.status || 502
    res.status(status).json({ error: error.message || 'No fue posible sincronizar Google Ads.', code: error.code || 'GOOGLE_ADS_SYNC_ERROR' })
  }
})

function safeStoragePath(bucket, objectPath) {
  if (!['empresa-assets', 'rrhh-documentos', transferReceiptBucket, companyDocumentBucket, vehicleFileBucket].includes(bucket)) throw Object.assign(new Error('Contenedor de archivos no permitido.'), { status: 400 })
  const normalized = String(objectPath || '').replaceAll('\\', '/').replace(/^\/+/, '')
  if (!normalized || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw Object.assign(new Error('Ruta de archivo inválida.'), { status: 400 })
  }
  const bucketRoot = bucket === transferReceiptBucket
    ? transferReceiptRoot
    : bucket === 'rrhh-documentos'
      ? employeeDocumentRoot
      : bucket === companyDocumentBucket
        ? companyDocumentRoot
        : bucket === vehicleFileBucket
          ? vehicleFileRoot
          : path.resolve(uploadRoot, bucket)
  const absolute = path.resolve(bucketRoot, normalized)
  const expectedRoot = bucketRoot + path.sep
  if (!absolute.startsWith(expectedRoot)) throw Object.assign(new Error('Ruta de archivo inválida.'), { status: 400 })
  return { absolute, normalized }
}

function wildcardPath(value) {
  return Array.isArray(value) ? value.join('/') : value
}

function validateUploadType(bucket, objectPath) {
  const extension = path.extname(objectPath).toLowerCase()
  const allowed = bucket === 'empresa-assets'
    ? new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
    : bucket === transferReceiptBucket
      ? new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp'])
    : new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt'])
  if (!allowed.has(extension)) {
    throw Object.assign(new Error(bucket === 'empresa-assets'
      ? 'El logo debe ser PNG, JPG, WEBP o GIF.'
      : bucket === transferReceiptBucket
        ? 'El comprobante debe ser PDF, PNG, JPG o WEBP.'
        : 'Tipo de documento no permitido.'), { status: 400 })
  }
}

async function authorizeStorage(userId, bucket, objectPath, write = false) {
  const companyId = String(objectPath || '').split('/')[0]
  const access = await getCompanyAccess(userId, companyId)
  if (!access) throw Object.assign(new Error('No tienes acceso a los archivos de esta empresa.'), { status: 403 })
  if (access.isAdmin) return companyId
  const required = bucket === 'rrhh-documentos'
    ? 'rrhh_documentos'
    : bucket === transferReceiptBucket
      ? 'comprobantes_comisiones'
      : bucket === companyDocumentBucket
        ? 'documentos_empresa'
        : bucket === vehicleFileBucket
          ? 'flota'
          : 'configuracion'
  if (!access.modules.has(required)) throw Object.assign(new Error(write ? 'No tienes permiso para modificar estos archivos.' : 'No tienes permiso para abrir estos archivos.'), { status: 403 })
  return companyId
}

async function receiptAccess(user) {
  const companyId = await getActiveCompany(user.id)
  const access = companyId ? await getCompanyAccess(user.id, companyId) : null
  if (!companyId || !hasAnyModule(access, ['comprobantes_comisiones'])) {
    throw Object.assign(new Error('No tienes acceso a comprobantes y comisiones.'), { status: 403 })
  }
  const currentSeller = (await pool.query(`
    select id, nombre, email, usuario_id, sueldo_base, moneda, rol_trabajador, configuracion_extra
      from public.personas
     where empresa_id = $1
       and usuario_id = $2
       and activo = true
       and (rol_trabajador = 'vendedor' or configuracion_extra ->> 'rol_trabajador' = 'vendedor')
     limit 1
  `, [companyId, user.id])).rows[0] || null
  return {
    companyId,
    access,
    currentSeller,
    canManageAll: Boolean(access?.isAdmin || access?.modules?.has('personas_pagos')),
  }
}

function receiptList(data) {
  return Array.isArray(data?.comprobantes_transferencia) ? data.comprobantes_transferencia : []
}

function quoteBelongsToSeller(quote, user) {
  return String(quote.created_by || '') === String(user.id)
    || String(quote.vendedor_email || '').toLowerCase() === String(user.email || '').toLowerCase()
    || String(quote.data?.vendedorEmail || '').toLowerCase() === String(user.email || '').toLowerCase()
}

async function sellerById(client, companyId, sellerId) {
  return (await client.query(`
    select id, nombre, email, usuario_id, sueldo_base, moneda, rol_trabajador, configuracion_extra
      from public.personas
     where id = $1 and empresa_id = $2 and activo = true
       and (rol_trabajador = 'vendedor' or configuracion_extra ->> 'rol_trabajador' = 'vendedor')
     limit 1
  `, [sellerId, companyId])).rows[0] || null
}

app.post('/api/cotizaciones/import', authenticate, async (req, res) => {
  const sourceRows = Array.isArray(req.body?.rows) ? req.body.rows : []
  const fileName = String(req.body?.file_name || '').trim().slice(0, 255)
  if (!sourceRows.length) return res.status(400).json({ error: 'El archivo no contiene cotizaciones válidas para importar.' })
  if (sourceRows.length > 1000) return res.status(400).json({ error: 'Importa un máximo de 1.000 cotizaciones por archivo.' })

  let client
  try {
    const companyId = await getActiveCompany(req.user.id)
    const access = companyId ? await getCompanyAccess(req.user.id, companyId) : null
    if (!companyId || !hasAnyModule(access, ['cotizaciones'])) {
      return res.status(403).json({ error: 'No tienes permiso para importar cotizaciones.' })
    }

    const normalized = sourceRows.map((row, index) => normalizeQuoteImportRow(row, {
      importUid: row?.importacion_uid,
      fileName: fileName || row?.importacion_archivo,
      rowNumber: row?.source_row || index + 2,
    }))
    const invalid = normalized.filter((item) => !item.valid)
    if (invalid.length) {
      const first = invalid[0]
      return res.status(400).json({
        error: `La fila ${first.sourceRow || '?'} no es válida: ${first.errors.join(', ')}.`,
        invalid_rows: invalid.length,
      })
    }

    client = await pool.connect()
    await client.query('begin')
    const sellers = (await client.query(`
      select id, nombre, email, usuario_id
        from public.personas
       where empresa_id = $1 and activo = true
         and (rol_trabajador = 'vendedor' or configuracion_extra ->> 'rol_trabajador' = 'vendedor')
    `, [companyId])).rows
    const byEmail = new Map(sellers.filter((seller) => seller.email).map((seller) => [String(seller.email).toLowerCase(), seller]))
    const byName = new Map(sellers.map((seller) => [String(seller.nombre).trim().toLowerCase(), seller]))
    const imported = []

    for (const item of normalized) {
      const row = item.data
      const seller = byEmail.get(String(row.vendedor_email || '').toLowerCase())
        || byName.get(String(row.vendedor_nombre || '').trim().toLowerCase())
        || null
      const documentData = {
        ...row.data,
        vendedorNombre: seller?.nombre || row.vendedor_nombre || '',
        vendedorEmail: seller?.email || row.vendedor_email || '',
        savedAt: new Date().toISOString(),
      }
      const result = await client.query(`
        insert into public.cotizacion_documentos (
          empresa_id, tipo, estado, numero, serie_cotizacion, origen_documento,
          importacion_uid, importacion_archivo, fecha_emision, fecha_vcto,
          cliente_nombre, cliente_contacto, cliente_rut, cliente_direccion,
          cliente_giro, cliente_comuna, cliente_telefono, cliente_ciudad, cliente_email,
          vendedor_id, vendedor_nombre, vendedor_email, referencia, observaciones,
          items, subtotal, neto, iva, total, data, emitida_at, created_by
        ) values (
          $1, 'COTIZACIÓN', 'cotizacion_emitida', $2, $3, 'importado',
          $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21,
          $22::jsonb, $23, $24, $25, $26, $27::jsonb, now(), $28
        )
        on conflict (empresa_id, importacion_uid) where importacion_uid is not null
        do update set
          numero = excluded.numero,
          serie_cotizacion = excluded.serie_cotizacion,
          importacion_archivo = excluded.importacion_archivo,
          fecha_emision = excluded.fecha_emision,
          fecha_vcto = excluded.fecha_vcto,
          cliente_nombre = excluded.cliente_nombre,
          cliente_contacto = excluded.cliente_contacto,
          cliente_rut = excluded.cliente_rut,
          cliente_direccion = excluded.cliente_direccion,
          cliente_giro = excluded.cliente_giro,
          cliente_comuna = excluded.cliente_comuna,
          cliente_telefono = excluded.cliente_telefono,
          cliente_ciudad = excluded.cliente_ciudad,
          cliente_email = excluded.cliente_email,
          vendedor_id = excluded.vendedor_id,
          vendedor_nombre = excluded.vendedor_nombre,
          vendedor_email = excluded.vendedor_email,
          referencia = excluded.referencia,
          observaciones = excluded.observaciones,
          subtotal = excluded.subtotal,
          neto = excluded.neto,
          iva = excluded.iva,
          total = excluded.total,
          data = coalesce(public.cotizacion_documentos.data, '{}'::jsonb)
            || (excluded.data - 'comprobantes_transferencia'),
          updated_at = now()
        returning id, numero, serie_cotizacion, fecha_emision, cliente_nombre
      `, [
        companyId, row.numero, row.serie_cotizacion, row.importacion_uid, row.importacion_archivo,
        row.fecha_emision, row.fecha_vcto, row.cliente_nombre, row.cliente_contacto, row.cliente_rut,
        row.cliente_direccion, row.cliente_giro, row.cliente_comuna, row.cliente_telefono,
        row.cliente_ciudad, row.cliente_email, seller?.id || null, seller?.nombre || row.vendedor_nombre,
        seller?.email || row.vendedor_email, row.referencia, row.observaciones, JSON.stringify(row.items || []),
        row.subtotal, row.neto, row.iva, row.total, JSON.stringify(documentData), req.user.id,
      ])
      imported.push(result.rows[0])
    }

    const thSeriesNumbers = normalized
      .filter((item) => item.data.serie_cotizacion === 'TH')
      .map((item) => Number(item.data.numero || 0))
    if (thSeriesNumbers.length) {
      const greatestNumber = Math.max(11865, ...thSeriesNumbers)
      await client.query(`
        insert into public.erp_counters (empresa_id, key, last_value)
        values ($1, 'cotizacion', $2)
        on conflict (empresa_id, key) do update
        set last_value = greatest(public.erp_counters.last_value, excluded.last_value), updated_at = now()
      `, [companyId, greatestNumber])
    }
    await client.query('commit')
    res.status(201).json({ data: { processed: imported.length, rows: imported } })
  } catch (error) {
    if (client) await client.query('rollback').catch(() => {})
    const schemaMissing = ['42703', '42P10'].includes(error.code)
    const formatted = schemaMissing
      ? { status: 503, message: 'Falta instalar la migración de importación de cotizaciones en PostgreSQL.' }
      : error.status ? { status: error.status, message: error.message } : databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: error.code })
  } finally {
    client?.release()
  }
})

app.get('/api/comprobantes', authenticate, async (req, res) => {
  try {
    const scope = await receiptAccess(req.user)
    if (!scope.canManageAll && !scope.currentSeller) {
      return res.status(403).json({ error: 'Tu cuenta debe estar vinculada a una ficha con rol de vendedor.' })
    }
    const sellers = (await pool.query(`
      select id, nombre, email, usuario_id, sueldo_base, moneda, rol_trabajador, configuracion_extra
        from public.personas
       where empresa_id = $1
         and activo = true
         and (rol_trabajador = 'vendedor' or configuracion_extra ->> 'rol_trabajador' = 'vendedor')
       order by nombre
    `, [scope.companyId])).rows
    const quoteResult = await pool.query(`
      select id, numero, pre_numero, fecha_emision, cliente_id, cliente_nombre, cliente_rut,
             serie_cotizacion, origen_documento, importacion_archivo, vendedor_id,
             vendedor_nombre, vendedor_email, items, neto, total, data, created_by, created_at, updated_at
        from public.cotizacion_documentos
       where empresa_id = $1
         and numero is not null
       order by coalesce(fecha_emision, created_at::date) desc, numero desc
       limit 2000
    `, [scope.companyId])
    const quotes = (scope.canManageAll
      ? quoteResult.rows
      : quoteResult.rows.filter((quote) => quoteBelongsToSeller(quote, req.user)))
      .map((quote) => ({ ...quote, neto_calculable: quoteNetAmount(quote) }))
    const visibleSellers = scope.canManageAll ? sellers : sellers.filter((seller) => seller.id === scope.currentSeller.id)
    res.json({
      data: {
        quotes,
        sellers: visibleSellers.map((seller) => ({ ...seller, commission_rules: commercialRules(seller.configuracion_extra) })),
        can_manage_all: scope.canManageAll,
        current_person_id: scope.currentSeller?.id || null,
        storage_location: displayStoragePath(transferReceiptRoot),
      },
    })
  } catch (error) {
    const formatted = error.status ? { status: error.status, message: error.message } : databaseError(error)
    res.status(formatted.status).json({ error: formatted.message })
  }
})

app.patch('/api/comprobantes/reglas', authenticate, async (req, res) => {
  try {
    const scope = await receiptAccess(req.user)
    if (!scope.canManageAll && !scope.currentSeller) {
      return res.status(403).json({ error: 'Tu cuenta debe estar vinculada a una ficha con rol de vendedor.' })
    }
    const sellerId = scope.canManageAll ? String(req.body?.vendedor_id || '') : String(scope.currentSeller.id)
    const rules = validateCommercialRules(req.body || {})
    const result = await pool.query(`
      update public.personas
         set rol_trabajador = 'vendedor',
             configuracion_extra = jsonb_set(
               jsonb_set(coalesce(configuracion_extra, '{}'::jsonb), '{rol_trabajador}', '"vendedor"'::jsonb, true),
               '{comercial}',
               coalesce(configuracion_extra -> 'comercial', '{}'::jsonb) || $3::jsonb,
               true
             ),
             updated_at = now()
       where id = $1 and empresa_id = $2 and activo = true
         and (rol_trabajador = 'vendedor' or configuracion_extra ->> 'rol_trabajador' = 'vendedor')
       returning id, nombre, email, usuario_id, sueldo_base, moneda, rol_trabajador, configuracion_extra
    `, [sellerId, scope.companyId, JSON.stringify(rules)])
    if (!result.rowCount) return res.status(404).json({ error: 'No se encontró el vendedor seleccionado.' })
    res.json({ data: { seller: { ...result.rows[0], commission_rules: rules } } })
  } catch (error) {
    const formatted = error.status ? { status: error.status, message: error.message } : databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: error.code })
  }
})

app.post('/api/comprobantes', authenticate, upload.single('file'), async (req, res) => {
  let writtenPath = ''
  let client
  try {
    if (!req.file) throw Object.assign(new Error('Selecciona el comprobante de transferencia.'), { status: 400 })
    const scope = await receiptAccess(req.user)
    if (!scope.canManageAll && !scope.currentSeller) throw Object.assign(new Error('Tu cuenta debe estar vinculada a una ficha con rol de vendedor.'), { status: 403 })
    const quoteId = String(req.body?.quote_id || '')
    const transferDate = String(req.body?.fecha_transferencia || '')
    const transferRut = formatRut(req.body?.rut_transferencia || '')
    const operationType = String(req.body?.tipo_operacion || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) throw Object.assign(new Error('Indica una fecha de transferencia válida.'), { status: 400 })
    if (!isValidRut(transferRut)) throw Object.assign(new Error('El RUT de quien transfirió no es válido.'), { status: 400 })
    if (!['arriendo', 'trabajo_hidraulico', 'venta_apilador'].includes(operationType)) {
      throw Object.assign(new Error('Selecciona el tipo de negocio asociado al pago.'), { status: 400 })
    }

    client = await pool.connect()
    await client.query('begin')
    const quote = (await client.query(`
      select id, numero, fecha_emision, cliente_id, cliente_nombre, cliente_rut, neto, total,
             data, created_by
        from public.cotizacion_documentos
       where id = $1 and empresa_id = $2 and numero is not null
       for update
    `, [quoteId, scope.companyId])).rows[0]
    if (!quote) throw Object.assign(new Error('La cotización seleccionada no existe o aún no tiene número final.'), { status: 404 })
    if (!scope.canManageAll && !quoteBelongsToSeller(quote, req.user)) throw Object.assign(new Error('Solo puedes registrar comprobantes de tus propias cotizaciones.'), { status: 403 })

    const sellerId = scope.canManageAll ? String(req.body?.vendedor_id || '') : String(scope.currentSeller.id)
    const seller = await sellerById(client, scope.companyId, sellerId)
    if (!seller) throw Object.assign(new Error('Selecciona un vendedor activo.'), { status: 400 })

    const quoteCurrency = String(quote.data?.moneda || 'CLP').toUpperCase()
    const exchangeRate = quoteCurrency === 'CLP' ? 1 : Number(req.body?.tipo_cambio_clp || 0)
    if (operationType === 'trabajo_hidraulico' && quoteCurrency !== 'CLP' && !(exchangeRate > 0)) {
      throw Object.assign(new Error(`Indica el tipo de cambio a CLP para calcular la comisión de esta cotización en ${quoteCurrency}.`), { status: 400 })
    }
    const netQuote = quoteNetAmount(quote)
    const netClp = quoteCurrency === 'CLP' ? netQuote : netQuote * exchangeRate
    const costClp = Number(req.body?.costo_trabajo_clp || 0)
    const rules = commercialRules(seller.configuracion_extra)
    const calculation = calculateCommission({
      tipo: operationType,
      neto: netClp,
      costo: costClp,
      meses: req.body?.meses_arriendo,
      cantidad: req.body?.cantidad_apiladores,
      rules,
    })
    const manualSource = String(req.body?.comision_manual_clp ?? '').trim()
    const manualCommission = manualSource === '' ? null : Number(manualSource)
    if (manualCommission !== null && (!Number.isFinite(manualCommission) || manualCommission < 0 || manualCommission > 100_000_000)) {
      throw Object.assign(new Error('La comisión acordada debe estar entre $0 y $100.000.000.'), { status: 400 })
    }

    const originalExtension = path.extname(req.file.originalname || '').toLowerCase()
    const baseName = receiptFilename({ folio: quote.numero, transferDate, rut: transferRut, extension: originalExtension })
    const year = transferDate.slice(0, 4)
    let objectPath = `${scope.companyId}/${year}/${baseName}`
    let suffix = 2
    while (existsSync(safeStoragePath(transferReceiptBucket, objectPath).absolute)) {
      const extension = path.extname(baseName)
      objectPath = `${scope.companyId}/${year}/${baseName.slice(0, -extension.length)}_${suffix}${extension}`
      suffix += 1
    }
    const target = safeStoragePath(transferReceiptBucket, objectPath)
    validateUploadType(transferReceiptBucket, target.normalized)
    await mkdir(path.dirname(target.absolute), { recursive: true })
    await writeFile(target.absolute, req.file.buffer)
    writtenPath = target.absolute

    const receipt = {
      id: randomUUID(),
      cotizacion_id: String(quote.id),
      cotizacion_numero: String(quote.numero),
      cliente_id: quote.cliente_id || null,
      cliente_nombre: quote.cliente_nombre || '',
      cliente_rut: quote.cliente_rut || '',
      vendedor_id: seller.id,
      vendedor_usuario_id: seller.usuario_id || null,
      vendedor_nombre: seller.nombre,
      vendedor_email: seller.email || '',
      fecha_transferencia: transferDate,
      rut_transferencia: transferRut,
      tipo_operacion: operationType,
      moneda_cotizacion: quoteCurrency,
      tipo_cambio_clp: exchangeRate,
      neto_cotizacion: netQuote,
      neto_calculo_clp: netClp,
      costo_trabajo_clp: costClp,
      ganancia_calculo_clp: calculation.profit,
      meses_arriendo: calculation.months,
      cantidad_apiladores: calculation.quantity,
      comision_calculada_clp: calculation.commission,
      comision_clp: manualCommission ?? calculation.commission,
      comision_origen: manualCommission === null ? 'regla_vendedor' : 'manual',
      reglas_aplicadas: rules,
      notas: String(req.body?.notas || '').trim().slice(0, 1000),
      archivo_path: target.normalized,
      archivo_nombre: path.basename(target.normalized),
      archivo_original: String(req.file.originalname || '').slice(0, 255),
      archivo_mime: req.file.mimetype || '',
      archivo_bytes: req.file.size,
      subido_por: req.user.id,
      subido_en: new Date().toISOString(),
    }
    const receipts = [...receiptList(quote.data), receipt]
    await client.query(`
      update public.cotizacion_documentos
         set data = jsonb_set(coalesce(data, '{}'::jsonb), '{comprobantes_transferencia}', $3::jsonb, true),
             updated_at = now()
       where id = $1 and empresa_id = $2
    `, [quote.id, scope.companyId, JSON.stringify(receipts)])
    await client.query('commit')
    res.status(201).json({ data: { receipt } })
  } catch (error) {
    if (client) await client.query('rollback').catch(() => {})
    if (writtenPath) await rm(writtenPath, { force: true }).catch(() => {})
    const formatted = error.status ? { status: error.status, message: error.message } : databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: error.code })
  } finally {
    client?.release()
  }
})

app.post('/api/comprobantes/recalcular', authenticate, async (req, res) => {
  let client
  try {
    const scope = await receiptAccess(req.user)
    if (!scope.canManageAll && !scope.currentSeller) {
      return res.status(403).json({ error: 'Tu cuenta debe estar vinculada a una ficha con rol de vendedor.' })
    }
    const month = String(req.body?.month || '')
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Selecciona un mes válido para recalcular.' })
    const sellerId = scope.canManageAll ? String(req.body?.vendedor_id || '') : String(scope.currentSeller.id)

    client = await pool.connect()
    await client.query('begin')
    const seller = await sellerById(client, scope.companyId, sellerId)
    if (!seller) throw Object.assign(new Error('Selecciona un vendedor activo.'), { status: 400 })
    const rules = commercialRules(seller.configuracion_extra)
    const quotes = (await client.query(`
      select id, numero, items, neto, total, data
        from public.cotizacion_documentos
       where empresa_id = $1
         and jsonb_typeof(data -> 'comprobantes_transferencia') = 'array'
       for update
    `, [scope.companyId])).rows

    let recalculated = 0
    let totalCommission = 0
    for (const quote of quotes) {
      let changed = false
      const receipts = receiptList(quote.data).map((receipt) => {
        if (String(receipt.vendedor_id || '') !== sellerId || !String(receipt.fecha_transferencia || '').startsWith(`${month}-`)) return receipt
        if (receipt.comision_origen === 'manual') {
          totalCommission += Number(receipt.comision_clp || 0)
          return receipt
        }
        const rate = Number(receipt.tipo_cambio_clp || 1)
        const quoteCurrency = String(receipt.moneda_cotizacion || 'CLP').toUpperCase()
        const storedNet = Number(receipt.neto_calculo_clp || 0)
        const netClp = storedNet > 0 ? storedNet : quoteNetAmount(quote) * (quoteCurrency === 'CLP' ? 1 : rate)
        const calculation = calculateCommission({
          tipo: receipt.tipo_operacion,
          neto: netClp,
          costo: receipt.costo_trabajo_clp,
          meses: receipt.meses_arriendo,
          cantidad: receipt.cantidad_apiladores,
          rules,
        })
        changed = true
        recalculated += 1
        totalCommission += calculation.commission
        return {
          ...receipt,
          neto_calculo_clp: netClp,
          ganancia_calculo_clp: calculation.profit,
          comision_calculada_clp: calculation.commission,
          comision_clp: calculation.commission,
          comision_origen: 'regla_vendedor',
          reglas_aplicadas: rules,
          recalculado_en: new Date().toISOString(),
        }
      })
      if (changed) {
        await client.query(`
          update public.cotizacion_documentos
             set data = jsonb_set(coalesce(data, '{}'::jsonb), '{comprobantes_transferencia}', $3::jsonb, true),
                 updated_at = now()
           where id = $1 and empresa_id = $2
        `, [quote.id, scope.companyId, JSON.stringify(receipts)])
      }
    }
    await client.query('commit')
    res.json({ data: { recalculated, total_commission: totalCommission, rules } })
  } catch (error) {
    if (client) await client.query('rollback').catch(() => {})
    const formatted = error.status ? { status: error.status, message: error.message } : databaseError(error)
    res.status(formatted.status).json({ error: formatted.message, code: error.code })
  } finally {
    client?.release()
  }
})

app.delete('/api/comprobantes/:quoteId/:receiptId', authenticate, async (req, res) => {
  let client
  try {
    const scope = await receiptAccess(req.user)
    client = await pool.connect()
    await client.query('begin')
    const quote = (await client.query(`
      select id, data, created_by
        from public.cotizacion_documentos
       where id = $1 and empresa_id = $2
       for update
    `, [req.params.quoteId, scope.companyId])).rows[0]
    if (!quote) throw Object.assign(new Error('Cotización no encontrada.'), { status: 404 })
    const receipts = receiptList(quote.data)
    const receipt = receipts.find((item) => String(item.id) === String(req.params.receiptId))
    if (!receipt) throw Object.assign(new Error('Comprobante no encontrado.'), { status: 404 })
    const ownsReceipt = String(receipt.vendedor_usuario_id || '') === String(req.user.id) || quoteBelongsToSeller(quote, req.user)
    if (!scope.canManageAll && !ownsReceipt) throw Object.assign(new Error('No puedes eliminar comprobantes de otro vendedor.'), { status: 403 })
    const remaining = receipts.filter((item) => String(item.id) !== String(req.params.receiptId))
    await client.query(`
      update public.cotizacion_documentos
         set data = jsonb_set(coalesce(data, '{}'::jsonb), '{comprobantes_transferencia}', $3::jsonb, true),
             updated_at = now()
       where id = $1 and empresa_id = $2
    `, [quote.id, scope.companyId, JSON.stringify(remaining)])
    await client.query('commit')
    if (receipt.archivo_path) {
      const target = safeStoragePath(transferReceiptBucket, receipt.archivo_path)
      await rm(target.absolute, { force: true })
    }
    res.json({ data: { id: receipt.id } })
  } catch (error) {
    if (client) await client.query('rollback').catch(() => {})
    const formatted = error.status ? { status: error.status, message: error.message } : databaseError(error)
    res.status(formatted.status).json({ error: formatted.message })
  } finally {
    client?.release()
  }
})

app.post('/api/storage/:bucket/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Selecciona un archivo.' })
    const target = safeStoragePath(req.params.bucket, req.query.path)
    validateUploadType(req.params.bucket, target.normalized)
    await authorizeStorage(req.user.id, req.params.bucket, target.normalized, true)
    await mkdir(path.dirname(target.absolute), { recursive: true })
    if (req.query.upsert !== 'true' && existsSync(target.absolute)) return res.status(409).json({ error: 'Ya existe un archivo en esa ruta.' })
    await writeFile(target.absolute, req.file.buffer)
    res.status(201).json({ data: { path: target.normalized } })
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message })
  }
})

app.delete('/api/storage/:bucket', authenticate, async (req, res) => {
  const paths = Array.isArray(req.body?.paths) ? req.body.paths : []
  try {
    for (const objectPath of paths) {
      const target = safeStoragePath(req.params.bucket, objectPath)
      await authorizeStorage(req.user.id, req.params.bucket, target.normalized, true)
      await rm(target.absolute, { force: true })
    }
    res.json({ data: paths })
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message })
  }
})

app.post('/api/storage/:bucket/signed-url', authenticate, async (req, res) => {
  try {
    const target = safeStoragePath(req.params.bucket, req.body?.path)
    await authorizeStorage(req.user.id, req.params.bucket, target.normalized, false)
    const seconds = Math.max(60, Math.min(Number(req.body?.expiresIn || 3600), 86_400))
    const token = createFileToken({ sub: req.user.id, bucket: req.params.bucket, path: target.normalized }, seconds)
    const signedUrl = `/api/files/private/${encodeURIComponent(req.params.bucket)}/${target.normalized.split('/').map(encodeURIComponent).join('/')}?token=${encodeURIComponent(token)}`
    res.json({ data: { signedUrl } })
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message })
  }
})

app.get('/api/files/public/:bucket/*path', async (req, res) => {
  try {
    if (req.params.bucket !== 'empresa-assets') return res.status(403).json({ error: 'Archivo privado.' })
    const target = safeStoragePath(req.params.bucket, wildcardPath(req.params.path))
    const contents = await readFile(target.absolute)
    res.set('Content-Security-Policy', "default-src 'none'; sandbox")
    res.type(path.extname(target.absolute)).send(contents)
  } catch {
    res.status(404).json({ error: 'Archivo no encontrado.' })
  }
})

app.get('/api/files/private/:bucket/*path', async (req, res) => {
  try {
    const target = safeStoragePath(req.params.bucket, wildcardPath(req.params.path))
    const signed = verifyFileToken(String(req.query.token || ''))
    if (signed.bucket !== req.params.bucket || signed.path !== target.normalized) throw new Error('La firma no corresponde al archivo.')
    const contents = await readFile(target.absolute)
    res.set('Content-Security-Policy', "default-src 'none'; sandbox")
    res.type(path.extname(target.absolute)).send(contents)
  } catch {
    res.status(403).json({ error: 'El enlace del archivo no es válido o venció.' })
  }
})

app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta de API no encontrada.' }))

const distDir = path.join(rootDir, 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir, { index: false }))
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' || !String(req.headers.accept || '').includes('text/html')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? `El archivo supera el máximo de ${process.env.MAX_UPLOAD_MB || 15} MB.` : error.message })
  console.error(error)
  res.status(500).json({ error: 'Error interno del servidor.' })
})

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[intranet-api] escuchando en http://0.0.0.0:${port}`)
})

async function shutdown() {
  server.close(async () => {
    await pool.end()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
