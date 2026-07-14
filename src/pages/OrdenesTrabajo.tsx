import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, FileText, RefreshCw, Wrench } from 'lucide-react'
import { Card } from '../components/Card'
import { supabase } from '../lib/supabase'

type Cliente = {
  id: string
  razon_social: string
}

type Equipo = {
  id: string
  code: string
  name: string
  cliente_id?: string
}

type OrdenTrabajo = {
  id: string
  folio: string
  titulo?: string
  estado: string
  prioridad: string
  descripcion_problema?: string
  fecha_ingreso?: string
  clientes?: Cliente | null
  machines?: Equipo | null
}

type CotizacionDocumento = {
  id: number
  numero?: number
  pre_numero?: string
  cliente_nombre?: string
  cliente_id?: string
  total?: number
  estado?: string
  created_at?: string
}

const emptyForm = {
  folio: '',
  titulo: '',
  cliente_id: '',
  equipo_id: '',
  prioridad: 'normal',
  descripcion_problema: '',
}

function nextManualFolio() {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  return `OT-${stamp}`
}

function money(value?: number) {
  return `$${Math.round(Number(value || 0)).toLocaleString('es-CL')}`
}

export function OrdenesTrabajo() {
  const [ordenes, setOrdenes] = useState<OrdenTrabajo[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [cotizaciones, setCotizaciones] = useState<CotizacionDocumento[]>([])
  const [selectedDoc, setSelectedDoc] = useState('')
  const [form, setForm] = useState({ ...emptyForm, folio: nextManualFolio() })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')

    const [ordenesResult, clientesResult, equiposResult, cotizacionesResult] = await Promise.all([
      supabase
        .from('ordenes_trabajo')
        .select('*, clientes(id, razon_social), machines(id, code, name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('clientes')
        .select('id, razon_social')
        .order('razon_social', { ascending: true }),
      supabase
        .from('machines')
        .select('id, code, name, cliente_id')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('cotizacion_documentos')
        .select('id, numero, pre_numero, cliente_nombre, cliente_id, total, estado, created_at')
        .in('estado', ['cotizacion_emitida', 'COTIZACION'])
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    if (ordenesResult.error) setMessage(ordenesResult.error.message)
    setOrdenes((ordenesResult.data || []) as OrdenTrabajo[])
    setClientes((clientesResult.data || []) as Cliente[])
    setEquipos((equiposResult.data || []) as Equipo[])
    setCotizaciones((cotizacionesResult.data || []) as CotizacionDocumento[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const equiposFiltrados = useMemo(() => {
    if (!form.cliente_id) return equipos
    return equipos.filter((equipo) => !equipo.cliente_id || equipo.cliente_id === form.cliente_id)
  }, [equipos, form.cliente_id])

  async function createManual() {
    if (!form.folio.trim()) {
      setMessage('Ingresa un folio para la OT.')
      return
    }

    setSaving(true)
    setMessage('')

    const { error } = await supabase
      .from('ordenes_trabajo')
      .insert({
        folio: form.folio.trim(),
        titulo: form.titulo.trim() || null,
        cliente_id: form.cliente_id || null,
        equipo_id: form.equipo_id || null,
        prioridad: form.prioridad,
        descripcion_problema: form.descripcion_problema.trim() || null,
      })

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setForm({ ...emptyForm, folio: nextManualFolio() })
    setMessage('Orden de trabajo creada.')
    await load()
  }

  async function createFromQuote() {
    const docId = Number(selectedDoc)
    if (!docId) {
      setMessage('Selecciona una cotización emitida.')
      return
    }

    setSaving(true)
    setMessage('')

    const { error } = await supabase.rpc('crear_ot_desde_cotizacion_documento', {
      doc_id: docId,
    })

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setSelectedDoc('')
    setMessage('OT creada o recuperada desde la cotización.')
    await load()
  }

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-950">Órdenes de Trabajo</h2>
          <p className="mt-2 text-slate-600">Control de trabajos recibidos, diagnóstico, reparación, pruebas y cierre.</p>
        </div>

        <button onClick={load} disabled={loading || saving} className="inline-flex items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50">
          <RefreshCw size={18} />
          Actualizar
        </button>
      </div>

      {message && <div className="mb-4 rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <FileText size={20} className="text-blue-700" />
              <h3 className="text-lg font-bold text-slate-950">Desde Cotización</h3>
            </div>

            <select className="w-full rounded border border-slate-300 px-3 py-3" value={selectedDoc} onChange={(event) => setSelectedDoc(event.target.value)}>
              <option value="">Selecciona cotización emitida</option>
              {cotizaciones.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.numero ? `Cot. ${doc.numero}` : doc.pre_numero || `Doc ${doc.id}`} · {doc.cliente_nombre || 'Sin cliente'} · {money(doc.total)}
                </option>
              ))}
            </select>

            <button onClick={createFromQuote} disabled={saving || !selectedDoc} className="mt-4 w-full rounded bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
              Crear OT desde cotización
            </button>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-2">
              <Wrench size={20} className="text-blue-700" />
              <h3 className="text-lg font-bold text-slate-950">OT Manual</h3>
            </div>

            <div className="grid gap-3">
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="Folio" value={form.folio} onChange={(event) => setForm({ ...form, folio: event.target.value })} />
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="Título" value={form.titulo} onChange={(event) => setForm({ ...form, titulo: event.target.value })} />
              <select className="rounded border border-slate-300 px-3 py-3" value={form.cliente_id} onChange={(event) => setForm({ ...form, cliente_id: event.target.value, equipo_id: '' })}>
                <option value="">Cliente</option>
                {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.razon_social}</option>)}
              </select>
              <select className="rounded border border-slate-300 px-3 py-3" value={form.equipo_id} onChange={(event) => setForm({ ...form, equipo_id: event.target.value })}>
                <option value="">Equipo</option>
                {equiposFiltrados.map((equipo) => <option key={equipo.id} value={equipo.id}>{equipo.code} · {equipo.name}</option>)}
              </select>
              <select className="rounded border border-slate-300 px-3 py-3" value={form.prioridad} onChange={(event) => setForm({ ...form, prioridad: event.target.value })}>
                <option value="baja">Baja</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
              <textarea className="min-h-28 rounded border border-slate-300 px-3 py-3" placeholder="Problema reportado / alcance" value={form.descripcion_problema} onChange={(event) => setForm({ ...form, descripcion_problema: event.target.value })} />
            </div>

            <button onClick={createManual} disabled={saving} className="mt-4 w-full rounded bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
              Crear OT manual
            </button>
          </Card>
        </div>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <ClipboardList size={20} className="text-blue-700" />
            <h3 className="text-lg font-bold text-slate-950">Trabajos</h3>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-3">OT</th>
                  <th className="py-3">Cliente</th>
                  <th className="py-3">Equipo</th>
                  <th className="py-3">Estado</th>
                  <th className="py-3">Prioridad</th>
                </tr>
              </thead>
              <tbody>
                {ordenes.map((orden) => (
                  <tr key={orden.id} className="border-b align-top">
                    <td className="py-3">
                      <div className="font-semibold text-slate-950">{orden.folio}</div>
                      <div className="max-w-xs text-slate-500">{orden.titulo || orden.descripcion_problema || '-'}</div>
                    </td>
                    <td className="py-3">{orden.clientes?.razon_social || '-'}</td>
                    <td className="py-3">{orden.machines ? `${orden.machines.code} · ${orden.machines.name}` : '-'}</td>
                    <td className="py-3"><span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{orden.estado.replace(/_/g, ' ')}</span></td>
                    <td className="py-3">{orden.prioridad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!ordenes.length && <div className="py-8 text-center text-slate-500">{loading ? 'Cargando OT...' : 'No hay órdenes de trabajo.'}</div>}
          </div>
        </Card>
      </div>
    </div>
  )
}
