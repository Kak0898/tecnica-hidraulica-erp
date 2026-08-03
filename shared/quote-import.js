const HEADER_ALIASES = Object.freeze({
  numero: ['numero', 'nro', 'n cotizacion', 'numero cotizacion', 'n° cotizacion', 'folio', 'cotizacion'],
  serie: ['serie', 'serie cotizacion', 'sucursal', 'origen'],
  fecha_emision: ['fecha emision', 'fecha de emision', 'fecha cotizacion', 'fecha'],
  fecha_vcto: ['fecha vencimiento', 'fecha de vencimiento', 'vencimiento'],
  cliente_nombre: ['cliente', 'razon social', 'señor(es)', 'senor(es)', 'empresa cliente'],
  cliente_rut: ['rut cliente', 'rut', 'rut empresa'],
  cliente_contacto: ['contacto', 'nombre contacto'],
  cliente_direccion: ['direccion', 'direccion cliente'],
  cliente_giro: ['giro', 'giro cliente'],
  cliente_comuna: ['comuna', 'comuna cliente'],
  cliente_ciudad: ['ciudad', 'region', 'ciudad region'],
  cliente_telefono: ['telefono', 'fono', 'celular'],
  cliente_email: ['email', 'correo', 'correo cliente'],
  moneda: ['moneda', 'currency'],
  neto: ['neto', 'monto neto', 'subtotal'],
  iva: ['iva', 'impuesto'],
  total: ['total', 'monto total'],
  vendedor_nombre: ['vendedor', 'nombre vendedor', 'ejecutivo', 'comercial'],
  vendedor_email: ['correo vendedor', 'email vendedor', 'vendedor email'],
  referencia: ['referencia', 'oc', 'orden compra'],
  observaciones: ['observaciones', 'notas', 'comentarios'],
})

function normalizedKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function indexedRow(row) {
  return Object.entries(row || {}).reduce((result, [key, value]) => {
    const normalized = normalizedKey(key)
    const hasValue = value !== undefined && value !== null && String(value).trim() !== ''
    if (hasValue || result[normalized] === undefined) result[normalized] = value
    return result
  }, {})
}

function field(row, name) {
  const aliases = HEADER_ALIASES[name] || [name]
  for (const alias of aliases) {
    const value = row[normalizedKey(alias)]
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return ''
}

function text(value, maxLength = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

function decimal(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  let source = String(value ?? '').trim().replace(/[^\d,.-]/g, '')
  if (!source) return 0
  const comma = source.lastIndexOf(',')
  const dot = source.lastIndexOf('.')
  if (comma > dot) source = source.replace(/\./g, '').replace(',', '.')
  else if (dot > comma && comma >= 0) source = source.replace(/,/g, '')
  else if (comma >= 0) source = source.replace(',', '.')
  else if ((source.match(/\./g) || []).length > 1) source = source.replace(/\./g, '')
  const parsed = Number(source)
  return Number.isFinite(parsed) ? parsed : 0
}

function integer(value) {
  const source = String(value ?? '').replace(/[^\d-]/g, '')
  const parsed = Number(source)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function isoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  const source = String(value ?? '').trim()
  if (!source) return ''
  const iso = source.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  const local = source.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  const shortLocal = source.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/)
  const parts = iso
    ? [iso[1], iso[2], iso[3]]
    : local
      ? [local[3], local[2], local[1]]
      : shortLocal
        ? [`20${shortLocal[3]}`, shortLocal[2], shortLocal[1]]
        : null
  if (!parts) return ''
  const result = `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`
  const date = new Date(`${result}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== result ? '' : result
}

function currency(value) {
  const normalized = text(value, 8).toUpperCase().replace('$', '')
  if (['CLP', 'PESO', 'PESOS'].includes(normalized)) return 'CLP'
  if (['USD', 'US', 'DOLAR', 'DOLARES'].includes(normalized)) return 'USD'
  if (normalized === 'UF') return 'UF'
  return 'CLP'
}

function series(value, date) {
  const normalized = text(value, 40)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || `IMP-${String(date || '').slice(0, 4) || 'HIST'}`
}

export function normalizeQuoteImportRow(source, context = {}) {
  const row = indexedRow({
    ...(source || {}),
    moneda: source?.moneda ?? source?.data?.moneda,
  })
  const numero = integer(field(row, 'numero'))
  const fechaEmision = isoDate(field(row, 'fecha_emision'))
  const clienteNombre = text(field(row, 'cliente_nombre'), 250)
  const errors = []
  if (!numero || numero < 1) errors.push('número de cotización inválido')
  if (!fechaEmision) errors.push('fecha de emisión inválida')
  if (!clienteNombre) errors.push('cliente vacío')

  let neto = Math.max(0, decimal(field(row, 'neto')))
  let iva = Math.max(0, decimal(field(row, 'iva')))
  let total = Math.max(0, decimal(field(row, 'total')))
  if (!neto && total) neto = total / 1.19
  if (!iva && total && neto) iva = Math.max(0, total - neto)
  if (!total && (neto || iva)) total = neto + iva
  if (!neto && !total) errors.push('monto neto o total vacío')

  const rowNumber = Number(context.rowNumber || 0)
  const importUid = text(context.importUid, 180)
  if (!importUid) errors.push('identificador interno de importación vacío')

  const moneda = currency(field(row, 'moneda'))
  const serieCotizacion = series(field(row, 'serie'), fechaEmision)
  const vendedorNombre = text(field(row, 'vendedor_nombre'), 200)
  const vendedorEmail = text(field(row, 'vendedor_email'), 250).toLowerCase()
  const observaciones = text(field(row, 'observaciones'), 3000)
  const referencia = text(field(row, 'referencia'), 500)
  const fechaVcto = isoDate(field(row, 'fecha_vcto'))
  const importedReferences = [{
    texto: referencia || 'Cotización histórica importada',
    items: [{
      codigo: '',
      descripcion: referencia || 'Monto neto de cotización histórica importada',
      cantidad: 1,
      um: 'UN',
      precio: neto,
      dscto: 0,
    }],
  }]

  return {
    valid: errors.length === 0,
    errors,
    sourceRow: rowNumber,
    data: {
      numero,
      serie_cotizacion: serieCotizacion,
      origen_documento: 'importado',
      importacion_uid: importUid,
      importacion_archivo: text(context.fileName, 255),
      fecha_emision: fechaEmision || null,
      fecha_vcto: fechaVcto || null,
      cliente_nombre: clienteNombre,
      cliente_contacto: text(field(row, 'cliente_contacto'), 200),
      cliente_rut: text(field(row, 'cliente_rut'), 30),
      cliente_direccion: text(field(row, 'cliente_direccion'), 500),
      cliente_giro: text(field(row, 'cliente_giro'), 300),
      cliente_comuna: text(field(row, 'cliente_comuna'), 150),
      cliente_ciudad: text(field(row, 'cliente_ciudad'), 150),
      cliente_telefono: text(field(row, 'cliente_telefono'), 80),
      cliente_email: text(field(row, 'cliente_email'), 250).toLowerCase(),
      vendedor_nombre: vendedorNombre,
      vendedor_email: vendedorEmail,
      referencia,
      observaciones,
      subtotal: neto,
      neto,
      iva,
      total,
      items: importedReferences,
      data: {
        documentKind: 'cotizacion',
        tipo: 'COTIZACIÓN',
        estado: 'cotizacion_emitida',
        numero: numero ? String(numero) : '',
        numeroReservado: Boolean(numero),
        fecha: fechaEmision,
        vcto: fechaVcto,
        moneda,
        cliente: clienteNombre,
        contacto: text(field(row, 'cliente_contacto'), 200),
        rut: text(field(row, 'cliente_rut'), 30),
        direccion: text(field(row, 'cliente_direccion'), 500),
        giro: text(field(row, 'cliente_giro'), 300),
        comuna: text(field(row, 'cliente_comuna'), 150),
        ciudad: text(field(row, 'cliente_ciudad'), 150),
        telefono: text(field(row, 'cliente_telefono'), 80),
        email: text(field(row, 'cliente_email'), 250).toLowerCase(),
        vendedorNombre,
        vendedorEmail,
        referencia,
        referencias: importedReferences,
        observaciones,
        serieCotizacion,
        origenDocumento: 'importado',
        importedFrom: text(context.fileName, 255),
        importedRow: rowNumber,
        dirty: false,
      },
    },
  }
}

export function quoteImportLabel(quote) {
  const number = quote?.numero || 'SIN-NÚMERO'
  const seriesValue = quote?.serie_cotizacion || quote?.data?.serieCotizacion || 'TH'
  const date = quote?.fecha_emision || quote?.data?.fecha || 'sin fecha'
  const id = quote?.id ? ` · ID ${quote.id}` : ''
  return `N° ${number} · ${seriesValue} · ${date}${id}`
}
