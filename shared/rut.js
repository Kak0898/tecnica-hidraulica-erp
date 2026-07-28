export function cleanRut(value) {
  return String(value ?? '').replace(/[^0-9k]/gi, '').toUpperCase()
}

export function calculateRutVerifier(body) {
  const digits = String(body ?? '').replace(/\D/g, '')
  if (!digits) return ''
  let sum = 0
  let multiplier = 2
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += Number(digits[index]) * multiplier
    multiplier = multiplier === 7 ? 2 : multiplier + 1
  }
  const result = 11 - (sum % 11)
  if (result === 11) return '0'
  if (result === 10) return 'K'
  return String(result)
}

export function isValidRut(value) {
  const cleaned = cleanRut(value)
  if (cleaned.length < 2) return false
  const body = cleaned.slice(0, -1)
  const verifier = cleaned.slice(-1)
  if (!/^\d+$/.test(body) || Number(body) <= 0) return false
  return calculateRutVerifier(body) === verifier
}

export function formatRut(value) {
  const cleaned = cleanRut(value).slice(0, 9)
  if (cleaned.length <= 1) return cleaned
  const body = cleaned.slice(0, -1).replace(/^0+(?=\d)/, '')
  const verifier = cleaned.slice(-1)
  const grouped = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${grouped}-${verifier}`
}

export function rutStatus(value) {
  const cleaned = cleanRut(value)
  if (!cleaned) return 'empty'
  if (cleaned.length < 2) return 'incomplete'
  return isValidRut(cleaned) ? 'valid' : 'invalid'
}
