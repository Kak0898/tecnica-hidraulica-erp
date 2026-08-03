import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateCommission, commercialRules, quoteNetAmount, receiptFilename, validateCommercialRules } from './commissions.mjs'

test('calcula las tres reglas comerciales de vendedores', () => {
  const rules = commercialRules({ comercial: {
    comision_arriendo_mensual: 35000,
    comision_trabajo_hidraulico_pct: 6,
    comision_venta_apilador: 600000,
  } })
  assert.equal(calculateCommission({ tipo: 'arriendo', meses: 3, rules }).commission, 105000)
  assert.equal(calculateCommission({ tipo: 'trabajo_hidraulico', neto: 1_000_000, costo: 400_000, rules }).commission, 36000)
  assert.equal(calculateCommission({ tipo: 'venta_apilador', cantidad: 2, rules }).commission, 1_200_000)
})

test('respeta reglas distintas por vendedor y valida sus límites', () => {
  const rules = validateCommercialRules({
    comision_arriendo_mensual: 42000,
    comision_trabajo_hidraulico_pct: 8.5,
    comision_venta_apilador: 725000,
  })
  assert.equal(calculateCommission({ tipo: 'arriendo', meses: 2, rules }).commission, 84000)
  assert.equal(calculateCommission({ tipo: 'trabajo_hidraulico', neto: 1_000_000, costo: 200_000, rules }).commission, 68000)
  assert.equal(calculateCommission({ tipo: 'venta_apilador', cantidad: 2, rules }).commission, 1_450_000)
  assert.throws(() => validateCommercialRules({ ...rules, comision_trabajo_hidraulico_pct: 101 }), /entre 0% y 100%/)
})

test('recupera el neto desde ítems o desde el total cuando la columna neto quedó vacía', () => {
  assert.equal(quoteNetAmount({ data: { referencias: [{ items: [{ cantidad: 2, precio: 100000, dscto: 10 }] }] } }), 180000)
  assert.equal(Math.round(quoteNetAmount({ total: 119000 })), 100000)
})

test('genera el nombre seguro solicitado para el comprobante', () => {
  assert.equal(
    receiptFilename({ folio: 11877, transferDate: '2026-07-29', rut: '76.165.147-1', extension: '.PDF' }),
    'COT-11877_2026-07-29_RUT-76165147-1.pdf',
  )
})
