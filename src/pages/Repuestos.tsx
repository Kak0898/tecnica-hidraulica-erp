import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Card } from '../components/Card'

type SparePartRow = {
  id?: string
  code: string
  name: string
  brand?: string
  category?: string
  location?: string
  stock: number
  min_stock: number
  unit_price?: number
  unit?: string
  supplier?: string
  notes?: string
}

const emptyForm: SparePartRow = {
  code: '',
  name: '',
  brand: '',
  category: '',
  location: '',
  stock: 0,
  min_stock: 1,
  unit_price: 0,
  unit: 'unidad',
  supplier: '',
  notes: '',
}

export function Repuestos() {
  const [items, setItems] = useState<SparePartRow[]>([])
  const [form, setForm] = useState<SparePartRow>(emptyForm)
  const [editingCode, setEditingCode] = useState<string | null>(null)

  async function load() {
    const { data, error } = await supabase
      .from('spare_parts')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      alert(error.message)
      return
    }

    setItems(data || [])
  }

  useEffect(() => {
    load()
  }, [])

  async function save() {
    if (!form.code || !form.name) {
      return alert('Falta código y nombre')
    }

    const payload = {
      code: form.code,
      name: form.name,
      brand: form.brand || '',
      category: form.category || '',
      location: form.location || '',
      stock: Number(form.stock || 0),
      min_stock: Number(form.min_stock || 0),
      unit_price: Number(form.unit_price || 0),
      unit: form.unit || 'unidad',
      supplier: form.supplier || '',
      notes: form.notes || '',
    }

    const { error } = await supabase
      .from('spare_parts')
      .upsert(payload, { onConflict: 'empresa_id,code' })

    if (error) {
      alert(error.message)
      return
    }

    setForm(emptyForm)
    setEditingCode(null)
    load()

    alert(editingCode ? 'Repuesto actualizado correctamente' : 'Repuesto guardado correctamente')
  }

  function editarRepuesto(repuesto: SparePartRow) {
    setForm({
      id: repuesto.id,
      code: repuesto.code || '',
      name: repuesto.name || '',
      brand: repuesto.brand || '',
      category: repuesto.category || '',
      location: repuesto.location || '',
      stock: Number(repuesto.stock || 0),
      min_stock: Number(repuesto.min_stock || 0),
      unit_price: Number(repuesto.unit_price || 0),
      unit: repuesto.unit || 'unidad',
      supplier: repuesto.supplier || '',
      notes: repuesto.notes || '',
    })

    setEditingCode(repuesto.code)
  }

  function cancelarEdicion() {
    setForm(emptyForm)
    setEditingCode(null)
  }

  async function eliminarRepuesto(repuesto: SparePartRow) {
    const confirmar = confirm(`¿Seguro que quieres eliminar el repuesto ${repuesto.code}?`)

    if (!confirmar) return

    let query = supabase
      .from('spare_parts')
      .delete()

    query = repuesto.id ? query.eq('id', repuesto.id) : query.eq('code', repuesto.code)

    const { error } = await query

    if (error) {
      alert(error.message)
      return
    }

    setItems(items.filter((item) => repuesto.id ? item.id !== repuesto.id : item.code !== repuesto.code))
    alert('Repuesto eliminado correctamente')
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-3xl font-bold">Repuestos</h2>
        <a href="/formatos/formato-inventario-repuestos.xlsx" download className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-100">
          <Download size={17} /> Descargar formato inventario repuestos
        </a>
      </div>

      <Card>
        <div className="grid md:grid-cols-4 gap-3 mb-4">
          <input
            className="border p-3 rounded"
            placeholder="Código"
            value={form.code}
            disabled={!!editingCode}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />

          <input
            className="border p-3 rounded"
            placeholder="Nombre"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <input
            className="border p-3 rounded"
            placeholder="Marca"
            value={form.brand || ''}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
          />

          <input
            className="border p-3 rounded"
            placeholder="Categoría"
            value={form.category || ''}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />

          <input
            className="border p-3 rounded"
            placeholder="Ubicación"
            value={form.location || ''}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />

          <input
            className="border p-3 rounded"
            type="number"
            placeholder="Stock"
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
          />

          <input
            className="border p-3 rounded"
            type="number"
            placeholder="Stock mínimo"
            value={form.min_stock}
            onChange={(e) => setForm({ ...form, min_stock: Number(e.target.value) })}
          />

          <input
            className="border p-3 rounded"
            type="number"
            placeholder="Precio unitario"
            value={form.unit_price || 0}
            onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })}
          />

          <input
            className="border p-3 rounded"
            placeholder="Unidad"
            value={form.unit || ''}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          />

          <input
            className="border p-3 rounded"
            placeholder="Proveedor"
            value={form.supplier || ''}
            onChange={(e) => setForm({ ...form, supplier: e.target.value })}
          />

          <input
            className="border p-3 rounded"
            placeholder="Observaciones"
            value={form.notes || ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />

          <button
            onClick={save}
            className="bg-blue-600 text-white rounded px-4 py-3"
          >
            {editingCode ? 'Actualizar' : 'Guardar'}
          </button>

          {editingCode && (
            <button
              onClick={cancelarEdicion}
              className="bg-slate-700 text-white rounded px-4 py-3"
            >
              Cancelar
            </button>
          )}
        </div>

        <div className="overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b">
                <th className="py-2">Código</th>
                <th className="py-2">Nombre</th>
                <th className="py-2">Categoría</th>
                <th className="py-2">Stock</th>
                <th className="py-2">Mínimo</th>
                <th className="py-2">Proveedor</th>
                <th className="py-2">Alerta</th>
                <th className="py-2">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {items.map((r) => (
                <tr
                  className={`border-b ${Number(r.stock) <= Number(r.min_stock) ? 'bg-red-50' : ''}`}
                  key={r.id || r.code}
                >
                  <td className="py-2">{r.code}</td>
                  <td className="py-2">{r.name}</td>
                  <td className="py-2">{r.category || '-'}</td>
                  <td className="py-2 font-bold">{r.stock}</td>
                  <td className="py-2">{r.min_stock}</td>
                  <td className="py-2">{r.supplier || '-'}</td>
                  <td className="py-2">
                    {Number(r.stock) <= Number(r.min_stock) ? (
                      <span className="text-red-600 font-bold">Bajo stock</span>
                    ) : (
                      'OK'
                    )}
                  </td>
                  <td className="py-2 flex gap-2">
                    <button
                      onClick={() => editarRepuesto(r)}
                      className="bg-yellow-500 text-white px-3 py-1 rounded"
                    >
                      Editar
                    </button>

                    <button
                      onClick={() => eliminarRepuesto(r)}
                      className="bg-red-600 text-white px-3 py-1 rounded"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
