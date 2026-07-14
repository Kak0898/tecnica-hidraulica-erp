import { useState } from 'react'
import { readExcelFile, normalizeMachineRow, normalizeSparePartRow } from '../lib/excel'
import { supabase } from '../lib/supabase'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
import { useEmpresa } from '../lib/empresa'

type ImportType = 'machines' | 'spare_parts'
type ImportRow = Record<string, unknown> & { code?: string; name?: string }

type ImportSummary = {
  total: number
  ready: number
  duplicates: number
  invalid: number
  duplicateCodes: string[]
}

const emptySummary: ImportSummary = {
  total: 0,
  ready: 0,
  duplicates: 0,
  invalid: 0,
  duplicateCodes: [],
}

function normalizeText(value: any) {
  return String(value ?? '').trim()
}

function hasImportValue(value: unknown) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  return true
}

function mergeDuplicateRows(current: ImportRow, incoming: ImportRow) {
  const merged = { ...current }

  Object.entries(incoming).forEach(([key, value]) => {
    if (hasImportValue(value)) merged[key] = value
  })

  return merged
}

function prepareImportRows(sourceRows: ImportRow[]) {
  const uniqueRows = new Map<string, ImportRow>()
  const duplicateCodes = new Set<string>()
  let invalid = 0
  let duplicates = 0

  sourceRows.forEach((row) => {
    const code = normalizeText(row.code)
    const name = normalizeText(row.name)

    if (!code || !name || code === 'MAQ-' || code === 'SERIE-') {
      invalid += 1
      return
    }

    const key = code.toLocaleUpperCase('es-CL')
    const prepared = { ...row, code, name }
    const existing = uniqueRows.get(key)

    if (existing) {
      duplicates += 1
      duplicateCodes.add(code)
      uniqueRows.set(key, mergeDuplicateRows(existing, prepared))
      return
    }

    uniqueRows.set(key, prepared)
  })

  return {
    rows: Array.from(uniqueRows.values()),
    summary: {
      total: sourceRows.length,
      ready: uniqueRows.size,
      duplicates,
      invalid,
      duplicateCodes: Array.from(duplicateCodes).slice(0, 8),
    } satisfies ImportSummary,
  }
}

export function Importar() {
  const { activeEmpresaId } = useEmpresa()
  const [rows, setRows] = useState<ImportRow[]>([])
  const [summary, setSummary] = useState<ImportSummary>(emptySummary)
  const [fileName, setFileName] = useState('')
  const [type, setType] = useState<ImportType>('machines')
  const [loading, setLoading] = useState(false)
  const [reading, setReading] = useState(false)
  const [message, setMessage] = useState('')

  async function onFile(file: File) {
    setReading(true)
    setMessage('')
    setFileName(file.name)

    try {
      const sheetIndex = type === 'machines' ? 0 : 1
      const raw = await readExcelFile(file, sheetIndex)

      const mapped =
        type === 'machines'
          ? raw.map((row: any) => normalizeMachineRow(row))
          : raw.map((row: any) => normalizeSparePartRow(row))

      const prepared = prepareImportRows(mapped)
      setRows(prepared.rows)
      setSummary(prepared.summary)

      if (!prepared.rows.length) {
        setMessage('El archivo no contiene filas válidas con código y nombre.')
      } else if (prepared.summary.duplicates || prepared.summary.invalid) {
        setMessage(`Archivo revisado: ${prepared.summary.ready} filas listas, ${prepared.summary.duplicates} duplicadas consolidadas y ${prepared.summary.invalid} omitidas por falta de datos.`)
      } else {
        setMessage(`${prepared.summary.ready} filas listas para importar.`)
      }
    } catch (error) {
      setRows([])
      setSummary(emptySummary)
      setMessage(error instanceof Error ? error.message : 'No se pudo leer el archivo seleccionado.')
    } finally {
      setReading(false)
    }
  }

  async function importRows() {
    if (!activeEmpresaId) {
      setMessage('Selecciona una empresa activa antes de importar datos.')
      return
    }

    if (!rows.length) {
      setMessage('Selecciona y revisa un archivo Excel antes de importar.')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const payload = rows.map((row) => ({ ...row, empresa_id: activeEmpresaId }))
      const { error } = await supabase
        .from(type)
        .upsert(payload, { onConflict: 'empresa_id,code' })

      if (error) {
        if (error.code === '21000' || /ON CONFLICT DO UPDATE/i.test(error.message)) {
          setMessage('El archivo contiene códigos repetidos. Vuelve a seleccionarlo para que el sistema los consolide antes de importar.')
        } else {
          setMessage(`No se pudo completar la importación: ${error.message}`)
        }
        return
      }

      await supabase.from('import_logs').insert({
        empresa_id: activeEmpresaId,
        import_type: type,
        total_rows: summary.total,
        success_rows: rows.length,
        error_rows: summary.invalid,
        metadata: {
          archivo: fileName,
          filas_duplicadas_consolidadas: summary.duplicates,
          codigos_duplicados: summary.duplicateCodes,
        },
      })

      setMessage(`Importación completada: ${rows.length} ${type === 'machines' ? 'máquinas' : 'repuestos'} procesados correctamente.`)
    } catch (error) {
      setMessage(error instanceof Error ? `No se pudo completar la importación: ${error.message}` : 'No se pudo completar la importación.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-slate-950">Importar Excel</h2>
        <p className="mt-2 text-slate-600">El sistema revisa filas incompletas y consolida códigos duplicados antes de guardar.</p>
      </div>

      <FeedbackToast message={message} onClose={() => setMessage('')} />

      <Card>
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
          <select
            className="rounded border border-slate-300 p-3"
            value={type}
            onChange={(e) => {
              setType(e.target.value as ImportType)
              setRows([])
              setSummary(emptySummary)
              setFileName('')
              setMessage('')
            }}
          >
            <option value="machines">Maquinaria</option>
            <option value="spare_parts">Repuestos</option>
          </select>

          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white p-2.5"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFile(file)
              e.currentTarget.value = ''
            }}
          />

          <button
            onClick={importRows}
            disabled={loading || reading}
            className="rounded bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            {reading ? 'Revisando archivo...' : loading ? 'Importando...' : `Importar ${type === 'machines' ? 'maquinaria' : 'repuestos'}`}
          </button>
        </div>

        {fileName && <p className="mb-4 text-sm text-slate-500">Archivo: <b className="text-slate-700">{fileName}</b></p>}

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Filas detectadas</div><div className="mt-2 text-2xl font-black text-slate-950">{summary.total}</div></div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-emerald-700">Listas para importar</div><div className="mt-2 text-2xl font-black text-emerald-800">{summary.ready}</div></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-amber-700">Duplicadas consolidadas</div><div className="mt-2 text-2xl font-black text-amber-800">{summary.duplicates}</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Filas omitidas</div><div className="mt-2 text-2xl font-black text-slate-700">{summary.invalid}</div></div>
        </div>

        {!!summary.duplicateCodes.length && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <b>Códigos repetidos detectados:</b> {summary.duplicateCodes.join(', ')}{summary.duplicates > summary.duplicateCodes.length ? '…' : ''}. Se conservará {type === 'machines' ? 'una sola máquina' : 'un solo repuesto'} por código, combinando los datos informados.
          </div>
        )}

        <pre className="bg-slate-950 text-green-300 p-4 rounded-xl overflow-auto max-h-96">
          {rows.length ? JSON.stringify(rows.slice(0, 10), null, 2) : 'Selecciona un archivo para revisar las primeras filas válidas.'}
        </pre>
      </Card>
    </div>
  )
}
