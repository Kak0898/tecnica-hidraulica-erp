import assert from 'node:assert/strict'
import test from 'node:test'
import { read, utils, write } from 'xlsx'
import { buildInventoryWorkbook } from '../shared/inventory-export.js'

test('exporta las tres hojas de inventario y conserva códigos, series y cantidades', () => {
  const workbook = buildInventoryWorkbook({
    machines: [{ code: '0007', name: 'Grúa horquilla', serial: '000031', purchase_value: '1500000', last_maintenance: '2026-11-25' }],
    spare_parts: [{ code: '0012', name: '=RUEDA', stock: 0, min_stock: 1, unit_cost: '17250.50' }],
    epp_items: [{ code: '0081', name: 'Botas', talla: '042', stock: 5, estado: 'disponible' }],
  }, 'Empresa de prueba')
  const xlsx = read(write(workbook, { bookType: 'xlsx', type: 'buffer' }))
  assert.deepEqual(xlsx.SheetNames, ['Maquinaria', 'Repuestos y ruedas', 'EPP y ropa'])
  assert.equal(xlsx.Props.Company, 'Empresa de prueba')
  const [machine] = utils.sheet_to_json(xlsx.Sheets.Maquinaria)
  const [part] = utils.sheet_to_json(xlsx.Sheets['Repuestos y ruedas'])
  const [epp] = utils.sheet_to_json(xlsx.Sheets['EPP y ropa'])

  assert.equal(machine['Código'], '0007')
  assert.equal(machine['N° de serie'], '000031')
  assert.equal(machine['Valor de compra'], 1500000)
  assert.equal(xlsx.Sheets.Maquinaria.V2.w, '25/11/2026')
  assert.equal(part['Stock actual'], 0)
  assert.equal(part['Costo unitario'], 17250.5)
  assert.equal(part['Precio unitario'], undefined)
  assert.equal(part.Nombre, '=RUEDA')
  assert.equal(xlsx.Sheets['Repuestos y ruedas'].B2.f, undefined)
  assert.equal(epp.Talla, '042')
  assert.equal(epp['Stock actual'], 5)
})

test('las categorías vacías mantienen su hoja y sus encabezados', () => {
  const workbook = buildInventoryWorkbook({ machines: [], spare_parts: [], epp_items: [] }, 'Empresa de prueba')
  for (const name of workbook.SheetNames) {
    const rows = utils.sheet_to_json(workbook.Sheets[name], { header: 1 })
    assert.equal(rows.length, 1)
    assert.equal(rows[0][0], 'Código')
  }
})
