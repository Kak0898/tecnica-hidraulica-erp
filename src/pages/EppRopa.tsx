import { useEffect, useMemo, useState } from 'react'
import { Download, HardHat, Pencil, Plus, Save, Trash2, UserRound, X } from 'lucide-react'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
import { useEmpresa } from '../lib/empresa'
import { supabase } from '../lib/supabase'

type EppItem = {
  id?: string
  code: string
  category: string
  name: string
  talla: string
  color: string
  stock: number
  min_stock: number
  location: string
  estado: string
  notes: string
}

type WorkerSize = {
  id?: string
  nombre: string
  talla_polera: string
  talla_pantalon: string
  talla_zapato: string
  talla_overol: string
  talla_geologo: string
  notes?: string
}

const emptyItem: EppItem = {
  code: '',
  category: '',
  name: '',
  talla: '',
  color: '',
  stock: 0,
  min_stock: 1,
  location: '',
  estado: 'disponible',
  notes: '',
}

const emptyWorker: WorkerSize = {
  nombre: '',
  talla_polera: '',
  talla_pantalon: '',
  talla_zapato: '',
  talla_overol: '',
  talla_geologo: '',
  notes: '',
}

function slug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function generatedCode(item: EppItem) {
  const identity = [item.category, item.name, item.talla, item.color]
    .map(slug)
    .filter((part, index, parts) => Boolean(part) && part !== parts[index - 1])
    .join('-')
  return identity ? `EPP-${identity}` : ''
}

function databaseMessage(error: { code?: string; message?: string } | null) {
  if (!error) return ''
  if (error.code === 'PGRST205' || /epp_items|epp_worker_sizes|schema cache/i.test(error.message || '')) {
    return 'Falta habilitar el módulo EPP en PostgreSQL. Ejecuta npm run db:init y vuelve a cargar esta sección.'
  }
  return error.message || 'No fue posible completar la operación.'
}

export function EppRopa() {
  const { activeEmpresaId } = useEmpresa()
  const [tab, setTab] = useState<'inventario' | 'tallas'>('inventario')
  const [items, setItems] = useState<EppItem[]>([])
  const [workers, setWorkers] = useState<WorkerSize[]>([])
  const [personNames, setPersonNames] = useState<string[]>([])
  const [itemForm, setItemForm] = useState<EppItem>(emptyItem)
  const [workerForm, setWorkerForm] = useState<WorkerSize>(emptyWorker)
  const [editingItemId, setEditingItemId] = useState('')
  const [editingWorkerId, setEditingWorkerId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    if (!activeEmpresaId) return
    setLoading(true)

    const [itemsResult, workersResult, personsResult] = await Promise.all([
      supabase.from('epp_items').select('*').eq('empresa_id', activeEmpresaId).order('category').order('talla'),
      supabase.from('epp_worker_sizes').select('*').eq('empresa_id', activeEmpresaId).order('nombre'),
      supabase.from('personas').select('nombre, apellidos').eq('empresa_id', activeEmpresaId).eq('activo', true).order('nombre'),
    ])

    if (itemsResult.error || workersResult.error) {
      setMessage(databaseMessage(itemsResult.error || workersResult.error))
    } else {
      setItems((itemsResult.data || []) as EppItem[])
      setWorkers((workersResult.data || []) as WorkerSize[])
    }

    setPersonNames((personsResult.data || []).map((person: { nombre?: string; apellidos?: string }) => [person.nombre, person.apellidos].filter(Boolean).join(' ')))
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [activeEmpresaId])

  const summary = useMemo(() => ({
    variants: items.length,
    stock: items.reduce((total, item) => total + Number(item.stock || 0), 0),
    categories: new Set(items.map((item) => item.category).filter(Boolean)).size,
    critical: items.filter((item) => Number(item.stock) <= Number(item.min_stock)).length,
  }), [items])

  function cancelItem() {
    setItemForm(emptyItem)
    setEditingItemId('')
  }

  function cancelWorker() {
    setWorkerForm(emptyWorker)
    setEditingWorkerId('')
  }

  async function saveItem() {
    if (!activeEmpresaId) return setMessage('Selecciona una empresa activa antes de guardar.')
    const code = itemForm.code.trim() || generatedCode(itemForm)
    if (!code || !itemForm.category.trim() || !itemForm.name.trim()) {
      return setMessage('Completa categoría y nombre. El código puede quedar vacío porque el sistema lo genera automáticamente.')
    }

    setSaving(true)
    const payload = {
      ...itemForm,
      code,
      stock: Math.max(0, Number(itemForm.stock || 0)),
      min_stock: Math.max(0, Number(itemForm.min_stock || 0)),
      empresa_id: activeEmpresaId,
    }
    delete payload.id

    const query = editingItemId
      ? supabase.from('epp_items').update(payload).eq('id', editingItemId)
      : supabase.from('epp_items').insert(payload)
    const { error } = await query
    setSaving(false)

    if (error) return setMessage(databaseMessage(error))
    setMessage(editingItemId ? 'Artículo EPP actualizado correctamente.' : 'Artículo EPP guardado correctamente.')
    cancelItem()
    await load()
  }

  async function saveWorker() {
    if (!activeEmpresaId) return setMessage('Selecciona una empresa activa antes de guardar.')
    if (!workerForm.nombre.trim()) return setMessage('Ingresa o selecciona el nombre del trabajador.')

    setSaving(true)
    const payload = { ...workerForm, nombre: workerForm.nombre.trim(), empresa_id: activeEmpresaId }
    delete payload.id
    const query = editingWorkerId
      ? supabase.from('epp_worker_sizes').update(payload).eq('id', editingWorkerId)
      : supabase.from('epp_worker_sizes').upsert(payload, { onConflict: 'empresa_id,nombre' })
    const { error } = await query
    setSaving(false)

    if (error) return setMessage(databaseMessage(error))
    setMessage(editingWorkerId ? 'Tallas del trabajador actualizadas correctamente.' : 'Tallas del trabajador guardadas correctamente.')
    cancelWorker()
    await load()
  }

  async function deleteItem(item: EppItem) {
    if (!item.id || !confirm(`¿Eliminar ${item.name} (${item.talla || 'sin talla'})?`)) return
    const { error } = await supabase.from('epp_items').delete().eq('id', item.id)
    if (error) return setMessage(databaseMessage(error))
    setMessage('Artículo EPP eliminado correctamente.')
    await load()
  }

  async function deleteWorker(worker: WorkerSize) {
    if (!worker.id || !confirm(`¿Eliminar las tallas registradas para ${worker.nombre}?`)) return
    const { error } = await supabase.from('epp_worker_sizes').delete().eq('id', worker.id)
    if (error) return setMessage(databaseMessage(error))
    setMessage('Ficha de tallas eliminada correctamente.')
    await load()
  }

  return (
    <div className="space-y-5">
      <FeedbackToast message={message} onClose={() => setMessage('')} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-3xl font-black text-slate-950">EPP y ropa</h2>
          <p className="mt-2 text-slate-600">Controla existencias por categoría, talla y color, junto con las tallas de cada trabajador.</p>
        </div>
        <a href="/formatos/formato-epp-ropa.xlsx" download className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white shadow-sm transition hover:bg-emerald-700">
          <Download size={18} /> Descargar formato EPP y ropa
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Variantes', summary.variants, 'bg-blue-50 text-blue-800'],
          ['Unidades disponibles', summary.stock, 'bg-emerald-50 text-emerald-800'],
          ['Categorías', summary.categories, 'bg-violet-50 text-violet-800'],
          ['Stock crítico', summary.critical, summary.critical ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-700'],
        ].map(([label, value, style]) => (
          <Card key={String(label)} className={String(style)}>
            <p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p>
            <p className="mt-2 text-3xl font-black">{value}</p>
          </Card>
        ))}
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button onClick={() => setTab('inventario')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold ${tab === 'inventario' ? 'bg-slate-950 text-white' : 'text-slate-600'}`}><HardHat size={17} /> Inventario EPP</button>
        <button onClick={() => setTab('tallas')} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold ${tab === 'tallas' ? 'bg-slate-950 text-white' : 'text-slate-600'}`}><UserRound size={17} /> Tallas trabajadores</button>
      </div>

      {tab === 'inventario' ? (
        <>
          <Card>
            <div className="mb-4 flex items-center gap-2"><Plus size={19} className="text-blue-600" /><h3 className="font-bold text-slate-950">{editingItemId ? 'Editar artículo' : 'Agregar artículo EPP o ropa'}</h3></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <input className="rounded border border-slate-300 p-3" placeholder="Código (opcional)" value={itemForm.code} disabled={!!editingItemId} onChange={(e) => setItemForm({ ...itemForm, code: e.target.value })} />
              <input className="rounded border border-slate-300 p-3" placeholder="Categoría *" value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} />
              <input className="rounded border border-slate-300 p-3" placeholder="Nombre *" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
              <input className="rounded border border-slate-300 p-3" placeholder="Talla" value={itemForm.talla} onChange={(e) => setItemForm({ ...itemForm, talla: e.target.value })} />
              <input className="rounded border border-slate-300 p-3" placeholder="Color" value={itemForm.color} onChange={(e) => setItemForm({ ...itemForm, color: e.target.value })} />
              <label className="text-xs font-bold text-slate-600">Cantidad<input type="number" min="0" className="mt-1 w-full rounded border border-slate-300 p-3 text-base font-normal text-slate-950" value={itemForm.stock} onChange={(e) => setItemForm({ ...itemForm, stock: Number(e.target.value) })} /></label>
              <label className="text-xs font-bold text-slate-600">Stock mínimo<input type="number" min="0" className="mt-1 w-full rounded border border-slate-300 p-3 text-base font-normal text-slate-950" value={itemForm.min_stock} onChange={(e) => setItemForm({ ...itemForm, min_stock: Number(e.target.value) })} /></label>
              <input className="rounded border border-slate-300 p-3 xl:self-end" placeholder="Ubicación" value={itemForm.location} onChange={(e) => setItemForm({ ...itemForm, location: e.target.value })} />
              <select className="rounded border border-slate-300 p-3 xl:self-end" value={itemForm.estado} onChange={(e) => setItemForm({ ...itemForm, estado: e.target.value })}>
                <option value="disponible">Disponible</option><option value="agotado">Agotado</option><option value="reservado">Reservado</option><option value="entregado">Entregado</option><option value="baja">Baja</option>
              </select>
              <input className="rounded border border-slate-300 p-3 xl:self-end" placeholder="Observaciones" value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button disabled={saving} onClick={saveItem} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white disabled:opacity-50"><Save size={17} /> {editingItemId ? 'Actualizar' : 'Guardar artículo'}</button>
              {editingItemId && <button onClick={cancelItem} className="inline-flex items-center gap-2 rounded-xl bg-slate-200 px-4 py-2.5 font-bold text-slate-700"><X size={17} /> Cancelar</button>}
            </div>
          </Card>

          <Card>
            <div className="overflow-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Código</th><th className="p-3">Categoría / artículo</th><th className="p-3">Talla</th><th className="p-3">Color</th><th className="p-3">Ubicación</th><th className="p-3">Stock</th><th className="p-3">Estado</th><th className="p-3">Acciones</th></tr></thead>
                <tbody>
                  {items.map((item) => {
                    const critical = Number(item.stock) <= Number(item.min_stock)
                    return <tr key={item.id || item.code} className={`border-b ${critical ? 'bg-red-50' : ''}`}>
                      <td className="p-3 font-mono text-xs">{item.code}</td>
                      <td className="p-3"><b>{item.category}</b><div className="text-slate-500">{item.name}</div></td>
                      <td className="p-3">{item.talla || '—'}</td><td className="p-3">{item.color || '—'}</td><td className="p-3">{item.location || '—'}</td>
                      <td className="p-3"><b className={critical ? 'text-red-700' : 'text-slate-950'}>{item.stock}</b><div className="text-xs text-slate-500">mín. {item.min_stock}</div></td>
                      <td className="p-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize">{item.estado}</span></td>
                      <td className="p-3"><div className="flex gap-2"><button title="Editar" onClick={() => { setItemForm(item); setEditingItemId(item.id || '') }} className="rounded-lg bg-amber-100 p-2 text-amber-800"><Pencil size={16} /></button><button title="Eliminar" onClick={() => deleteItem(item)} className="rounded-lg bg-red-100 p-2 text-red-700"><Trash2 size={16} /></button></div></td>
                    </tr>
                  })}
                  {!loading && !items.length && <tr><td colSpan={8} className="p-8 text-center text-slate-500">Aún no hay artículos EPP. Agrégalos manualmente o impórtalos desde Excel.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <div className="mb-4 flex items-center gap-2"><UserRound size={19} className="text-blue-600" /><h3 className="font-bold text-slate-950">{editingWorkerId ? 'Editar tallas' : 'Registrar tallas de trabajador'}</h3></div>
            <datalist id="personas-epp">{personNames.map((name) => <option key={name} value={name} />)}</datalist>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <input list="personas-epp" className="rounded border border-slate-300 p-3" placeholder="Trabajador *" value={workerForm.nombre} onChange={(e) => setWorkerForm({ ...workerForm, nombre: e.target.value })} />
              <input className="rounded border border-slate-300 p-3" placeholder="Talla polera" value={workerForm.talla_polera} onChange={(e) => setWorkerForm({ ...workerForm, talla_polera: e.target.value })} />
              <input className="rounded border border-slate-300 p-3" placeholder="Talla pantalón" value={workerForm.talla_pantalon} onChange={(e) => setWorkerForm({ ...workerForm, talla_pantalon: e.target.value })} />
              <input className="rounded border border-slate-300 p-3" placeholder="Talla zapato" value={workerForm.talla_zapato} onChange={(e) => setWorkerForm({ ...workerForm, talla_zapato: e.target.value })} />
              <input className="rounded border border-slate-300 p-3" placeholder="Talla overol" value={workerForm.talla_overol} onChange={(e) => setWorkerForm({ ...workerForm, talla_overol: e.target.value })} />
              <input className="rounded border border-slate-300 p-3" placeholder="Talla geólogo" value={workerForm.talla_geologo} onChange={(e) => setWorkerForm({ ...workerForm, talla_geologo: e.target.value })} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2"><button disabled={saving} onClick={saveWorker} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white disabled:opacity-50"><Save size={17} /> {editingWorkerId ? 'Actualizar' : 'Guardar tallas'}</button>{editingWorkerId && <button onClick={cancelWorker} className="inline-flex items-center gap-2 rounded-xl bg-slate-200 px-4 py-2.5 font-bold text-slate-700"><X size={17} /> Cancelar</button>}</div>
          </Card>

          <Card>
            <div className="overflow-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Trabajador</th><th className="p-3">Polera</th><th className="p-3">Pantalón</th><th className="p-3">Zapato</th><th className="p-3">Overol</th><th className="p-3">Geólogo</th><th className="p-3">Acciones</th></tr></thead><tbody>
              {workers.map((worker) => <tr key={worker.id || worker.nombre} className="border-b"><td className="p-3 font-bold">{worker.nombre}</td><td className="p-3">{worker.talla_polera || '—'}</td><td className="p-3">{worker.talla_pantalon || '—'}</td><td className="p-3">{worker.talla_zapato || '—'}</td><td className="p-3">{worker.talla_overol || '—'}</td><td className="p-3">{worker.talla_geologo || '—'}</td><td className="p-3"><div className="flex gap-2"><button title="Editar" onClick={() => { setWorkerForm(worker); setEditingWorkerId(worker.id || '') }} className="rounded-lg bg-amber-100 p-2 text-amber-800"><Pencil size={16} /></button><button title="Eliminar" onClick={() => deleteWorker(worker)} className="rounded-lg bg-red-100 p-2 text-red-700"><Trash2 size={16} /></button></div></td></tr>)}
              {!loading && !workers.length && <tr><td colSpan={7} className="p-8 text-center text-slate-500">Aún no hay tallas registradas. Puedes importarlas desde la segunda hoja del formato EPP.</td></tr>}
            </tbody></table></div>
          </Card>
        </>
      )}
    </div>
  )
}
