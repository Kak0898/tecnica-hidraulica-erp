import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeQuoteImportRow, quoteImportLabel } from '../shared/quote-import.js'

test('normaliza una cotización Excel con montos y fecha chilenos', () => {
  const result = normalizeQuoteImportRow({
    'N° Cotización': '11877',
    Serie: 'Santiago 2025',
    Fecha: '29/07/2026',
    Cliente: 'Empresa de prueba',
    'RUT Cliente': '76.171.450-3',
    Moneda: 'USD',
    Neto: '1.250,50',
    IVA: '237,60',
    Total: '1.488,10',
    Vendedor: 'Franco Dareck',
  }, { importUid: 'archivo:cotizaciones:2', fileName: 'historial.xlsx', rowNumber: 2 })

  assert.equal(result.valid, true)
  assert.equal(result.data.numero, 11877)
  assert.equal(result.data.serie_cotizacion, 'SANTIAGO-2025')
  assert.equal(result.data.fecha_emision, '2026-07-29')
  assert.equal(result.data.neto, 1250.5)
  assert.equal(result.data.data.moneda, 'USD')
})

test('permite folios repetidos porque la identidad es el ID de importación', () => {
  const base = { Numero: 44, Fecha: '2025-01-10', Cliente: 'Cliente A', Total: 119000 }
  const first = normalizeQuoteImportRow(base, { importUid: 'file-a:2', fileName: 'a.xlsx', rowNumber: 2 })
  const second = normalizeQuoteImportRow(base, { importUid: 'file-a:3', fileName: 'a.xlsx', rowNumber: 3 })
  assert.equal(first.data.numero, second.data.numero)
  assert.notEqual(first.data.importacion_uid, second.data.importacion_uid)
  assert.equal(Math.round(first.data.neto), 100000)
})

test('etiqueta documentos homónimos con serie, fecha e ID interno', () => {
  assert.equal(
    quoteImportLabel({ id: 91, numero: 44, serie_cotizacion: 'IMP-2025', fecha_emision: '2025-01-10' }),
    'N° 44 · IMP-2025 · 2025-01-10 · ID 91',
  )
})

test('normaliza presupuesto importado sin ocupar folio final de cotización', () => {
  const result = normalizeQuoteImportRow({
    tipo: 'presupuesto',
    pre_numero: '11879',
    Fecha: '01-08-2026',
    Cliente: 'Cliente Presupuesto',
    Total: '$1.190.000',
  }, { importUid: 'vercel:presupuesto:11879', fileName: 'presupuestos.json', rowNumber: 4 })

  assert.equal(result.valid, true)
  assert.equal(result.data.document_kind, 'presupuesto')
  assert.equal(result.data.numero, null)
  assert.match(result.data.pre_numero, /^IMP-IMP-2026-11879-0004$/)
  assert.equal(result.data.data.numeroReservado, false)
})

test('lee export JSON con data_json y conserva referencias completas', () => {
  const result = normalizeQuoteImportRow({
    numero: '11879',
    serie_cotizacion: 'TH',
    fecha_emision: '2026-08-03',
    cliente_nombre: 'Cliente JSON',
    total: '119000',
    data_json: JSON.stringify({
      documentKind: 'cotizacion',
      moneda: 'CLP',
      referencias: [{ texto: 'Cambio kit sellos', items: [{ descripcion: 'Cambio kit sellos cilindro', cantidad: 1, precio: 100000 }] }],
    }),
  }, { importUid: 'json:11879', fileName: 'cotizaciones.json', rowNumber: 1 })

  assert.equal(result.valid, true)
  assert.equal(result.data.document_kind, 'cotizacion')
  assert.equal(result.data.numero, 11879)
  assert.equal(result.data.items[0].texto, 'Cambio kit sellos')
})
