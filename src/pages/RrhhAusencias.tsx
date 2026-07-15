import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3, Palmtree, Plus, Save, Stethoscope, X } from 'lucide-react'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
import { useEmpresa } from '../lib/empresa'
import { supabase } from '../lib/supabase'
import { businessDays, databaseMessage, EmptyState, formatDate, inputClass, labelClass, PersonaRrhh, RrhhHeader, SchemaWarning, StatusBadge } from './rrhh/shared'

type Absence = {
  id: string
  persona_id: string
  tipo: string
  estado: string
  fecha_inicio: string
  fecha_termino: string
  dias: number
  folio?: string | null
  emisor?: string | null
  motivo?: string | null
  documento_url?: string | null
  notas?: string | null
  personas?: Pick<PersonaRrhh, 'id' | 'nombre' | 'rut'> | null
}

type VacationBalance = { id: string; persona_id: string; periodo: number; dias_otorgados: number; dias_ajuste: number; notas?: string | null }

const today = new Date().toISOString().slice(0, 10)
const emptyAbsence = { persona_id: '', tipo: 'vacaciones', estado: 'pendiente', fecha_inicio: today, fecha_termino: today, dias: 1, folio: '', emisor: '', motivo: '', documento_url: '', notas: '' }
const emptyBalance = { persona_id: '', periodo: new Date().getFullYear(), dias_otorgados: 15, dias_ajuste: 0, notas: '' }

function calendarDays(start: string, end: string) {
  if (!start || !end || end < start) return 0
  return Math.floor((new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86400000) + 1
}

export function RrhhAusencias() {
  const { activeEmpresaId, activeEmpresa } = useEmpresa()
  const [people, setPeople] = useState<PersonaRrhh[]>([])
  const [absences, setAbsences] = useState<Absence[]>([])
  const [balances, setBalances] = useState<VacationBalance[]>([])
  const [form, setForm] = useState(emptyAbsence)
  const [balanceForm, setBalanceForm] = useState(emptyBalance)
  const [showForm, setShowForm] = useState(false)
  const [showBalance, setShowBalance] = useState(false)
  const [typeFilter, setTypeFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [schemaReady, setSchemaReady] = useState(true)
  const [message, setMessage] = useState('')

  async function load() {
    if (!activeEmpresaId) return
    setLoading(true)
    const [peopleResult, absencesResult, balancesResult] = await Promise.all([
      supabase.from('personas').select('id,nombre,rut,tipo_relacion,activo,estado_laboral').eq('empresa_id', activeEmpresaId).eq('activo', true).order('nombre'),
      supabase.from('rrhh_ausencias').select('*, personas(id,nombre,rut)').eq('empresa_id', activeEmpresaId).order('fecha_inicio', { ascending: false }),
      supabase.from('rrhh_saldos_vacaciones').select('*').eq('empresa_id', activeEmpresaId).order('periodo', { ascending: false }),
    ])
    if (absencesResult.error) {
      setSchemaReady(false)
      setMessage(databaseMessage(absencesResult.error))
      setAbsences([])
    } else {
      setSchemaReady(true)
      setAbsences((absencesResult.data || []) as unknown as Absence[])
    }
    if (!peopleResult.error) setPeople((peopleResult.data || []) as unknown as PersonaRrhh[])
    if (!balancesResult.error) setBalances((balancesResult.data || []) as VacationBalance[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [activeEmpresaId])

  const summary = useMemo(() => ({
    pending: absences.filter((item) => item.estado === 'pendiente').length,
    activeLicences: absences.filter((item) => item.tipo === 'licencia_medica' && item.estado === 'aprobada' && item.fecha_inicio <= today && item.fecha_termino >= today).length,
    activeVacations: absences.filter((item) => item.tipo === 'vacaciones' && item.estado === 'aprobada' && item.fecha_inicio <= today && item.fecha_termino >= today).length,
    approvedDays: absences.filter((item) => item.estado === 'aprobada' && item.fecha_inicio.startsWith(String(new Date().getFullYear()))).reduce((total, item) => total + Number(item.dias || 0), 0),
  }), [absences])

  const filtered = useMemo(() => absences.filter((item) => (typeFilter === 'todos' || item.tipo === typeFilter) && (statusFilter === 'todos' || item.estado === statusFilter)), [absences, statusFilter, typeFilter])

  const vacationRows = useMemo(() => people.filter((person) => person.tipo_relacion === 'contrato').map((person) => {
    const year = Number(balanceForm.periodo || new Date().getFullYear())
    const balance = balances.find((item) => item.persona_id === person.id && Number(item.periodo) === year)
    const used = absences.filter((item) => item.persona_id === person.id && item.tipo === 'vacaciones' && item.estado === 'aprobada' && item.fecha_inicio.startsWith(String(year))).reduce((total, item) => total + Number(item.dias || 0), 0)
    const available = Number(balance?.dias_otorgados ?? 15) + Number(balance?.dias_ajuste ?? 0) - used
    return { person, year, balance, used, available }
  }), [absences, balanceForm.periodo, balances, people])

  function updateDates(start: string, end: string, type = form.tipo) {
    const days = type === 'vacaciones' ? businessDays(start, end) : calendarDays(start, end)
    setForm((current) => ({ ...current, fecha_inicio: start, fecha_termino: end, dias: days }))
  }

  function resetForm() {
    setForm({ ...emptyAbsence, fecha_inicio: today, fecha_termino: today })
    setShowForm(false)
  }

  async function saveAbsence() {
    if (!schemaReady) return setMessage('Primero ejecuta el SQL 17_rrhh_escalable.sql en Supabase.')
    if (!activeEmpresaId) return setMessage('Selecciona una empresa antes de guardar.')
    if (!form.persona_id) return setMessage('Selecciona el trabajador asociado a la ausencia.')
    if (!form.fecha_inicio || !form.fecha_termino) return setMessage('Completa las fechas de inicio y término.')
    if (form.fecha_termino < form.fecha_inicio) return setMessage('La fecha de término no puede ser anterior al inicio.')
    if (Number(form.dias) <= 0) return setMessage('El período seleccionado no contiene días válidos.')

    setSaving(true)
    const { error } = await supabase.from('rrhh_ausencias').insert({ empresa_id: activeEmpresaId, persona_id: form.persona_id, tipo: form.tipo, estado: form.estado, fecha_inicio: form.fecha_inicio, fecha_termino: form.fecha_termino, dias: Number(form.dias), folio: form.folio.trim() || null, emisor: form.emisor.trim() || null, motivo: form.motivo.trim() || null, documento_url: form.documento_url.trim() || null, notas: form.notas.trim() || null, aprobado_at: form.estado === 'aprobada' ? new Date().toISOString() : null })
    setSaving(false)
    if (error) return setMessage(databaseMessage(error))
    setMessage('Ausencia registrada correctamente.')
    resetForm()
    await load()
  }

  async function updateStatus(item: Absence, estado: string) {
    if (estado === 'anulada' && !window.confirm('¿Anular este registro? Se conservará en el historial.')) return
    const { error } = await supabase.from('rrhh_ausencias').update({ estado, aprobado_at: estado === 'aprobada' ? new Date().toISOString() : null }).eq('id', item.id).eq('empresa_id', activeEmpresaId)
    if (error) return setMessage(databaseMessage(error))
    setMessage(`Registro marcado como ${estado}.`)
    await load()
  }

  async function saveBalance() {
    if (!activeEmpresaId) return setMessage('Selecciona una empresa antes de guardar el saldo.')
    if (!balanceForm.persona_id) return setMessage('Selecciona el trabajador del saldo de vacaciones.')
    if (Number(balanceForm.dias_otorgados) < 0) return setMessage('Los días otorgados no pueden ser negativos.')
    setSaving(true)
    const { error } = await supabase.from('rrhh_saldos_vacaciones').upsert({ empresa_id: activeEmpresaId, persona_id: balanceForm.persona_id, periodo: Number(balanceForm.periodo), dias_otorgados: Number(balanceForm.dias_otorgados), dias_ajuste: Number(balanceForm.dias_ajuste), notas: balanceForm.notas.trim() || null }, { onConflict: 'empresa_id,persona_id,periodo' })
    setSaving(false)
    if (error) return setMessage(databaseMessage(error))
    setMessage('Saldo de vacaciones actualizado.')
    setShowBalance(false)
    await load()
  }

  return <div className="space-y-5">
    <FeedbackToast message={message} onClose={() => setMessage('')} />
    <RrhhHeader title="Ausencias, licencias y vacaciones" description={`Solicitudes, respaldos, aprobaciones y saldos de ${activeEmpresa?.nombre || 'la empresa activa'} en un solo historial.`} loading={loading} onRefresh={load} action={<><button onClick={() => setShowBalance(true)} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-800">Ajustar vacaciones</button><button onClick={() => { resetForm(); setShowForm(true) }} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white"><Plus size={17} />Registrar ausencia</button></>} />
    {!schemaReady && <SchemaWarning />}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase text-amber-600">Pendientes</p><p className="mt-2 text-3xl font-black">{summary.pending}</p></div><Clock3 className="text-amber-600" /></div></Card><Card><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase text-blue-600">Licencias activas</p><p className="mt-2 text-3xl font-black">{summary.activeLicences}</p></div><Stethoscope className="text-blue-600" /></div></Card><Card><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase text-emerald-600">De vacaciones</p><p className="mt-2 text-3xl font-black">{summary.activeVacations}</p></div><Palmtree className="text-emerald-600" /></div></Card><Card><p className="text-xs font-black uppercase text-slate-500">Días aprobados este año</p><p className="mt-2 text-3xl font-black">{summary.approvedDays}</p></Card></div>

    {showForm && <Card><div className="mb-5 flex items-start justify-between"><div><h3 className="text-xl font-black">Registrar ausencia</h3><p className="mt-1 text-sm text-slate-500">Si falta una persona, primero créala en Equipo y fichas.</p></div><button onClick={resetForm} className="rounded-lg bg-slate-100 p-2"><X size={18} /></button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <label className={labelClass}>Trabajador *<select value={form.persona_id} onChange={(e) => setForm({ ...form, persona_id: e.target.value })} className={inputClass}><option value="">Seleccionar</option>{people.map((person) => <option key={person.id} value={person.id}>{person.nombre} · {person.rut || 'sin RUT'}</option>)}</select></label>
      <label className={labelClass}>Tipo<select value={form.tipo} onChange={(e) => { const tipo = e.target.value; setForm({ ...form, tipo, dias: tipo === 'vacaciones' ? businessDays(form.fecha_inicio, form.fecha_termino) : calendarDays(form.fecha_inicio, form.fecha_termino) }) }} className={inputClass}><option value="vacaciones">Vacaciones</option><option value="licencia_medica">Licencia médica</option><option value="permiso_con_goce">Permiso con goce</option><option value="permiso_sin_goce">Permiso sin goce</option><option value="inasistencia">Inasistencia</option><option value="fuero">Fuero</option><option value="suspension">Suspensión</option><option value="otro">Otro</option></select></label>
      <label className={labelClass}>Estado<select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} className={inputClass}><option value="borrador">Borrador</option><option value="pendiente">Pendiente</option><option value="aprobada">Aprobada</option><option value="rechazada">Rechazada</option><option value="cerrada">Cerrada</option><option value="anulada">Anulada</option></select></label>
      <label className={labelClass}>Días calculados<input type="number" min="0" step="0.5" value={form.dias} onChange={(e) => setForm({ ...form, dias: Number(e.target.value) })} className={inputClass} /><span className="mt-1 block text-xs font-normal text-slate-500">Vacaciones excluye sábados y domingos.</span></label>
      <label className={labelClass}>Desde *<input type="date" value={form.fecha_inicio} onChange={(e) => updateDates(e.target.value, form.fecha_termino)} className={inputClass} /></label>
      <label className={labelClass}>Hasta *<input type="date" value={form.fecha_termino} onChange={(e) => updateDates(form.fecha_inicio, e.target.value)} className={inputClass} /></label>
      <label className={labelClass}>Folio<input value={form.folio} onChange={(e) => setForm({ ...form, folio: e.target.value })} className={inputClass} /></label>
      <label className={labelClass}>Emisor<input value={form.emisor} onChange={(e) => setForm({ ...form, emisor: e.target.value })} className={inputClass} placeholder="Médico, institución..." /></label>
      <label className={`${labelClass} md:col-span-2`}>Motivo<input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} className={inputClass} /></label>
      <label className={`${labelClass} md:col-span-2`}>URL respaldo<input type="url" value={form.documento_url} onChange={(e) => setForm({ ...form, documento_url: e.target.value })} className={inputClass} placeholder="https://..." /></label>
      <label className={`${labelClass} md:col-span-4`}>Notas<textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} className={`${inputClass} min-h-24`} /></label>
    </div><button onClick={saveAbsence} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-black text-white disabled:opacity-50"><Save size={17} />{saving ? 'Guardando...' : 'Guardar ausencia'}</button></Card>}

    {showBalance && <Card className="border-emerald-200 bg-emerald-50/40"><div className="mb-4 flex items-start justify-between"><div><h3 className="text-xl font-black">Configurar saldo anual</h3><p className="mt-1 text-sm text-slate-500">Los días utilizados se calculan desde las vacaciones aprobadas; aquí se registran los días otorgados y ajustes.</p></div><button onClick={() => setShowBalance(false)} className="rounded-lg bg-white p-2"><X size={18} /></button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><label className={`${labelClass} xl:col-span-2`}>Trabajador<select value={balanceForm.persona_id} onChange={(e) => { const existing = balances.find((item) => item.persona_id === e.target.value && Number(item.periodo) === Number(balanceForm.periodo)); setBalanceForm({ ...balanceForm, persona_id: e.target.value, dias_otorgados: Number(existing?.dias_otorgados ?? 15), dias_ajuste: Number(existing?.dias_ajuste ?? 0), notas: existing?.notas || '' }) }} className={inputClass}><option value="">Seleccionar</option>{people.filter((person) => person.tipo_relacion === 'contrato').map((person) => <option key={person.id} value={person.id}>{person.nombre}</option>)}</select></label><label className={labelClass}>Año<input type="number" min="2000" max="2200" value={balanceForm.periodo} onChange={(e) => setBalanceForm({ ...balanceForm, periodo: Number(e.target.value) })} className={inputClass} /></label><label className={labelClass}>Días otorgados<input type="number" min="0" step="0.5" value={balanceForm.dias_otorgados} onChange={(e) => setBalanceForm({ ...balanceForm, dias_otorgados: Number(e.target.value) })} className={inputClass} /></label><label className={labelClass}>Ajuste<input type="number" step="0.5" value={balanceForm.dias_ajuste} onChange={(e) => setBalanceForm({ ...balanceForm, dias_ajuste: Number(e.target.value) })} className={inputClass} /></label><label className={`${labelClass} md:col-span-2 xl:col-span-5`}>Notas<input value={balanceForm.notas} onChange={(e) => setBalanceForm({ ...balanceForm, notas: e.target.value })} className={inputClass} /></label></div><button onClick={saveBalance} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-black text-white"><Save size={17} />Guardar saldo</button></Card>}

    <Card><div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-2"><CalendarDays className="text-blue-700" /><h3 className="font-black">Historial de ausencias</h3></div><div className="flex gap-2"><select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value="todos">Todos los tipos</option><option value="vacaciones">Vacaciones</option><option value="licencia_medica">Licencias</option><option value="permiso_con_goce">Permisos con goce</option><option value="permiso_sin_goce">Permisos sin goce</option><option value="inasistencia">Inasistencias</option><option value="fuero">Fueros</option></select><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value="todos">Todos los estados</option><option value="pendiente">Pendientes</option><option value="aprobada">Aprobadas</option><option value="rechazada">Rechazadas</option><option value="cerrada">Cerradas</option><option value="anulada">Anuladas</option></select></div></div><div className="overflow-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Trabajador</th><th className="p-3">Tipo</th><th className="p-3">Período</th><th className="p-3">Días</th><th className="p-3">Respaldo</th><th className="p-3">Estado</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id} className="border-b hover:bg-slate-50"><td className="p-3"><p className="font-black">{item.personas?.nombre || '—'}</p><p className="mt-1 text-xs text-slate-500">{item.personas?.rut || ''}</p></td><td className="p-3 font-semibold capitalize">{item.tipo.replace(/_/g, ' ')}</td><td className="p-3">{formatDate(item.fecha_inicio)} — {formatDate(item.fecha_termino)}</td><td className="p-3 font-black">{item.dias}</td><td className="p-3">{item.documento_url ? <a href={item.documento_url} target="_blank" rel="noreferrer" className="font-bold text-blue-700 hover:underline">Abrir respaldo</a> : <span className="text-slate-400">Sin archivo</span>}{item.folio && <p className="mt-1 text-xs text-slate-500">Folio {item.folio}</p>}</td><td className="p-3"><select value={item.estado} onChange={(e) => updateStatus(item, e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold"><option value="borrador">Borrador</option><option value="pendiente">Pendiente</option><option value="aprobada">Aprobada</option><option value="rechazada">Rechazada</option><option value="cerrada">Cerrada</option><option value="anulada">Anulada</option></select><div className="mt-2"><StatusBadge value={item.estado} /></div></td></tr>)}{!loading && !filtered.length && <tr><td colSpan={6} className="p-4"><EmptyState>No hay ausencias registradas con estos filtros.</EmptyState></td></tr>}</tbody></table></div></Card>

    <Card><div className="mb-4 flex items-center gap-2"><CheckCircle2 className="text-emerald-700" /><h3 className="font-black">Saldos de vacaciones · {balanceForm.periodo}</h3></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{vacationRows.map(({ person, balance, used, available }) => <div key={person.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between"><div><p className="font-black">{person.nombre}</p><p className="mt-1 text-xs text-slate-500">Otorgados {Number(balance?.dias_otorgados ?? 15)} · Ajuste {Number(balance?.dias_ajuste ?? 0)}</p></div><span className={`text-xl font-black ${available < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{available}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, (used / Math.max(1, Number(balance?.dias_otorgados ?? 15) + Number(balance?.dias_ajuste ?? 0))) * 100))}%` }} /></div><p className="mt-2 text-xs text-slate-500">{used} días utilizados · {available} disponibles</p></div>)}{!vacationRows.length && <EmptyState>No hay trabajadores contratados para calcular vacaciones.</EmptyState>}</div></Card>
  </div>
}
