import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sources = [
  ['Compatibilidad PostgreSQL', 'database/prelude.sql'],
  ['Esquema integral TH Control', 'supabase/schema.sql'],
  ['Recursos Humanos escalable', 'supabase/sql-editor/17_rrhh_escalable.sql'],
  ['API propia y permisos finales', 'database/postlude.sql'],
]

const sections = []
for (const [title, relativePath] of sources) {
  let contents = await readFile(path.join(root, relativePath), 'utf8')
  // El parche 17 era ejecutable por separado y traía su propia transacción.
  // El archivo integral usa una única transacción para no dejar instalaciones parciales.
  if (relativePath === 'supabase/sql-editor/17_rrhh_escalable.sql') {
    contents = contents.replace(/^\s*begin;\s*$/gim, '').replace(/^\s*commit;\s*$/gim, '')
  }
  sections.push(`\n-- ============================================================================\n-- ${title}\n-- Fuente: ${relativePath}\n-- ============================================================================\n\n${contents.trim()}\n`)
}

const header = `-- TH Control · esquema completo para PostgreSQL independiente
-- Generado automáticamente por database/build-schema.mjs.
-- ADVERTENCIA: diseñado para una base nueva; elimina y recrea tablas del ERP.
`

const destination = path.join(root, 'database/postgresql.sql')
await writeFile(destination, `${header}\nbegin;\n${sections.join('\n')}\ncommit;\n`, 'utf8')
console.log(destination)
