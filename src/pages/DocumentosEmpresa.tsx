import { useEffect, useMemo, useState } from 'react'
import { Archive, ExternalLink, FileArchive, FileText, LoaderCircle, Plus, RefreshCw, Save, Search, UploadCloud, X } from 'lucide-react'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
import { useEmpresa } from '../lib/empresa'
import { supabase } from '../lib/supabase'
import { EmptyState, StatusBadge, formatDate, inputClass, labelClass } from './rrhh/shared'

type CompanyDocument = {
  id: string
  empresa_id: string
  nombre: string
  fecha_emision: string
  categoria?: string | null
  descripcion?: string | null
  archivo_path: string
  archivo_nombre: string
  archivo_tipo?: string | null
  archivo_tamano?: number | null
  estado: 'vigente' | 'archivado'
  created_at: string
}

const bucket = 'documentos-empresa'
const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = { nombre: '', fecha_emision: today(), categoria: '', descripcion: '' }

function documentMessage(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return ''
  if (error.code === 'REQUEST_TIMEOUT') return 'La operación tardó demasiado. Revisa la conexión y vuelve a intentarlo.'
  if (error.code === 'NETWORK_ERROR') return 'No fue posible contactar la API. Revisa la conexión y vuelve a intentarlo.'
  if (['42P01', 'PGRST205'].includes(error.code || '') || /documentos_empresa|schema cache|does not exist/i.test(error.message || '')) {
    return 'Falta instalar el módulo Archivo documental en PostgreSQL.'
  }
  if (error.code === '23505') return 'Ya existe un documento con esos datos.'
  if (error.code === '23514') return 'Uno de los valores no cumple las reglas del sistema.'
  return error.message || 'No fue posible completar la operación.'
}

function slugify(value: string) {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'documento'
}

function extensionFrom(name: string) {
  const extension = name.includes('.') ? name.split('.').pop() || '' : ''
  return extension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
}

function formatBytes(value?: number | null) {
  const bytes = Number(value || 0)
  if (!bytes) return 'Sin tamaño'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function DocumentosEmpresa() {
  const { activeEmpresaId, activeEmpresa } = useEmpresa()
  const [documents, setDocuments] = useState<CompanyDocument[]>([])
  const [form, setForm] = useState(emptyForm)
  const [file, setFile] = useState<File | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [categoryFilter, setCategoryFilter] = useState('todas')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [schemaReady, setSchemaReady] = useState(true)
  const [message, setMessage] = useState('')

  async function load() {
    if (!activeEmpresaId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('documentos_empresa')
      .select('*')
      .eq('empresa_id', activeEmpresaId)
      .order('fecha_emision', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) {
      setSchemaReady(false)
      setDocuments([])
      setMessage(documentMessage(error))
    } else {
      setSchemaReady(true)
      setDocuments((data || []) as CompanyDocument[])
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [activeEmpresaId])

  const categories = useMemo(() => {
    const values = documents.map((item) => item.categoria?.trim()).filter(Boolean) as string[]
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'es'))
  }, [documents])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return documents.filter((item) => {
      const matchesTerm = !term || [item.nombre, item.categoria, item.descripcion, item.archivo_nombre]
        .some((value) => String(value || '').toLowerCase().includes(term))
      const matchesStatus = statusFilter === 'todos' || item.estado === statusFilter
      const matchesCategory = categoryFilter === 'todas' || item.categoria === categoryFilter
      return matchesTerm && matchesStatus && matchesCategory
    })
  }, [categoryFilter, documents, query, statusFilter])

  const summary = useMemo(() => ({
    total: documents.length,
    active: documents.filter((item) => item.estado === 'vigente').length,
    archived: documents.filter((item) => item.estado === 'archivado').length,
    latest: documents[0]?.fecha_emision || null,
  }), [documents])

  async function saveDocument() {
    if (!schemaReady) return setMessage('Primero instala el módulo Archivo documental con npm run db:seed:documentos-empresa.')
    if (!activeEmpresaId) return setMessage('Selecciona una empresa antes de guardar.')
    if (!form.nombre.trim()) return setMessage('Escribe un nombre para identificar el documento.')
    if (!form.fecha_emision) return setMessage('Ingresa la fecha en que el documento fue emitido.')
    if (!file) return setMessage('Selecciona el PDF, imagen o archivo escaneado.')
    if (file.size > 15 * 1024 * 1024) return setMessage('El archivo supera el máximo de 15 MB.')

    setSaving(true)
    let uploadedPath = ''
    try {
      const extension = extensionFrom(file.name)
      const month = form.fecha_emision.slice(0, 7)
      const name = `${form.fecha_emision}-${slugify(form.nombre)}-${Date.now()}.${extension}`
      uploadedPath = `${activeEmpresaId}/${month}/${name}`
      const upload = await supabase.storage.from(bucket).upload(uploadedPath, file, { upsert: false })
      if (upload.error) throw upload.error
      const { error } = await supabase.from('documentos_empresa').insert({
        empresa_id: activeEmpresaId,
        nombre: form.nombre.trim(),
        fecha_emision: form.fecha_emision,
        categoria: form.categoria.trim() || null,
        descripcion: form.descripcion.trim() || null,
        archivo_path: uploadedPath,
        archivo_nombre: file.name,
        archivo_tipo: file.type || null,
        archivo_tamano: file.size,
        estado: 'vigente',
      })
      if (error) throw error
    } catch (error) {
      if (uploadedPath) await supabase.storage.from(bucket).remove([uploadedPath])
      setSaving(false)
      return setMessage(documentMessage(error as { code?: string; message?: string }))
    }

    setSaving(false)
    setMessage('Documento guardado y disponible para abrir.')
    setForm(emptyForm)
    setFile(null)
    setShowForm(false)
    await load()
  }

  async function openDocument(item: CompanyDocument) {
    const popup = window.open('', '_blank')
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(item.archivo_path, 3600)
    if (error || !data?.signedUrl) {
      popup?.close()
      return setMessage(error?.message || 'No fue posible abrir el documento privado.')
    }
    if (popup) popup.location.href = data.signedUrl
  }

  async function setStatus(item: CompanyDocument, estado: 'vigente' | 'archivado') {
    const { error } = await supabase.from('documentos_empresa').update({ estado }).eq('id', item.id).eq('empresa_id', activeEmpresaId)
    if (error) return setMessage(documentMessage(error))
    setMessage(estado === 'archivado' ? 'Documento archivado.' : 'Documento reactivado.')
    await load()
  }

  return <div className="space-y-5">
    <FeedbackToast message={message} onClose={() => setMessage('')} />

    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-blue-700">Administración</p>
        <h2 className="text-3xl font-black text-slate-950">Archivo documental</h2>
        <p className="mt-2 max-w-3xl text-slate-600">Documentos escaneados, PDFs y respaldos generales de {activeEmpresa?.nombre || 'la empresa activa'}. La fecha corresponde a emisión del documento, no al día en que se sube.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} />Actualizar</button>
        <button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white"><Plus size={17} />Subir documento</button>
      </div>
    </div>

    {!schemaReady && <Card className="border-amber-300 bg-amber-50"><div className="flex gap-3 text-amber-950"><FileArchive className="mt-0.5 shrink-0" /><div><h3 className="font-black">Falta preparar Archivo documental en PostgreSQL</h3><p className="mt-1 text-sm leading-6">Ejecuta <b>npm run db:seed:documentos-empresa</b> para crear la tabla, el bucket privado y los permisos.</p></div></div></Card>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card><p className="text-xs font-black uppercase text-slate-500">Total documentos</p><p className="mt-2 text-3xl font-black">{summary.total}</p></Card>
      <Card><p className="text-xs font-black uppercase text-emerald-600">Vigentes</p><p className="mt-2 text-3xl font-black text-emerald-700">{summary.active}</p></Card>
      <Card><p className="text-xs font-black uppercase text-slate-500">Archivados</p><p className="mt-2 text-3xl font-black text-slate-700">{summary.archived}</p></Card>
      <Card><p className="text-xs font-black uppercase text-blue-600">Última emisión</p><p className="mt-2 text-xl font-black text-slate-900">{formatDate(summary.latest)}</p></Card>
    </div>

    {showForm && <Card>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h3 className="text-xl font-black">Subir documento</h3>
          <p className="mt-1 text-sm text-slate-500">Usa un nombre claro para buscarlo después. El archivo queda privado para la empresa activa.</p>
        </div>
        <button type="button" onClick={() => setShowForm(false)} className="rounded-lg bg-slate-100 p-2"><X size={18} /></button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className={`${labelClass} xl:col-span-2`}>Nombre visible *<input value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} className={inputClass} placeholder="Factura compresor, contrato proveedor, guía despacho..." /></label>
        <label className={labelClass}>Fecha emisión *<input type="date" value={form.fecha_emision} onChange={(event) => setForm({ ...form, fecha_emision: event.target.value })} className={inputClass} /></label>
        <label className={labelClass}>Categoría<input value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value })} className={inputClass} placeholder="Factura, contrato, guía..." /></label>
        <label className={`${labelClass} md:col-span-2`}>Archivo *<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(event) => setFile(event.target.files?.[0] || null)} className={`${inputClass} text-sm`} /></label>
        <label className={`${labelClass} md:col-span-2`}>Descripción<textarea value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} className={`${inputClass} min-h-24 resize-y`} placeholder="Detalle interno opcional" /></label>
      </div>
      {file && <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900"><p>{file.name} · {formatBytes(file.size)}</p></div>}
      <button type="button" onClick={saveDocument} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-black text-white disabled:opacity-50">
        {saving ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />}
        {saving ? 'Guardando...' : 'Guardar documento'}
      </button>
    </Card>}

    <Card>
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-2"><FileText className="text-blue-700" /><h3 className="font-black">Documentos subidos</h3></div>
        <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_160px_170px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Buscar documento" />
          </label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="todos">Todos</option><option value="vigente">Vigentes</option><option value="archivado">Archivados</option></select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="todas">Todas las categorías</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
        </div>
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Documento</th><th className="p-3">Fecha emisión</th><th className="p-3">Categoría</th><th className="p-3">Archivo</th><th className="p-3">Estado</th><th className="p-3 text-right">Acciones</th></tr></thead>
          <tbody>
            {filtered.map((item) => <tr key={item.id} className="border-b hover:bg-slate-50">
              <td className="p-3"><p className="font-black text-slate-900">{item.nombre}</p>{item.descripcion && <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">{item.descripcion}</p>}</td>
              <td className="p-3 font-semibold">{formatDate(item.fecha_emision)}</td>
              <td className="p-3">{item.categoria || 'Sin categoría'}</td>
              <td className="p-3"><p className="font-semibold">{item.archivo_nombre}</p><p className="mt-1 text-xs text-slate-500">{formatBytes(item.archivo_tamano)}</p></td>
              <td className="p-3"><StatusBadge value={item.estado} /></td>
              <td className="p-3 text-right">
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => openDocument(item)} title="Abrir documento" className="rounded-lg bg-blue-100 p-2 text-blue-700"><ExternalLink size={16} /></button>
                  <button type="button" onClick={() => setStatus(item, item.estado === 'archivado' ? 'vigente' : 'archivado')} title={item.estado === 'archivado' ? 'Reactivar' : 'Archivar'} className="rounded-lg bg-slate-100 p-2 text-slate-700"><Archive size={16} /></button>
                </div>
              </td>
            </tr>)}
            {!loading && !filtered.length && <tr><td colSpan={6} className="p-4"><EmptyState>No hay documentos que coincidan con los filtros.</EmptyState></td></tr>}
            {loading && <tr><td colSpan={6} className="p-8 text-center text-sm font-semibold text-slate-500">Cargando documentos...</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>

    <Card className="border-blue-100 bg-blue-50/50">
      <div className="flex gap-3 text-blue-950"><UploadCloud className="mt-0.5 shrink-0" /><p className="text-sm leading-6">Los archivos se guardan por empresa y por mes de emisión. Para abrirlos, el sistema genera un enlace privado temporal, así no quedan públicos en internet.</p></div>
    </Card>
  </div>
}
