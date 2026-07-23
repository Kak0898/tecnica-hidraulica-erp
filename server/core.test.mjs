import assert from 'node:assert/strict'
import test from 'node:test'
import { createFileToken, createSession, verifyFileToken } from './auth.mjs'
import { hasAnyModule } from './policies.mjs'
import { parseSelect, serializeColumnValue } from './query.mjs'

process.env.JWT_SECRET = 'secreto-de-prueba-con-mas-de-32-caracteres'

test('parseSelect separa campos y relaciones permitidas', () => {
  assert.deepEqual(parseSelect('id, nombre, clientes(id, razon_social)'), {
    fields: ['id', 'nombre'],
    relations: [{ name: 'clientes', select: 'id, razon_social' }],
  })
  assert.throws(() => parseSelect('id, (select pg_sleep(1))'), /Campo de selección inválido/)
})

test('los arreglos y objetos destinados a JSONB se serializan como JSON', () => {
  const columns = new Set(['items', 'data', 'nombre'])
  columns.jsonColumns = new Set(['items', 'data'])
  assert.equal(serializeColumnValue(columns, 'items', [{ cantidad: 1, precio: 100 }]), '[{"cantidad":1,"precio":100}]')
  assert.equal(serializeColumnValue(columns, 'data', { moneda: 'CLP' }), '{"moneda":"CLP"}')
  assert.equal(serializeColumnValue(columns, 'nombre', 'Cliente'), 'Cliente')
})

test('los administradores y módulos autorizados pasan el control de acceso', () => {
  assert.equal(hasAnyModule({ isAdmin: true, modules: new Set() }, ['personas_pagos']), true)
  assert.equal(hasAnyModule({ isAdmin: false, modules: new Set(['flota']) }, ['flota']), true)
  assert.equal(hasAnyModule({ isAdmin: false, modules: new Set(['flota']) }, ['personas_pagos']), false)
})

test('las sesiones y enlaces de archivo usan tokens de tipo distinto', () => {
  const session = createSession({ id: '11111111-1111-4111-8111-111111111111', email: 'qa@test.cl', raw_user_meta_data: {} })
  assert.equal(session.user.email, 'qa@test.cl')

  const token = createFileToken({ sub: session.user.id, bucket: 'rrhh-documentos', path: 'empresa/documento.pdf' }, 60)
  const decoded = verifyFileToken(token)
  assert.equal(decoded.bucket, 'rrhh-documentos')
  assert.equal(decoded.path, 'empresa/documento.pdf')
  assert.throws(() => verifyFileToken(session.access_token), /Firma de archivo inválida/)
})
