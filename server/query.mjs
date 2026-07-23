import { getActiveCompany, getCompanyAccess, withUserTransaction } from './db.mjs'
import { hasAnyModule, RELATIONS, TABLE_ACCESS } from './policies.mjs'

const columnCache = new Map()

function identifier(value, label = 'identificador') {
  if (!/^[a-z_][a-z0-9_]*$/i.test(String(value || ''))) throw new Error(`${label} inválido.`)
  return `"${value}"`
}

function splitTopLevel(value) {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of String(value || '*')) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

export function parseSelect(value = '*') {
  const fields = []
  const relations = []
  for (const part of splitTopLevel(value)) {
    const relation = part.match(/^([a-z_][a-z0-9_]*)\s*\((.*)\)$/i)
    if (relation) {
      relations.push({ name: relation[1], select: relation[2] || '*' })
      continue
    }
    if (part === '*') fields.push('*')
    else if (/^[a-z_][a-z0-9_]*$/i.test(part)) fields.push(part)
    else throw new Error(`Campo de selección inválido: ${part}`)
  }
  return { fields: fields.length ? fields : ['*'], relations }
}

async function getColumns(client, table) {
  if (columnCache.has(table)) return columnCache.get(table)
  const result = await client.query(
    `select column_name, data_type
       from information_schema.columns
      where table_schema = 'public' and table_name = $1`,
    [table],
  )
  const columns = new Set(result.rows.map((row) => row.column_name))
  if (!columns.size) throw new Error(`La tabla ${table} no existe en PostgreSQL.`)
  columns.jsonColumns = new Set(
    result.rows.filter((row) => ['json', 'jsonb'].includes(row.data_type)).map((row) => row.column_name),
  )
  columnCache.set(table, columns)
  return columns
}

export function serializeColumnValue(columns, column, value) {
  if (value == null || !columns?.jsonColumns?.has(column) || typeof value === 'string') return value
  return JSON.stringify(value)
}

function selectedSql(fields, columns) {
  if (fields.includes('*')) return '*'
  const valid = fields.filter((field) => columns.has(field))
  if (!valid.length) throw new Error('La selección no contiene columnas válidas.')
  return valid.map((field) => identifier(field)).join(', ')
}

function addFilters(filters, columns, params, forced = []) {
  const clauses = []
  const allFilters = [...(Array.isArray(filters) ? filters : []), ...forced]
  for (const filter of allFilters) {
    const column = String(filter?.column || '')
    if (!columns.has(column)) throw new Error(`La columna ${column} no existe.`)
    const quoted = identifier(column)
    const operator = filter.operator || 'eq'
    if ((operator === 'eq' || operator === 'is') && filter.value === null) {
      clauses.push(`${quoted} is null`)
      continue
    }
    if (operator === 'in') {
      const values = Array.isArray(filter.value) ? filter.value : []
      if (!values.length) {
        clauses.push('false')
        continue
      }
      params.push(values)
      clauses.push(`${quoted} = any($${params.length})`)
      continue
    }
    const operators = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' }
    const sqlOperator = operators[operator]
    if (!sqlOperator) throw new Error(`Operador no permitido: ${operator}`)
    params.push(filter.value)
    clauses.push(`${quoted} ${sqlOperator} $${params.length}`)
  }
  return clauses
}

function requestedCompany(body) {
  const fromFilter = (body.filters || []).find((filter) => filter.column === 'empresa_id' && filter.operator === 'eq')?.value
  const firstPayload = Array.isArray(body.payload) ? body.payload[0] : body.payload
  return fromFilter || firstPayload?.empresa_id || null
}

async function authorize(userId, body) {
  const config = TABLE_ACCESS[body.table]
  if (!config) throw Object.assign(new Error('Tabla no autorizada por la API.'), { status: 403 })

  const write = body.action !== 'select'
  if (config.special === 'catalog' && write) throw Object.assign(new Error('El catálogo es de solo lectura.'), { status: 403 })
  if (['memberships', 'active_company'].includes(config.special) && write) {
    throw Object.assign(new Error('Esta información se modifica mediante una operación segura.'), { status: 403 })
  }

  let companyId = requestedCompany(body)
  if (!companyId) companyId = await getActiveCompany(userId)

  if (config.special === 'companies') {
    const explicitId = (body.filters || []).find((filter) => filter.column === 'id' && filter.operator === 'eq')?.value
    companyId = explicitId || companyId
    if (write) {
      const companyAccess = await getCompanyAccess(userId, companyId)
      if (!companyAccess?.isAdmin) throw Object.assign(new Error('Solo un administrador puede modificar la empresa.'), { status: 403 })
    }
    return { config, companyId, companyAccess: companyId ? await getCompanyAccess(userId, companyId) : null }
  }

  if (config.companyScoped) {
    if (!companyId) throw Object.assign(new Error('No existe una empresa activa.'), { status: 400 })
    const companyAccess = await getCompanyAccess(userId, companyId)
    if (!companyAccess) throw Object.assign(new Error('No tienes acceso a la empresa seleccionada.'), { status: 403 })
    const required = write ? config.write : config.read
    if (!hasAnyModule(companyAccess, required)) throw Object.assign(new Error('Tu usuario no tiene permiso para esta sección.'), { status: 403 })
    return { config, companyId, companyAccess }
  }

  return { config, companyId, companyAccess: companyId ? await getCompanyAccess(userId, companyId) : null }
}

function forcedScope(config, userId, companyId) {
  if (config.companyScoped) return [{ column: 'empresa_id', operator: 'eq', value: companyId }]
  if (config.special === 'memberships' || config.special === 'active_company' || config.special === 'profile') {
    return [{ column: 'user_id', operator: 'eq', value: userId }]
  }
  return []
}

async function hydrateRelations(client, table, rows, relationRequests, companyId) {
  if (!rows.length || !relationRequests.length) return rows
  const definitions = RELATIONS[table] || {}
  for (const request of relationRequests) {
    const relation = definitions[request.name]
    if (!relation) continue
    const keys = [...new Set(rows.map((row) => row[relation.sourceKey]).filter(Boolean))]
    if (!keys.length) {
      rows.forEach((row) => { row[request.name] = relation.many ? [] : null })
      continue
    }
    const columns = await getColumns(client, relation.target)
    const parsed = parseSelect(request.select)
    const relationFields = parsed.fields.includes('*')
      ? '*'
      : selectedSql([...new Set([...parsed.fields, relation.targetKey])], columns)
    const params = [keys]
    let sql = `select ${relationFields} from ${identifier(relation.target, 'tabla')} where ${identifier(relation.targetKey)} = any($1)`
    if (companyId && columns.has('empresa_id')) {
      params.push(companyId)
      sql += ` and empresa_id = $${params.length}`
    }
    const related = (await client.query(sql, params)).rows
    const byKey = new Map()
    for (const item of related) {
      const key = item[relation.targetKey]
      if (relation.many) {
        const list = byKey.get(key) || []
        list.push(item)
        byKey.set(key, list)
      } else {
        byKey.set(key, item)
      }
    }
    rows.forEach((row) => {
      row[request.name] = byKey.get(row[relation.sourceKey]) || (relation.many ? [] : null)
    })
  }
  return rows
}

function orderSql(orders, columns) {
  const parts = []
  for (const order of Array.isArray(orders) ? orders : []) {
    if (!columns.has(order.column)) throw new Error(`La columna ${order.column} no existe.`)
    parts.push(`${identifier(order.column)} ${order.ascending === false ? 'desc' : 'asc'} ${order.nullsFirst === true ? 'nulls first' : order.nullsFirst === false ? 'nulls last' : ''}`.trim())
  }
  return parts.length ? ` order by ${parts.join(', ')}` : ''
}

function normalizeRows(payload, columns, userId, companyId, config) {
  const source = Array.isArray(payload) ? payload : [payload || {}]
  return source.map((item) => {
    const row = {}
    for (const [key, value] of Object.entries(item || {})) {
      if (columns.has(key)) row[key] = value
    }
    if (config.companyScoped && columns.has('empresa_id')) row.empresa_id = companyId
    if (config.special === 'profile' && columns.has('user_id')) {
      row.user_id = userId
      if (columns.has('creado_por')) row.creado_por = userId
    }
    if (columns.has('created_by') && row.created_by == null) row.created_by = userId
    return row
  })
}

async function executeSelect(client, userId, body, auth) {
  const columns = await getColumns(client, body.table)
  const parsed = parseSelect(body.select || '*')
  const params = []
  const clauses = addFilters(body.filters, columns, params, forcedScope(auth.config, userId, auth.companyId))
  if (auth.config.special === 'companies') {
    params.push(userId)
    clauses.push(`id in (select empresa_id from public.usuarios_empresas where user_id = $${params.length} and activo = true)`)
  }
  const where = clauses.length ? ` where ${clauses.join(' and ')}` : ''
  const relationSourceKeys = parsed.relations
    .map((relation) => RELATIONS[body.table]?.[relation.name]?.sourceKey)
    .filter(Boolean)
  const baseFields = parsed.fields.includes('*') ? parsed.fields : [...new Set([...parsed.fields, ...relationSourceKeys])]
  const select = selectedSql(baseFields, columns)
  const countParams = [...params]
  let sql = `select ${select} from ${identifier(body.table, 'tabla')}${where}${orderSql(body.orders, columns)}`
  const requestedLimit = body.limit == null ? null : Math.max(0, Math.min(Number(body.limit), 5000))
  const offset = Math.max(0, Number(body.offset || 0))
  if (requestedLimit != null) {
    params.push(requestedLimit)
    sql += ` limit $${params.length}`
  }
  if (offset) {
    params.push(offset)
    sql += ` offset $${params.length}`
  }
  const result = await client.query(sql, params)
  const rows = await hydrateRelations(client, body.table, result.rows, parsed.relations, auth.companyId)
  let count = null
  if (body.count === 'exact') {
    const counted = await client.query(`select count(*)::int as count from ${identifier(body.table, 'tabla')}${where}`, countParams)
    count = counted.rows[0]?.count ?? 0
  }
  return { data: rows, count }
}

async function executeInsert(client, userId, body, auth) {
  const columns = await getColumns(client, body.table)
  const rows = normalizeRows(body.payload, columns, userId, auth.companyId, auth.config)
  if (!rows.length) return { data: [], count: null }
  const insertColumns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  if (!insertColumns.length) throw new Error('No hay datos válidos para guardar.')
  const params = []
  const values = rows.map((row) => `(${insertColumns.map((column) => {
    const value = Object.prototype.hasOwnProperty.call(row, column) ? row[column] : null
    params.push(serializeColumnValue(columns, column, value))
    return `$${params.length}`
  }).join(', ')})`)
  let conflict = ''
  if (body.action === 'upsert') {
    const conflictColumns = String(body.onConflict || '').split(',').map((item) => item.trim()).filter(Boolean)
    if (!conflictColumns.length || conflictColumns.some((column) => !columns.has(column))) throw new Error('La clave de actualización no es válida.')
    const updateColumns = insertColumns.filter((column) => !conflictColumns.includes(column) && !['id', 'created_at'].includes(column))
    conflict = ` on conflict (${conflictColumns.map((column) => identifier(column)).join(', ')}) do ${updateColumns.length ? `update set ${updateColumns.map((column) => `${identifier(column)} = excluded.${identifier(column)}`).join(', ')}` : 'nothing'}`
  }
  const parsed = parseSelect(body.select || '*')
  const returning = selectedSql(parsed.fields, columns)
  const sql = `insert into ${identifier(body.table, 'tabla')} (${insertColumns.map((column) => identifier(column)).join(', ')}) values ${values.join(', ')}${conflict} returning ${returning}`
  const result = await client.query(sql, params)
  return { data: result.rows, count: null }
}

async function executeUpdateOrDelete(client, userId, body, auth) {
  const columns = await getColumns(client, body.table)
  const params = []
  const forced = forcedScope(auth.config, userId, auth.companyId)
  const userFilters = Array.isArray(body.filters) ? body.filters : []
  if (!userFilters.length) throw new Error('La operación necesita al menos un filtro explícito.')
  let prefix
  if (body.action === 'update') {
    const row = normalizeRows(body.payload, columns, userId, auth.companyId, auth.config)[0]
    delete row.id
    delete row.created_at
    const entries = Object.entries(row)
    if (!entries.length) throw new Error('No hay datos válidos para actualizar.')
    const assignments = entries.map(([column, value]) => {
      params.push(serializeColumnValue(columns, column, value))
      return `${identifier(column)} = $${params.length}`
    })
    prefix = `update ${identifier(body.table, 'tabla')} set ${assignments.join(', ')}`
  } else {
    prefix = `delete from ${identifier(body.table, 'tabla')}`
  }
  const clauses = addFilters(userFilters, columns, params, forced)
  const parsed = parseSelect(body.select || '*')
  const returning = selectedSql(parsed.fields, columns)
  const result = await client.query(`${prefix} where ${clauses.join(' and ')} returning ${returning}`, params)
  return { data: result.rows, count: null }
}

export async function executeDataQuery(userId, body) {
  if (!body || !['select', 'insert', 'update', 'delete', 'upsert'].includes(body.action)) {
    throw Object.assign(new Error('Operación de datos inválida.'), { status: 400 })
  }
  const auth = await authorize(userId, body)
  return withUserTransaction(userId, async (client) => {
    if (body.action === 'select') return executeSelect(client, userId, body, auth)
    if (body.action === 'insert' || body.action === 'upsert') return executeInsert(client, userId, body, auth)
    return executeUpdateOrDelete(client, userId, body, auth)
  })
}
