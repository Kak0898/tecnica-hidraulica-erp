import jwt from 'jsonwebtoken'
import { pool } from './db.mjs'

function secret() {
  const value = process.env.JWT_SECRET || ''
  if (value.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres.')
  return value
}

export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    user_metadata: row.raw_user_meta_data || {},
  }
}

export function createSession(row) {
  const user = publicUser(row)
  const authVersion = Number(user.user_metadata?.erp_auth_version || 0)
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, authVersion, type: 'session' },
    secret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h', issuer: 'intranet-api' },
  )
  return {
    access_token: accessToken,
    token_type: 'bearer',
    user,
  }
}

export function createFileToken(payload, expiresIn) {
  return jwt.sign({ ...payload, type: 'file' }, secret(), {
    expiresIn,
    issuer: 'intranet-api',
  })
}

export function verifyFileToken(token) {
  const payload = jwt.verify(token, secret(), { issuer: 'intranet-api' })
  if (payload.type !== 'file') throw new Error('Firma de archivo inválida.')
  return payload
}

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) return res.status(401).json({ error: 'Debes iniciar sesión.' })
    const payload = jwt.verify(token, secret(), { issuer: 'intranet-api' })
    if (payload.type !== 'session' || !payload.sub) return res.status(401).json({ error: 'Sesión inválida.' })
    const current = await pool.query(`select raw_user_meta_data from auth.users where id = $1 limit 1`, [payload.sub])
    if (!current.rowCount) return res.status(401).json({ error: 'La cuenta ya no existe.' })
    const currentVersion = Number(current.rows[0].raw_user_meta_data?.erp_auth_version || 0)
    if (currentVersion !== Number(payload.authVersion || 0)) {
      return res.status(401).json({ error: 'Las credenciales cambiaron. Inicia sesión nuevamente.' })
    }
    req.user = { id: payload.sub, email: payload.email || '' }
    next()
  } catch {
    res.status(401).json({ error: 'La sesión venció. Inicia sesión nuevamente.' })
  }
}
