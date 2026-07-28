export function canManageCredentials(callerRole, targetRole, isSelf = false) {
  if (isSelf || targetRole === 'owner') return false
  if (callerRole === 'owner') return ['admin', 'operador'].includes(targetRole)
  if (callerRole === 'admin') return targetRole === 'operador'
  return false
}

export function validateCredentialChange({ email, password, currentEmail }) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const normalizedCurrent = String(currentEmail || '').trim().toLowerCase()
  const nextPassword = String(password || '')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return 'Ingresa un correo válido para iniciar sesión.'
  if (nextPassword && nextPassword.length < 8) return 'La contraseña temporal debe tener al menos 8 caracteres.'
  if (nextPassword.length > 128) return 'La contraseña temporal no puede superar 128 caracteres.'
  if (normalizedEmail === normalizedCurrent && !nextPassword) return 'Cambia el correo o ingresa una nueva contraseña temporal.'
  return ''
}
