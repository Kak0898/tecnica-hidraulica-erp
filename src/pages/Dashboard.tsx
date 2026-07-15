import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  DollarSign,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Truck,
  Wrench,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'

type MachineRow = {
  id?: string
  code?: string
  name?: string
  conteo?: string
  brand?: string
  model?: string
  serial?: string
  tipo?: string
  location?: string
  estado_fisico?: string
  disponibilidad?: string
}

type SparePartRow = {
  id?: string
  code?: string
  name?: string
  brand?: string
  category?: string
  location?: string
  stock?: number
  min_stock?: number
  unit_price?: number
  unit?: string
  supplier?: string
  notes?: string
}

type KpiCardProps = {
  title: string
  value: string | number
  detail: string
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'slate'
  icon: React.ReactNode
}

function normalizar(value: any) {
  return String(value ?? '').trim().toLowerCase()
}

function numero(value: any) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function porcentaje(value: number, total: number) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

function formatoDinero(value: number) {
  return `$${Math.round(value).toLocaleString('es-CL')}`
}

function etiqueta(value?: string, fallback = 'Sin dato') {
  const text = String(value || '').trim()
  return text ? text.replace(/_/g, ' ') : fallback
}

function topEntries(
  rows: Array<Record<string, any>>,
  field: string,
  fallback: string,
  limit = 6,
) {
  const totals = rows.reduce<Record<string, number>>((acc, row) => {
    const key = etiqueta(row[field], fallback)
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  return Object.entries(totals)
    .map(([name, cantidad]) => ({ name, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, limit)
}

function stockEntries(rows: SparePartRow[], field: keyof SparePartRow, fallback: string, limit = 6) {
  const totals = rows.reduce<Record<string, number>>((acc, row) => {
    const key = etiqueta(String(row[field] || ''), fallback)
    acc[key] = (acc[key] || 0) + numero(row.stock)
    return acc
  }, {})

  return Object.entries(totals)
    .map(([name, stock]) => ({ name, stock }))
    .sort((a, b) => b.stock - a.stock)
    .slice(0, limit)
}

function compactName(value: string) {
  return value.length > 16 ? `${value.slice(0, 15)}...` : value
}

function esBuenEstado(value?: string) {
  const estadoFisico = normalizar(value)

  return estadoFisico === 'buen_estado' || estadoFisico === 'buen estado' || estadoFisico === 'bueno'
}

function badgeClass(value?: string) {
  const estado = normalizar(value)

  if (estado.includes('activo') || estado.includes('disponible') || estado.includes('buen')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }

  if (estado.includes('mantenimiento') || estado.includes('regular') || estado.includes('revision')) {
    return 'bg-amber-50 text-amber-700 border-amber-200'
  }

  if (estado.includes('inactivo') || estado.includes('baja') || estado.includes('malo') || estado.includes('no oper')) {
    return 'bg-red-50 text-red-700 border-red-200'
  }

  return 'bg-slate-50 text-slate-700 border-slate-200'
}

function Badge({ value }: { value?: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClass(value)}`}>
      {etiqueta(value)}
    </span>
  )
}

function KpiCard({ title, value, detail, tone = 'slate', icon }: KpiCardProps) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-slate-100 text-slate-700',
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <h3 className="mt-2 text-4xl font-bold text-slate-950">{value}</h3>
          <p className="mt-2 text-sm text-slate-600">{detail}</p>
        </div>

        <div className={`rounded p-3 ${tones[tone]}`}>{icon}</div>
      </div>
    </Card>
  )
}

function ChartTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
  )
}

function EmptyChart({ text = 'Sin datos para graficar.' }: { text?: string }) {
  return (
    <div className="flex h-full min-h-full items-center justify-center rounded border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
      {text}
    </div>
  )
}

const colores = ['#2563eb', '#16a34a', '#f97316', '#dc2626', '#7c3aed', '#0891b2', '#475569']

export function Dashboard() {
  const [machines, setMachines] = useState<MachineRow[]>([])
  const [spareParts, setSpareParts] = useState<SparePartRow[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)

    const { data: machinesData, error: machinesError } = await supabase
      .from('machines')
      .select('*')
      .order('created_at', { ascending: false })

    if (machinesError) {
      setMessage(machinesError.message)
      setLoading(false)
      return
    }

    const { data: sparePartsData, error: sparePartsError } = await supabase
      .from('spare_parts')
      .select('*')
      .order('created_at', { ascending: false })

    if (sparePartsError) {
      setMessage(sparePartsError.message)
      setLoading(false)
      return
    }

    setMachines(machinesData || [])
    setSpareParts(sparePartsData || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const stats = useMemo(() => {
    const totalMachines = machines.length
    const totalSpareParts = spareParts.length

    const disponibles = machines.filter((m) => normalizar(m.disponibilidad).includes('disponible')).length
    const arrendadas = machines.filter((m) => normalizar(m.disponibilidad).includes('arrendada')).length
    const noOperativas = machines.filter((m) => {
      const disponibilidad = normalizar(m.disponibilidad)
      const fisico = normalizar(m.estado_fisico)

      return (
        disponibilidad.includes('no oper') ||
        disponibilidad.includes('revision') ||
        fisico.includes('malo')
      )
    }).length

    const buenEstado = machines.filter((m) => esBuenEstado(m.estado_fisico)).length
    const regular = machines.filter((m) => normalizar(m.estado_fisico).includes('regular')).length
    const malo = machines.filter((m) => normalizar(m.estado_fisico).includes('malo')).length

    const marcasData = topEntries(machines as Array<Record<string, any>>, 'brand', 'Sin marca')
    const tiposData = topEntries(machines as Array<Record<string, any>>, 'tipo', 'Sin tipo')
    const ubicacionesData = topEntries(machines as Array<Record<string, any>>, 'location', 'Sin ubicación')

    const estadoFisicoData = topEntries(machines as Array<Record<string, any>>, 'estado_fisico', 'Sin estado físico').map((item) => ({
      estado: item.name,
      cantidad: item.cantidad,
    }))

    const disponibilidadData = topEntries(machines as Array<Record<string, any>>, 'disponibilidad', 'Sin dato').map((item) => ({
      estado: item.name,
      cantidad: item.cantidad,
    }))

    const valorInventario = spareParts.reduce((acc, r) => {
      return acc + numero(r.stock) * numero(r.unit_price)
    }, 0)

    const bajoStock = spareParts.filter((r) => {
      return numero(r.stock) <= numero(r.min_stock) && numero(r.stock) > 0
    }).length

    const sinStock = spareParts.filter((r) => numero(r.stock) <= 0).length
    const repuestosCriticos = spareParts
      .filter((r) => numero(r.stock) <= numero(r.min_stock))
      .sort((a, b) => numero(a.stock) - numero(b.stock))
      .slice(0, 6)

    const categoriasData = topEntries(spareParts as Array<Record<string, any>>, 'category', 'Sin categoría')
    const proveedoresData = topEntries(spareParts as Array<Record<string, any>>, 'supplier', 'Sin proveedor')
    const stockPorUbicacion = stockEntries(spareParts, 'location', 'Sin ubicación')

    const saludFlota = porcentaje(buenEstado, totalMachines)
    const disponibilidadComercial = porcentaje(disponibles + arrendadas, totalMachines)
    const riesgoRepuestos = porcentaje(bajoStock + sinStock, totalSpareParts)

    const maquinasPrioritarias = machines
      .filter((m) => {
        const disponibilidad = normalizar(m.disponibilidad)
        const fisico = normalizar(m.estado_fisico)
        return (
          disponibilidad.includes('no oper') ||
          disponibilidad.includes('revision') ||
          fisico.includes('regular') ||
          fisico.includes('malo')
        )
      })
      .slice(0, 6)

    return {
      totalMachines,
      totalSpareParts,
      disponibles,
      arrendadas,
      noOperativas,
      buenEstado,
      regular,
      malo,
      marcasData,
      tiposData,
      ubicacionesData,
      estadoFisicoData,
      disponibilidadData,
      valorInventario,
      bajoStock,
      sinStock,
      repuestosCriticos,
      categoriasData,
      proveedoresData,
      stockPorUbicacion,
      saludFlota,
      disponibilidadComercial,
      riesgoRepuestos,
      maquinasPrioritarias,
    }
  }, [machines, spareParts])

  if (loading) {
    return (
      <div>
        <h2 className="text-3xl font-bold mb-6">Dashboard Comercial</h2>
        <Card>
          <p>Cargando dashboard...</p>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <FeedbackToast message={message} onClose={() => setMessage('')} />
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-blue-700">Técnica Hidráulica ERP</p>
          <h2 className="mt-1 text-3xl font-bold text-slate-950">Dashboard Comercial</h2>
          <p className="mt-2 max-w-3xl text-slate-600">
            Inventario operativo, disponibilidad de maquinaria y respaldo de repuestos para decisiones comerciales.
          </p>
        </div>

        <button
          onClick={load}
          className="inline-flex items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 text-white"
        >
          <RefreshCw size={18} />
          Actualizar
        </button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <KpiCard
          title="Maquinaria inventariada"
          value={stats.totalMachines}
          detail={`${stats.buenEstado} en buen estado · ${stats.regular} regulares`}
          tone="blue"
          icon={<Truck size={24} />}
        />

        <KpiCard
          title="Disponibilidad comercial"
          value={`${stats.disponibilidadComercial}%`}
          detail={`${stats.disponibles} disponibles · ${stats.arrendadas} arrendadas`}
          tone="green"
          icon={<ShieldCheck size={24} />}
        />

        <KpiCard
          title="Salud de maquinaria"
          value={`${stats.saludFlota}%`}
          detail={`${stats.buenEstado} máquinas en buen estado`}
          tone="amber"
          icon={<Wrench size={24} />}
        />

        <KpiCard
          title="Respaldo repuestos"
          value={formatoDinero(stats.valorInventario)}
          detail={`${stats.totalSpareParts} SKUs · ${stats.riesgoRepuestos}% en riesgo`}
          tone={stats.riesgoRepuestos > 20 ? 'red' : 'slate'}
          icon={<Boxes size={24} />}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card>
          <ChartTitle title="Maquinaria por marca" subtitle="Concentración comercial por fabricante" />

          <div className="h-80 min-h-80">
            {stats.marcasData.length ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200} initialDimension={{ width: 480, height: 320 }}>
                <BarChart data={stats.marcasData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tickFormatter={compactName} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="cantidad" name="Máquinas" fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>
        </Card>

        <Card>
          <ChartTitle title="Disponibilidad de maquinaria" subtitle="Estado comercial actual" />

          <div className="h-80 min-h-80">
            {stats.disponibilidadData.length ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200} initialDimension={{ width: 480, height: 320 }}>
                <PieChart>
                  <Pie
                    data={stats.disponibilidadData}
                    dataKey="cantidad"
                    nameKey="estado"
                    outerRadius={105}
                    label
                  >
                    {stats.disponibilidadData.map((_, index) => (
                      <Cell key={`availability-${index}`} fill={colores[index % colores.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>
        </Card>

        <Card>
          <ChartTitle title="Cobertura por ubicación" subtitle="Presencia operacional por bodega o cliente" />

          <div className="space-y-4">
            {stats.ubicacionesData.map((item) => (
              <div key={item.name}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-700">{item.name}</span>
                  <span className="font-bold text-slate-950">{item.cantidad}</span>
                </div>
                <div className="h-2 rounded bg-slate-100">
                  <div
                    className="h-2 rounded bg-blue-600"
                    style={{ width: `${porcentaje(item.cantidad, stats.totalMachines)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <ChartTitle title="Mix de maquinaria" subtitle="Tipos con mayor presencia en el inventario" />

          <div className="h-80 min-h-80">
            {stats.tiposData.length ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200} initialDimension={{ width: 640, height: 320 }}>
                <BarChart data={stats.tiposData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tickFormatter={compactName} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="cantidad" name="Máquinas" fill="#16a34a" />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>
        </Card>

        <Card>
          <ChartTitle title="Condición física" subtitle="Lectura rápida del estado real de la maquinaria" />

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm text-emerald-700">Buen estado</p>
              <h3 className="mt-2 text-3xl font-bold text-emerald-800">{stats.buenEstado}</h3>
            </div>

            <div className="rounded border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-700">Regular</p>
              <h3 className="mt-2 text-3xl font-bold text-amber-800">{stats.regular}</h3>
            </div>

            <div className="rounded border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">Malo</p>
              <h3 className="mt-2 text-3xl font-bold text-red-800">{stats.malo}</h3>
            </div>
          </div>

          <div className="mt-6 h-56 min-h-56">
            {stats.estadoFisicoData.length ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200} initialDimension={{ width: 480, height: 224 }}>
                <PieChart>
                  <Pie data={stats.estadoFisicoData} dataKey="cantidad" nameKey="estado" outerRadius={80} label>
                    {stats.estadoFisicoData.map((_, index) => (
                      <Cell key={`physical-status-${index}`} fill={colores[index % colores.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card>
          <ChartTitle title="Inventario de repuestos" subtitle="Valor y profundidad del respaldo técnico" />

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded bg-emerald-50 p-3 text-emerald-700">
                <DollarSign size={22} />
              </div>
              <div>
                <p className="text-sm text-slate-500">Valor valorizado</p>
                <p className="text-2xl font-bold text-slate-950">{formatoDinero(stats.valorInventario)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded border p-3">
                <p className="text-sm text-slate-500">Bajo stock</p>
                <p className="text-2xl font-bold text-amber-600">{stats.bajoStock}</p>
              </div>

              <div className="rounded border p-3">
                <p className="text-sm text-slate-500">Sin stock</p>
                <p className="text-2xl font-bold text-red-600">{stats.sinStock}</p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <ChartTitle title="Categorías críticas" subtitle="Familias con mayor cantidad de ítems" />

          <div className="h-72 min-h-72">
            {stats.categoriasData.length ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200} initialDimension={{ width: 480, height: 288 }}>
                <BarChart data={stats.categoriasData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tickFormatter={compactName} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="cantidad" name="SKUs" fill="#7c3aed" />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>
        </Card>

        <Card>
          <ChartTitle title="Stock por ubicación" subtitle="Dónde está concentrado el respaldo" />

          <div className="space-y-4">
            {stats.stockPorUbicacion.map((item) => (
              <div key={item.name}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-700">{item.name}</span>
                  <span className="font-bold text-slate-950">{item.stock}</span>
                </div>
                <div className="h-2 rounded bg-slate-100">
                  <div
                    className="h-2 rounded bg-violet-600"
                    style={{ width: `${porcentaje(item.stock, stats.stockPorUbicacion[0]?.stock || 1)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <ChartTitle title="Oportunidades operativas" subtitle="Máquinas que conviene revisar para mejorar disponibilidad" />

          {stats.maquinasPrioritarias.length === 0 ? (
            <p className="text-slate-500">No hay máquinas prioritarias.</p>
          ) : (
            <div className="space-y-3">
              {stats.maquinasPrioritarias.map((machine) => (
                <div key={machine.id || machine.code} className="rounded border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">
                        {machine.conteo || machine.code || 'Sin código'} · {machine.brand || 'Sin marca'}
                      </p>
                      <p className="text-sm text-slate-600">
                        {machine.model || machine.tipo || 'Sin modelo'} · {machine.location || 'Sin ubicación'}
                      </p>
                    </div>
                    <Badge value={machine.disponibilidad || machine.estado_fisico} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <ChartTitle title="Riesgo de continuidad" subtitle="Repuestos que pueden afectar tiempos de respuesta" />

          {stats.repuestosCriticos.length === 0 ? (
            <p className="text-slate-500">No hay repuestos críticos.</p>
          ) : (
            <div className="space-y-3">
              {stats.repuestosCriticos.map((repuesto) => (
                <div key={repuesto.id || repuesto.code} className="rounded border border-red-100 bg-red-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">{repuesto.code || 'Sin código'}</p>
                      <p className="text-sm text-slate-700">{repuesto.name || 'Sin nombre'}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {repuesto.supplier || 'Sin proveedor'} · {repuesto.location || 'Sin ubicación'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 rounded bg-white px-2 py-1 text-sm font-bold text-red-700">
                      <AlertTriangle size={16} />
                      {numero(repuesto.stock)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <ChartTitle title="Principales proveedores" subtitle="Concentración de abastecimiento" />

          <div className="space-y-4">
            {stats.proveedoresData.map((item) => (
              <div key={item.name}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-700">{item.name}</span>
                  <span className="font-bold text-slate-950">{item.cantidad}</span>
                </div>
                <div className="h-2 rounded bg-slate-100">
                  <div
                    className="h-2 rounded bg-slate-700"
                    style={{ width: `${porcentaje(item.cantidad, stats.totalSpareParts)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <ChartTitle title="Huella operativa" subtitle="Indicadores para presentar capacidad instalada" />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded border p-4">
              <div className="mb-3 rounded bg-blue-50 p-3 text-blue-700 w-fit">
                <MapPin size={22} />
              </div>
              <p className="text-sm text-slate-500">Ubicaciones con maquinaria</p>
              <p className="mt-2 text-3xl font-bold text-slate-950">{stats.ubicacionesData.length}</p>
            </div>

            <div className="rounded border p-4">
              <div className="mb-3 rounded bg-emerald-50 p-3 text-emerald-700 w-fit">
                <ShieldCheck size={22} />
              </div>
              <p className="text-sm text-slate-500">Disponibilidad comercial</p>
              <p className="mt-2 text-3xl font-bold text-slate-950">{stats.disponibilidadComercial}%</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

export const DashboardPage = Dashboard
