import { useEffect, useMemo, useState } from 'react'
import { Building2, Handshake, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { Card } from '../components/Card'
import { useEmpresa } from '../lib/empresa'
import { supabase } from '../lib/supabase'

type EmpresaAsociada = {
  id: string
  empresa_id: string
  tipo: 'cliente' | 'proveedor' | 'contratista' | 'taller' | 'leasing' | 'partner' | 'otra'
  razon_social: string
  nombre_fantasia?: string | null
  rut?: string | null
  contacto_nombre?: string | null
  contacto_cargo?: string | null
  email?: string | null
  telefono?: string | null
  direccion?: string | null
  sitio_web?: string | null
  servicios?: string | null
  estado: 'activa' | 'inactiva'
  notas?: string | null
  created_at?: string
}

const emptyForm = {
  tipo: 'proveedor' as EmpresaAsociada['tipo'],
  razon_social: '',
  nombre_fantasia: '',
  rut: '',
  contacto_nombre: '',
  contacto_cargo: '',
  email: '',
  telefono: '',
  direccion: '',
  sitio_web: '',
  servicios: '',
  estado: 'activa' as EmpresaAsociada['estado'],
  notas: '',
}

const typeLabels: Record<EmpresaAsociada['tipo'], string> = {
  cliente: 'Cliente corporativo',
  proveedor: 'Proveedor',
  contratista: 'Contratista',
  taller: 'Taller externo',
  leasing: 'Leasing / arriendo',
  partner: 'Socio comercial',
  otra: 'Otra relación',
}

function nullable(value: string) {
  return value.trim() || null
}

function moduleError(message: string) {
  if (/empresas_asociadas|schema cache|could not find/i.test(message)) {
    return 'El módulo aún no está activado en la base de datos. Ejecuta el SQL 11_flota_empresas_asociadas.sql en Supabase.'
  }
  return message
}

function websiteUrl(value?: string | null) {
  if (!value) return ''
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

export function EmpresasAsociadas() {
  const { activeEmpresaId } = useEmpresa()
  const [items, setItems] = useState<EmpresaAsociada[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('todas')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    if (!activeEmpresaId) return
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('empresas_asociadas')
      .select('*')
      .eq('empresa_id', activeEmpresaId)
      .order('razon_social', { ascending: true })

    if (error) {
      setItems([])
      setMessage(moduleError(error.message))
    } else {
      setItems((data || []) as EmpresaAsociada[])
    }

    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [activeEmpresaId])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((item) => {
      const matchesType = typeFilter === 'todas' || item.tipo === typeFilter
      const matchesTerm = !term || [
        item.razon_social,
        item.nombre_fantasia,
        item.rut,
        item.contacto_nombre,
        item.email,
        item.telefono,
        item.servicios,
      ].some((value) => String(value || '').toLowerCase().includes(term))
      return matchesType && matchesTerm
    })
  }, [items, search, typeFilter])

  const activeCount = items.filter((item) => item.estado === 'activa').length
  const supplierCount = items.filter((item) => ['proveedor', 'taller', 'leasing'].includes(item.tipo)).length
  const commercialCount = items.filter((item) => ['cliente', 'partner', 'contratista'].includes(item.tipo)).length

  function resetForm() {
    setForm(emptyForm)
    setEditingId('')
  }

  function edit(item: EmpresaAsociada) {
    setEditingId(item.id)
    setForm({
      tipo: item.tipo,
      razon_social: item.razon_social || '',
      nombre_fantasia: item.nombre_fantasia || '',
      rut: item.rut || '',
      contacto_nombre: item.contacto_nombre || '',
      contacto_cargo: item.contacto_cargo || '',
      email: item.email || '',
      telefono: item.telefono || '',
      direccion: item.direccion || '',
      sitio_web: item.sitio_web || '',
      servicios: item.servicios || '',
      estado: item.estado,
      notas: item.notas || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function save() {
    if (!activeEmpresaId || !form.razon_social.trim()) {
      setMessage('Ingresa la razón social de la empresa asociada.')
      return
    }

    setSaving(true)
    setMessage('')
    const payload = {
      empresa_id: activeEmpresaId,
      tipo: form.tipo,
      razon_social: form.razon_social.trim(),
      nombre_fantasia: nullable(form.nombre_fantasia),
      rut: nullable(form.rut),
      contacto_nombre: nullable(form.contacto_nombre),
      contacto_cargo: nullable(form.contacto_cargo),
      email: nullable(form.email),
      telefono: nullable(form.telefono),
      direccion: nullable(form.direccion),
      sitio_web: nullable(form.sitio_web),
      servicios: nullable(form.servicios),
      estado: form.estado,
      notas: nullable(form.notas),
    }

    const query = editingId
      ? supabase.from('empresas_asociadas').update(payload).eq('id', editingId).eq('empresa_id', activeEmpresaId)
      : supabase.from('empresas_asociadas').insert(payload)
    const { error } = await query

    setSaving(false)
    if (error) {
      setMessage(moduleError(error.message))
      return
    }

    setMessage(editingId ? 'Empresa asociada actualizada.' : 'Empresa asociada guardada.')
    resetForm()
    await load()
  }

  async function remove(item: EmpresaAsociada) {
    if (!window.confirm(`¿Eliminar ${item.razon_social}?`)) return
    const { error } = await supabase
      .from('empresas_asociadas')
      .delete()
      .eq('id', item.id)
      .eq('empresa_id', activeEmpresaId)

    if (error) {
      setMessage(moduleError(error.message))
      return
    }
    if (editingId === item.id) resetForm()
    setMessage('Empresa asociada eliminada.')
    await load()
  }

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-950">Empresas Asociadas</h2>
          <p className="mt-2 text-slate-600">Directorio de proveedores, contratistas, talleres, clientes corporativos y socios de TH.</p>
        </div>
        <button onClick={load} disabled={loading || saving} className="inline-flex items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50">
          <RefreshCw size={18} /> Actualizar
        </button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card><div className="text-sm font-semibold text-slate-500">Relaciones activas</div><div className="mt-2 text-3xl font-black text-slate-950">{activeCount}</div></Card>
        <Card><div className="text-sm font-semibold text-slate-500">Proveedores y soporte</div><div className="mt-2 text-3xl font-black text-blue-700">{supplierCount}</div></Card>
        <Card><div className="text-sm font-semibold text-slate-500">Relaciones comerciales</div><div className="mt-2 text-3xl font-black text-emerald-700">{commercialCount}</div></Card>
      </div>

      {message && <div className="mb-4 rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">{message}</div>}

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Handshake size={20} className="text-blue-700" /><h3 className="text-lg font-bold text-slate-950">{editingId ? 'Editar Empresa' : 'Nueva Empresa Asociada'}</h3></div>
            {editingId && <button onClick={resetForm} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cancelar edición"><X size={18} /></button>}
          </div>

          <div className="grid gap-3">
            <select className="rounded border border-slate-300 px-3 py-3" value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value as EmpresaAsociada['tipo'] })}>
              {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input className="rounded border border-slate-300 px-3 py-3" placeholder="Razón social *" value={form.razon_social} onChange={(event) => setForm({ ...form, razon_social: event.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="Nombre de fantasía" value={form.nombre_fantasia} onChange={(event) => setForm({ ...form, nombre_fantasia: event.target.value })} />
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="RUT" value={form.rut} onChange={(event) => setForm({ ...form, rut: event.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="Persona de contacto" value={form.contacto_nombre} onChange={(event) => setForm({ ...form, contacto_nombre: event.target.value })} />
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="Cargo contacto" value={form.contacto_cargo} onChange={(event) => setForm({ ...form, contacto_cargo: event.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input type="email" className="rounded border border-slate-300 px-3 py-3" placeholder="Correo" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="Teléfono" value={form.telefono} onChange={(event) => setForm({ ...form, telefono: event.target.value })} />
            </div>
            <input className="rounded border border-slate-300 px-3 py-3" placeholder="Dirección" value={form.direccion} onChange={(event) => setForm({ ...form, direccion: event.target.value })} />
            <input className="rounded border border-slate-300 px-3 py-3" placeholder="Sitio web" value={form.sitio_web} onChange={(event) => setForm({ ...form, sitio_web: event.target.value })} />
            <textarea className="min-h-24 rounded border border-slate-300 px-3 py-3" placeholder="Servicios, productos o relación con TH" value={form.servicios} onChange={(event) => setForm({ ...form, servicios: event.target.value })} />
            <select className="rounded border border-slate-300 px-3 py-3" value={form.estado} onChange={(event) => setForm({ ...form, estado: event.target.value as EmpresaAsociada['estado'] })}>
              <option value="activa">Activa</option><option value="inactiva">Inactiva</option>
            </select>
            <textarea className="min-h-20 rounded border border-slate-300 px-3 py-3" placeholder="Notas internas" value={form.notas} onChange={(event) => setForm({ ...form, notas: event.target.value })} />
          </div>

          <button onClick={save} disabled={saving || !activeEmpresaId} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
            {editingId ? <Pencil size={18} /> : <Plus size={18} />} {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Agregar empresa'}
          </button>
        </Card>

        <Card>
          <div className="mb-4 flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input className="w-full rounded border border-slate-300 py-3 pl-10 pr-3" placeholder="Buscar por empresa, RUT, contacto o servicio" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
            <select className="rounded border border-slate-300 px-3 py-3" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="todas">Todas las relaciones</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          {loading ? <p className="py-10 text-center text-slate-500">Cargando empresas asociadas...</p> : !filtered.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500"><Building2 className="mx-auto mb-3" size={30} /><p>No hay empresas asociadas para mostrar.</p></div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h4 className="font-bold text-slate-950">{item.razon_social}</h4><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{typeLabels[item.tipo]}</span><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.estado === 'activa' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{item.estado}</span></div>
                      <p className="mt-1 text-sm text-slate-500">{[item.nombre_fantasia, item.rut].filter(Boolean).join(' · ') || 'Sin RUT registrado'}</p>
                      <div className="mt-3 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
                        <span>{item.contacto_nombre || 'Sin contacto'}{item.contacto_cargo ? ` · ${item.contacto_cargo}` : ''}</span><span>{item.telefono || 'Sin teléfono'}</span><span>{item.email || 'Sin correo'}</span>{item.sitio_web ? <a href={websiteUrl(item.sitio_web)} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{item.sitio_web}</a> : <span>Sin sitio web</span>}
                      </div>
                      {item.servicios && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{item.servicios}</p>}
                    </div>
                    <div className="flex shrink-0 gap-2"><button onClick={() => edit(item)} className="rounded-lg bg-slate-100 p-2 text-slate-700" aria-label={`Editar ${item.razon_social}`}><Pencil size={17} /></button><button onClick={() => remove(item)} className="rounded-lg bg-red-50 p-2 text-red-700" aria-label={`Eliminar ${item.razon_social}`}><Trash2 size={17} /></button></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
