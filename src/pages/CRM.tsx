import { useEffect, useMemo, useState } from 'react'
import { BriefcaseBusiness, DollarSign, RefreshCw, TrendingUp } from 'lucide-react'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
import { supabase } from '../lib/supabase'

type Cliente = {
  id: string
  razon_social: string
}

type Oportunidad = {
  id: string
  nombre: string
  etapa: string
  valor_estimado: number
  probabilidad: number
  fecha_cierre_estimada?: string
  notas?: string
  clientes?: Cliente | null
  created_at?: string
}

const etapas = [
  ['prospecto', 'Prospecto'],
  ['contactado', 'Contactado'],
  ['cotizando', 'Cotizando'],
  ['negociacion', 'Negociación'],
  ['ganada', 'Ganada'],
  ['perdida', 'Perdida'],
]

const emptyForm = {
  nombre: '',
  cliente_id: '',
  etapa: 'prospecto',
  valor_estimado: 0,
  probabilidad: 10,
  fecha_cierre_estimada: '',
  notas: '',
}

function money(value: number) {
  return `$${Math.round(Number(value || 0)).toLocaleString('es-CL')}`
}

function etapaLabel(value: string) {
  return etapas.find(([key]) => key === value)?.[1] || value
}

function tone(etapa: string) {
  if (etapa === 'ganada') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (etapa === 'perdida') return 'bg-red-50 text-red-700 border-red-200'
  if (etapa === 'negociacion' || etapa === 'cotizando') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-blue-50 text-blue-700 border-blue-200'
}

export function CRM() {
  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')

    const [oppsResult, clientesResult] = await Promise.all([
      supabase
        .from('crm_oportunidades')
        .select('*, clientes(id, razon_social)')
        .order('created_at', { ascending: false }),
      supabase
        .from('clientes')
        .select('id, razon_social')
        .order('razon_social', { ascending: true }),
    ])

    if (oppsResult.error) setMessage(oppsResult.error.message)

    setOportunidades((oppsResult.data || []) as Oportunidad[])
    setClientes((clientesResult.data || []) as Cliente[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const stats = useMemo(() => {
    const abiertas = oportunidades.filter((item) => !['ganada', 'perdida'].includes(item.etapa))
    const valorPipeline = abiertas.reduce((sum, item) => sum + Number(item.valor_estimado || 0), 0)
    const ponderado = abiertas.reduce((sum, item) => sum + Number(item.valor_estimado || 0) * (Number(item.probabilidad || 0) / 100), 0)
    const ganadas = oportunidades.filter((item) => item.etapa === 'ganada').reduce((sum, item) => sum + Number(item.valor_estimado || 0), 0)

    return { abiertas: abiertas.length, valorPipeline, ponderado, ganadas }
  }, [oportunidades])

  async function save() {
    if (!form.nombre.trim()) {
      setMessage('Ingresa el nombre de la oportunidad.')
      return
    }

    setSaving(true)
    setMessage('')

    const { error } = await supabase.from('crm_oportunidades').insert({
      nombre: form.nombre.trim(),
      cliente_id: form.cliente_id || null,
      etapa: form.etapa,
      valor_estimado: Number(form.valor_estimado || 0),
      probabilidad: Number(form.probabilidad || 0),
      fecha_cierre_estimada: form.fecha_cierre_estimada || null,
      notas: form.notas.trim() || null,
    })

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setForm(emptyForm)
    setMessage('Oportunidad creada.')
    await load()
  }

  async function updateEtapa(id: string, etapa: string) {
    const { error } = await supabase
      .from('crm_oportunidades')
      .update({ etapa })
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setOportunidades((current) => current.map((item) => item.id === id ? { ...item, etapa } : item))
  }

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-950">CRM Comercial</h2>
          <p className="mt-2 text-slate-600">Pipeline comercial conectado a clientes, cotizaciones y seguimiento gerencial.</p>
        </div>

        <button onClick={load} disabled={loading || saving} className="inline-flex items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50">
          <RefreshCw size={18} />
          {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      <FeedbackToast message={message} onClose={() => setMessage('')} />

      <div className="mb-4 grid gap-4 md:grid-cols-4">
        <Card>
          <div className="flex items-center gap-3">
            <BriefcaseBusiness className="text-blue-700" />
            <div>
              <p className="text-sm text-slate-500">Abiertas</p>
              <p className="text-2xl font-bold text-slate-950">{stats.abiertas}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <DollarSign className="text-emerald-700" />
            <div>
              <p className="text-sm text-slate-500">Pipeline</p>
              <p className="text-2xl font-bold text-slate-950">{money(stats.valorPipeline)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <TrendingUp className="text-amber-700" />
            <div>
              <p className="text-sm text-slate-500">Ponderado</p>
              <p className="text-2xl font-bold text-slate-950">{money(stats.ponderado)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div>
            <p className="text-sm text-slate-500">Ganadas</p>
            <p className="text-2xl font-bold text-slate-950">{money(stats.ganadas)}</p>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <Card>
          <h3 className="mb-4 text-lg font-bold text-slate-950">Nueva Oportunidad</h3>
          <div className="grid gap-3">
            <input className="rounded border border-slate-300 px-3 py-3" placeholder="Nombre oportunidad" value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} />
            <select className="rounded border border-slate-300 px-3 py-3" value={form.cliente_id} onChange={(event) => setForm({ ...form, cliente_id: event.target.value })}>
              <option value="">Cliente</option>
              {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.razon_social}</option>)}
            </select>
            <div className="grid gap-3 sm:grid-cols-2">
              <select className="rounded border border-slate-300 px-3 py-3" value={form.etapa} onChange={(event) => setForm({ ...form, etapa: event.target.value })}>
                {etapas.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <input className="rounded border border-slate-300 px-3 py-3" type="date" value={form.fecha_cierre_estimada} onChange={(event) => setForm({ ...form, fecha_cierre_estimada: event.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded border border-slate-300 px-3 py-3" type="number" placeholder="Valor estimado" value={form.valor_estimado} onChange={(event) => setForm({ ...form, valor_estimado: Number(event.target.value) })} />
              <input className="rounded border border-slate-300 px-3 py-3" type="number" min={0} max={100} placeholder="Probabilidad %" value={form.probabilidad} onChange={(event) => setForm({ ...form, probabilidad: Number(event.target.value) })} />
            </div>
            <textarea className="min-h-28 rounded border border-slate-300 px-3 py-3" placeholder="Notas comerciales" value={form.notas} onChange={(event) => setForm({ ...form, notas: event.target.value })} />
          </div>

          <button onClick={save} disabled={saving} className="mt-4 w-full rounded bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
            {saving ? 'Guardando...' : 'Crear oportunidad'}
          </button>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-950">Pipeline</h3>
            <span className="text-sm text-slate-500">{oportunidades.length} oportunidades</span>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-3">Oportunidad</th>
                  <th className="py-3">Cliente</th>
                  <th className="py-3">Etapa</th>
                  <th className="py-3">Valor</th>
                  <th className="py-3">Prob.</th>
                  <th className="py-3">Cierre</th>
                </tr>
              </thead>
              <tbody>
                {oportunidades.map((item) => (
                  <tr key={item.id} className="border-b align-top">
                    <td className="py-3">
                      <div className="font-semibold text-slate-950">{item.nombre}</div>
                      <div className="max-w-xs text-slate-500">{item.notas || '-'}</div>
                    </td>
                    <td className="py-3">{item.clientes?.razon_social || '-'}</td>
                    <td className="py-3">
                      <select className={`rounded border px-2 py-1 text-xs font-semibold ${tone(item.etapa)}`} value={item.etapa} onChange={(event) => updateEtapa(item.id, event.target.value)}>
                        {etapas.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </select>
                    </td>
                    <td className="py-3 font-semibold">{money(item.valor_estimado)}</td>
                    <td className="py-3">{item.probabilidad}%</td>
                    <td className="py-3">{item.fecha_cierre_estimada || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!oportunidades.length && <div className="py-8 text-center text-slate-500">{loading ? 'Cargando oportunidades...' : 'No hay oportunidades comerciales.'}</div>}
          </div>
        </Card>
      </div>
    </div>
  )
}
