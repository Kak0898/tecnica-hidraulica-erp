import { cleanRut } from './rut.js'

export function documentSlug(value) {
  return String(value || 'documento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'documento'
}

export function employeeDocumentFilename({ rut, type, issueDate, extension, uploadedAt = new Date() }) {
  const clean = cleanRut(rut)
  if (!clean) throw new Error('El trabajador debe tener un RUT antes de subir documentos.')
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(issueDate || ''))
    ? String(issueDate).replaceAll('-', '')
    : uploadedAt.toISOString().slice(0, 10).replaceAll('-', '')
  const time = uploadedAt.toISOString().slice(11, 19).replaceAll(':', '')
  const safeExtension = String(extension || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!safeExtension) throw new Error('El documento no tiene una extensión válida.')
  return `${clean}_${documentSlug(type)}_${date}_${time}.${safeExtension}`
}
