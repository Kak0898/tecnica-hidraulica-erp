import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowUpRight, BarChart3, CheckCircle2, ExternalLink, Lightbulb, MousePointerClick, Plus, RefreshCw, Search, Settings2, Sparkles, Target } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from '../components/Card'
import { useEmpresa } from '../lib/empresa'
import { supabase } from '../lib/supabase'

type Campana = {
  id: string
  nombre: string
  google_campaign_id?: string
  tipo: string
  estado: string
  presupuesto_diario: number
  objetivo_cpa: number
  objetivo_roas: number
  url_google_ads?: string
}

type Metrica = {
  id: string
  campana_id: string
  fecha: string
  impresiones: number
  clics: number
  costo: number
  conversiones: number
  valor_conversiones: number
  cuota_impresiones: number
  perdida_presupuesto: number
  google_ads_campanas?: Campana | null
}

type Recomendacion = {
  id: string
  campana_id?: string
  fecha: string
  prioridad: 'alta' | 'media' | 'baja'
  titulo: string
  detalle: string
  estado: 'pendiente' | 'aplicada' | 'descartada'
  google_ads_campanas?: { nombre: string } | null
}

const today = new Date().toISOString().slice(0, 10)

const emptyCampaign = {
  nombre: '',
  google_campaign_id: '',
  tipo: 'busqueda',
  estado: 'habilitada',
  presupuesto_diario: 0,
  objetivo_cpa: 0,
  objetivo_roas: 0,
  url_google_ads: '',
}

const emptyMetric = {
  campana_id: '',
  fecha: today,
  impresiones: 0,
  clics: 0,
  costo: 0,
  conversiones: 0,
  valor_conversiones: 0,
  cuota_impresiones: 0,
  perdida_presupuesto: 0,
}

const googleLinks = [
  { title: 'Campañas', detail: 'Presupuesto y estado', href: 'https://ads.google.com/aw/campaigns', icon: BarChart3 },
  { title: 'Términos de búsqueda', detail: 'Qué buscaron los clientes', href: 'https://ads.google.com/aw/keywords/searchterms', icon: Search },
  { title: 'Recomendaciones', detail: 'Sugerencias de Google', href: 'https://ads.google.com/aw/recommendations', icon: Sparkles },
  { title: 'Conversiones', detail: 'Llamadas y formularios', href: 'https://ads.google.com/aw/conversions', icon: Target },
]

function money(value: number) {
  return `$${Math.round(Number(value || 0)).toLocaleString('es-CL')}`
}

function decimal(value: number, digits = 1) {
  return Number(value || 0).toLocaleString('es-CL', { maximumFractionDigits: digits })
}

function priorityClass(priority: string) {
  if (priority === 'alta') return 'border-red-200 bg-red-50 text-red-800'
  if (priority === 'media') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-blue-200 bg-blue-50 text-blue-800'
}

export function GoogleAds() {
  const { activeEmpresaId } = useEmpresa()
  const [campaigns, setCampaigns] = useState<Campana[]>([])
  const [metrics, setMetrics] = useState<Metrica[]>([])
  const [recommendations, setRecommendations] = useState<Recomendacion[]>([])
  const [campaignForm, setCampaignForm] = useState(emptyCampaign)
  const [metricForm, setMetricForm] = useState(emptyMetric)
  const [showSetup, setShowSetup] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')

    const [campaignResult, metricResult, recommendationResult] = await Promise.all([
      supabase.from('google_ads_campanas').select('*').order('nombre'),
      supabase
        .from('google_ads_metricas_diarias')
        .select('*, google_ads_campanas(id, nombre, google_campaign_id, tipo, estado, presupuesto_diario, objetivo_cpa, objetivo_roas, url_google_ads)')
        .order('fecha', { ascending: false })
        .limit(180),
      supabase
        .from('google_ads_recomendaciones')
        .select('*, google_ads_campanas(nombre)')
        .eq('estado', 'pendiente')
        .order('fecha', { ascending: false })
        .limit(30),
    ])

    if (campaignResult.error) {
      setMessage('Falta instalar el módulo Google Ads en la base de datos. Ejecuta el SQL completo entregado con el sistema.')
    }

    setCampaigns((campaignResult.data || []) as Campana[])
    setMetrics((metricResult.data || []) as Metrica[])
    setRecommendations((recommendationResult.data || []) as Recomendacion[])
    setLoading(false)
  }

  useEffect(() => {
    if (activeEmpresaId) load()
  }, [activeEmpresaId])

  const latestDate = metrics[0]?.fecha || ''
  const latestMetrics = useMemo(() => metrics.filter((metric) => metric.fecha === latestDate), [metrics, latestDate])

  const summary = useMemo(() => {
    const total = latestMetrics.reduce((result, metric) => ({
      impressions: result.impressions + Number(metric.impresiones || 0),
      clicks: result.clicks + Number(metric.clics || 0),
      cost: result.cost + Number(metric.costo || 0),
      conversions: result.conversions + Number(metric.conversiones || 0),
      conversionValue: result.conversionValue + Number(metric.valor_conversiones || 0),
    }), { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 })

    return {
      ...total,
      ctr: total.impressions ? (total.clicks / total.impressions) * 100 : 0,
      cpc: total.clicks ? total.cost / total.clicks : 0,
      cpa: total.conversions ? total.cost / total.conversions : 0,
      roas: total.cost ? total.conversionValue / total.cost : 0,
    }
  }, [latestMetrics])

  const trend = useMemo(() => {
    const byDate = new Map<string, { fecha: string; costo: number; conversiones: number }>()
    metrics.forEach((metric) => {
      const current = byDate.get(metric.fecha) || { fecha: metric.fecha, costo: 0, conversiones: 0 }
      current.costo += Number(metric.costo || 0)
      current.conversiones += Number(metric.conversiones || 0)
      byDate.set(metric.fecha, current)
    })
    return Array.from(byDate.values()).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(-14)
  }, [metrics])

  const automaticSuggestions = useMemo(() => {
    if (!latestMetrics.length) return []
    const suggestions: Array<{ title: string; detail: string; priority: 'alta' | 'media' | 'baja' }> = []

    latestMetrics.forEach((metric) => {
      const name = metric.google_ads_campanas?.nombre || 'Campaña'
      const ctr = metric.impresiones ? (Number(metric.clics) / Number(metric.impresiones)) * 100 : 0
      const cpa = metric.conversiones ? Number(metric.costo) / Number(metric.conversiones) : 0
      const target = Number(metric.google_ads_campanas?.objetivo_cpa || 0)

      if (Number(metric.clics) >= 20 && Number(metric.conversiones) === 0) {
        suggestions.push({ title: `Revisar conversiones en ${name}`, detail: 'Hay al menos 20 clics sin resultados. Revisa términos, página de destino y medición de llamadas/formularios.', priority: 'alta' })
      } else if (target > 0 && cpa > target * 1.25) {
        suggestions.push({ title: `CPA sobre objetivo en ${name}`, detail: `El costo por conversión es ${money(cpa)} y el objetivo es ${money(target)}. Ajusta búsquedas, ubicaciones u oferta.`, priority: 'alta' })
      }

      if (Number(metric.impresiones) >= 100 && ctr < 3) {
        suggestions.push({ title: `Mejorar CTR en ${name}`, detail: `El CTR es ${decimal(ctr, 2)}%. Prueba títulos más específicos y agrega términos no relevantes como negativas.`, priority: 'media' })
      }

      if (Number(metric.perdida_presupuesto) >= 15) {
        suggestions.push({ title: `Campaña limitada por presupuesto`, detail: `${name} pierde ${decimal(metric.perdida_presupuesto)}% de impresiones por presupuesto. Prioriza horarios y términos con conversiones antes de aumentarlo.`, priority: 'media' })
      }
    })

    if (!suggestions.length) suggestions.push({ title: 'Sin alertas críticas', detail: 'Las métricas cargadas no muestran desvíos importantes. Revisa términos de búsqueda y conversiones antes de cambiar presupuesto.', priority: 'baja' })
    return suggestions.slice(0, 6)
  }, [latestMetrics])

  async function saveCampaign() {
    if (!campaignForm.nombre.trim()) {
      setMessage('Ingresa el nombre de la campaña.')
      return
    }

    setSaving(true)
    const { error } = await supabase.from('google_ads_campanas').insert({
      nombre: campaignForm.nombre.trim(),
      google_campaign_id: campaignForm.google_campaign_id.trim() || null,
      tipo: campaignForm.tipo,
      estado: campaignForm.estado,
      presupuesto_diario: Number(campaignForm.presupuesto_diario || 0),
      objetivo_cpa: Number(campaignForm.objetivo_cpa || 0),
      objetivo_roas: Number(campaignForm.objetivo_roas || 0),
      url_google_ads: campaignForm.url_google_ads.trim() || null,
    })
    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setCampaignForm(emptyCampaign)
    setMessage('Campaña agregada.')
    await load()
  }

  async function saveMetric() {
    if (!metricForm.campana_id) {
      setMessage('Selecciona una campaña.')
      return
    }

    setSaving(true)
    const { error } = await supabase.from('google_ads_metricas_diarias').upsert({
      campana_id: metricForm.campana_id,
      fecha: metricForm.fecha,
      impresiones: Number(metricForm.impresiones || 0),
      clics: Number(metricForm.clics || 0),
      costo: Number(metricForm.costo || 0),
      conversiones: Number(metricForm.conversiones || 0),
      valor_conversiones: Number(metricForm.valor_conversiones || 0),
      cuota_impresiones: Number(metricForm.cuota_impresiones || 0),
      perdida_presupuesto: Number(metricForm.perdida_presupuesto || 0),
    }, { onConflict: 'campana_id,fecha' })

    if (!error) await supabase.rpc('generar_recomendaciones_google_ads', { p_fecha: metricForm.fecha })
    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setMetricForm((current) => ({ ...emptyMetric, campana_id: current.campana_id, fecha: current.fecha }))
    setMessage('Métricas guardadas y recomendaciones actualizadas.')
    await load()
  }

  async function resolveRecommendation(id: string, status: 'aplicada' | 'descartada') {
    const { error } = await supabase.from('google_ads_recomendaciones').update({ estado: status, resuelta_at: new Date().toISOString() }).eq('id', id)
    if (error) {
      setMessage(error.message)
      return
    }
    setRecommendations((current) => current.filter((item) => item.id !== id))
  }

  return (
    <div className="mx-auto max-w-[1500px] pb-10">
      <div className="mb-7 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-blue-700"><BarChart3 size={17} /> Marketing digital</div>
          <h2 className="text-3xl font-black tracking-tight text-slate-950">Google Ads, sin ruido</h2>
          <p className="mt-2 max-w-3xl text-slate-600">Inversión, resultados y acciones concretas para revisar cada día. Último dato: {latestDate || 'sin métricas cargadas'}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowSetup((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><Settings2 size={18} /> Configurar</button>
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={18} /> Actualizar</button>
          <a href="https://ads.google.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-700/20 hover:bg-blue-800"><ExternalLink size={18} /> Abrir Google Ads</a>
        </div>
      </div>

      {message && <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{message}</div>}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Inversión" value={money(summary.cost)} detail={latestDate || 'Sin fecha'} icon={<BarChart3 />} />
        <MetricCard title="Clics" value={summary.clicks.toLocaleString('es-CL')} detail={`CTR ${decimal(summary.ctr, 2)}%`} icon={<MousePointerClick />} />
        <MetricCard title="Conversiones" value={decimal(summary.conversions, 2)} detail={`CPA ${money(summary.cpa)}`} icon={<Target />} tone="green" />
        <MetricCard title="Costo por clic" value={money(summary.cpc)} detail={`${summary.impressions.toLocaleString('es-CL')} impresiones`} icon={<ArrowUpRight />} />
        <MetricCard title="ROAS" value={`${decimal(summary.roas, 2)}x`} detail={summary.roas >= 1 ? 'Retorno positivo informado' : 'Revisar valor de conversiones'} icon={<Sparkles />} tone={summary.roas >= 1 ? 'green' : 'amber'} />
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {googleLinks.map((link) => {
          const Icon = link.icon
          return <a key={link.title} href={link.href} target="_blank" rel="noreferrer" className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-700"><Icon size={21} /></div>
            <div className="min-w-0 flex-1"><p className="font-bold text-slate-950">{link.title}</p><p className="text-sm text-slate-500">{link.detail}</p></div>
            <ArrowUpRight className="text-slate-300 group-hover:text-blue-600" size={18} />
          </a>
        })}
      </div>

      {showSetup && (
        <div className="mb-5 grid gap-5 xl:grid-cols-2">
          <Card>
            <SectionTitle icon={<Plus />} title="Agregar campaña" subtitle="Registra solo lo necesario para evaluar resultados." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Nombre" value={campaignForm.nombre} onChange={(value) => setCampaignForm({ ...campaignForm, nombre: value })} placeholder="Búsqueda · Servicio hidráulico" />
              <Input label="ID de Google (opcional)" value={campaignForm.google_campaign_id} onChange={(value) => setCampaignForm({ ...campaignForm, google_campaign_id: value })} placeholder="123456789" />
              <Select label="Tipo" value={campaignForm.tipo} onChange={(value) => setCampaignForm({ ...campaignForm, tipo: value })} options={[['busqueda', 'Búsqueda'], ['performance_max', 'Performance Max'], ['display', 'Display'], ['video', 'Video'], ['otro', 'Otro']]} />
              <Select label="Estado" value={campaignForm.estado} onChange={(value) => setCampaignForm({ ...campaignForm, estado: value })} options={[['habilitada', 'Habilitada'], ['pausada', 'Pausada'], ['finalizada', 'Finalizada']]} />
              <NumberInput label="Presupuesto diario" value={campaignForm.presupuesto_diario} onChange={(value) => setCampaignForm({ ...campaignForm, presupuesto_diario: value })} />
              <NumberInput label="CPA objetivo" value={campaignForm.objetivo_cpa} onChange={(value) => setCampaignForm({ ...campaignForm, objetivo_cpa: value })} />
              <NumberInput label="ROAS objetivo" value={campaignForm.objetivo_roas} onChange={(value) => setCampaignForm({ ...campaignForm, objetivo_roas: value })} step="0.1" />
              <Input label="Enlace directo (opcional)" value={campaignForm.url_google_ads} onChange={(value) => setCampaignForm({ ...campaignForm, url_google_ads: value })} placeholder="https://ads.google.com/..." />
            </div>
            <button onClick={saveCampaign} disabled={saving} className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 font-bold text-white disabled:opacity-50">Guardar campaña</button>
          </Card>

          <Card>
            <SectionTitle icon={<BarChart3 />} title="Cargar resultado diario" subtitle="Puedes copiar estos datos desde la vista Campañas de Google Ads." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Campaña" value={metricForm.campana_id} onChange={(value) => setMetricForm({ ...metricForm, campana_id: value })} options={campaigns.map((campaign) => [campaign.id, campaign.nombre])} placeholder="Selecciona una campaña" />
              <Input label="Fecha" type="date" value={metricForm.fecha} onChange={(value) => setMetricForm({ ...metricForm, fecha: value })} />
              <NumberInput label="Impresiones" value={metricForm.impresiones} onChange={(value) => setMetricForm({ ...metricForm, impresiones: value })} />
              <NumberInput label="Clics" value={metricForm.clics} onChange={(value) => setMetricForm({ ...metricForm, clics: value })} />
              <NumberInput label="Costo" value={metricForm.costo} onChange={(value) => setMetricForm({ ...metricForm, costo: value })} />
              <NumberInput label="Conversiones" value={metricForm.conversiones} onChange={(value) => setMetricForm({ ...metricForm, conversiones: value })} step="0.01" />
              <NumberInput label="Valor conversiones" value={metricForm.valor_conversiones} onChange={(value) => setMetricForm({ ...metricForm, valor_conversiones: value })} />
              <NumberInput label="Cuota impresiones %" value={metricForm.cuota_impresiones} onChange={(value) => setMetricForm({ ...metricForm, cuota_impresiones: value })} step="0.1" />
              <NumberInput label="Pérdida por presupuesto %" value={metricForm.perdida_presupuesto} onChange={(value) => setMetricForm({ ...metricForm, perdida_presupuesto: value })} step="0.1" />
            </div>
            <button onClick={saveMetric} disabled={saving || !campaigns.length} className="mt-4 w-full rounded-xl bg-blue-700 px-4 py-3 font-bold text-white disabled:opacity-50">Guardar métricas y analizar</button>
          </Card>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <SectionTitle icon={<BarChart3 />} title="Tendencia de 14 días" subtitle="Costo y conversiones registradas." />
          <div className="h-80 min-h-80">
            {trend.length ? <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
              <ComposedChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="fecha" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="cost" tickFormatter={(value) => `$${Math.round(value / 1000)}k`} tick={{ fontSize: 12 }} />
                <YAxis yAxisId="conversions" orientation="right" tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value, name) => name === 'Costo' ? money(Number(value)) : decimal(Number(value), 2)} />
                <Bar yAxisId="cost" dataKey="costo" name="Costo" fill="#2563eb" radius={[5, 5, 0, 0]} />
                <Line yAxisId="conversions" type="monotone" dataKey="conversiones" name="Conversiones" stroke="#16a34a" strokeWidth={3} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer> : <EmptyState text="Carga la primera métrica diaria para ver la tendencia." />}
          </div>
        </Card>

        <Card>
          <SectionTitle icon={<Lightbulb />} title="Qué hacer hoy" subtitle="Alertas basadas en los últimos datos." />
          <div className="space-y-3">
            {(recommendations.length ? recommendations : automaticSuggestions).map((item, index) => {
              const persisted = 'id' in item
              const priority = 'prioridad' in item ? item.prioridad : item.priority
              const title = 'titulo' in item ? item.titulo : item.title
              const detail = 'detalle' in item ? item.detalle : item.detail
              return <div key={persisted ? item.id : `${title}-${index}`} className={`rounded-xl border p-4 ${priorityClass(priority)}`}>
                <div className="flex items-start gap-3">
                  {priority === 'alta' ? <AlertTriangle className="mt-0.5 shrink-0" size={19} /> : <Lightbulb className="mt-0.5 shrink-0" size={19} />}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{title}</p>
                    <p className="mt-1 text-sm leading-5 opacity-85">{detail}</p>
                    {persisted && <div className="mt-3 flex gap-2">
                      <button onClick={() => resolveRecommendation(item.id, 'aplicada')} className="inline-flex items-center gap-1 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs font-bold"><CheckCircle2 size={14} /> Aplicada</button>
                      <button onClick={() => resolveRecommendation(item.id, 'descartada')} className="rounded-lg bg-white/70 px-2.5 py-1.5 text-xs font-bold">Descartar</button>
                    </div>}
                  </div>
                </div>
              </div>
            })}
            {!recommendations.length && !automaticSuggestions.length && <EmptyState text="Las recomendaciones aparecerán al cargar métricas." />}
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <SectionTitle icon={<Target />} title="Campañas del último día" subtitle="Las métricas indispensables, sin columnas innecesarias." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="pb-3">Campaña</th><th className="pb-3">Costo</th><th className="pb-3">Clics</th><th className="pb-3">CTR</th><th className="pb-3">Conversiones</th><th className="pb-3">CPA</th><th className="pb-3">Pérdida presupuesto</th><th className="pb-3 text-right">Google Ads</th></tr></thead>
            <tbody>{latestMetrics.map((metric) => {
              const campaign = metric.google_ads_campanas
              const ctr = metric.impresiones ? Number(metric.clics) / Number(metric.impresiones) * 100 : 0
              const cpa = metric.conversiones ? Number(metric.costo) / Number(metric.conversiones) : 0
              return <tr key={metric.id} className="border-b border-slate-100">
                <td className="py-4"><p className="font-bold text-slate-950">{campaign?.nombre || 'Campaña'}</p><p className="text-xs text-slate-500">{campaign?.tipo || '-'}</p></td>
                <td className="py-4 font-semibold">{money(metric.costo)}</td><td className="py-4">{metric.clics}</td><td className="py-4">{decimal(ctr, 2)}%</td><td className="py-4 font-bold text-emerald-700">{decimal(metric.conversiones, 2)}</td><td className="py-4">{money(cpa)}</td><td className="py-4">{decimal(metric.perdida_presupuesto)}%</td>
                <td className="py-4 text-right"><a href={campaign?.url_google_ads || 'https://ads.google.com/aw/campaigns'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-blue-700">Abrir <ExternalLink size={14} /></a></td>
              </tr>
            })}</tbody>
          </table>
          {!latestMetrics.length && <div className="py-10 text-center text-sm text-slate-500">{loading ? 'Cargando campañas...' : 'No hay métricas registradas.'}</div>}
        </div>
      </Card>
    </div>
  )
}

function MetricCard({ title, value, detail, icon, tone = 'blue' }: { title: string; value: string; detail: string; icon: React.ReactNode; tone?: 'blue' | 'green' | 'amber' }) {
  const classes = tone === 'green' ? 'bg-emerald-50 text-emerald-700' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
  return <Card><div className={`mb-4 w-fit rounded-xl p-2.5 ${classes}`}>{icon}</div><p className="text-sm font-medium text-slate-500">{title}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></Card>
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return <div className="mb-5 flex items-start gap-3"><div className="rounded-lg bg-slate-100 p-2 text-slate-700">{icon}</div><div><h3 className="font-black text-slate-950">{title}</h3><p className="mt-0.5 text-sm text-slate-500">{subtitle}</p></div></div>
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500">{text}</div>
}

function Input({ label, value, onChange, placeholder = '', type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-3 focus:ring-blue-100" /></label>
}

function NumberInput({ label, value, onChange, step = '1' }: { label: string; value: number; onChange: (value: number) => void; step?: string }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span><input type="number" min="0" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-3 focus:ring-blue-100" /></label>
}

function Select({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (value: string) => void; options: string[][]; placeholder?: string }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-3 focus:ring-blue-100">{placeholder && <option value="">{placeholder}</option>}{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>
}
