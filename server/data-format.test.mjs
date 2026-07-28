import assert from 'node:assert/strict'
import test from 'node:test'
import { dateValue } from '../shared/dates.js'
import { calculateRutVerifier, cleanRut, formatRut, isValidRut, rutStatus } from '../shared/rut.js'
import { configurePostgresTypes, parsePostgresDate, POSTGRES_DATE_OID } from './postgres-types.mjs'

test('valida y formatea RUT chileno con dígito verificador', () => {
  assert.equal(cleanRut('21.060.982-2'), '210609822')
  assert.equal(calculateRutVerifier('21060982'), '2')
  assert.equal(formatRut('210609822'), '21.060.982-2')
  assert.equal(isValidRut('21.060.982-2'), true)
  assert.equal(isValidRut('21.060.982-3'), false)
  assert.equal(rutStatus('21.060.982-2'), 'valid')
  assert.equal(rutStatus('21.060.982-3'), 'invalid')
})

test('normaliza fechas PostgreSQL para formularios y evita fechas imposibles', () => {
  assert.equal(dateValue('2026-07-28'), '2026-07-28')
  assert.equal(dateValue('2026-07-28T00:00:00.000Z'), '2026-07-28')
  assert.equal(dateValue('2026-02-30T00:00:00.000Z'), '')
  assert.equal(dateValue('sin-fecha'), '')
})

test('configura DATE de PostgreSQL como texto YYYY-MM-DD', () => {
  let registeredOid = null
  let registeredParser = null
  configurePostgresTypes({
    setTypeParser(oid, parser) {
      registeredOid = oid
      registeredParser = parser
    },
  })
  assert.equal(registeredOid, POSTGRES_DATE_OID)
  assert.equal(registeredParser, parsePostgresDate)
  assert.equal(registeredParser('2026-07-28'), '2026-07-28')
})
