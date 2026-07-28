import assert from 'node:assert/strict'
import test from 'node:test'
import { canManageCredentials, validateCredentialChange } from './admin-users.mjs'

test('protege credenciales de propietarios y administradores', () => {
  assert.equal(canManageCredentials('owner', 'admin'), true)
  assert.equal(canManageCredentials('owner', 'operador'), true)
  assert.equal(canManageCredentials('admin', 'operador'), true)
  assert.equal(canManageCredentials('admin', 'admin'), false)
  assert.equal(canManageCredentials('owner', 'owner'), false)
  assert.equal(canManageCredentials('owner', 'operador', true), false)
})

test('valida cambio de correo o contraseña temporal', () => {
  assert.match(validateCredentialChange({ email: 'mal', password: '', currentEmail: 'antes@th.cl' }), /correo válido/)
  assert.match(validateCredentialChange({ email: 'nuevo@th.cl', password: '123', currentEmail: 'antes@th.cl' }), /8 caracteres/)
  assert.match(validateCredentialChange({ email: 'antes@th.cl', password: '', currentEmail: 'antes@th.cl' }), /Cambia el correo/)
  assert.equal(validateCredentialChange({ email: 'nuevo@th.cl', password: 'Temporal2026', currentEmail: 'antes@th.cl' }), '')
})
