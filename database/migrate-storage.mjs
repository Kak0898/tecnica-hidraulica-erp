import 'dotenv/config'
import pg from 'pg'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

for (const name of ['SUPABASE_DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL']) {
  if (!process.env[name]) throw new Error(`Falta ${name} en .env.`)
}

const source = new pg.Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } })
const target = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: ['1', 'true', 'require'].includes(String(process.env.DATABASE_SSL || '').toLowerCase()) ? { rejectUnauthorized: false } : undefined })
const uploadRoot = path.resolve(process.env.UPLOAD_DIR || './uploads')

function safeTarget(bucket, name) {
  const clean = String(name).replaceAll('\\', '/').replace(/^\/+/, '')
  if (!clean || clean.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error(`Ruta inválida: ${name}`)
  const result = path.resolve(uploadRoot, bucket, clean)
  if (!result.startsWith(path.resolve(uploadRoot, bucket) + path.sep)) throw new Error(`Ruta fuera del directorio: ${name}`)
  return result
}

try {
  const objects = await source.query(`select bucket_id, name from storage.objects where bucket_id = any($1::text[]) order by bucket_id, name`, [['empresa-assets', 'rrhh-documentos']])
  let copied = 0
  for (const object of objects.rows) {
    const encoded = object.name.split('/').map(encodeURIComponent).join('/')
    const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/authenticated/${encodeURIComponent(object.bucket_id)}/${encoded}`, {
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY },
    })
    if (!response.ok) {
      console.warn(`No se pudo descargar ${object.bucket_id}/${object.name}: HTTP ${response.status}`)
      continue
    }
    const destination = safeTarget(object.bucket_id, object.name)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, Buffer.from(await response.arrayBuffer()))
    copied += 1
  }
  await target.query(
    `update public.empresas
        set logo_url = '/api/files/public/empresa-assets/' || logo_path
      where logo_path is not null and trim(logo_path) <> ''`,
  )
  console.log(`Archivos migrados: ${copied}`)
} finally {
  await source.end()
  await target.end()
}
