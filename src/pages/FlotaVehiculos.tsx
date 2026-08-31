import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CarFront, ExternalLink, FileText, Gauge, Image, Paperclip, Pencil, Plus, RefreshCw, Save, Search, Trash2, UploadCloud, X } from 'lucide-react'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
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

type VehiculoArchivo = {
  id: string
  empresa_id: string
  vehiculo_id: string
  tipo: 'padron' | 'revision_tecnica' | 'permiso_circulacion' | 'soap' | 'seguro' | 'mantencion' | 'foto' | 'otro'
  nombre: string
  fecha_emision?: string | null
  fecha_vencimiento?: string | null
  descripcion?: string | null
  archivo_path: string
  archivo_nombre: string
  archivo_tipo?: string | null
  archivo_tamano?: number | null
  created_at: string
}

const emptyForm = {
  empresa_asociada_id: '', conductor_id: '', patente: '', tipo: 'camioneta' as Vehiculo['tipo'], propiedad: 'propio' as Vehiculo['propiedad'], marca: '', modelo: '', anio: '', color: '', combustible: 'diésel', kilometraje: '0', estado: 'operativo' as Vehiculo['estado'], ubicacion: '', revision_tecnica_vencimiento: '', permiso_circulacion_vencimiento: '', seguro_vencimiento: '', mantencion_proxima_fecha: '', mantencion_proximo_km: '', notas: '',
}

const emptyFileForm = { vehiculo_id: '', tipo: 'padron' as VehiculoArchivo['tipo'], nombre: '', fecha_emision: new Date().toISOString().slice(0, 10), fecha_vencimiento: '', descripcion: '' }
const vehicleFileBucket = 'vehiculos-archivos'
const typeLabels: Record<Vehiculo['tipo'], string> = { camioneta: 'Camioneta', automovil: 'Automóvil', camion: 'Camión', furgon: 'Furgón', moto: 'Motocicleta', maquinaria: 'Maquinaria vial', otro: 'Otro' }
const stateLabels: Record<Vehiculo['estado'], string> = { operativo: 'Operativo', mantenimiento: 'En mantenimiento', fuera_servicio: 'Fuera de servicio', vendido: 'Vendido / dado de baja' }
const propertyLabels: Record<Vehiculo['propiedad'], string> = { propio: 'Propio', leasing: 'Leasing', arrendado: 'Arrendado', comodato: 'Comodato' }
const fileTypeLabels: Record<VehiculoArchivo['tipo'], string> = { padron: 'Padrón', revision_tecnica: 'Revisión técnica', permiso_circulacion: 'Permiso circulación', soap: 'SOAP', seguro: 'Seguro', mantencion: 'Mantención', foto: 'Foto', otro: 'Otro' }

function nullable(value: string) { return value.trim() || null }
function moduleError(message: string) { return /vehiculos_empresa|vehiculo_archivos|schema cache|could not find|does not exist/i.test(message) ? 'El módulo de flota aún no está completo en PostgreSQL. Ejecuta npm run db:seed:vehiculo-archivos.' : message }
function daysUntil(value?: string | null) { if (!value) return null; const target = new Date(`${value}T12:00:00`); return Math.ceil((target.getTime() - Date.now()) / 86400000) }
function isExpiring(value?: string | null) { const days = daysUntil(value); return days !== null && days <= 30 }
function formatDate(value?: string | null) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString('es-CL') : 'Sin fecha' }
function normalizePlate(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) }
function slugify(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'archivo' }
function extensionFrom(name: string) { return (name.includes('.') ? name.split('.').pop() || '' : '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf' }
function formatBytes(value?: number | null) { const bytes = Number(value || 0); if (!bytes) return 'Sin tamaño'; return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB` }

function stateBadge(state: Vehiculo['estado']) {
  if (state === 'operativo') return 'bg-emerald-50 text-emerald-700'
  if (state === 'mantenimiento') return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
}

export function FlotaVehiculos() {
  const { activeEmpresaId } = useEmpresa()
  const [items, setItems] = useState<Vehiculo[]>([])
  const [files, setFiles] = useState<VehiculoArchivo[]>([])
  const [companies, setCompanies] = useState<SimpleOption[]>([])
  const [people, setPeople] = useState<SimpleOption[]>([])
  const [form, setForm] = useState(emptyForm)
  const [fileForm, setFileForm] = useState(emptyFileForm)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
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
    const [vehiclesResult, filesResult, companiesResult, peopleResult] = await Promise.all([
      supabase.from('vehiculos_empresa').select('*, empresas_asociadas(id, razon_social), personas(id, nombre)').eq('empresa_id', activeEmpresaId).order('patente'),
      supabase.from('vehiculo_archivos').select('*').eq('empresa_id', activeEmpresaId).order('created_at', { ascending: false }),
      supabase.from('empresas_asociadas').select('id, razon_social').eq('empresa_id', activeEmpresaId).eq('estado', 'activa').order('razon_social'),
      supabase.from('personas').select('id, nombre').eq('empresa_id', activeEmpresaId).eq('activo', true).order('nombre'),
    ])

    if (vehiclesResult.error) { setItems([]); setMessage(moduleError(vehiclesResult.error.message)) } else setItems((vehiclesResult.data || []) as unknown as Vehiculo[])
    if (filesResult.error) { setFiles([]); setMessage(moduleError(filesResult.error.message)) } else setFiles((filesResult.data || []) as VehiculoArchivo[])
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
  const filesByVehicle = useMemo(() => files.reduce<Record<string, VehiculoArchivo[]>>((acc, item) => {
    acc[item.vehiculo_id] = [...(acc[item.vehiculo_id] || []), item]
    return acc
  }, {}), [files])

  function resetForm() { setForm(emptyForm); setEditingId('') }
  function edit(item: Vehiculo) {
    setEditingId(item.id)
    setForm({ empresa_asociada_id: item.empresa_asociada_id || '', conductor_id: item.conductor_id || '', patente: item.patente || '', tipo: item.tipo, propiedad: item.propiedad, marca: item.marca || '', modelo: item.modelo || '', anio: item.anio ? String(item.anio) : '', color: item.color || '', combustible: item.combustible || '', kilometraje: String(item.kilometraje || 0), estado: item.estado, ubicacion: item.ubicacion || '', revision_tecnica_vencimiento: item.revision_tecnica_vencimiento || '', permiso_circulacion_vencimiento: item.permiso_circulacion_vencimiento || '', seguro_vencimiento: item.seguro_vencimiento || '', mantencion_proxima_fecha: item.mantencion_proxima_fecha || '', mantencion_proximo_km: item.mantencion_proximo_km ? String(item.mantencion_proximo_km) : '', notas: item.notas || '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function save() {
    if (!activeEmpresaId) { setMessage('Selecciona una empresa activa antes de agregar un vehículo.'); return }
    if (!form.patente.trim() || !form.marca.trim() || !form.modelo.trim()) { setMessage('Completa patente, marca y modelo.'); return }
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

  function selectFileVehicle(vehiculoId: string) {
    const vehicle = items.find((item) => item.id === vehiculoId)
    setFileForm((current) => ({ ...current, vehiculo_id: vehiculoId, nombre: current.nombre || (vehicle ? `Documento ${vehicle.patente}` : '') }))
  }

  async function saveVehicleFile() {
    if (!activeEmpresaId) { setMessage('Selecciona una empresa activa antes de subir archivos.'); return }
    if (!fileForm.vehiculo_id) { setMessage('Selecciona el vehículo al que pertenece el archivo.'); return }
    if (!fileForm.nombre.trim()) { setMessage('Escribe un nombre para identificar el archivo.'); return }
    if (!uploadFile) { setMessage('Selecciona un PDF, imagen o archivo del vehículo.'); return }
    if (uploadFile.size > 15 * 1024 * 1024) { setMessage('El archivo supera el máximo de 15 MB.'); return }
    const vehicle = items.find((item) => item.id === fileForm.vehiculo_id)
    if (!vehicle) { setMessage('El vehículo seleccionado ya no está disponible.'); return }

    setSaving(true); setMessage('')
    let uploadedPath = ''
    try {
      const extension = extensionFrom(uploadFile.name)
      const issue = fileForm.fecha_emision || new Date().toISOString().slice(0, 10)
      const fileName = `${issue}-${slugify(fileTypeLabels[fileForm.tipo])}-${slugify(fileForm.nombre)}-${Date.now()}.${extension}`
      uploadedPath = `${activeEmpresaId}/${vehicle.id}/${fileName}`
      const upload = await supabase.storage.from(vehicleFileBucket).upload(uploadedPath, uploadFile, { upsert: false })
      if (upload.error) throw upload.error
      const { error } = await supabase.from('vehiculo_archivos').insert({
        empresa_id: activeEmpresaId,
        vehiculo_id: vehicle.id,
        tipo: fileForm.tipo,
        nombre: fileForm.nombre.trim(),
        fecha_emision: nullable(fileForm.fecha_emision),
        fecha_vencimiento: nullable(fileForm.fecha_vencimiento),
        descripcion: nullable(fileForm.descripcion),
        archivo_path: uploadedPath,
        archivo_nombre: uploadFile.name,
        archivo_tipo: uploadFile.type || null,
        archivo_tamano: uploadFile.size,
      })
      if (error) throw error
    } catch (error) {
      if (uploadedPath) await supabase.storage.from(vehicleFileBucket).remove([uploadedPath])
      setSaving(false)
      setMessage(moduleError(error instanceof Error ? error.message : 'No fue posible guardar el archivo.'))
      return
    }
    setSaving(false)
    setMessage('Archivo guardado en la carpeta del vehículo.')
    setFileForm(emptyFileForm)
    setUploadFile(null)
    await load()
  }

  async function openVehicleFile(item: VehiculoArchivo) {
    const popup = window.open('', '_blank')
    const { data, error } = await supabase.storage.from(vehicleFileBucket).createSignedUrl(item.archivo_path, 3600)
    if (error || !data?.signedUrl) {
      popup?.close()
      setMessage(error?.message || 'No fue posible abrir el archivo privado.')
      return
    }
    if (popup) popup.location.href = data.signedUrl
  }

  async function removeVehicleFile(item: VehiculoArchivo) {
    if (!window.confirm(`¿Eliminar el archivo "${item.nombre}"?`)) return
    const { error } = await supabase.from('vehiculo_archivos').delete().eq('id', item.id).eq('empresa_id', activeEmpresaId)
    if (error) { setMessage(moduleError(error.message)); return }
    await supabase.storage.from(vehicleFileBucket).remove([item.archivo_path])
    setMessage('Archivo eliminado.')
    await load()
  }

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><h2 className="text-3xl font-bold text-slate-950">Flota de Vehículos</h2><p className="mt-2 text-slate-600">Control de vehículos, conductores, asignaciones, kilometraje y vencimientos.</p></div><button onClick={load} disabled={loading || saving} className="inline-flex items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50"><RefreshCw size={18} /> {loading ? 'Actualizando...' : 'Actualizar'}</button></div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><div className="text-sm font-semibold text-slate-500">Vehículos registrados</div><div className="mt-2 text-3xl font-black text-slate-950">{items.length}</div></Card>
        <Card><div className="text-sm font-semibold text-slate-500">Operativos</div><div className="mt-2 text-3xl font-black text-emerald-700">{operational}</div></Card>
        <Card><div className="text-sm font-semibold text-slate-500">En mantenimiento</div><div className="mt-2 text-3xl font-black text-amber-700">{maintenance}</div></Card>
        <Card><div className="text-sm font-semibold text-slate-500">Documentos por vencer</div><div className="mt-2 text-3xl font-black text-red-700">{documentAlerts}</div></Card>
      </div>

      <FeedbackToast message={message} onClose={() => setMessage('')} />

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
          <button onClick={save} disabled={saving} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{editingId ? <Pencil size={18} /> : <Plus size={18} />} {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Agregar a la flota'}</button>
        </Card>

        <Card>
          <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="mb-3 flex items-center gap-2"><UploadCloud size={19} className="text-blue-700" /><h3 className="font-bold text-slate-950">Archivos del vehículo</h3></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <select className="rounded border border-slate-300 bg-white px-3 py-3" value={fileForm.vehiculo_id} onChange={(event) => selectFileVehicle(event.target.value)}><option value="">Seleccionar vehículo</option>{items.map((item) => <option key={item.id} value={item.id}>{item.patente} · {item.marca} {item.modelo}</option>)}</select>
              <select className="rounded border border-slate-300 bg-white px-3 py-3" value={fileForm.tipo} onChange={(event) => setFileForm({ ...fileForm, tipo: event.target.value as VehiculoArchivo['tipo'] })}>{Object.entries(fileTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <input className="rounded border border-slate-300 bg-white px-3 py-3" placeholder="Nombre visible *" value={fileForm.nombre} onChange={(event) => setFileForm({ ...fileForm, nombre: event.target.value })} />
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt" className="rounded border border-slate-300 bg-white px-3 py-3 text-sm" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
              <label className="grid gap-1 text-xs font-semibold text-slate-600">Fecha emisión<input type="date" className="rounded border border-slate-300 bg-white px-3 py-3 text-sm" value={fileForm.fecha_emision} onChange={(event) => setFileForm({ ...fileForm, fecha_emision: event.target.value })} /></label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">Fecha vencimiento<input type="date" className="rounded border border-slate-300 bg-white px-3 py-3 text-sm" value={fileForm.fecha_vencimiento} onChange={(event) => setFileForm({ ...fileForm, fecha_vencimiento: event.target.value })} /></label>
              <input className="rounded border border-slate-300 bg-white px-3 py-3 md:col-span-2" placeholder="Descripción opcional" value={fileForm.descripcion} onChange={(event) => setFileForm({ ...fileForm, descripcion: event.target.value })} />
            </div>
            {uploadFile && <p className="mt-3 text-xs font-semibold text-blue-900">{uploadFile.name} · {formatBytes(uploadFile.size)}</p>}
            <button onClick={saveVehicleFile} disabled={saving || !items.length} className="mt-3 inline-flex items-center gap-2 rounded bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save size={16} />Guardar archivo</button>
          </div>

          <div className="mb-4 flex flex-col gap-3 md:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input className="w-full rounded border border-slate-300 py-3 pl-10 pr-3" placeholder="Buscar patente, marca, conductor o empresa" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select className="rounded border border-slate-300 px-3 py-3" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="todos">Todos los estados</option>{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          {loading ? <p className="py-10 text-center text-slate-500">Cargando flota...</p> : !filtered.length ? <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500"><CarFront className="mx-auto mb-3" size={32} /><p>No hay vehículos para mostrar.</p></div> : <div className="grid gap-3">{filtered.map((item) => {
            const alerts = [
              ['Revisión técnica', item.revision_tecnica_vencimiento], ['Permiso', item.permiso_circulacion_vencimiento], ['Seguro', item.seguro_vencimiento], ['Mantención', item.mantencion_proxima_fecha],
            ].filter(([, date]) => isExpiring(date))
            return <div key={item.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-slate-950 px-3 py-1.5 font-black tracking-wider text-white">{item.patente}</span><h4 className="font-bold text-slate-950">{item.marca} {item.modelo}</h4><span className={`rounded-full px-2 py-1 text-xs font-semibold ${stateBadge(item.estado)}`}>{stateLabels[item.estado]}</span></div><p className="mt-2 text-sm text-slate-500">{typeLabels[item.tipo]} · {item.anio || 'Año sin informar'} · {propertyLabels[item.propiedad]}</p><div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2"><span className="inline-flex items-center gap-2"><Gauge size={15} /> {Number(item.kilometraje || 0).toLocaleString('es-CL')} km</span><span>Conductor: {item.personas?.nombre || 'Sin asignar'}</span><span>Base: {item.ubicacion || 'Sin informar'}</span><span>Empresa relacionada: {item.empresas_asociadas?.razon_social || 'Uso interno TH'}</span></div></div><div className="flex shrink-0 gap-2"><button onClick={() => edit(item)} className="rounded-lg bg-slate-100 p-2 text-slate-700" aria-label={`Editar ${item.patente}`}><Pencil size={17} /></button><button onClick={() => remove(item)} className="rounded-lg bg-red-50 p-2 text-red-700" aria-label={`Eliminar ${item.patente}`}><Trash2 size={17} /></button></div></div>
              <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4"><div className={`rounded-lg p-2 ${isExpiring(item.revision_tecnica_vencimiento) ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}`}>Revisión: {formatDate(item.revision_tecnica_vencimiento)}</div><div className={`rounded-lg p-2 ${isExpiring(item.permiso_circulacion_vencimiento) ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}`}>Permiso: {formatDate(item.permiso_circulacion_vencimiento)}</div><div className={`rounded-lg p-2 ${isExpiring(item.seguro_vencimiento) ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}`}>Seguro: {formatDate(item.seguro_vencimiento)}</div><div className={`rounded-lg p-2 ${isExpiring(item.mantencion_proxima_fecha) ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600'}`}>Mantención: {formatDate(item.mantencion_proxima_fecha)}</div></div>
              <div className="mt-4 rounded-xl bg-slate-50 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800"><Paperclip size={16} />Archivos guardados</div>
                {filesByVehicle[item.id]?.length ? <div className="grid gap-2">
                  {filesByVehicle[item.id].map((file) => <div key={file.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-black text-blue-700">{fileTypeLabels[file.tipo]}</span><p className="font-bold text-slate-900">{file.nombre}</p>{file.tipo === 'foto' && <Image size={15} className="text-slate-400" />}</div>
                      <p className="mt-1 truncate text-xs text-slate-500">{file.archivo_nombre} · {formatBytes(file.archivo_tamano)} · Emisión: {formatDate(file.fecha_emision)}{file.fecha_vencimiento ? ` · Vence: ${formatDate(file.fecha_vencimiento)}` : ''}</p>
                      {file.descripcion && <p className="mt-1 text-xs text-slate-500">{file.descripcion}</p>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => openVehicleFile(file)} className="rounded-lg bg-blue-100 p-2 text-blue-700" title="Abrir archivo"><ExternalLink size={16} /></button>
                      <button onClick={() => removeVehicleFile(file)} className="rounded-lg bg-red-50 p-2 text-red-700" title="Eliminar archivo"><Trash2 size={16} /></button>
                    </div>
                  </div>)}
                </div> : <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500"><FileText className="mx-auto mb-2" size={20} />Sin archivos guardados para este vehículo.</div>}
              </div>
              {alerts.length > 0 && <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"><AlertTriangle size={15} /> Atención: {alerts.map(([name]) => name).join(', ')} vencido o dentro de 30 días.</div>}
            </div>
          })}</div>}
        </Card>
      </div>
    </div>
  )
}
