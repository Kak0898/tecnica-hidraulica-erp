import * as XLSX from 'xlsx'

const knownHeaderKeys = new Set([
  'code',
  'codigo',
  'name',
  'nombre',
  'conteo',
  'modelo',
  'color',
  'marca',
  'serie',
  'tipo',
  'ano',
  'ubicacion',
  'estado',
  'disponibilidad',
  'tipodebateria',
  'altobateria',
  'anchobateria',
  'largo',
  'altura',
  'medidas',
  'medida',
  'cantidad',
  'stock',
  'categoria',
  'category',
  'unidad',
  'unit',
  'proveedor',
  'supplier',
  'talla',
  'stockminimo',
  'observaciones',
  'tallapolera',
  'tallapantalon',
  'tallazapato',
  'tallaoverol',
  'tallageologo',
])

export type ExcelSheetData = {
  name: string
  matrix: unknown[][]
}

export type EppImportRow = {
  code: string
  category: string
  name: string
  talla: string
  color: string
  stock: number
  min_stock: number
  location: string
  estado: string
  notes: string
}

export type EppWorkerSizeRow = {
  nombre: string
  talla_polera: string
  talla_pantalon: string
  talla_zapato: string
  talla_overol: string
  talla_geologo: string
}

function limpiarClave(value: string) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '')
    .trim()
}

function hasCellValue(value: unknown) {
  return String(value ?? '').trim() !== ''
}

function findHeaderRow(rows: unknown[][]) {
  let bestIndex = -1
  let bestScore = 0

  rows.slice(0, 40).forEach((row, index) => {
    const matches = new Set(
      row
        .map((value) => limpiarClave(String(value ?? '')))
        .filter((key) => knownHeaderKeys.has(key)),
    )

    if (matches.size > bestScore) {
      bestIndex = index
      bestScore = matches.size
    }
  })

  if (bestScore >= 2) return bestIndex
  return rows.findIndex((row) => row.some(hasCellValue))
}

export function rowsFromExcelMatrix(matrix: unknown[][]) {
  const headerIndex = findHeaderRow(matrix)

  if (headerIndex < 0) return []

  const headerCounts = new Map<string, number>()
  const headers = matrix[headerIndex].map((value, columnIndex) => {
    const base = String(value ?? '').trim() || `__columna_${columnIndex + 1}`
    const normalized = limpiarClave(base)
    const count = (headerCounts.get(normalized) ?? 0) + 1
    headerCounts.set(normalized, count)
    return count === 1 ? base : `${base}_${count}`
  })

  return matrix
    .slice(headerIndex + 1)
    .filter((row) => row.some(hasCellValue))
    .map((row) =>
      headers.reduce<Record<string, unknown>>((result, header, columnIndex) => {
        result[header] = row[columnIndex] ?? ''
        return result
      }, {}),
    )
}

function matrixFromWorksheet(worksheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false,
  })
}

function rowsFromWorksheet(worksheet: XLSX.WorkSheet) {
  return rowsFromExcelMatrix(matrixFromWorksheet(worksheet))
}

export function readExcelWorkbookBuffer(buffer: ArrayBuffer | Uint8Array): ExcelSheetData[] {
  const workbook = XLSX.read(buffer, { type: 'array' })

  return workbook.SheetNames.map((name) => ({
    name,
    matrix: matrixFromWorksheet(workbook.Sheets[name]),
  }))
}

export async function readExcelWorkbook(file: File): Promise<ExcelSheetData[]> {
  return readExcelWorkbookBuffer(await file.arrayBuffer())
}

export function findExcelSheet(
  sheets: ExcelSheetData[],
  patterns: string[],
  fallbackIndex = 0,
) {
  const normalizedPatterns = patterns.map(limpiarClave)
  return sheets.find((sheet) => {
    const normalizedName = limpiarClave(sheet.name)
    return normalizedPatterns.some((pattern) => normalizedName.includes(pattern))
  }) ?? sheets[fallbackIndex] ?? sheets[0]
}

export function readExcelBuffer(buffer: ArrayBuffer | Uint8Array, sheetIndex = 0): any[] {
  const workbook = XLSX.read(buffer, { type: 'array' })

  const sheetName = workbook.SheetNames[sheetIndex]

  if (!sheetName) {
    throw new Error(`No existe la hoja número ${sheetIndex + 1} en el Excel`)
  }

  const worksheet = workbook.Sheets[sheetName]

  return rowsFromWorksheet(worksheet)
}

export async function readExcelFile(file: File, sheetIndex = 0): Promise<any[]> {
  return readExcelBuffer(await file.arrayBuffer(), sheetIndex)
}

function get(row: any, keys: string[]) {
  const normalizedRow: Record<string, any> = {}

  Object.keys(row).forEach((key) => {
    normalizedRow[limpiarClave(key)] = row[key]
  })

  for (const key of keys) {
    const normalizedKey = limpiarClave(key)

    if (normalizedRow[normalizedKey] !== undefined) {
      return normalizedRow[normalizedKey]
    }
  }

  return ''
}

function texto(value: any) {
  return String(value ?? '').trim()
}

function numero(value: any) {
  const limpio = String(value ?? '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim()

  const n = Number(limpio)
  return Number.isFinite(n) ? n : 0
}

function entero(value: any) {
  const n = parseInt(String(value ?? '').trim(), 10)
  return Number.isFinite(n) ? n : null
}

function slug(value: any) {
  return texto(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalizarEstadoFisico(value: any) {
  const estado = texto(value).toLowerCase()

  if (
    estado.includes('no operativa') ||
    estado.includes('desarmad') ||
    estado.includes('falla') ||
    estado.includes('falta')
  ) return 'malo'
  if (estado.includes('nuevo')) return 'nuevo'
  if (estado.includes('usado')) return 'usado'
  if (estado.includes('buen')) return 'buen estado'
  if (estado.includes('operativa')) return 'buen estado'
  if (estado.includes('regular')) return 'regular'
  if (estado.includes('revision')) return 'regular'
  if (estado.includes('revisión')) return 'regular'
  if (estado.includes('reparacion')) return 'regular'
  if (estado.includes('reparación')) return 'regular'
  if (estado.includes('malo')) return 'malo'

  return 'buen estado'
}

function normalizarDisponibilidad(value: any) {
  const disponibilidad = texto(value).toLowerCase()

  if (disponibilidad.includes('no operativa')) return 'no_disponible'
  if (disponibilidad.includes('no disponible')) return 'no_disponible'
  if (disponibilidad.includes('para revision')) return 'mantenimiento'
  if (disponibilidad.includes('para revisión')) return 'mantenimiento'
  if (disponibilidad.includes('arriendo/venta')) return 'disponible'
  if (disponibilidad.includes('arrienda/venta')) return 'disponible'
  if (disponibilidad.includes('en arriendo')) return 'arrendada'
  if (disponibilidad.includes('disponible')) return 'disponible'
  if (disponibilidad.includes('arrendada')) return 'arrendada'
  if (disponibilidad.includes('arriendo')) return 'arrendada'
  if (disponibilidad.includes('ocupada')) return 'ocupada'
  if (disponibilidad.includes('mantencion')) return 'mantenimiento'
  if (disponibilidad.includes('mantención')) return 'mantenimiento'
  if (disponibilidad.includes('mantenimiento')) return 'mantenimiento'
  if (disponibilidad.includes('baja')) return 'baja'

  return disponibilidad || 'disponible'
}

function normalizarStatusDesdeDisponibilidad(value: any) {
  const disponibilidad = normalizarDisponibilidad(value)

  if (disponibilidad === 'mantenimiento') return 'mantenimiento'
  if (disponibilidad === 'baja') return 'baja'
  if (disponibilidad === 'no_disponible') return 'inactivo'

  return 'activo'
}

export function normalizeMachineRow(row: any) {
  const conteo = texto(get(row, ['CONTEO', 'conteo']))
  const modelo = texto(get(row, ['MODELO', 'modelo']))
  const color = texto(get(row, ['COLOR', 'color']))
  const marca = texto(get(row, ['MARCA', 'marca']))
  const serie = texto(get(row, ['SERIE', 'serie']))
  const tipo = texto(get(row, ['TIPO', 'tipo']))
  const anio = entero(get(row, ['AÑO', 'ANO', 'año', 'ano']))
  const ubicacion = texto(get(row, ['UBICACIÓN', 'UBICACION', 'ubicación', 'ubicacion']))
  const estado = texto(get(row, ['ESTADO', 'estado']))
  const disponibilidad = texto(get(row, ['DISPONIBILIDAD', 'disponibilidad']))
  const tipoBateria = texto(get(row, ['TIPO DE BATERIA', 'TIPO DE BATERÍA', 'tipo de bateria', 'tipo de batería']))

  const altoBateria = numero(get(row, ['ALTO BATERIA', 'ALTO BATERÍA', 'alto bateria', 'alto batería']))
  const anchoBateria = numero(get(row, ['ANCHO BATERIA', 'ANCHO BATERÍA', 'ancho bateria', 'ancho batería']))
  const largo = numero(get(row, ['LARGO', 'largo']))
  const altura = numero(get(row, ['ALTURA', 'altura']))

  const identidadEquipo = slug(`${marca}-${modelo}-${tipo}`)
  const code =
    conteo
      ? `MAQ-${String(conteo).padStart(3, '0')}`
      : serie
        ? `SERIE-${slug(serie)}`
        : identidadEquipo
          ? `MAQ-${identidadEquipo}`
          : ''

  const name = [marca, modelo, tipo, serie].filter(Boolean).join(' ') || code

  return {
    code,
    name,
    conteo,
    model: modelo,
    color,
    brand: marca,
    serial: serie,
    tipo,
    anio,
    location: ubicacion,
    estado_fisico: normalizarEstadoFisico(estado),
    estado_detalle: estado,
    disponibilidad: normalizarDisponibilidad(disponibilidad),
    status: normalizarStatusDesdeDisponibilidad(disponibilidad),
    tipo_bateria: tipoBateria,
    alto_bateria: altoBateria,
    ancho_bateria: anchoBateria,
    largo,
    altura,
  }
}

export function normalizeSparePartRow(row: any) {
  const medidas = texto(get(row, ['MEDIDAS', 'MEDIDA', 'medidas', 'medida']))
  const rawCode = texto(get(row, ['CODE', 'CÓDIGO', 'CODIGO', 'code', 'código', 'codigo']))
  const rawName = texto(get(row, ['NAME', 'NOMBRE', 'name', 'nombre']))

  return {
    code: rawCode || (medidas ? `REP-${slug(medidas)}` : ''),
    name: rawName || (medidas ? `Rueda de carga ${medidas}` : ''),
    brand: texto(get(row, ['BRAND', 'MARCA', 'brand', 'marca'])),
    category: texto(get(row, ['CATEGORY', 'CATEGORÍA', 'CATEGORIA', 'category', 'categoría', 'categoria'])) || (medidas ? 'Ruedas de carga' : ''),
    location: texto(get(row, ['LOCATION', 'UBICACIÓN', 'UBICACION', 'location', 'ubicación', 'ubicacion'])),
    stock: numero(get(row, ['STOCK', 'CANTIDAD', 'stock', 'cantidad'])),
    min_stock: numero(get(row, ['MIN_STOCK', 'STOCK MÍNIMO', 'STOCK MINIMO', 'MÍNIMO', 'MINIMO', 'min_stock', 'stock mínimo', 'stock minimo', 'mínimo', 'minimo'])),
    unit_price: numero(get(row, ['UNIT_PRICE', 'PRECIO UNITARIO', 'PRECIO', 'unit_price', 'precio unitario', 'precio'])),
    unit: texto(get(row, ['UNIT', 'UNIDAD', 'unit', 'unidad'])) || 'unidad',
    supplier: texto(get(row, ['SUPPLIER', 'PROVEEDOR', 'supplier', 'proveedor'])),
    notes: texto(get(row, ['NOTES', 'NOTAS', 'OBSERVACIONES', 'notes', 'notas', 'observaciones'])),
  }
}

const cantidadesEnPalabras: Record<string, number> = {
  CERO: 0,
  UNO: 1,
  UNA: 1,
  DOS: 2,
  TRES: 3,
  CUATRO: 4,
  CINCO: 5,
  SEIS: 6,
  SIETE: 7,
  OCHO: 8,
  NUEVE: 9,
  DIEZ: 10,
}

function cantidadEpp(value: unknown) {
  const raw = texto(value).toUpperCase()
  const word = raw.split(/\s+/).find((part) => cantidadesEnPalabras[part] !== undefined)
  if (word) return cantidadesEnPalabras[word]

  const parsed = Number(raw.replace(/[^\d,.-]/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0
}

function codigoEpp(category: unknown, name: unknown, talla: unknown, color: unknown) {
  const identity = [category, name, talla, color]
    .map(slug)
    .filter((part, index, parts) => Boolean(part) && part !== parts[index - 1])
    .join('-')
  return identity ? `EPP-${identity}` : ''
}

export function normalizeEppRow(row: any): EppImportRow {
  const category = texto(get(row, ['CATEGORÍA', 'CATEGORIA', 'CATEGORY', 'categoría', 'categoria', 'category']))
  const talla = texto(get(row, ['TALLA', 'talla']))
  const color = texto(get(row, ['COLOR', 'color']))
  const name = texto(get(row, ['NOMBRE', 'NAME', 'ARTÍCULO', 'ARTICULO', 'nombre', 'name', 'artículo', 'articulo'])) || category
  const stock = cantidadEpp(get(row, ['CANTIDAD', 'CANT. DISPONIBLE', 'CANT DISPONIBLE', 'STOCK', 'cantidad', 'cant. disponible', 'cant disponible', 'stock']))
  const rawEstado = texto(get(row, ['ESTADO', 'estado'])).toLowerCase()

  return {
    code: texto(get(row, ['CÓDIGO', 'CODIGO', 'CODE', 'código', 'codigo', 'code'])) || codigoEpp(category, name, talla, color),
    category,
    name,
    talla,
    color,
    stock,
    min_stock: cantidadEpp(get(row, ['STOCK MÍNIMO', 'STOCK MINIMO', 'MÍNIMO', 'MINIMO', 'stock mínimo', 'stock minimo', 'mínimo', 'minimo'])),
    location: texto(get(row, ['UBICACIÓN', 'UBICACION', 'LOCATION', 'ubicación', 'ubicacion', 'location'])),
    estado: rawEstado || (stock > 0 ? 'disponible' : 'agotado'),
    notes: texto(get(row, ['OBSERVACIONES', 'NOTAS', 'NOTES', 'observaciones', 'notas', 'notes'])),
  }
}

function isStructuredEppHeader(row: unknown[]) {
  const keys = new Set(row.map((value) => limpiarClave(texto(value))))
  return keys.has('categoria') && (keys.has('cantidad') || keys.has('stock')) && (keys.has('talla') || keys.has('nombre'))
}

function parseStructuredEppSheet(matrix: unknown[][]) {
  const headerIndex = matrix.slice(0, 40).findIndex(isStructuredEppHeader)
  if (headerIndex < 0) return []

  return rowsFromExcelMatrix(matrix.slice(headerIndex)).map(normalizeEppRow)
}

function parseOriginalEppSheet(matrix: unknown[][]) {
  const rows: EppImportRow[] = []
  let category = ''

  matrix.forEach((sourceRow) => {
    const [rawTalla, rawColor, rawCantidad, rawUbicacion] = sourceRow
    const talla = texto(rawTalla)
    const color = texto(rawColor)
    const cantidad = texto(rawCantidad)
    const ubicacion = texto(rawUbicacion)
    const key = limpiarClave(talla)

    if (talla && !color && !cantidad && !ubicacion && key !== 'talla') {
      category = talla
      return
    }

    if (!category || !talla || key === 'talla') return

    rows.push(normalizeEppRow({
      CATEGORÍA: category,
      NOMBRE: category,
      TALLA: talla,
      COLOR: color,
      CANTIDAD: cantidad,
      UBICACIÓN: ubicacion,
    }))
  })

  return rows
}

function parseWorkerSizesSheet(matrix: unknown[][]): EppWorkerSizeRow[] {
  const headerIndex = matrix.slice(0, 40).findIndex((row) => {
    const keys = new Set(row.map((value) => limpiarClave(texto(value))))
    return keys.has('nombre') && keys.has('tallapolera')
  })

  if (headerIndex < 0) return []

  const headers = matrix[headerIndex].map((value) => limpiarClave(texto(value)))
  const indexOf = (key: string) => headers.indexOf(key)
  const nombreIndex = indexOf('nombre')

  return matrix
    .slice(headerIndex + 1)
    .filter((row) => nombreIndex >= 0 && hasCellValue(row[nombreIndex]))
    .map((row) => ({
      nombre: texto(row[nombreIndex]),
      talla_polera: texto(row[indexOf('tallapolera')]),
      talla_pantalon: texto(row[indexOf('tallapantalon')]),
      talla_zapato: texto(row[indexOf('tallazapato')]),
      talla_overol: texto(row[indexOf('tallaoverol')]),
      talla_geologo: texto(row[indexOf('tallageologo')]),
    }))
}

function uniqueBy<T>(rows: T[], keyFor: (row: T) => string) {
  const unique = new Map<string, T>()
  rows.forEach((row) => {
    const key = keyFor(row)
    if (key) unique.set(key, row)
  })
  return Array.from(unique.values())
}

export function normalizeEppWorkbook(sheets: ExcelSheetData[]) {
  const inventorySheet = findExcelSheet(sheets, ['epp', 'ropa'], 2)
  const structuredItems = inventorySheet ? parseStructuredEppSheet(inventorySheet.matrix) : []
  const items = structuredItems.length
    ? structuredItems
    : inventorySheet
      ? parseOriginalEppSheet(inventorySheet.matrix)
      : []

  const workerSizes = sheets.flatMap((sheet) => parseWorkerSizesSheet(sheet.matrix))

  return {
    items: uniqueBy(items, (row) => row.code.toLocaleUpperCase('es-CL')),
    workerSizes: uniqueBy(workerSizes, (row) => row.nombre.toLocaleUpperCase('es-CL')),
  }
}
