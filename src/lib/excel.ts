import * as XLSX from 'xlsx'

export async function readExcelFile(file: File, sheetIndex = 0): Promise<any[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const sheetName = workbook.SheetNames[sheetIndex]

  if (!sheetName) {
    throw new Error(`No existe la hoja número ${sheetIndex + 1} en el Excel`)
  }

  const worksheet = workbook.Sheets[sheetName]

  return XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
  })
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

  if (estado.includes('nuevo')) return 'nuevo'
  if (estado.includes('usado')) return 'usado'
  if (estado.includes('buen')) return 'buen_estado'
  if (estado.includes('operativa')) return 'buen_estado'
  if (estado.includes('regular')) return 'regular'
  if (estado.includes('revision')) return 'regular'
  if (estado.includes('revisión')) return 'regular'
  if (estado.includes('malo')) return 'malo'
  if (estado.includes('falla')) return 'malo'
  if (estado.includes('desarmado')) return 'malo'

  return 'buen_estado'
}

function normalizarDisponibilidad(value: any) {
  const disponibilidad = texto(value).toLowerCase()

  if (disponibilidad.includes('disponible')) return 'disponible'
  if (disponibilidad.includes('arriendo')) return 'arrendada'
  if (disponibilidad.includes('arrendada')) return 'arrendada'
  if (disponibilidad.includes('ocupada')) return 'ocupada'
  if (disponibilidad.includes('mantencion')) return 'mantenimiento'
  if (disponibilidad.includes('mantención')) return 'mantenimiento'
  if (disponibilidad.includes('mantenimiento')) return 'mantenimiento'
  if (disponibilidad.includes('baja')) return 'baja'
  if (disponibilidad.includes('no disponible')) return 'no_disponible'

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

  const code =
    conteo
      ? `MAQ-${String(conteo).padStart(3, '0')}`
      : serie
        ? `SERIE-${slug(serie)}`
        : `MAQ-${slug(`${marca}-${modelo}-${tipo}`)}`

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
  return {
    code: texto(row.code || row.codigo),
    name: texto(row.name || row.nombre),
    brand: texto(row.brand || row.marca),
    category: texto(row.category || row.categoria),
    location: texto(row.location || row.ubicacion),
    stock: numero(row.stock),
    min_stock: numero(row.min_stock || row.stock_minimo || row.minimo),
    unit_price: numero(row.unit_price || row.precio_unitario || row.precio),
    unit: texto(row.unit || row.unidad || 'unidad'),
    supplier: texto(row.supplier || row.proveedor),
    notes: texto(row.notes || row.notas || row.observaciones),
  }
}