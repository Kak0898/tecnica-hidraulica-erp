import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Minus,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  Shirt,
  Warehouse,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { FeedbackToast } from '../components/FeedbackToast'
import { useEmpresa } from '../lib/empresa'
import { supabase } from '../lib/supabase'

type InventoryKind = 'maquina' | 'repuesto' | 'epp'
type InventoryFilter = 'todos' | InventoryKind | 'critico'

type InventoryItem = {
  id: string
  kind: InventoryKind
  code: string
  name: string
  category: string
  brand: string
  model: string
  serial: string
  location: string
  stock: number | null
  minStock: number | null
  unit: string
  supplier: string
  talla: string
  color: string
  status: string
  notes: string
  updatedAt: string
}

type InventoryForm = {
  kind: InventoryKind
  code: string
  name: string
  category: string
  brand: string
  model: string
  serial: string
  location: string
  stock: number
  minStock: number
  unit: string
  supplier: string
  talla: string
  color: string
  status: string
  notes: string
}

const emptyForm: InventoryForm = {
  kind: 'repuesto',
  code: '',
  name: '',
  category: '',
  brand: '',
  model: '',
  serial: '',
  location: '',
  stock: 1,
  minStock: 1,
  unit: 'unidad',
  supplier: '',
  talla: '',
  color: '',
  status: 'disponible',
  notes: '',
}

const kindMeta = {
  maquina: { label: 'Máquina', shortLabel: 'Máquinas', icon: Boxes, color: 'bg-blue-50 text-blue-800 border-blue-200' },
  repuesto: { label: 'Repuesto / rueda', shortLabel: 'Repuestos', icon: Package, color: 'bg-amber-50 text-amber-800 border-amber-200' },
  epp: { label: 'EPP / ropa', shortLabel: 'EPP y ropa', icon: Shirt, color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
} as const

const categorySuggestions = {
  maquina: ['Apilador', 'Grúa horquilla', 'Transpaleta', 'Bomba', 'Cilindro hidráulico', 'Herramienta', 'Equipo de taller'],
  repuesto: ['Rueda', 'Neumático', 'Sello hidráulico', 'Manguera', 'Rodamiento', 'Filtro', 'Batería', 'Repuesto general'],
  epp: ['Polera', 'Pantalón', 'Overol', 'Zapato de seguridad', 'Casco', 'Guante', 'Chaleco geólogo', 'Chaqueta'],
} as const

function normalize(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function databaseMessage(error: { code?: string; message?: string } | null) {
  if (!error) return ''
  if (/tabla no autorizada|not authorized|forbidden|inventario/i.test(error.message || '')) {
    return 'Falta habilitar el permiso Inventario en la base de datos. Ejecuta npm run db:seed:inventario en el servidor.'
  }
  return error.message || 'No fue posible completar la operación.'
}

function machineToItem(row: Record<string, any>): InventoryItem {
  return {
    id: row.id,
    kind: 'maquina',
    code: row.code || '',
    name: row.name || '',
    category: row.category || row.tipo || '',
    brand: row.brand || '',
    model: row.model || '',
    serial: row.serial_number || row.serial || '',
    location: row.location || row.ubicacion_cliente || '',
    stock: null,
    minStock: null,
    unit: 'equipo',
    supplier: '',
    talla: '',
    color: row.color || '',
    status: row.status || 'activo',
    notes: row.notes || '',
    updatedAt: row.updated_at || row.created_at || '',
  }
}

function sparePartToItem(row: Record<string, any>): InventoryItem {
  return {
    id: row.id,
    kind: 'repuesto',
    code: row.code || '',
    name: row.name || '',
    category: row.category || '',
    brand: row.brand || '',
    model: '',
    serial: '',
    location: row.location || '',
    stock: numberValue(row.stock),
    minStock: numberValue(row.min_stock),
    unit: row.unit || 'unidad',
    supplier: row.supplier || '',
    talla: '',
    color: '',
    status: numberValue(row.stock) > 0 ? 'disponible' : 'agotado',
    notes: row.notes || '',
    updatedAt: row.updated_at || row.created_at || '',
  }
}

function eppToItem(row: Record<string, any>): InventoryItem {
  return {
    id: row.id,
    kind: 'epp',
    code: row.code || '',
    name: row.name || '',
    category: row.category || '',
    brand: '',
    model: '',
    serial: '',
    location: row.location || '',
    stock: numberValue(row.stock),
    minStock: numberValue(row.min_stock),
    unit: 'unidad',
    supplier: '',
    talla: row.talla || '',
    color: row.color || '',
    status: row.estado || 'disponible',
    notes: row.notes || '',
    updatedAt: row.updated_at || row.created_at || '',
  }
}

function itemToForm(item: InventoryItem): InventoryForm {
  return {
    kind: item.kind,
    code: item.code,
    name: item.name,
    category: item.category,
    brand: item.brand,
    model: item.model,
    serial: item.serial,
    location: item.location,
    stock: item.stock ?? 1,
    minStock: item.minStock ?? 1,
    unit: item.unit || 'unidad',
    supplier: item.supplier,
    talla: item.talla,
    color: item.color,
    status: item.status || (item.kind === 'maquina' ? 'activo' : 'disponible'),
    notes: item.notes,
  }
}

function isCritical(item: InventoryItem) {
  return item.stock !== null && item.minStock !== null && item.stock <= item.minStock
}

export function Inventario() {
  const { activeEmpresaId, activeEmpresa } = useEmpresa()
  const scannerRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [adjustingId, setAdjustingId] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<InventoryFilter>('todos')
  const [highlightedId, setHighlightedId] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState<InventoryForm>(emptyForm)

  async function load() {
    if (!activeEmpresaId) return
    setLoading(true)
    const [machinesResult, sparePartsResult, eppResult] = await Promise.all([
      supabase.from('machines').select('*').eq('empresa_id', activeEmpresaId).order('updated_at', { ascending: false }),
      supabase.from('spare_parts').select('*').eq('empresa_id', activeEmpresaId).order('updated_at', { ascending: false }),
      supabase.from('epp_items').select('*').eq('empresa_id', activeEmpresaId).order('updated_at', { ascending: false }),
    ])

    const error = machinesResult.error || sparePartsResult.error || eppResult.error
    if (error) setMessage(databaseMessage(error))

    setItems([
      ...((machinesResult.data || []) as Record<string, any>[]).map(machineToItem),
      ...((sparePartsResult.data || []) as Record<string, any>[]).map(sparePartToItem),
      ...((eppResult.data || []) as Record<string, any>[]).map(eppToItem),
    ].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))))
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [activeEmpresaId])

  useEffect(() => {
    if (!formOpen) scannerRef.current?.focus()
  }, [formOpen, loading])

  const summary = useMemo(() => ({
    references: items.length,
    machines: items.filter((item) => item.kind === 'maquina').length,
    units: items.reduce((total, item) => total + (item.stock ?? 1), 0),
    critical: items.filter(isCritical).length,
  }), [items])

  const visibleItems = useMemo(() => {
    const query = normalize(search)
    return items.filter((item) => {
      if (filter === 'critico' && !isCritical(item)) return false
      if (filter !== 'todos' && filter !== 'critico' && item.kind !== filter) return false
      if (!query) return true
      return normalize([
        item.code,
        item.name,
        item.category,
        item.brand,
        item.model,
        item.serial,
        item.location,
        item.talla,
        item.color,
      ].join(' ')).includes(query)
    })
  }, [filter, items, search])

  function closeForm() {
    setFormOpen(false)
    setEditingId('')
    setForm(emptyForm)
  }

  function openNew(kind: InventoryKind = 'repuesto', code = '') {
    setEditingId('')
    setForm({
      ...emptyForm,
      kind,
      code,
      status: kind === 'maquina' ? 'activo' : 'disponible',
    })
    setFormOpen(true)
  }

  function openEdit(item: InventoryItem) {
    setEditingId(item.id)
    setForm(itemToForm(item))
    setFormOpen(true)
  }

  function processScan() {
    const scannedCode = search.trim()
    if (!scannedCode) return
    const exact = items.find((item) => normalize(item.code) === normalize(scannedCode))
    if (exact) {
      setFilter('todos')
      setSearch(exact.code)
      setHighlightedId(exact.id)
      setMessage(`${exact.code}: ${exact.name}`)
      window.setTimeout(() => document.getElementById(`inventory-${exact.kind}-${exact.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      return
    }
    openNew('repuesto', scannedCode)
    setMessage(`Código nuevo: ${scannedCode}`)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!activeEmpresaId) return setMessage('Selecciona una empresa activa antes de guardar.')
    const code = form.code.trim()
    const name = form.name.trim()
    const category = form.category.trim()
    if (!code || !name || !category) return setMessage('Completa código, nombre y categoría.')

    const duplicate = items.find((item) => normalize(item.code) === normalize(code) && !(item.id === editingId && item.kind === form.kind))
    if (duplicate) return setMessage(`El código ${code} ya pertenece a ${duplicate.name}.`)

    setSaving(true)
    let result: { error: { message?: string; code?: string } | null }

    if (form.kind === 'maquina') {
      const payload = {
        empresa_id: activeEmpresaId,
        code,
        name,
        category,
        tipo: category,
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        serial: form.serial.trim() || null,
        serial_number: form.serial.trim() || null,
        location: form.location.trim() || null,
        status: form.status || 'activo',
        notes: form.notes.trim() || null,
      }
      result = editingId
        ? await supabase.from('machines').update(payload).eq('id', editingId).eq('empresa_id', activeEmpresaId)
        : await supabase.from('machines').insert(payload)
    } else if (form.kind === 'epp') {
      const stock = Math.max(0, numberValue(form.stock))
      const payload = {
        empresa_id: activeEmpresaId,
        code,
        name,
        category,
        talla: form.talla.trim() || null,
        color: form.color.trim() || null,
        stock,
        min_stock: Math.max(0, numberValue(form.minStock)),
        location: form.location.trim() || null,
        estado: stock === 0 && form.status === 'disponible' ? 'agotado' : form.status || 'disponible',
        notes: form.notes.trim() || null,
      }
      result = editingId
        ? await supabase.from('epp_items').update(payload).eq('id', editingId).eq('empresa_id', activeEmpresaId)
        : await supabase.from('epp_items').insert(payload)
    } else {
      const payload = {
        empresa_id: activeEmpresaId,
        code,
        name,
        category,
        brand: form.brand.trim() || null,
        stock: Math.max(0, numberValue(form.stock)),
        min_stock: Math.max(0, numberValue(form.minStock)),
        unit: form.unit.trim() || 'unidad',
        supplier: form.supplier.trim() || null,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
      }
      result = editingId
        ? await supabase.from('spare_parts').update(payload).eq('id', editingId).eq('empresa_id', activeEmpresaId)
        : await supabase.from('spare_parts').insert(payload)
    }

    setSaving(false)
    if (result.error) return setMessage(databaseMessage(result.error))
    setMessage(editingId ? 'Artículo actualizado correctamente.' : 'Artículo agregado al inventario.')
    closeForm()
    setSearch(code)
    await load()
  }

  async function adjustStock(item: InventoryItem, delta: number) {
    if (!activeEmpresaId || item.stock === null || item.kind === 'maquina') return
    const stock = Math.max(0, item.stock + delta)
    setAdjustingId(item.id)
    const table = item.kind === 'epp' ? 'epp_items' : 'spare_parts'
    const payload = item.kind === 'epp'
      ? { stock, estado: stock > 0 && item.status === 'agotado' ? 'disponible' : stock === 0 ? 'agotado' : item.status }
      : { stock }
    const { error } = await supabase.from(table).update(payload).eq('id', item.id).eq('empresa_id', activeEmpresaId)
    setAdjustingId('')
    if (error) return setMessage(databaseMessage(error))
    setItems((current) => current.map((currentItem) => currentItem.id === item.id && currentItem.kind === item.kind
      ? { ...currentItem, stock, status: item.kind === 'epp' ? String(payload.estado) : currentItem.status }
      : currentItem))
  }

  const filters: Array<{ key: InventoryFilter; label: string }> = [
    { key: 'todos', label: 'Todo' },
    { key: 'maquina', label: 'Máquinas' },
    { key: 'repuesto', label: 'Repuestos' },
    { key: 'epp', label: 'EPP / ropa' },
    { key: 'critico', label: 'Bajo stock' },
  ]

  const summaryCards: Array<{ label: string; value: number; icon: LucideIcon }> = [
    { label: 'Referencias', value: summary.references, icon: Warehouse },
    { label: 'Máquinas', value: summary.machines, icon: Boxes },
    { label: 'Unidades', value: summary.units, icon: Package },
    { label: 'Críticos', value: summary.critical, icon: AlertTriangle },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <FeedbackToast message={message} onClose={() => setMessage('')} />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase text-blue-700">{activeEmpresa?.nombre || 'Empresa activa'}</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">Inventario</h2>
        </div>
        <button type="button" onClick={() => openNew()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm">
          <Plus size={19} /> Agregar artículo
        </button>
      </header>

      <section className="sticky top-16 z-20 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-950/5 lg:static lg:p-4">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <ScanLine className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-600" size={21} />
            <input
              ref={scannerRef}
              autoFocus
              autoCapitalize="characters"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setHighlightedId('') }}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); processScan() } }}
              placeholder="Escanear o buscar código"
              aria-label="Escanear o buscar código"
              className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50 pl-11 pr-11 text-base font-bold text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
            {search && <button type="button" onClick={() => { setSearch(''); setHighlightedId(''); scannerRef.current?.focus() }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500" aria-label="Limpiar búsqueda"><X size={18} /></button>}
          </div>
          <button type="button" onClick={processScan} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white" aria-label="Buscar código"><Search size={20} /></button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {summaryCards.map(({ label, value, icon: Icon }) => (
          <section key={label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-black uppercase text-slate-500">{label}</p><Icon size={17} className={label === 'Críticos' && value ? 'text-red-600' : 'text-slate-400'} /></div>
            <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
          </section>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((item) => (
          <button key={item.key} type="button" onClick={() => setFilter(item.key)} className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-bold ${filter === item.key ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <section className="flex min-h-48 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-slate-500"><RefreshCw className="animate-spin" size={20} /> Cargando inventario...</section>
      ) : visibleItems.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
          <Package className="mx-auto text-slate-300" size={42} />
          <h3 className="mt-3 font-black text-slate-900">{items.length ? 'No hay coincidencias' : 'Inventario vacío'}</h3>
          <button type="button" onClick={() => openNew('repuesto', search.trim())} className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white"><Plus size={18} /> Agregar artículo</button>
        </section>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {visibleItems.map((item) => {
            const meta = kindMeta[item.kind]
            const Icon = meta.icon
            const critical = isCritical(item)
            const highlighted = highlightedId === item.id
            return (
              <article id={`inventory-${item.kind}-${item.id}`} key={`${item.kind}-${item.id}`} className={`rounded-2xl border bg-white p-4 shadow-sm transition ${highlighted ? 'border-blue-500 ring-4 ring-blue-100' : critical ? 'border-red-200' : 'border-slate-200'}`}>
                <div className="flex items-start gap-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${meta.color}`}><Icon size={21} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="truncate font-mono text-xs font-black text-blue-700">{item.code}</p><h3 className="mt-0.5 break-words text-base font-black text-slate-950">{item.name}</h3></div>
                      <button type="button" onClick={() => openEdit(item)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600" aria-label={`Editar ${item.name}`}><Pencil size={17} /></button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-700">{meta.label}</span>
                      {item.category && <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-700">{item.category}</span>}
                      {critical && <span className="rounded-lg bg-red-100 px-2 py-1 text-red-700">Bajo stock</span>}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-[10px] font-black uppercase text-slate-400">Ubicación</p><p className="mt-0.5 truncate font-bold text-slate-800">{item.location || 'Sin ubicación'}</p></div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-[10px] font-black uppercase text-slate-400">{item.kind === 'maquina' ? 'Estado' : 'Detalle'}</p><p className="mt-0.5 truncate font-bold capitalize text-slate-800">{item.kind === 'epp' ? [item.talla, item.color].filter(Boolean).join(' · ') || item.status : item.kind === 'maquina' ? item.status : item.brand || item.unit}</p></div>
                </div>

                {item.stock === null ? (
                  <div className="mt-3 flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 size={17} /> Activo individual</div>
                ) : (
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <div><p className="text-[10px] font-black uppercase text-slate-400">Stock</p><p className={`text-2xl font-black ${critical ? 'text-red-700' : 'text-slate-950'}`}>{item.stock} <span className="text-xs font-bold text-slate-400">{item.unit}</span></p></div>
                    <div className="flex items-center gap-2">
                      <button type="button" disabled={adjustingId === item.id || item.stock === 0} onClick={() => void adjustStock(item, -1)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-700 disabled:opacity-30" aria-label={`Descontar stock de ${item.name}`}><Minus size={18} /></button>
                      <button type="button" disabled={adjustingId === item.id} onClick={() => void adjustStock(item, 1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white disabled:opacity-40" aria-label={`Aumentar stock de ${item.name}`}><Plus size={18} /></button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/70 p-0 backdrop-blur-sm sm:p-6">
          <div className="min-h-full sm:flex sm:items-center sm:justify-center">
            <form onSubmit={save} className="min-h-screen bg-white sm:min-h-0 sm:w-full sm:max-w-3xl sm:rounded-2xl sm:shadow-2xl">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 sm:rounded-t-2xl sm:px-6">
                <div><p className="text-xs font-black uppercase text-blue-700">{editingId ? 'Editar registro' : 'Nuevo registro'}</p><h3 className="text-xl font-black text-slate-950">{kindMeta[form.kind].label}</h3></div>
                <button type="button" onClick={closeForm} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600" aria-label="Cerrar formulario"><X size={20} /></button>
              </div>

              <div className="space-y-5 p-4 sm:p-6">
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(kindMeta) as InventoryKind[]).map((kind) => {
                    const Icon = kindMeta[kind].icon
                    return <button key={kind} type="button" disabled={Boolean(editingId)} onClick={() => setForm({ ...emptyForm, code: form.code, kind, status: kind === 'maquina' ? 'activo' : 'disponible' })} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-center text-xs font-black disabled:opacity-60 ${form.kind === kind ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600'}`}><Icon size={20} />{kindMeta[kind].shortLabel}</button>
                  })}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-bold text-slate-700">Código *<input required autoCapitalize="characters" value={form.code} disabled={Boolean(editingId)} onChange={(event) => setForm({ ...form, code: event.target.value })} className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-normal disabled:bg-slate-100" /></label>
                  <label className="text-sm font-bold text-slate-700">Nombre *<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-normal" /></label>
                  <label className="text-sm font-bold text-slate-700">Categoría *<input required list={`inventory-categories-${form.kind}`} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-normal" /><datalist id={`inventory-categories-${form.kind}`}>{categorySuggestions[form.kind].map((category) => <option key={category} value={category} />)}</datalist></label>
                  <label className="text-sm font-bold text-slate-700">Ubicación<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-normal" /></label>

                  {form.kind !== 'epp' && <label className="text-sm font-bold text-slate-700">Marca<input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-normal" /></label>}
                  {form.kind === 'maquina' && <><label className="text-sm font-bold text-slate-700">Modelo<input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-normal" /></label><label className="text-sm font-bold text-slate-700">Número de serie<input value={form.serial} onChange={(event) => setForm({ ...form, serial: event.target.value })} className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-normal" /></label></>}
                  {form.kind === 'epp' && <><label className="text-sm font-bold text-slate-700">Talla<input value={form.talla} onChange={(event) => setForm({ ...form, talla: event.target.value })} className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-normal" /></label><label className="text-sm font-bold text-slate-700">Color<input value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-normal" /></label></>}
                  {form.kind !== 'maquina' && <><label className="text-sm font-bold text-slate-700">Cantidad<input type="number" min="0" inputMode="numeric" value={form.stock} onChange={(event) => setForm({ ...form, stock: numberValue(event.target.value) })} className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-normal" /></label><label className="text-sm font-bold text-slate-700">Stock mínimo<input type="number" min="0" inputMode="numeric" value={form.minStock} onChange={(event) => setForm({ ...form, minStock: numberValue(event.target.value) })} className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-normal" /></label></>}
                  {form.kind === 'repuesto' && <><label className="text-sm font-bold text-slate-700">Unidad<input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-normal" /></label><label className="text-sm font-bold text-slate-700">Proveedor<input value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-normal" /></label></>}
                  {form.kind !== 'repuesto' && <label className="text-sm font-bold text-slate-700">Estado<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="mt-1 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-normal">{form.kind === 'maquina' ? <><option value="activo">Activo</option><option value="mantencion">En mantención</option><option value="inactivo">Inactivo</option><option value="baja">Dado de baja</option></> : <><option value="disponible">Disponible</option><option value="reservado">Reservado</option><option value="entregado">Entregado</option><option value="agotado">Agotado</option><option value="baja">Baja</option></>}</select></label>}
                  <label className="text-sm font-bold text-slate-700 sm:col-span-2">Observaciones<textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-base font-normal" /></label>
                </div>
              </div>

              <div className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-white p-4 sm:rounded-b-2xl sm:px-6">
                <button type="button" onClick={closeForm} className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 font-bold text-slate-700">Cancelar</button>
                <button type="submit" disabled={saving} className="min-h-12 flex-[1.5] rounded-xl bg-blue-600 px-4 font-black text-white disabled:opacity-50">{saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Agregar al inventario'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
