import { useRef, useState } from 'react'
import { Download, FileSpreadsheet, LoaderCircle, UploadCloud, X } from 'lucide-react'
import { findExcelSheet, readExcelWorkbook, rowsFromExcelMatrix } from '../lib/excel'
import { supabase } from '../lib/supabase'
import { normalizeQuoteImportRow, quoteImportLabel } from '../../shared/quote-import.js'

type PreparedQuote = Record<string, any> & { source_row: number }

async function fileFingerprint(file: File) {
  const bytes = await file.arrayBuffer()
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('')
  }
  return `${file.name}-${file.size}-${file.lastModified}`.replace(/[^a-zA-Z0-9-]/g, '-')
}

export function ImportarCotizaciones({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<PreparedQuote[]>([])
  const [invalid, setInvalid] = useState<Array<{ row: number; errors: string[] }>>([])
  const [repeatedFolios, setRepeatedFolios] = useState(0)
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function prepare(file: File) {
    setReading(true)
    setMessage('')
    setFileName(file.name)
    try {
      const [sheets, fingerprint] = await Promise.all([readExcelWorkbook(file), fileFingerprint(file)])
      const sheet = findExcelSheet(sheets, ['cotizaciones', 'cotizacion'], 0)
      if (!sheet) throw new Error('El Excel no contiene ninguna hoja.')
      const sourceRows = rowsFromExcelMatrix(sheet.matrix)
      const prepared = sourceRows.map((source, index) => normalizeQuoteImportRow(source, {
        importUid: `${fingerprint}:${sheet.name}:${index + 2}`,
        fileName: file.name,
        rowNumber: index + 2,
      }))
      const validRows: PreparedQuote[] = prepared.filter((item) => item.valid).map((item) => ({ ...item.data, source_row: item.sourceRow }))
      const invalidRows = prepared.filter((item) => !item.valid).map((item) => ({ row: item.sourceRow, errors: item.errors }))
      const folioCounts = validRows.reduce<Map<string, number>>((counts, row) => {
        const key = String(row.numero)
        counts.set(key, (counts.get(key) || 0) + 1)
        return counts
      }, new Map())
      setRows(validRows)
      setInvalid(invalidRows)
      setRepeatedFolios([...folioCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0))
      setMessage(validRows.length
        ? `${validRows.length} cotización(es) listas. Los folios repetidos se conservarán como documentos distintos.`
        : 'No se encontraron filas válidas. Revisa número, fecha, cliente y monto.')
    } catch (error) {
      setRows([])
      setInvalid([])
      setRepeatedFolios(0)
      setMessage(error instanceof Error ? error.message : 'No se pudo leer el archivo seleccionado.')
    } finally {
      setReading(false)
    }
  }

  async function importRows() {
    if (!rows.length) return setMessage('Selecciona y revisa un archivo antes de importar.')
    setSaving(true)
    const { data, error } = await supabase.cotizaciones.importRows(rows, fileName)
    if (error) {
      setMessage(`No se pudo importar: ${error.message}`)
      setSaving(false)
      return
    }
    setMessage(`${Number(data?.processed || rows.length)} cotización(es) importadas correctamente. Ya están disponibles en el listado y en comisiones.`)
    setRows([])
    setFileName('')
    if (inputRef.current) inputRef.current.value = ''
    onImported()
    setSaving(false)
  }

  return <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-100 p-3 text-blue-700"><FileSpreadsheet size={22} /></div>
        <div>
          <h3 className="text-lg font-black text-slate-950">Importar cotizaciones históricas</h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">El número visible puede repetirse. El sistema distingue cada documento por serie, fecha e ID interno y evita reimportar la misma fila del mismo archivo.</p>
        </div>
      </div>
      <button type="button" onClick={onClose} className="self-end rounded-lg bg-slate-100 p-2 text-slate-600 lg:self-start" aria-label="Cerrar importación"><X size={18} /></button>
    </div>

    <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void prepare(file) }} className="min-w-0 rounded-xl border border-slate-300 bg-white p-2.5 text-sm" />
      <a href="/formatos/formato-importacion-cotizaciones.xlsx" download className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-800"><Download size={17} />Descargar formato</a>
      <button type="button" onClick={importRows} disabled={reading || saving || !rows.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{reading || saving ? <LoaderCircle size={17} className="animate-spin" /> : <UploadCloud size={17} />}{reading ? 'Revisando...' : saving ? 'Importando...' : 'Importar cotizaciones'}</button>
    </div>

    {(fileName || message) && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
      {fileName && <p><b>Archivo:</b> {fileName}</p>}
      {message && <p className="mt-1 font-semibold">{message}</p>}
    </div>}

    {fileName && <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs font-black uppercase text-emerald-700">Listas</p><p className="mt-1 text-2xl font-black text-emerald-900">{rows.length}</p></div>
      <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs font-black uppercase text-amber-700">Folios repetidos preservados</p><p className="mt-1 text-2xl font-black text-amber-900">{repeatedFolios}</p></div>
      <div className="rounded-xl bg-red-50 p-3"><p className="text-xs font-black uppercase text-red-700">Filas omitidas</p><p className="mt-1 text-2xl font-black text-red-900">{invalid.length}</p></div>
    </div>}

    {!!invalid.length && <p className="mt-3 text-xs font-semibold text-red-700">Primeras filas omitidas: {invalid.slice(0, 4).map((item) => `fila ${item.row} (${item.errors.join(', ')})`).join('; ')}.</p>}
    {!!rows.length && <div className="mt-4 overflow-auto rounded-xl border border-slate-200"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="p-3">Documento interno</th><th className="p-3">Cliente</th><th className="p-3">Moneda</th><th className="p-3 text-right">Neto</th><th className="p-3">Vendedor</th></tr></thead><tbody>{rows.slice(0, 8).map((row) => <tr key={row.importacion_uid} className="border-t"><td className="p-3 font-black">{quoteImportLabel(row)}</td><td className="p-3">{row.cliente_nombre}</td><td className="p-3">{row.data?.moneda || 'CLP'}</td><td className="p-3 text-right font-semibold">{Number(row.neto || 0).toLocaleString('es-CL')}</td><td className="p-3">{row.vendedor_nombre || row.vendedor_email || 'Sin asignar'}</td></tr>)}</tbody></table></div>}
  </div>
}
