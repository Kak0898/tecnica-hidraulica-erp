import { utils, writeFile } from 'xlsx'

const sheets = [
  {
    name: 'Maquinaria',
    table: 'machines',
    columns: [
      ['Código', 'code'],
      ['Nombre', 'name'],
      ['Conteo', 'conteo'],
      ['Categoría', 'category'],
      ['Tipo', 'tipo'],
      ['Marca', 'brand'],
      ['Modelo', 'model'],
      ['N° de serie', (row) => row.serial_number || row.serial],
      ['Color', 'color'],
      ['Año', 'anio', 'number'],
      ['Ubicación', 'location'],
      ['Ubicación cliente', 'ubicacion_cliente'],
      ['Estado', 'status'],
      ['Estado físico', 'estado_fisico'],
      ['Detalle del estado', 'estado_detalle'],
      ['Disponibilidad', 'disponibilidad'],
      ['Tipo de batería', 'tipo_bateria'],
      ['Alto de batería', 'alto_bateria', 'number'],
      ['Ancho de batería', 'ancho_bateria', 'number'],
      ['Largo', 'largo', 'number'],
      ['Altura', 'altura', 'number'],
      ['Último mantenimiento', 'last_maintenance', 'date'],
      ['Próximo mantenimiento', 'next_maintenance', 'date'],
      ['Valor de compra', 'purchase_value', 'number'],
      ['Notas', 'notes'],
    ],
  },
  {
    name: 'Repuestos y ruedas',
    table: 'spare_parts',
    columns: [
      ['Código', 'code'],
      ['Nombre', 'name'],
      ['Categoría', 'category'],
      ['Marca', 'brand'],
      ['Equipo compatible', 'compatible_machine'],
      ['Stock actual', 'stock', 'number'],
      ['Stock mínimo', 'min_stock', 'number'],
      ['Unidad', 'unit'],
      ['Costo unitario', 'unit_cost', 'number'],
      ['Precio unitario', 'unit_price', 'number'],
      ['Proveedor', 'supplier'],
      ['Ubicación', 'location'],
      ['Notas', 'notes'],
    ],
  },
  {
    name: 'EPP y ropa',
    table: 'epp_items',
    columns: [
      ['Código', 'code'],
      ['Nombre', 'name'],
      ['Categoría', 'category'],
      ['Talla', 'talla'],
      ['Color', 'color'],
      ['Stock actual', 'stock', 'number'],
      ['Stock mínimo', 'min_stock', 'number'],
      ['Ubicación', 'location'],
      ['Estado', 'estado'],
      ['Notas', 'notes'],
    ],
  },
]

export const inventoryExportTables = sheets.map(({ name, table }) => ({ name, table }))

function cellValue(row, key, format) {
  const value = typeof key === 'function' ? key(row) : row[key]
  if (value == null || value === '') return null
  if (format === 'number' && Number.isFinite(Number(value))) return Number(value)
  if (format === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-03-01') {
    const utcDays = Date.parse(value) / 86_400_000
    if (Number.isFinite(utcDays)) return { t: 'n', v: utcDays + 25569, z: 'dd/mm/yyyy' }
  }
  return String(value)
}

export function buildInventoryWorkbook(rowsByTable, company) {
  const workbook = utils.book_new()
  workbook.Props = { Title: 'Inventario', Company: company, CreatedDate: new Date() }

  for (const { name, table, columns } of sheets) {
    const headers = columns.map(([label]) => label)
    const rows = rowsByTable[table].map((row) =>
      columns.map(([, key, format]) => cellValue(row, key, format)),
    )
    const sheet = utils.aoa_to_sheet([headers, ...rows])
    sheet['!cols'] = headers.map((header, index) => {
      const width = rows.reduce((longest, row) => Math.max(longest, String(row[index]?.v ?? row[index] ?? '').length), header.length)
      return { wch: Math.min(52, Math.max(12, width + 2)) }
    })
    if (rows.length) sheet['!autofilter'] = { ref: sheet['!ref'] }
    utils.book_append_sheet(workbook, sheet, name)
  }
  return workbook
}

export function downloadInventoryWorkbook(rowsByTable, company, slug) {
  const safeSlug = String(slug || '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'empresa'
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date())
  const workbook = buildInventoryWorkbook(rowsByTable, company)
  writeFile(workbook, `inventario-${safeSlug}-${date}.xlsx`, { compression: true })
}
