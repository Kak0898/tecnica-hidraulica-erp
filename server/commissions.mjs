export const DEFAULT_RULES = Object.freeze({
  comision_arriendo_mensual: 35_000,
  comision_trabajo_hidraulico_pct: 6,
  comision_venta_apilador: 600_000,
})

function nonNegative(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

export function commercialRules(extra = {}) {
  const source = extra?.comercial && typeof extra.comercial === 'object' ? extra.comercial : extra || {}
  return {
    comision_arriendo_mensual: nonNegative(source.comision_arriendo_mensual, DEFAULT_RULES.comision_arriendo_mensual),
    comision_trabajo_hidraulico_pct: Math.min(100, nonNegative(source.comision_trabajo_hidraulico_pct, DEFAULT_RULES.comision_trabajo_hidraulico_pct)),
    comision_venta_apilador: nonNegative(source.comision_venta_apilador, DEFAULT_RULES.comision_venta_apilador),
  }
}

export function validateCommercialRules(input = {}) {
  const values = {
    comision_arriendo_mensual: Number(input.comision_arriendo_mensual),
    comision_trabajo_hidraulico_pct: Number(input.comision_trabajo_hidraulico_pct),
    comision_venta_apilador: Number(input.comision_venta_apilador),
  }
  if (!Number.isFinite(values.comision_arriendo_mensual) || values.comision_arriendo_mensual < 0 || values.comision_arriendo_mensual > 100_000_000) {
    throw Object.assign(new Error('La comisión por arriendo debe estar entre $0 y $100.000.000.'), { status: 400 })
  }
  if (!Number.isFinite(values.comision_trabajo_hidraulico_pct) || values.comision_trabajo_hidraulico_pct < 0 || values.comision_trabajo_hidraulico_pct > 100) {
    throw Object.assign(new Error('El porcentaje de trabajo hidráulico debe estar entre 0% y 100%.'), { status: 400 })
  }
  if (!Number.isFinite(values.comision_venta_apilador) || values.comision_venta_apilador < 0 || values.comision_venta_apilador > 100_000_000) {
    throw Object.assign(new Error('La comisión por venta de apilador debe estar entre $0 y $100.000.000.'), { status: 400 })
  }
  return values
}

function itemAmount(item) {
  const quantity = nonNegative(item?.cantidad, 0)
  const price = nonNegative(item?.precio ?? item?.precio_unitario, 0)
  const discount = Math.min(100, nonNegative(item?.dscto ?? item?.descuento, 0))
  return quantity * price * (1 - discount / 100)
}

export function quoteNetAmount(quote = {}) {
  const direct = nonNegative(quote.neto, 0)
  if (direct > 0) return direct
  const dataDirect = nonNegative(quote.data?.neto ?? quote.data?.subtotal, 0)
  if (dataDirect > 0) return dataDirect
  const references = Array.isArray(quote.data?.referencias) ? quote.data.referencias : []
  const referenceTotal = references.reduce(
    (sum, reference) => sum + (Array.isArray(reference?.items) ? reference.items.reduce((itemSum, item) => itemSum + itemAmount(item), 0) : 0),
    0,
  )
  if (referenceTotal > 0) return referenceTotal
  const items = Array.isArray(quote.items) ? quote.items : Array.isArray(quote.data?.items) ? quote.data.items : []
  const itemsTotal = items.reduce((sum, item) => sum + itemAmount(item), 0)
  if (itemsTotal > 0) return itemsTotal
  const total = nonNegative(quote.total ?? quote.data?.total, 0)
  return total > 0 ? total / 1.19 : 0
}

export function calculateCommission({ tipo, neto = 0, costo = 0, meses = 1, cantidad = 1, rules = DEFAULT_RULES }) {
  const safeNeto = nonNegative(neto)
  const safeCost = nonNegative(costo)
  const safeMonths = Math.max(1, Math.trunc(nonNegative(meses, 1)))
  const safeQuantity = Math.max(1, Math.trunc(nonNegative(cantidad, 1)))
  const profit = Math.max(0, safeNeto - safeCost)

  if (tipo === 'arriendo') {
    return { commission: nonNegative(rules.comision_arriendo_mensual) * safeMonths, profit, months: safeMonths, quantity: 1 }
  }
  if (tipo === 'trabajo_hidraulico') {
    return { commission: profit * nonNegative(rules.comision_trabajo_hidraulico_pct) / 100, profit, months: 1, quantity: 1 }
  }
  if (tipo === 'venta_apilador') {
    return { commission: nonNegative(rules.comision_venta_apilador) * safeQuantity, profit, months: 1, quantity: safeQuantity }
  }
  throw Object.assign(new Error('Selecciona si corresponde a arriendo, trabajo hidráulico o venta de apilador.'), { status: 400 })
}

export function receiptFilename({ folio, transferDate, rut, extension }) {
  const safeFolio = String(folio || 'SIN-FOLIO').toUpperCase().replace(/[^A-Z0-9-]/g, '-')
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(transferDate || '')) ? transferDate : ''
  const safeRut = String(rut || '').toUpperCase().replace(/[^0-9K-]/g, '') || 'SIN-RUT'
  const safeExtension = String(extension || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!safeDate) throw Object.assign(new Error('La fecha de transferencia es obligatoria.'), { status: 400 })
  if (!safeExtension) throw Object.assign(new Error('El comprobante no tiene una extensión válida.'), { status: 400 })
  return `COT-${safeFolio}_${safeDate}_RUT-${safeRut}.${safeExtension}`
}
