import { AlertTriangle, RefreshCw } from 'lucide-react'
import { ReactNode } from 'react'
import { Card } from '../../components/Card'

export type PersonaRrhh = {
  id: string
  empresa_id: string
  tipo_relacion: 'contrato' | 'honorarios' | 'proveedor' | 'externo'
  rut?: string | null
  nombre: string
  email?: string | null
  telefono?: string | null
  direccion?: string | null
  cargo?: string | null
  centro_costo?: string | null
  activo: boolean
  codigo_empleado?: string | null
  fecha_nacimiento?: string | null
  nacionalidad?: string | null
  estado_civil?: string | null
  comuna?: string | null
  region?: string | null
  contacto_emergencia_nombre?: string | null
  contacto_emergencia_telefono?: string | null
  contacto_emergencia_relacion?: string | null
  fecha_ingreso?: string | null
  fecha_termino?: string | null
  estado_laboral?: 'activo' | 'licencia' | 'vacaciones' | 'suspendido' | 'desvinculado'
  tipo_contrato?: string | null
  jornada?: string | null
  horas_semanales?: number | null
  sueldo_base?: number | null
  moneda?: string | null
  afp?: string | null
  salud_tipo?: string | null
  salud_institucion?: string | null
  usuario_id?: string | null
}

export type RrhhAlert = {
  id: string
  tipo: string
  titulo: string
  detalle?: string | null
  prioridad: 'alta' | 'media' | 'baja'
  estado: 'pendiente' | 'vista' | 'resuelta' | 'descartada'
  fecha_vencimiento?: string | null
  persona_id?: string | null
}

export const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100'
export const labelClass = 'text-sm font-bold text-slate-700'

export function databaseMessage(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return ''
  if (error.code === '42P01' || error.code === 'PGRST205' || /rrhh_|column .* does not exist|schema cache/i.test(error.message || '')) {
    return 'Falta ejecutar el archivo SQL 17_rrhh_escalable.sql en Supabase.'
  }
  if (error.code === '23505') return 'Ya existe un registro con esos datos en la empresa activa.'
  if (error.code === '23514') return 'Uno de los valores no cumple las reglas del sistema. Revisa fechas, estados y montos.'
  return error.message || 'No fue posible completar la operación.'
}

export function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

export function money(value?: number | null, currency = 'CLP') {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value || 0))
}

export function daysUntil(value?: string | null) {
  if (!value) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${value}T00:00:00`)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

export function statusClass(status?: string | null) {
  if (['activo', 'vigente', 'aprobada', 'pagado', 'resuelta'].includes(status || '')) return 'bg-emerald-100 text-emerald-800'
  if (['pendiente', 'pendiente_firma', 'borrador', 'vista'].includes(status || '')) return 'bg-amber-100 text-amber-800'
  if (['licencia', 'vacaciones'].includes(status || '')) return 'bg-blue-100 text-blue-800'
  if (['vencido', 'rechazada', 'anulado', 'anulada', 'desvinculado', 'descartada'].includes(status || '')) return 'bg-red-100 text-red-800'
  return 'bg-slate-100 text-slate-700'
}

export function StatusBadge({ value }: { value?: string | null }) {
  const text = (value || 'sin estado').replace(/_/g, ' ')
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black capitalize ${statusClass(value)}`}>{text}</span>
}

export function RrhhHeader({ title, description, loading, onRefresh, action }: {
  title: string
  description: string
  loading?: boolean
  onRefresh?: () => void
  action?: ReactNode
}) {
  return <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
    <div>
      <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-blue-700">Recursos humanos</p>
      <h2 className="text-3xl font-black text-slate-950">{title}</h2>
      <p className="mt-2 max-w-3xl text-slate-600">{description}</p>
    </div>
    <div className="flex flex-wrap gap-2">
      {action}
      {onRefresh && <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} />Actualizar</button>}
    </div>
  </div>
}

export function SchemaWarning() {
  return <Card className="border-amber-300 bg-amber-50">
    <div className="flex gap-3 text-amber-950">
      <AlertTriangle className="mt-0.5 shrink-0" />
      <div><h3 className="font-black">Falta preparar Recursos Humanos en Supabase</h3><p className="mt-1 text-sm leading-6">Ejecuta completo el archivo <b>17_rrhh_escalable.sql</b>. El sistema no intentará guardar información hasta que la estructura esté disponible.</p></div>
    </div>
  </Card>
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{children}</div>
}

export function businessDays(start: string, end: string) {
  if (!start || !end) return 0
  const first = new Date(`${start}T12:00:00`)
  const last = new Date(`${end}T12:00:00`)
  if (last < first) return 0
  let total = 0
  for (const cursor = new Date(first); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
    const day = cursor.getDay()
    if (day !== 0 && day !== 6) total += 1
  }
  return total
}
