import 'dotenv/config'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { authenticate, createFileToken, createSession, publicUser, verifyFileToken } from './auth.mjs'
import { databaseError, getCompanyAccess, pool, withUserTransaction } from './db.mjs'
import { ALL_MODULES, RPC_ALLOWLIST, SET_RETURNING_RPCS } from './policies.mjs'
import { executeDataQuery } from './query.mjs'

if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en .env.')
if (String(process.env.JWT_SECRET || '').length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres.')

const app = express()
const port = Number(process.env.PORT || 3001)
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const uploadRoot = path.resolve(rootDir, process.env.UPLOAD_DIR || 'uploads')
const maxUploadBytes = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 15)) * 1024 * 1024
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxUploadBytes, files: 1 } })
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

function safeStoragePath(bucket, objectPath) {
  if (!['empresa-assets', 'rrhh-documentos'].includes(bucket)) throw Object.assign(new Error('Contenedor de archivos no permitido.'), { status: 400 })
  const normalized = String(objectPath || '').replaceAll('\\', '/').replace(/^\/+/, '')
  if (!normalized || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw Object.assign(new Error('Ruta de archivo inválida.'), { status: 400 })
  }
  const absolute = path.resolve(uploadRoot, bucket, normalized)
  const expectedRoot = path.resolve(uploadRoot, bucket) + path.sep
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
    : new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt'])
  if (!allowed.has(extension)) {
    throw Object.assign(new Error(bucket === 'empresa-assets'
      ? 'El logo debe ser PNG, JPG, WEBP o GIF.'
      : 'Tipo de documento no permitido.'), { status: 400 })
  }
}

async function authorizeStorage(userId, bucket, objectPath, write = false) {
  const companyId = String(objectPath || '').split('/')[0]
  const access = await getCompanyAccess(userId, companyId)
  if (!access) throw Object.assign(new Error('No tienes acceso a los archivos de esta empresa.'), { status: 403 })
  if (access.isAdmin) return companyId
  const required = bucket === 'rrhh-documentos' ? 'rrhh_documentos' : 'configuracion'
  if (!access.modules.has(required)) throw Object.assign(new Error(write ? 'No tienes permiso para modificar estos archivos.' : 'No tienes permiso para abrir estos archivos.'), { status: 403 })
  return companyId
}

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
