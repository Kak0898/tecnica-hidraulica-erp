import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, BadgeDollarSign, Pencil, Plus, Save, UserCheck, UsersRound, X } from 'lucide-react'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
import { useEmpresa } from '../lib/empresa'
import { supabase } from '../lib/supabase'
import { dateValue } from '../../shared/dates.js'
import { formatRut, isValidRut, rutStatus } from '../../shared/rut.js'
import { databaseMessage, EmptyState, formatDate, inputClass, labelClass, money, PersonaRrhh, RrhhAlert, RrhhHeader, SchemaWarning, StatusBadge } from './rrhh/shared'

const personColumns = 'id, empresa_id, tipo_relacion, rut, nombre, email, telefono, direccion, cargo, rol_trabajador, centro_costo, activo, codigo_empleado, fecha_nacimiento, nacionalidad, estado_civil, comuna, region, contacto_emergencia_nombre, contacto_emergencia_telefono, contacto_emergencia_relacion, fecha_ingreso, fecha_termino, estado_laboral, tipo_contrato, jornada, horas_semanales, sueldo_base, moneda, afp, salud_tipo, salud_institucion, usuario_id, configuracion_extra'

type CommercialSettings = {
  transferencia_banco?: string | null
  transferencia_rut?: string | null
  transferencia_tipo_cuenta?: string | null
  transferencia_numero_cuenta?: string | null
  transferencia_email_fallback?: string | null
  comision_arriendo_mensual?: number | null
  comision_trabajo_hidraulico_pct?: number | null
  comision_venta_apilador?: number | null
}

const DEFAULT_COMMERCIAL: CommercialSettings = {
  transferencia_banco: 'Banco de Chile',
  transferencia_rut: '76.171.450-3',
  transferencia_tipo_cuenta: 'Cuenta corriente',
  transferencia_numero_cuenta: '9010944505',
  transferencia_email_fallback: 'francodareck@tecnicahidraulica.cl',
  comision_arriendo_mensual: 35000,
  comision_trabajo_hidraulico_pct: 6,
  comision_venta_apilador: 600000,
}

const emptyForm = {
  tipo_relacion: 'contrato', rut: '', nombre: '', email: '', telefono: '', direccion: '', cargo: '', rol_trabajador: 'general', centro_costo: '',
  codigo_empleado: '', fecha_nacimiento: '', nacionalidad: 'Chilena', estado_civil: '', comuna: '', region: '',
  contacto_emergencia_nombre: '', contacto_emergencia_telefono: '', contacto_emergencia_relacion: '',
  fecha_ingreso: new Date().toISOString().slice(0, 10), fecha_termino: '', estado_laboral: 'activo',
  tipo_contrato: 'indefinido', jornada: 'completa', horas_semanales: 44, sueldo_base: 0, moneda: 'CLP',
  afp: '', salud_tipo: 'fonasa', salud_institucion: '',
}

type PersonForm = typeof emptyForm

export function RrhhPersonas() {
  const { activeEmpresaId, activeEmpresa } = useEmpresa()
  const [people, setPeople] = useState<PersonaRrhh[]>([])
  const [alerts, setAlerts] = useState<RrhhAlert[]>([])
  const [absentPersonIds, setAbsentPersonIds] = useState<string[]>([])
  const [form, setForm] = useState<PersonForm>(emptyForm)
  const [editingId, setEditingId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [schemaReady, setSchemaReady] = useState(true)
  const [message, setMessage] = useState('')
  const [commercial, setCommercial] = useState<CommercialSettings>(DEFAULT_COMMERCIAL)

  async function load() {
    if (!activeEmpresaId) return
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const [peopleResult, alertsResult, absencesResult, commercialResult] = await Promise.all([
      supabase.from('personas').select(personColumns).eq('empresa_id', activeEmpresaId).order('activo', { ascending: false }).order('nombre'),
      supabase.from('rrhh_alertas').select('id, tipo, titulo, detalle, prioridad, estado, fecha_vencimiento, persona_id').eq('empresa_id', activeEmpresaId).in('estado', ['pendiente', 'vista']).order('fecha_vencimiento', { ascending: true, nullsFirst: false }).limit(6),
      supabase.from('rrhh_ausencias').select('persona_id').eq('empresa_id', activeEmpresaId).eq('estado', 'aprobada').lte('fecha_inicio', today).gte('fecha_termino', today),
      supabase.from('empresas').select('transferencia_banco, transferencia_rut, transferencia_tipo_cuenta, transferencia_numero_cuenta, transferencia_email_fallback, comision_arriendo_mensual, comision_trabajo_hidraulico_pct, comision_venta_apilador').eq('id', activeEmpresaId).maybeSingle(),
    ])

    if (peopleResult.error) {
      setSchemaReady(false)
      setMessage(databaseMessage(peopleResult.error))
      setPeople([])
    } else {
      setSchemaReady(true)
      const loadedPeople = ((peopleResult.data || []) as PersonaRrhh[]).map((person) => ({
        ...person,
        rol_trabajador: person.rol_trabajador || String(person.configuracion_extra?.rol_trabajador || 'general') as PersonaRrhh['rol_trabajador'],
      }))
      setPeople(loadedPeople)
      setCommercial({ ...DEFAULT_COMMERCIAL, ...((commercialResult.data || {}) as CommercialSettings) })
    }
    if (!alertsResult.error) setAlerts((alertsResult.data || []) as RrhhAlert[])
    if (!absencesResult.error) setAbsentPersonIds([...new Set<string>((absencesResult.data || []).map((item: { persona_id: string }) => String(item.persona_id)))])
    else setAbsentPersonIds([])
    if (peopleResult.error && !commercialResult.error) setCommercial({ ...DEFAULT_COMMERCIAL, ...((commercialResult.data || {}) as CommercialSettings) })
    setLoading(false)
  }

  useEffect(() => { void load() }, [activeEmpresaId])

  const summary = useMemo(() => ({
    active: people.filter((person) => person.activo && person.estado_laboral === 'activo').length,
    away: new Set([
      ...absentPersonIds,
      ...people.filter((person) => ['licencia', 'vacaciones'].includes(person.estado_laboral || '')).map((person) => person.id),
    ]).size,
    inactive: people.filter((person) => !person.activo || person.estado_laboral === 'desvinculado').length,
    openAlerts: alerts.length,
  }), [absentPersonIds, alerts, people])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return people.filter((person) => {
      const matchesStatus = statusFilter === 'todos' || person.estado_laboral === statusFilter
      const matchesQuery = !needle || [person.nombre, person.rut, person.codigo_empleado, person.cargo, person.centro_costo].some((value) => String(value || '').toLowerCase().includes(needle))
      return matchesStatus && matchesQuery
    })
  }, [people, query, statusFilter])

  const currentRutStatus = rutStatus(form.rut)

  function update<K extends keyof PersonForm>(key: K, value: PersonForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function resetForm() {
    setForm({ ...emptyForm, fecha_ingreso: new Date().toISOString().slice(0, 10) })
    setEditingId('')
    setShowForm(false)
  }

  function editPerson(person: PersonaRrhh) {
    setEditingId(person.id)
    setForm({
      tipo_relacion: person.tipo_relacion || 'contrato', rut: formatRut(person.rut || ''), nombre: person.nombre || '', email: person.email || '', telefono: person.telefono || '',
      direccion: person.direccion || '', cargo: person.cargo || '', centro_costo: person.centro_costo || '', codigo_empleado: person.codigo_empleado || '',
      rol_trabajador: person.rol_trabajador || 'general',
      fecha_nacimiento: person.fecha_nacimiento || '', nacionalidad: person.nacionalidad || '', estado_civil: person.estado_civil || '', comuna: person.comuna || '', region: person.region || '',
      contacto_emergencia_nombre: person.contacto_emergencia_nombre || '', contacto_emergencia_telefono: person.contacto_emergencia_telefono || '', contacto_emergencia_relacion: person.contacto_emergencia_relacion || '',
      fecha_ingreso: dateValue(person.fecha_ingreso), fecha_termino: dateValue(person.fecha_termino), estado_laboral: person.estado_laboral || 'activo', tipo_contrato: person.tipo_contrato || 'indefinido',
      jornada: person.jornada || 'completa', horas_semanales: Number(person.horas_semanales || 0), sueldo_base: Number(person.sueldo_base || 0), moneda: person.moneda || 'CLP',
      afp: person.afp || '', salud_tipo: person.salud_tipo || 'fonasa', salud_institucion: person.salud_institucion || '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function savePerson() {
    if (!schemaReady) return setMessage('Primero instala el esquema completo en PostgreSQL con npm run db:init.')
    if (!activeEmpresaId) return setMessage('Selecciona una empresa antes de guardar la ficha.')
    if (form.nombre.trim().length < 3) return setMessage('Ingresa el nombre completo del trabajador.')
    if (form.rut.trim() && !isValidRut(form.rut)) return setMessage('El RUT ingresado no es válido. Revisa el número y su dígito verificador.')
    if (form.fecha_termino && form.fecha_ingreso && form.fecha_termino < form.fecha_ingreso) return setMessage('La fecha de término no puede ser anterior a la fecha de ingreso.')
    if (Number(form.horas_semanales) < 0 || Number(form.horas_semanales) > 80) return setMessage('Las horas semanales deben estar entre 0 y 80.')

    const payload = {
      empresa_id: activeEmpresaId,
      tipo_relacion: form.tipo_relacion,
      rut: form.rut.trim() ? formatRut(form.rut) : null,
      nombre: form.nombre.trim().replace(/\s+/g, ' '),
      email: form.email.trim() || null,
      telefono: form.telefono.trim() || null,
      direccion: form.direccion.trim() || null,
      cargo: form.cargo.trim() || null,
      rol_trabajador: form.rol_trabajador,
      centro_costo: form.centro_costo.trim() || null,
      codigo_empleado: form.codigo_empleado.trim() || null,
      fecha_nacimiento: form.fecha_nacimiento || null,
      nacionalidad: form.nacionalidad.trim() || null,
      estado_civil: form.estado_civil.trim() || null,
      comuna: form.comuna.trim() || null,
      region: form.region.trim() || null,
      contacto_emergencia_nombre: form.contacto_emergencia_nombre.trim() || null,
      contacto_emergencia_telefono: form.contacto_emergencia_telefono.trim() || null,
      contacto_emergencia_relacion: form.contacto_emergencia_relacion.trim() || null,
      fecha_ingreso: form.fecha_ingreso || null,
      fecha_termino: form.fecha_termino || null,
      estado_laboral: form.estado_laboral,
      activo: form.estado_laboral !== 'desvinculado',
      tipo_contrato: form.tipo_relacion === 'contrato' ? form.tipo_contrato : null,
      jornada: form.jornada.trim() || null,
      horas_semanales: Number(form.horas_semanales || 0),
      sueldo_base: Number(form.sueldo_base || 0),
      moneda: form.moneda || 'CLP',
      afp: form.afp.trim() || null,
      salud_tipo: form.salud_tipo.trim() || null,
      salud_institucion: form.salud_institucion.trim() || null,
      configuracion_extra: (() => {
        const existingExtra = people.find((person) => person.id === editingId)?.configuracion_extra || {}
        return {
        ...existingExtra,
        rol_trabajador: form.rol_trabajador,
        ...(form.rol_trabajador === 'vendedor' ? { comercial: existingExtra.comercial || DEFAULT_COMMERCIAL } : {}),
      }})(),
    }

    setSaving(true)
    try {
      const result = editingId
        ? await supabase.from('personas').update(payload).eq('id', editingId).eq('empresa_id', activeEmpresaId)
        : await supabase.from('personas').insert(payload)
      if (result.error) return setMessage(databaseMessage(result.error))
      setMessage(editingId ? 'Ficha del trabajador actualizada.' : 'Trabajador registrado correctamente.')
      resetForm()
      await load()
    } catch (error) {
      setMessage(databaseMessage(error as { code?: string; message?: string }))
    } finally {
      setSaving(false)
    }
  }

  return <div className="space-y-5">
    <FeedbackToast message={message} onClose={() => setMessage('')} />
    <RrhhHeader title="Equipo y fichas" description={`Expediente laboral central de ${activeEmpresa?.nombre || 'la empresa activa'}, reutilizado por contratos, ausencias, documentos y remuneraciones.`} loading={loading} onRefresh={load} action={<button onClick={() => { resetForm(); setShowForm(true) }} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white"><Plus size={17} />Nuevo trabajador</button>} />

    {!schemaReady && <SchemaWarning />}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Activos</p><p className="mt-2 text-3xl font-black text-slate-950">{summary.active}</p></div><UserCheck className="text-emerald-600" /></div></Card>
      <Card><p className="text-xs font-black uppercase tracking-wide text-blue-600">Ausentes hoy</p><p className="mt-2 text-3xl font-black text-blue-800">{summary.away}</p></Card>
      <Card><p className="text-xs font-black uppercase tracking-wide text-slate-500">Desvinculados</p><p className="mt-2 text-3xl font-black text-slate-700">{summary.inactive}</p></Card>
      <Card><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wide text-amber-600">Alertas abiertas</p><p className="mt-2 text-3xl font-black text-amber-800">{summary.openAlerts}</p></div><AlertCircle className="text-amber-600" /></div></Card>
    </div>

    <Card className="border-blue-200 bg-blue-50/50">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2"><BadgeDollarSign className="text-blue-700" size={21} /><h3 className="font-black text-slate-950">Información para vendedores</h3></div>
          <p className="mt-2 text-sm text-slate-600">Estos son los valores de referencia de la empresa. Cada persona con rol Vendedor administra sus reglas particulares en Comprobantes y comisiones.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-blue-200 bg-white p-3"><p className="text-xs font-black uppercase text-slate-500">Arriendo</p><p className="mt-1 font-black text-blue-800">{money(commercial.comision_arriendo_mensual)} / mes arrendado</p></div>
            <div className="rounded-xl border border-blue-200 bg-white p-3"><p className="text-xs font-black uppercase text-slate-500">Trabajo hidráulico</p><p className="mt-1 font-black text-blue-800">{Number(commercial.comision_trabajo_hidraulico_pct || 0)}% de la ganancia</p></div>
            <div className="rounded-xl border border-blue-200 bg-white p-3"><p className="text-xs font-black uppercase text-slate-500">Venta de apilador</p><p className="mt-1 font-black text-blue-800">{money(commercial.comision_venta_apilador)} por venta</p></div>
          </div>
        </div>
        <div className="min-w-full rounded-xl border border-slate-200 bg-white p-4 text-sm xl:min-w-[330px]">
          <p className="font-black uppercase text-slate-900">Datos de transferencia</p>
          <p className="mt-2 font-bold">Técnica Hidráulica Ltda.</p>
          <p>{commercial.transferencia_banco || 'Banco de Chile'}</p>
          <p>RUT: {commercial.transferencia_rut || '76.171.450-3'}</p>
          <p>{commercial.transferencia_tipo_cuenta || 'Cuenta corriente'} N° {commercial.transferencia_numero_cuenta || '9010944505'}</p>
          <p className="mt-2 text-xs text-slate-500">En cada cotización se usa el correo registrado del vendedor conectado.</p>
        </div>
      </div>
    </Card>

    {alerts.length > 0 && <Card className="border-amber-200 bg-amber-50/60"><div className="mb-3 flex items-center gap-2"><AlertCircle className="text-amber-700" size={19} /><h3 className="font-black text-amber-950">Atención requerida</h3></div><div className="grid gap-2 lg:grid-cols-2">{alerts.map((alert) => <div key={alert.id} className="rounded-xl border border-amber-200 bg-white p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-bold text-slate-900">{alert.titulo}</p><p className="mt-1 text-xs leading-5 text-slate-600">{alert.detalle || 'Revisa este pendiente en Documentos y alertas.'}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${alert.prioridad === 'alta' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{alert.prioridad}</span></div></div>)}</div></Card>}

    {showForm && <Card>
      <div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="text-xl font-black text-slate-950">{editingId ? 'Editar ficha laboral' : 'Registrar trabajador'}</h3><p className="mt-1 text-sm text-slate-500">Los campos vacíos se pueden completar después. Nombre, empresa y estado son la base del expediente.</p></div><button onClick={resetForm} aria-label="Cerrar formulario" className="rounded-lg bg-slate-100 p-2 text-slate-600"><X size={18} /></button></div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="space-y-3 rounded-2xl border border-slate-200 p-4"><h4 className="font-black text-slate-900">Identificación y contacto</h4>
          <label className={labelClass}>Nombre completo *<input value={form.nombre} onChange={(e) => update('nombre', e.target.value)} className={inputClass} placeholder="Nombre y apellidos" /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>RUT<input value={form.rut} onChange={(e) => update('rut', formatRut(e.target.value))} className={`${inputClass} ${currentRutStatus === 'invalid' ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : currentRutStatus === 'valid' ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-100' : ''}`} placeholder="12.345.678-5" inputMode="text" aria-invalid={currentRutStatus === 'invalid'} />{currentRutStatus === 'valid' && <span className="mt-1 block text-xs font-bold text-emerald-700">RUT válido</span>}{currentRutStatus === 'invalid' && <span className="mt-1 block text-xs font-bold text-red-700">Dígito verificador incorrecto</span>}</label><label className={labelClass}>Código interno<input value={form.codigo_empleado} onChange={(e) => update('codigo_empleado', e.target.value)} className={inputClass} placeholder="EMP-001" /></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Correo<input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className={inputClass} /></label><label className={labelClass}>Teléfono<input value={form.telefono} onChange={(e) => update('telefono', e.target.value)} className={inputClass} /></label></div>
          <label className={labelClass}>Dirección<input value={form.direccion} onChange={(e) => update('direccion', e.target.value)} className={inputClass} /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Comuna<input value={form.comuna} onChange={(e) => update('comuna', e.target.value)} className={inputClass} /></label><label className={labelClass}>Región<input value={form.region} onChange={(e) => update('region', e.target.value)} className={inputClass} /></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Fecha nacimiento<input type="date" value={form.fecha_nacimiento} onChange={(e) => update('fecha_nacimiento', e.target.value)} className={inputClass} /></label><label className={labelClass}>Nacionalidad<input value={form.nacionalidad} onChange={(e) => update('nacionalidad', e.target.value)} className={inputClass} /></label></div>
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 p-4"><h4 className="font-black text-slate-900">Situación laboral</h4>
          <div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Relación<select value={form.tipo_relacion} onChange={(e) => update('tipo_relacion', e.target.value)} className={inputClass}><option value="contrato">Contrato</option><option value="honorarios">Honorarios</option><option value="externo">Externo</option><option value="proveedor">Proveedor</option></select></label><label className={labelClass}>Estado<select value={form.estado_laboral} onChange={(e) => update('estado_laboral', e.target.value)} className={inputClass}><option value="activo">Activo</option><option value="licencia">Licencia</option><option value="vacaciones">Vacaciones</option><option value="suspendido">Suspendido</option><option value="desvinculado">Desvinculado</option></select></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Fecha ingreso<input type="date" value={form.fecha_ingreso} onChange={(e) => update('fecha_ingreso', e.target.value)} className={inputClass} /></label><label className={labelClass}>Fecha término<input type="date" value={form.fecha_termino} onChange={(e) => update('fecha_termino', e.target.value)} className={inputClass} /></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Cargo<input value={form.cargo} onChange={(e) => update('cargo', e.target.value)} className={inputClass} placeholder="Técnico hidráulico" /></label><label className={labelClass}>Rol interno<select value={form.rol_trabajador} onChange={(e) => update('rol_trabajador', e.target.value)} className={inputClass}><option value="general">General</option><option value="vendedor">Vendedor</option><option value="tecnico">Técnico</option><option value="administrativo">Administrativo</option><option value="supervisor">Supervisor</option><option value="jefatura">Jefatura</option></select><span className="mt-1 block text-xs font-normal text-slate-500">Define su función laboral; no cambia sus permisos del sistema.</span></label></div>
          <label className={labelClass}>Centro de costo<input value={form.centro_costo} onChange={(e) => update('centro_costo', e.target.value)} className={inputClass} placeholder="Taller central" /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Tipo contrato<select value={form.tipo_contrato} disabled={form.tipo_relacion !== 'contrato'} onChange={(e) => update('tipo_contrato', e.target.value)} className={inputClass}><option value="indefinido">Indefinido</option><option value="plazo_fijo">Plazo fijo</option><option value="obra_faena">Obra o faena</option><option value="part_time">Part time</option></select></label><label className={labelClass}>Jornada<input value={form.jornada} onChange={(e) => update('jornada', e.target.value)} className={inputClass} /></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Horas semanales<input type="number" min="0" max="80" step="0.5" value={form.horas_semanales} onChange={(e) => update('horas_semanales', Number(e.target.value))} className={inputClass} /></label><label className={labelClass}>Sueldo base<input type="number" min="0" value={form.sueldo_base} onChange={(e) => update('sueldo_base', Number(e.target.value))} className={inputClass} /></label></div>
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 p-4"><h4 className="font-black text-slate-900">Previsión y emergencia</h4>
          <label className={labelClass}>AFP<input value={form.afp} onChange={(e) => update('afp', e.target.value)} className={inputClass} placeholder="Modelo, Habitat..." /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Sistema de salud<select value={form.salud_tipo} onChange={(e) => update('salud_tipo', e.target.value)} className={inputClass}><option value="fonasa">Fonasa</option><option value="isapre">Isapre</option><option value="otro">Otro</option></select></label><label className={labelClass}>Institución<input value={form.salud_institucion} onChange={(e) => update('salud_institucion', e.target.value)} className={inputClass} /></label></div>
          <div className="border-t border-slate-200 pt-3"><p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">Contacto de emergencia</p><div className="space-y-3"><label className={labelClass}>Nombre<input value={form.contacto_emergencia_nombre} onChange={(e) => update('contacto_emergencia_nombre', e.target.value)} className={inputClass} /></label><div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Teléfono<input value={form.contacto_emergencia_telefono} onChange={(e) => update('contacto_emergencia_telefono', e.target.value)} className={inputClass} /></label><label className={labelClass}>Relación<input value={form.contacto_emergencia_relacion} onChange={(e) => update('contacto_emergencia_relacion', e.target.value)} className={inputClass} placeholder="Madre, cónyuge..." /></label></div></div></div>
        </section>
      </div>
      <div className="mt-5 flex flex-wrap gap-2"><button onClick={savePerson} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-black text-white disabled:opacity-50"><Save size={17} />{saving ? 'Guardando ficha...' : 'Guardar ficha'}</button><button onClick={resetForm} className="rounded-xl bg-slate-200 px-5 py-3 font-bold text-slate-700">Cancelar</button></div>
    </Card>}

    <Card>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-2"><UsersRound className="text-blue-700" size={21} /><h3 className="font-black text-slate-950">Nómina de personas</h3></div><div className="flex flex-col gap-2 sm:flex-row"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nombre, RUT, cargo o código" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm sm:w-80" /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="todos">Todos los estados</option><option value="activo">Activos</option><option value="licencia">En licencia</option><option value="vacaciones">De vacaciones</option><option value="suspendido">Suspendidos</option><option value="desvinculado">Desvinculados</option></select></div></div>
      <div className="overflow-auto"><table className="w-full min-w-[1080px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Trabajador</th><th className="p-3">Cargo / centro</th><th className="p-3">Rol interno</th><th className="p-3">Ingreso</th><th className="p-3">Relación</th><th className="p-3">Estado</th><th className="p-3">Base registrada</th><th className="p-3 text-right">Acción</th></tr></thead><tbody>
        {filtered.map((person) => <tr key={person.id} className="border-b align-top hover:bg-slate-50"><td className="p-3"><p className="font-black text-slate-900">{person.nombre}</p><p className="mt-1 text-xs text-slate-500">{person.rut || 'Sin RUT'}{person.codigo_empleado ? ` · ${person.codigo_empleado}` : ''}</p>{person.usuario_id && <span className="mt-2 inline-flex rounded bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">Cuenta vinculada</span>}</td><td className="p-3"><p className="font-semibold text-slate-800">{person.cargo || 'Sin cargo'}</p><p className="mt-1 text-xs text-slate-500">{person.centro_costo || 'Sin centro de costo'}</p></td><td className="p-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black capitalize ${person.rol_trabajador === 'vendedor' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'}`}>{person.rol_trabajador || 'general'}</span></td><td className="p-3">{formatDate(person.fecha_ingreso)}</td><td className="p-3"><span className="capitalize">{person.tipo_relacion}</span><p className="mt-1 text-xs text-slate-500">{(person.tipo_contrato || '').replace(/_/g, ' ')}</p></td><td className="p-3"><StatusBadge value={person.estado_laboral} /></td><td className="p-3 font-semibold">{money(person.sueldo_base, person.moneda || 'CLP')}</td><td className="p-3 text-right"><button onClick={() => editPerson(person)} title="Editar ficha" className="rounded-lg bg-amber-100 p-2 text-amber-800"><Pencil size={16} /></button></td></tr>)}
        {!loading && !filtered.length && <tr><td colSpan={8} className="p-4"><EmptyState>No hay personas que coincidan con los filtros.</EmptyState></td></tr>}
      </tbody></table></div>
    </Card>
  </div>
}
