import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, FileCheck2, FilePlus2, FolderCheck, Plus, RefreshCw, Save, X } from 'lucide-react'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
import { useEmpresa } from '../lib/empresa'
import { supabase } from '../lib/supabase'
import { databaseMessage, daysUntil, EmptyState, formatDate, inputClass, labelClass, PersonaRrhh, RrhhAlert, RrhhHeader, SchemaWarning, StatusBadge } from './rrhh/shared'

type DocumentType = {
  id: string
  nombre: string
  categoria: string
  obligatorio: boolean
  vence: boolean
  vigencia_dias?: number | null
  alcance: string
  activo: boolean
}

type EmployeeDocument = {
  id: string
  persona_id: string
  tipo_documento_id?: string | null
  nombre: string
  estado: string
  fecha_emision?: string | null
  fecha_vencimiento?: string | null
  url?: string | null
  notas?: string | null
  personas?: Pick<PersonaRrhh, 'id' | 'nombre' | 'rut'> | null
  rrhh_tipos_documento?: Pick<DocumentType, 'id' | 'nombre' | 'categoria'> | null
}

const emptyDocument = { persona_id: '', tipo_documento_id: '', nombre: '', estado: 'vigente', fecha_emision: new Date().toISOString().slice(0, 10), fecha_vencimiento: '', url: '', notas: '' }
const emptyType = { nombre: '', categoria: 'personal', obligatorio: false, vence: false, vigencia_dias: 0, alcance: 'todos' }

export function RrhhDocumentos() {
  const { activeEmpresaId, activeEmpresa } = useEmpresa()
  const [people, setPeople] = useState<PersonaRrhh[]>([])
  const [types, setTypes] = useState<DocumentType[]>([])
  const [documents, setDocuments] = useState<EmployeeDocument[]>([])
  const [alerts, setAlerts] = useState<RrhhAlert[]>([])
  const [documentForm, setDocumentForm] = useState(emptyDocument)
  const [typeForm, setTypeForm] = useState(emptyType)
  const [file, setFile] = useState<File | null>(null)
  const [showDocumentForm, setShowDocumentForm] = useState(false)
  const [showTypeForm, setShowTypeForm] = useState(false)
  const [personFilter, setPersonFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [schemaReady, setSchemaReady] = useState(true)
  const [message, setMessage] = useState('')

  async function load() {
    if (!activeEmpresaId) return
    setLoading(true)
    const [peopleResult, typesResult, documentsResult, alertsResult] = await Promise.all([
      supabase.from('personas').select('id,nombre,rut,tipo_relacion,activo').eq('empresa_id', activeEmpresaId).eq('activo', true).order('nombre'),
      supabase.from('rrhh_tipos_documento').select('*').eq('empresa_id', activeEmpresaId).order('activo', { ascending: false }).order('nombre'),
      supabase.from('rrhh_documentos_empleado').select('*, personas(id,nombre,rut), rrhh_tipos_documento(id,nombre,categoria)').eq('empresa_id', activeEmpresaId).order('fecha_vencimiento', { ascending: true, nullsFirst: false }),
      supabase.from('rrhh_alertas').select('id,tipo,titulo,detalle,prioridad,estado,fecha_vencimiento,persona_id').eq('empresa_id', activeEmpresaId).in('estado', ['pendiente', 'vista']).order('prioridad').order('fecha_vencimiento', { ascending: true, nullsFirst: false }),
    ])
    if (typesResult.error || documentsResult.error) {
      const error = typesResult.error || documentsResult.error
      setSchemaReady(false)
      setMessage(databaseMessage(error))
      setTypes([])
      setDocuments([])
    } else {
      setSchemaReady(true)
      setTypes((typesResult.data || []) as DocumentType[])
      setDocuments((documentsResult.data || []) as unknown as EmployeeDocument[])
    }
    if (!peopleResult.error) setPeople((peopleResult.data || []) as unknown as PersonaRrhh[])
    if (!alertsResult.error) setAlerts((alertsResult.data || []) as RrhhAlert[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [activeEmpresaId])

  const summary = useMemo(() => ({
    valid: documents.filter((item) => item.estado === 'vigente' && (!item.fecha_vencimiento || Number(daysUntil(item.fecha_vencimiento)) >= 0)).length,
    expired: documents.filter((item) => item.estado === 'vencido' || (item.fecha_vencimiento && Number(daysUntil(item.fecha_vencimiento)) < 0)).length,
    missing: alerts.filter((item) => item.tipo === 'documento_faltante').length,
    urgent: alerts.filter((item) => item.prioridad === 'alta').length,
  }), [alerts, documents])

  const filteredDocuments = useMemo(() => documents.filter((item) => (personFilter === 'todos' || item.persona_id === personFilter) && (statusFilter === 'todos' || item.estado === statusFilter)), [documents, personFilter, statusFilter])

  function selectType(typeId: string) {
    const type = types.find((item) => item.id === typeId)
    const issue = documentForm.fecha_emision || new Date().toISOString().slice(0, 10)
    let expiry = documentForm.fecha_vencimiento
    if (type?.vence && type.vigencia_dias && issue) {
      const date = new Date(`${issue}T12:00:00`)
      date.setDate(date.getDate() + Number(type.vigencia_dias))
      expiry = date.toISOString().slice(0, 10)
    }
    setDocumentForm((current) => ({ ...current, tipo_documento_id: typeId, nombre: current.nombre || type?.nombre || '', fecha_vencimiento: expiry }))
  }

  async function uploadDocument() {
    if (!file || !activeEmpresaId || !documentForm.persona_id) return { path: documentForm.url.trim() || null, uploaded: false }
    if (file.size > 15 * 1024 * 1024) throw new Error('El archivo supera el máximo de 15 MB.')
    const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80)
    const path = `${activeEmpresaId}/${documentForm.persona_id}/${crypto.randomUUID()}-${safeName || `documento.${extension}`}`
    const { error } = await supabase.storage.from('rrhh-documentos').upload(path, file, { upsert: false, contentType: file.type || undefined })
    if (error) throw new Error(error.message)
    return { path, uploaded: true }
  }

  async function saveDocument() {
    if (!schemaReady) return setMessage('Primero instala el esquema completo en PostgreSQL con npm run db:init.')
    if (!activeEmpresaId) return setMessage('Selecciona una empresa antes de guardar.')
    if (!documentForm.persona_id) return setMessage('Selecciona el trabajador del documento.')
    if (!documentForm.nombre.trim()) return setMessage('Escribe un nombre para identificar el documento.')
    if (documentForm.fecha_vencimiento && documentForm.fecha_emision && documentForm.fecha_vencimiento < documentForm.fecha_emision) return setMessage('El vencimiento no puede ser anterior a la emisión.')
    if (!file && !documentForm.url.trim()) return setMessage('Selecciona un archivo o ingresa una URL de respaldo.')

    setSaving(true)
    let uploadedPath: string | null = null
    let uploaded = false
    try {
      const upload = await uploadDocument()
      uploadedPath = upload.path
      uploaded = upload.uploaded
      const expired = documentForm.fecha_vencimiento && documentForm.fecha_vencimiento < new Date().toISOString().slice(0, 10)
      const { error } = await supabase.from('rrhh_documentos_empleado').insert({ empresa_id: activeEmpresaId, persona_id: documentForm.persona_id, tipo_documento_id: documentForm.tipo_documento_id || null, entidad_tipo: 'persona', entidad_id: documentForm.persona_id, nombre: documentForm.nombre.trim(), estado: expired ? 'vencido' : documentForm.estado, fecha_emision: documentForm.fecha_emision || null, fecha_vencimiento: documentForm.fecha_vencimiento || null, url: uploadedPath, notas: documentForm.notas.trim() || null })
      if (error) throw error
    } catch (error) {
      if (uploaded && uploadedPath) await supabase.storage.from('rrhh-documentos').remove([uploadedPath])
      setSaving(false)
      return setMessage(databaseMessage(error as { code?: string; message?: string }))
    }
    setSaving(false)
    setMessage('Documento guardado en la carpeta del trabajador.')
    setDocumentForm({ ...emptyDocument, fecha_emision: new Date().toISOString().slice(0, 10) })
    setFile(null)
    setShowDocumentForm(false)
    await load()
  }

  async function saveType() {
    if (!activeEmpresaId) return setMessage('Selecciona una empresa antes de crear el tipo documental.')
    if (typeForm.nombre.trim().length < 3) return setMessage('Escribe el nombre del tipo documental.')
    setSaving(true)
    const { error } = await supabase.from('rrhh_tipos_documento').insert({ empresa_id: activeEmpresaId, nombre: typeForm.nombre.trim(), categoria: typeForm.categoria, obligatorio: typeForm.obligatorio, vence: typeForm.vence, vigencia_dias: typeForm.vence && Number(typeForm.vigencia_dias) > 0 ? Number(typeForm.vigencia_dias) : null, alcance: typeForm.alcance })
    setSaving(false)
    if (error) return setMessage(databaseMessage(error))
    setMessage('Tipo documental agregado al catálogo.')
    setTypeForm(emptyType)
    setShowTypeForm(false)
    await load()
  }

  async function syncAlerts() {
    if (!activeEmpresaId) return setMessage('Selecciona una empresa antes de actualizar alertas.')
    setLoading(true)
    const { data, error } = await supabase.rpc('sincronizar_alertas_rrhh', { p_empresa_id: activeEmpresaId })
    setLoading(false)
    if (error) return setMessage(databaseMessage(error))
    setMessage(`Alertas actualizadas. Se revisaron ${Number(data || 0)} pendientes.`)
    await load()
  }

  async function resolveAlert(alert: RrhhAlert, estado: 'resuelta' | 'descartada') {
    const { error } = await supabase.from('rrhh_alertas').update({ estado, resuelto_at: new Date().toISOString() }).eq('id', alert.id).eq('empresa_id', activeEmpresaId)
    if (error) return setMessage(databaseMessage(error))
    setMessage(estado === 'resuelta' ? 'Alerta marcada como resuelta.' : 'Alerta descartada.')
    await load()
  }

  async function openDocument(item: EmployeeDocument) {
    if (!item.url) return setMessage('Este registro no tiene un archivo asociado.')
    if (/^https?:\/\//i.test(item.url)) {
      window.open(item.url, '_blank', 'noopener,noreferrer')
      return
    }
    const popup = window.open('', '_blank')
    const { data, error } = await supabase.storage.from('rrhh-documentos').createSignedUrl(item.url, 3600)
    if (error || !data?.signedUrl) {
      popup?.close()
      return setMessage(error?.message || 'No fue posible abrir el documento privado.')
    }
    if (popup) popup.location.href = data.signedUrl
  }

  return <div className="space-y-5">
    <FeedbackToast message={message} onClose={() => setMessage('')} />
    <RrhhHeader title="Documentos y alertas" description={`Carpetas laborales, requisitos configurables y recordatorios diarios de ${activeEmpresa?.nombre || 'la empresa activa'}. Los archivos quedan privados.`} loading={loading} onRefresh={load} action={<><button onClick={syncAlerts} disabled={loading || !schemaReady} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-800 disabled:opacity-50"><RefreshCw size={17} />Actualizar alertas</button><button onClick={() => setShowTypeForm(true)} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-800">Nuevo tipo</button><button onClick={() => setShowDocumentForm(true)} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white"><Plus size={17} />Subir documento</button></>} />
    {!schemaReady && <SchemaWarning />}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card><p className="text-xs font-black uppercase text-emerald-600">Vigentes</p><p className="mt-2 text-3xl font-black">{summary.valid}</p></Card><Card><p className="text-xs font-black uppercase text-red-600">Vencidos</p><p className="mt-2 text-3xl font-black text-red-700">{summary.expired}</p></Card><Card><p className="text-xs font-black uppercase text-amber-600">Faltantes</p><p className="mt-2 text-3xl font-black text-amber-800">{summary.missing}</p></Card><Card><p className="text-xs font-black uppercase text-red-600">Urgentes</p><p className="mt-2 text-3xl font-black text-red-700">{summary.urgent}</p></Card></div>

    <Card className={alerts.length ? 'border-amber-200 bg-amber-50/50' : ''}><div className="mb-4 flex items-center gap-2"><AlertTriangle className={alerts.length ? 'text-amber-700' : 'text-emerald-700'} /><h3 className="font-black">Centro de alertas</h3></div><div className="space-y-2">{alerts.map((alert) => <div key={alert.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex gap-3"><span className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ${alert.prioridad === 'alta' ? 'bg-red-500' : alert.prioridad === 'media' ? 'bg-amber-500' : 'bg-blue-500'}`} /><div><p className="font-black text-slate-900">{alert.titulo}</p><p className="mt-1 text-sm text-slate-600">{alert.detalle || 'Pendiente de revisión.'}</p>{alert.fecha_vencimiento && <p className="mt-1 text-xs font-bold text-slate-500">Fecha asociada: {formatDate(alert.fecha_vencimiento)}</p>}</div></div><div className="flex shrink-0 gap-2"><button onClick={() => resolveAlert(alert, 'resuelta')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800"><CheckCircle2 size={15} />Resolver</button><button onClick={() => resolveAlert(alert, 'descartada')} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">Descartar</button></div></div>)}{!alerts.length && <EmptyState>No hay alertas abiertas. Usa “Actualizar alertas” para revisar vencimientos y documentos obligatorios.</EmptyState>}</div></Card>

    {showDocumentForm && <Card><div className="mb-5 flex items-start justify-between"><div><h3 className="text-xl font-black">Agregar documento</h3><p className="mt-1 text-sm text-slate-500">Puedes subir un archivo privado de hasta 15 MB o registrar un enlace externo.</p></div><button onClick={() => setShowDocumentForm(false)} className="rounded-lg bg-slate-100 p-2"><X size={18} /></button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className={labelClass}>Trabajador *<select value={documentForm.persona_id} onChange={(e) => setDocumentForm({ ...documentForm, persona_id: e.target.value })} className={inputClass}><option value="">Seleccionar</option>{people.map((person) => <option key={person.id} value={person.id}>{person.nombre} · {person.rut || 'sin RUT'}</option>)}</select></label><label className={labelClass}>Tipo documental<select value={documentForm.tipo_documento_id} onChange={(e) => selectType(e.target.value)} className={inputClass}><option value="">Sin clasificar</option>{types.filter((type) => type.activo).map((type) => <option key={type.id} value={type.id}>{type.nombre}{type.obligatorio ? ' · obligatorio' : ''}</option>)}</select></label><label className={`${labelClass} md:col-span-2`}>Nombre *<input value={documentForm.nombre} onChange={(e) => setDocumentForm({ ...documentForm, nombre: e.target.value })} className={inputClass} /></label><label className={labelClass}>Emisión<input type="date" value={documentForm.fecha_emision} onChange={(e) => setDocumentForm({ ...documentForm, fecha_emision: e.target.value })} className={inputClass} /></label><label className={labelClass}>Vencimiento<input type="date" value={documentForm.fecha_vencimiento} onChange={(e) => setDocumentForm({ ...documentForm, fecha_vencimiento: e.target.value })} className={inputClass} /></label><label className={labelClass}>Estado<select value={documentForm.estado} onChange={(e) => setDocumentForm({ ...documentForm, estado: e.target.value })} className={inputClass}><option value="pendiente">Pendiente</option><option value="vigente">Vigente</option><option value="vencido">Vencido</option><option value="rechazado">Rechazado</option><option value="archivado">Archivado</option></select></label><label className={labelClass}>Archivo privado<input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} className={`${inputClass} text-sm`} /></label><label className={`${labelClass} md:col-span-2`}>O URL externa<input type="url" value={documentForm.url} onChange={(e) => setDocumentForm({ ...documentForm, url: e.target.value })} className={inputClass} placeholder="https://..." /></label><label className={`${labelClass} md:col-span-2`}>Notas<input value={documentForm.notas} onChange={(e) => setDocumentForm({ ...documentForm, notas: e.target.value })} className={inputClass} /></label></div>{file && <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">Archivo seleccionado: {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}<button onClick={saveDocument} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-black text-white disabled:opacity-50"><FilePlus2 size={17} />{saving ? 'Guardando documento...' : 'Guardar documento'}</button></Card>}

    {showTypeForm && <Card className="border-blue-200 bg-blue-50/40"><div className="mb-4 flex items-start justify-between"><div><h3 className="text-xl font-black">Nuevo tipo documental</h3><p className="mt-1 text-sm text-slate-500">Los obligatorios generan una alerta cuando un trabajador no tiene un ejemplar vigente.</p></div><button onClick={() => setShowTypeForm(false)} className="rounded-lg bg-white p-2"><X size={18} /></button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><label className={`${labelClass} xl:col-span-2`}>Nombre *<input value={typeForm.nombre} onChange={(e) => setTypeForm({ ...typeForm, nombre: e.target.value })} className={inputClass} /></label><label className={labelClass}>Categoría<select value={typeForm.categoria} onChange={(e) => setTypeForm({ ...typeForm, categoria: e.target.value })} className={inputClass}><option value="personal">Personal</option><option value="contrato">Contrato</option><option value="anexo">Anexo</option><option value="licencia">Licencia</option><option value="remuneracion">Remuneración</option><option value="seguridad">Seguridad</option><option value="previsional">Previsional</option><option value="otro">Otro</option></select></label><label className={labelClass}>Alcance<select value={typeForm.alcance} onChange={(e) => setTypeForm({ ...typeForm, alcance: e.target.value })} className={inputClass}><option value="todos">Todas las personas</option><option value="contrato">Solo contratados</option><option value="honorarios">Solo honorarios</option><option value="cargo">Por cargo</option><option value="personalizado">Personalizado</option></select></label><label className={labelClass}>Vigencia en días<input type="number" min="0" disabled={!typeForm.vence} value={typeForm.vigencia_dias} onChange={(e) => setTypeForm({ ...typeForm, vigencia_dias: Number(e.target.value) })} className={inputClass} /></label></div><div className="mt-4 flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={typeForm.obligatorio} onChange={(e) => setTypeForm({ ...typeForm, obligatorio: e.target.checked })} className="h-4 w-4" />Documento obligatorio</label><label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={typeForm.vence} onChange={(e) => setTypeForm({ ...typeForm, vence: e.target.checked })} className="h-4 w-4" />Tiene vencimiento</label></div><button onClick={saveType} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-black text-white"><Save size={17} />Guardar tipo</button></Card>}

    <Card><div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-2"><FolderCheck className="text-blue-700" /><h3 className="font-black">Carpetas documentales</h3></div><div className="flex gap-2"><select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value="todos">Todas las personas</option>{people.map((person) => <option key={person.id} value={person.id}>{person.nombre}</option>)}</select><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value="todos">Todos los estados</option><option value="vigente">Vigentes</option><option value="pendiente">Pendientes</option><option value="vencido">Vencidos</option><option value="rechazado">Rechazados</option><option value="archivado">Archivados</option></select></div></div><div className="overflow-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Trabajador</th><th className="p-3">Documento</th><th className="p-3">Categoría</th><th className="p-3">Vencimiento</th><th className="p-3">Estado</th><th className="p-3 text-right">Archivo</th></tr></thead><tbody>{filteredDocuments.map((item) => { const remaining = daysUntil(item.fecha_vencimiento); const derivedStatus = remaining !== null && remaining < 0 && item.estado === 'vigente' ? 'vencido' : item.estado; return <tr key={item.id} className="border-b hover:bg-slate-50"><td className="p-3"><p className="font-black">{item.personas?.nombre || '—'}</p><p className="mt-1 text-xs text-slate-500">{item.personas?.rut || ''}</p></td><td className="p-3"><p className="font-semibold">{item.nombre}</p><p className="mt-1 text-xs text-slate-500">{item.rrhh_tipos_documento?.nombre || 'Sin tipo'}</p></td><td className="p-3 capitalize">{item.rrhh_tipos_documento?.categoria || 'otro'}</td><td className="p-3">{formatDate(item.fecha_vencimiento)}{remaining !== null && <p className={`mt-1 text-xs font-bold ${remaining < 0 ? 'text-red-700' : remaining <= 7 ? 'text-amber-700' : 'text-slate-500'}`}>{remaining < 0 ? `Venció hace ${Math.abs(remaining)} días` : `${remaining} días restantes`}</p>}</td><td className="p-3"><StatusBadge value={derivedStatus} /></td><td className="p-3 text-right"><button onClick={() => openDocument(item)} disabled={!item.url} title={item.url ? 'Abrir documento' : 'Sin archivo'} className="rounded-lg bg-blue-100 p-2 text-blue-700 disabled:cursor-not-allowed disabled:opacity-30"><ExternalLink size={16} /></button></td></tr>})}{!loading && !filteredDocuments.length && <tr><td colSpan={6} className="p-4"><EmptyState>No hay documentos que coincidan con los filtros.</EmptyState></td></tr>}</tbody></table></div></Card>

    <Card><div className="mb-4 flex items-center gap-2"><FileCheck2 className="text-emerald-700" /><h3 className="font-black">Catálogo de requisitos</h3></div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{types.map((type) => <div key={type.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-black">{type.nombre}</p><p className="mt-1 text-xs capitalize text-slate-500">{type.categoria} · {type.alcance}</p></div>{type.obligatorio && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase text-amber-800">Obligatorio</span>}</div><p className="mt-3 text-xs text-slate-500">{type.vence ? `Vence${type.vigencia_dias ? ` a los ${type.vigencia_dias} días` : ''}` : 'Sin vencimiento'}</p></div>)}{!types.length && <EmptyState>Aún no existen tipos documentales.</EmptyState>}</div></Card>
  </div>
}
