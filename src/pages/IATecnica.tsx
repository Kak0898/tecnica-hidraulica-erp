import { useEffect, useMemo, useState } from 'react'
import { BrainCircuit, RefreshCw, Save, Sparkles } from 'lucide-react'
import { Card } from '../components/Card'
import { supabase } from '../lib/supabase'

type Equipo = {
  id: string
  code: string
  name: string
  brand?: string
  model?: string
  serial?: string
}

type OrdenTrabajo = {
  id: string
  folio: string
  titulo?: string
  descripcion_problema?: string
}

type Consulta = {
  id: string
  tipo: string
  pregunta: string
  respuesta?: string
  created_at?: string
  machines?: Equipo | null
  ordenes_trabajo?: OrdenTrabajo | null
}

const emptyForm = {
  tipo: 'tecnica',
  equipo_id: '',
  orden_trabajo_id: '',
  pregunta: '',
  respuesta: '',
}

function buildDraftAnswer(form: typeof emptyForm, equipos: Equipo[], ordenes: OrdenTrabajo[]) {
  const equipo = equipos.find((item) => item.id === form.equipo_id)
  const orden = ordenes.find((item) => item.id === form.orden_trabajo_id)
  const contexto = [
    equipo ? `Equipo: ${equipo.code} · ${equipo.name}${equipo.brand ? ` · ${equipo.brand}` : ''}${equipo.model ? ` ${equipo.model}` : ''}` : '',
    orden ? `OT: ${orden.folio}${orden.titulo ? ` · ${orden.titulo}` : ''}` : '',
  ].filter(Boolean)

  return [
    contexto.length ? `Contexto detectado:\n${contexto.join('\n')}` : 'Contexto detectado: sin equipo u OT asociada.',
    '',
    'Respuesta técnica sugerida:',
    '- Revisar síntomas reportados y condiciones de operación.',
    '- Validar presión, caudal, temperatura, fugas, contaminación y estado de sellos.',
    '- Registrar mediciones antes/después y adjuntar fotos si corresponde.',
    '- Si aplica, crear una OT o evento de historial para trazabilidad.',
    '',
    `Pregunta: ${form.pregunta || 'Sin pregunta ingresada.'}`,
  ].join('\n')
}

export function IATecnica() {
  const [consultas, setConsultas] = useState<Consulta[]>([])
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [ordenes, setOrdenes] = useState<OrdenTrabajo[]>([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')

    const [consultasResult, equiposResult, ordenesResult] = await Promise.all([
      supabase
        .from('ia_consultas')
        .select('*, machines(id, code, name, brand, model, serial), ordenes_trabajo(id, folio, titulo, descripcion_problema)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('machines')
        .select('id, code, name, brand, model, serial')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('ordenes_trabajo')
        .select('id, folio, titulo, descripcion_problema')
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    if (consultasResult.error) setMessage(consultasResult.error.message)
    setConsultas((consultasResult.data || []) as Consulta[])
    setEquipos((equiposResult.data || []) as Equipo[])
    setOrdenes((ordenesResult.data || []) as OrdenTrabajo[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const draftAnswer = useMemo(() => {
    return buildDraftAnswer(form, equipos, ordenes)
  }, [form, equipos, ordenes])

  function generateDraft() {
    setForm((current) => ({
      ...current,
      respuesta: buildDraftAnswer(current, equipos, ordenes),
    }))
  }

  async function save() {
    if (!form.pregunta.trim()) {
      setMessage('Ingresa una consulta técnica.')
      return
    }

    setSaving(true)
    setMessage('')

    const respuesta = form.respuesta.trim() || draftAnswer
    const { error } = await supabase.from('ia_consultas').insert({
      tipo: form.tipo,
      equipo_id: form.equipo_id || null,
      orden_trabajo_id: form.orden_trabajo_id || null,
      pregunta: form.pregunta.trim(),
      respuesta,
      metadata: {
        modo: 'asistente_base',
        generado_en_cliente: true,
      },
    })

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setForm(emptyForm)
    setMessage('Consulta técnica guardada.')
    await load()
  }

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-950">IA Técnica</h2>
          <p className="mt-2 text-slate-600">Registro de consultas técnicas con contexto de equipos, OT e historial operativo.</p>
        </div>

        <button onClick={load} disabled={loading || saving} className="inline-flex items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50">
          <RefreshCw size={18} />
          Actualizar
        </button>
      </div>

      {message && <div className="mb-4 rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-[460px_1fr]">
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <BrainCircuit className="text-blue-700" />
            <h3 className="text-lg font-bold text-slate-950">Nueva Consulta</h3>
          </div>

          <div className="grid gap-3">
            <select className="rounded border border-slate-300 px-3 py-3" value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value })}>
              <option value="tecnica">Técnica</option>
              <option value="diagnostico">Diagnóstico</option>
              <option value="repuestos">Repuestos</option>
              <option value="procedimiento">Procedimiento</option>
              <option value="comercial">Comercial técnico</option>
            </select>
            <select className="rounded border border-slate-300 px-3 py-3" value={form.equipo_id} onChange={(event) => setForm({ ...form, equipo_id: event.target.value })}>
              <option value="">Equipo</option>
              {equipos.map((equipo) => <option key={equipo.id} value={equipo.id}>{equipo.code} · {equipo.name}</option>)}
            </select>
            <select className="rounded border border-slate-300 px-3 py-3" value={form.orden_trabajo_id} onChange={(event) => setForm({ ...form, orden_trabajo_id: event.target.value })}>
              <option value="">Orden de trabajo</option>
              {ordenes.map((orden) => <option key={orden.id} value={orden.id}>{orden.folio} · {orden.titulo || orden.descripcion_problema || 'Sin título'}</option>)}
            </select>
            <textarea className="min-h-32 rounded border border-slate-300 px-3 py-3" placeholder="Pregunta técnica" value={form.pregunta} onChange={(event) => setForm({ ...form, pregunta: event.target.value })} />
            <textarea className="min-h-56 rounded border border-slate-300 px-3 py-3 font-mono text-sm" placeholder="Respuesta / recomendación" value={form.respuesta} onChange={(event) => setForm({ ...form, respuesta: event.target.value })} />
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button onClick={generateDraft} className="inline-flex flex-1 items-center justify-center gap-2 rounded bg-slate-800 px-4 py-3 font-semibold text-white">
              <Sparkles size={18} />
              Generar base
            </button>
            <button onClick={save} disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
              <Save size={18} />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-950">Consultas Guardadas</h3>
            <span className="text-sm text-slate-500">{consultas.length} registros</span>
          </div>

          <div className="space-y-3">
            {consultas.map((consulta) => (
              <div key={consulta.id} className="rounded border border-slate-200 p-4">
                <div className="mb-2 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold text-slate-950">{consulta.pregunta}</div>
                    <div className="text-sm text-slate-500">
                      {consulta.tipo} · {consulta.machines?.code || 'sin equipo'} · {consulta.ordenes_trabajo?.folio || 'sin OT'}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">{consulta.created_at || ''}</div>
                </div>
                <pre className="whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-700">{consulta.respuesta || 'Sin respuesta registrada.'}</pre>
              </div>
            ))}
            {!consultas.length && <div className="py-8 text-center text-slate-500">{loading ? 'Cargando consultas...' : 'No hay consultas técnicas guardadas.'}</div>}
          </div>
        </Card>
      </div>
    </div>
  )
}
