import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CarFront, Gauge, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { Card } from '../components/Card'
import { useEmpresa } from '../lib/empresa'
import { supabase } from '../lib/supabase'

type SimpleOption = { id: string; nombre?: string; razon_social?: string }

type Vehiculo = {
  id: string
  empresa_id: string
  empresa_asociada_id?: string | null
  conductor_id?: string | null
  patente: string
  tipo: 'camioneta' | 'automovil' | 'camion' | 'furgon' | 'moto' | 'maquinaria' | 'otro'
  propiedad: 'propio' | 'leasing' | 'arrendado' | 'comodato'
  marca: string
  modelo: string
  anio?: number | null
  color?: string | null
  combustible?: string | null
  kilometraje: number
  estado: 'operativo' | 'mantenimiento' | 'fuera_servicio' | 'vendido'
  ubicacion?: string | null
  revision_tecnica_vencimiento?: string | null
  permiso_circulacion_vencimiento?: string | null
  seguro_vencimiento?: string | null
  mantencion_proxima_fecha?: string | null
  mantencion_proximo_km?: number | null
  notas?: string | null
  empresas_asociadas?: { id: string; razon_social: string } | null
  personas?: { id: string; nombre: string } | null
}

const emptyForm = {
  empresa_asociada_id: '', conductor_id: '', patente: '', tipo: 'camioneta' as Vehiculo['tipo'], propiedad: 'propio' as Vehiculo['propiedad'], marca: '', modelo: '', anio: '', color: '', combustible: 'diésel', kilometraje: '0', estado: 'operativo' as Vehiculo['estado'], ubicacion: '', revision_tecnica_vencimiento: '', permiso_circulacion_vencimiento: '', seguro_vencimiento: '', mantencion_proxima_fecha: '', mantencion_proximo_km: '', notas: '',
}

const typeLabels: Record<Vehiculo['tipo'], string> = { camioneta: 'Camioneta', automovil: 'Automóvil', camion: 'Camión', furgon: 'Furgón', moto: 'Motocicleta', maquinaria: 'Maquinaria vial', otro: 'Otro' }
const stateLabels: Record<Vehiculo['estado'], string> = { operativo: 'Operativo', mantenimiento: 'En mantenimiento', fuera_servicio: 'Fuera de servicio', vendido: 'Vendido / dado de baja' }
const propertyLabels: Record<Vehiculo['propiedad'], string> = { propio: 'Propio', leasing: 'Leasing', arrendado: 'Arrendado', comodato: 'Comodato' }

function nullable(value: string) { return value.trim() || null }
function moduleError(message: string) { return /vehiculos_empresa|schema cache|could not find/i.test(message) ? 'El módulo aún no está activado en la base de datos. Ejecuta el SQL 11_flota_empresas_asociadas.sql en Supabase.' : message }
function daysUntil(value?: string | null) { if (!value) return null; const target = new Date(`${value}T12:00:00`); return Math.ceil((target.getTime() - Date.now()) / 86400000) }
function isExpiring(value?: string | null) { const days = daysUntil(value); return days !== null && days <= 30 }
function formatDate(value?: string | null) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString('es-CL') : 'Sin fecha' }
function normalizePlate(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) }

function stateBadge(state: Vehiculo['estado']) {
  if (state === 'operativo') return 'bg-emerald-50 text-emerald-700'
  if (state === 'mantenimiento') return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
}

export function FlotaVehiculos() {
  const { activeEmpresaId } = useEmpresa()
  const [items, setItems] = useState<Vehiculo[]>([])
  const [companies, setCompanies] = useState<SimpleOption[]>([])
  const [people, setPeople] = useState<SimpleOption[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState('')
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('todos')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    if (!activeEmpresaId) return
    setLoading(true)
    setMessage('')
    const [vehiclesResult, companiesResult, peopleResult] = await Promise.all([
      supabase.from('vehiculos_empresa').select('*, empresas_asociadas(id, razon_social), personas(id, nombre)').eq('empresa_id', activeEmpresaId).order('patente'),
      supabase.from('empresas_asociadas').select('id, razon_social').eq('empresa_id', activeEmpresaId).eq('estado', 'activa').order('razon_social'),
      supabase.from('personas').select('id, nombre').eq('empresa_id', activeEmpresaId).eq('activo', true).order('nombre'),
    ])

    if (vehiclesResult.error) { setItems([]); setMessage(moduleError(vehiclesResult.error.message)) } else setItems((vehiclesResult.data || []) as unknown as Vehiculo[])
    if (!companiesResult.error) setCompanies((companiesResult.data || []) as SimpleOption[])
    if (!peopleResult.error) setPeople((peopleResult.data || []) as SimpleOption[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [activeEmpresaId])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((item) => (stateFilter === 'todos' || item.estado === stateFilter) && (!term || [item.patente, item.marca, item.modelo, item.tipo, item.ubicacion, item.personas?.nombre, item.empresas_asociadas?.razon_social].some((value) => String(value || '').toLowerCase().includes(term))))
  }, [items, search, stateFilter])

  const operational = items.filter((item) => item.estado === 'operativo').length
  const maintenance = items.filter((item) => item.estado === 'mantenimiento').length
  const documentAlerts = items.filter((item) => [item.revision_tecnica_vencimiento, item.permiso_circulacion_vencimiento, item.seguro_vencimiento].some(isExpiring)).length

  function resetForm() { setForm(emptyForm); setEditingId('') }
  function edit(item: Vehiculo) {
    setEditingId(item.id)
    setForm({ empresa_asociada_id: item.empresa_asociada_id || '', conductor_id: item.conductor_id || '', patente: item.patente || '', tipo: item.tipo, propiedad: item.propiedad, marca: item.marca || '', modelo: item.modelo || '', anio: item.anio ? String(item.anio) : '', color: item.color || '', combustible: item.combustible || '', kilometraje: String(item.kilometraje || 0), estado: item.estado, ubicacion: item.ubicacion || '', revision_tecnica_vencimiento: item.revision_tecnica_vencimiento || '', permiso_circulacion_vencimiento: item.permiso_circulacion_vencimiento || '', seguro_vencimiento: item.seguro_vencimiento || '', mantencion_proxima_fecha: item.mantencion_proxima_fecha || '', mantencion_proximo_km: item.mantencion_proximo_km ? String(item.mantencion_proximo_km) : '', notas: item.notas || '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function save() {
    if (!activeEmpresaId || !form.patente.trim() || !form.marca.trim() || !form.modelo.trim()) { setMessage('Completa patente, marca y modelo.'); return }
    setSaving(true); setMessage('')
    const payload = { empresa_id: activeEmpresaId, empresa_asociada_id: nullable(form.empresa_asociada_id), conductor_id: nullable(form.conductor_id), patente: normalizePlate(form.patente), tipo: form.tipo, propiedad: form.propiedad, marca: form.marca.trim(), modelo: form.modelo.trim(), anio: form.anio ? Number(form.anio) : null, color: nullable(form.color), combustible: nullable(form.combustible), kilometraje: Math.max(0, Number(form.kilometraje) || 0), estado: form.estado, ubicacion: nullable(form.ubicacion), revision_tecnica_vencimiento: nullable(form.revision_tecnica_vencimiento), permiso_circulacion_vencimiento: nullable(form.permiso_circulacion_vencimiento), seguro_vencimiento: nullable(form.seguro_vencimiento), mantencion_proxima_fecha: nullable(form.mantencion_proxima_fecha), mantencion_proximo_km: form.mantencion_proximo_km ? Math.max(0, Number(form.mantencion_proximo_km)) : null, notas: nullable(form.notas) }
    const query = editingId ? supabase.from('vehiculos_empresa').update(payload).eq('id', editingId).eq('empresa_id', activeEmpresaId) : supabase.from('vehiculos_empresa').insert(payload)
    const { error } = await query
    setSaving(false)
    if (error) { setMessage(moduleError(error.message)); return }
    setMessage(editingId ? 'Vehículo actualizado.' : 'Vehículo agregado a la flota.'); resetForm(); await load()
  }

  async function remove(item: Vehiculo) {
    if (!window.confirm(`¿Eliminar el vehículo ${item.patente}?`)) return
    const { error } = await supabase.from('vehiculos_empresa').delete().eq('id', item.id).eq('empresa_id', activeEmpresaId)
    if (error) { setMessage(moduleError(error.message)); return }
    if (editingId === item.id) resetForm()
    setMessage('Vehículo eliminado de la flota.'); await load()
  }

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><h2 className="text-3xl font-bold text-slate-950">Flota de Vehículos</h2><p className="mt-2 text-slate-600">Control de vehículos, conductores, asignaciones, kilometraje y vencimientos.</p></div><button onClick={load} disabled={loading || saving} className="inline-flex items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50"><RefreshCw size={18} /> Actualizar</button></div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><div className="text-sm font-semibold text-slate-500">Vehículos registrados</div><div className="mt-2 text-3xl font-black text-slate-950">{items.length}</div></Card>
        <Card><div className="text-sm font-semibold text-slate-500">Operativos</div><div className="mt-2 text-3xl font-black text-emerald-700">{operational}</div></Card>
        <Card><div className="text-sm font-semibold text-slate-500">En mantenimiento</div><div className="mt-2 text-3xl font-black text-amber-700">{maintenance}</div></Card>
        <Card><div className="text-sm font-semibold text-slate-500">Documentos por vencer</div><div className="mt-2 text-3xl font-black text-red-700">{documentAlerts}</div></Card>
      </div>

      {message && <div className="mb-4 rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">{message}</div>}

      <div className="grid gap-5 xl:grid-cols-[430px_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><CarFront size={20} className="text-blue-700" /><h3 className="text-lg font-bold text-slate-950">{editingId ? 'Editar Vehículo' : 'Agregar Vehículo'}</h3></div>{editingId && <button onClick={resetForm} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cancelar edición"><X size={18} /></button>}</div>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2"><input className="rounded border border-slate-300 px-3 py-3 uppercase" placeholder="Patente *" value={form.patente} onChange={(event) => setForm({ ...form, patente: normalizePlate(event.target.value) })} /><select className="rounded border border-slate-300 px-3 py-3" value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value as Vehiculo['tipo'] })}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="grid gap-3 sm:grid-cols-2"><input className="rounded border border-slate-300 px-3 py-3" placeholder="Marca *" value={form.marca} onChange={(event) => setForm({ ...form, marca: event.target.value })} /><input className="rounded border border-slate-300 px-3 py-3" placeholder="Modelo *" value={form.modelo} onChange={(event) => setForm({ ...form, modelo: event.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-2"><input type="number" min="1900" max="2200" className="rounded border border-slate-300 px-3 py-3" placeholder="Año" value={form.anio} onChange={(event) => setForm({ ...form, anio: event.target.value })} /><input className="rounded border border-slate-300 px-3 py-3" placeholder="Color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-2"><select className="rounded border border-slate-300 px-3 py-3" value={form.propiedad} onChange={(event) => setForm({ ...form, propiedad: event.target.value as Vehiculo['propiedad'] })}>{Object.entries(propertyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input className="rounded border border-slate-300 px-3 py-3" placeholder="Combustible" value={form.combustible} onChange={(event) => setForm({ ...form, combustible: event.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-2"><input type="number" min="0" className="rounded border border-slate-300 px-3 py-3" placeholder="Kilometraje" value={form.kilometraje} onChange={(event) => setForm({ ...form, kilometraje: event.target.value })} /><select className="rounded border border-slate-300 px-3 py-3" value={form.estado} onChange={(event) => setForm({ ...form, estado: event.target.value as Vehiculo['estado'] })}>{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <input className="rounded border border-slate-300 px-3 py-3" placeholder="Ubicación o base" value={form.ubicacion} onChange={(event) => setForm({ ...form, ubicacion: event.target.value })} />
            <select className="rounded border border-slate-300 px-3 py-3" value={form.conductor_id} onChange={(event) => setForm({ ...form, conductor_id: event.target.value })}><option value="">Sin conductor asignado</option>{people.map((person) => <option key={person.id} value={person.id}>{person.nombre}</option>)}</select>
            <select className="rounded border border-slate-300 px-3 py-3" value={form.empresa_asociada_id} onChange={(event) => setForm({ ...form, empresa_asociada_id: event.target.value })}><option value="">Sin empresa asociada / uso interno</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.razon_social}</option>)}</select>
            <div className="mt-2 text-sm font-bold text-slate-800">Vencimientos</div>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">Revisión técnica<input type="date" className="rounded border border-slate-300 px-3 py-3 text-sm" value={form.revision_tecnica_vencimiento} onChange={(event) => setForm({ ...form, revision_tecnica_vencimiento: event.target.value })} /></label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">Permiso de circulación<input type="date" className="rounded border border-slate-300 px-3 py-3 text-sm" value={form.permiso_circulacion_vencimiento} onChange={(event) => setForm({ ...form, permiso_circulacion_vencimiento: event.target.value })} /></label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">Seguro<input type="date" className="rounded border border-slate-300 px-3 py-3 text-sm" value={form.seguro_vencimiento} onChange={(event) => setForm({ ...form, seguro_vencimiento: event.target.value })} /></label>
            <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-semibold text-slate-600">Próxima mantención<input type="date" className="rounded border border-slate-300 px-3 py-3 text-sm" value={form.mantencion_proxima_fecha} onChange={(event) => setForm({ ...form, mantencion_proxima_fecha: event.target.value })} /></label><label className="grid gap-1 text-xs font-semibold text-slate-600">Próximo kilometraje<input type="number" min="0" className="rounded border border-slate-300 px-3 py-3 text-sm" value={form.mantencion_proximo_km} onChange={(event) => setForm({ ...form, mantencion_proximo_km: event.target.value })} /></label></div>
            <textarea className="min-h-20 rounded border border-slate-300 px-3 py-3" placeholder="Notas del vehículo" value={form.notas} onChange={(event) => setForm({ ...form, notas: event.target.value })} />
          </div>
          <button onClick={save} disabled={saving || !activeEmpresaId} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{editingId ? <Pencil size={18} /> : <Plus size={18} />} {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Agregar a la flota'}</button>
        </Card>

        <Card>
          <div className="mb-4 flex flex-col gap-3 md:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input className="w-full rounded border border-slate-300 py-3 pl-10 pr-3" placeholder="Buscar patente, marca, conductor o empresa" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select className="rounded border border-slate-300 px-3 py-3" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="todos">Todos los estados</option>{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          {loading ? <p className="py-10 text-center text-slate-500">Cargando flota...</p> : !filtered.length ? <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500"><CarFront className="mx-auto mb-3" size={32} /><p>No hay vehículos para mostrar.</p></div> : <div className="grid gap-3">{filtered.map((item) => {
            const alerts = [
              ['Revisión técnica', item.revision_tecnica_vencimiento], ['Permiso', item.permiso_circulacion_vencimiento], ['Seguro', item.seguro_vencimiento], ['Mantención', item.mantencion_proxima_fecha],
            ].filter(([, date]) => isExpiring(date))
            return <div key={item.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-slate-950 px-3 py-1.5 font-black tracking-wider text-white">{item.patente}</span><h4 className="font-bold text-slate-950">{item.marca} {item.modelo}</h4><span className={`rounded-full px-2 py-1 text-xs font-semibold ${stateBadge(item.estado)}`}>{stateLabels[item.estado]}</span></div><p className="mt-2 text-sm text-slate-500">{typeLabels[item.tipo]} · {item.anio || 'Año sin informar'} · {propertyLabels[item.propiedad]}</p><div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2"><span className="inline-flex items-center gap-2"><Gauge size={15} /> {Number(item.kilometraje || 0).toLocaleString('es-CL')} km</span><span>Conductor: {item.personas?.nombre || 'Sin asignar'}</span><span>Base: {item.ubicacion || 'Sin informar'}</span><span>Empresa relacionada: {item.empresas_asociadas?.razon_social || 'Uso interno TH'}</span></div></div><div className="flex shrink-0 gap-2"><button onClick={() => edit(item)} className="rounded-lg bg-slate-100 p-2 text-slate-700" aria-label={`Editar ${item.patente}`}><Pencil size={17} /></button><button onClick={() => remove(item)} className="rounded-lg bg-red-50 p-2 text-red-700" aria-label={`Eliminar ${item.patente}`}><Trash2 size={17} /></button></div></div>
              <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4"><div className={`rounded-lg p-2 ${isExpiring(item.revision_tecnica_vencimiento) ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}`}>Revisión: {formatDate(item.revision_tecnica_vencimiento)}</div><div className={`rounded-lg p-2 ${isExpiring(item.permiso_circulacion_vencimiento) ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}`}>Permiso: {formatDate(item.permiso_circulacion_vencimiento)}</div><div className={`rounded-lg p-2 ${isExpiring(item.seguro_vencimiento) ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}`}>Seguro: {formatDate(item.seguro_vencimiento)}</div><div className={`rounded-lg p-2 ${isExpiring(item.mantencion_proxima_fecha) ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600'}`}>Mantención: {formatDate(item.mantencion_proxima_fecha)}</div></div>
              {alerts.length > 0 && <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"><AlertTriangle size={15} /> Atención: {alerts.map(([name]) => name).join(', ')} vencido o dentro de 30 días.</div>}
            </div>
          })}</div>}
        </Card>
      </div>
    </div>
  )
}
