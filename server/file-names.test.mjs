import assert from 'node:assert/strict'
import test from 'node:test'
import { documentSlug, employeeDocumentFilename } from '../shared/file-names.js'

test('nombra documentos de empleados por RUT limpio y tipo documental', () => {
  assert.equal(documentSlug('Carnet de identidad - frontal'), 'carnet_de_identidad_frontal')
  assert.equal(employeeDocumentFilename({
    rut: '76.171.450-3',
    type: 'Carnet de identidad - reverso',
    issueDate: '2026-07-29',
    extension: '.PDF',
    uploadedAt: new Date('2026-07-29T15:45:30Z'),
  }), '761714503_carnet_de_identidad_reverso_20260729_154530.pdf')
})
