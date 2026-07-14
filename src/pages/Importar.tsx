import { useState } from 'react'
import { readExcelFile, normalizeMachineRow } from '../lib/excel'
import { supabase } from '../lib/supabase'
import { Card } from '../components/Card'

type ImportType = 'machines' | 'spare_parts'

function normalizeText(value: any) {
  return String(value ?? '').trim()
}

function normalizeNumber(value: any) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function normalizeSparePartRow(row: any) {
  return {
    code: normalizeText(row.code || row.codigo),
    name: normalizeText(row.name || row.nombre),
    brand: normalizeText(row.brand || row.marca),
    category: normalizeText(row.category || row.categoria),
    location: normalizeText(row.location || row.ubicacion),
    stock: normalizeNumber(row.stock),
    min_stock: normalizeNumber(row.min_stock || row.stock_minimo || row.minimo),
    unit_price: normalizeNumber(row.unit_price || row.precio_unitario || row.precio),
    unit: normalizeText(row.unit || row.unidad || 'unidad'),
    supplier: normalizeText(row.supplier || row.proveedor),
    notes: normalizeText(row.notes || row.notas || row.observaciones),
  }
}

export function Importar() {
  const [rows, setRows] = useState<any[]>([])
  const [type, setType] = useState<ImportType>('machines')
  const [loading, setLoading] = useState(false)

  async function onFile(file: File) {
    const sheetIndex = type === 'machines' ? 0 : 1

    const raw = await readExcelFile(file, sheetIndex)

    const mapped =
        type === 'machines'
        ? raw.map((r: any) => normalizeMachineRow(r))
        : raw.map((r: any) => normalizeSparePartRow(r))

    setRows(mapped)
    }

  async function importRows() {
    const valid = rows.filter((r) => r.code && r.name)

    if (!valid.length) {
      return alert('No hay filas válidas')
    }

    setLoading(true)

    const { error } = await supabase
      .from(type)
      .upsert(valid, { onConflict: 'empresa_id,code' })

    if (error) {
      setLoading(false)
      return alert(error.message)
    }

    await supabase.from('import_logs').insert({
      import_type: type,
      total_rows: rows.length,
      success_rows: valid.length,
      error_rows: rows.length - valid.length,
    })

    setLoading(false)
    alert('Importación lista')
  }

  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">Importar Excel</h2>

      <Card>
        <div className="flex gap-3 mb-4">
          <select
            className="border p-3 rounded"
            value={type}
            onChange={(e) => {
              setType(e.target.value as ImportType)
              setRows([])
            }}
          >
            <option value="machines">Maquinaria</option>
            <option value="spare_parts">Repuestos</option>
          </select>

          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFile(file)
            }}
          />

          <button
            onClick={importRows}
            disabled={loading}
            className="bg-green-600 text-white rounded px-4 disabled:opacity-50"
          >
            {loading ? 'Importando...' : 'Importar a Supabase'}
          </button>
        </div>

        <p className="mb-3 text-slate-500">
          Filas detectadas: {rows.length}
        </p>

        <pre className="bg-slate-950 text-green-300 p-4 rounded-xl overflow-auto max-h-96">
          {JSON.stringify(rows.slice(0, 10), null, 2)}
        </pre>
      </Card>
    </div>
  )
}
