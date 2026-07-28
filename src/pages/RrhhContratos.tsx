import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, FilePlus2, FileSignature, PencilLine, Plus, Save, X } from 'lucide-react'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
import { useEmpresa } from '../lib/empresa'
import { supabase } from '../lib/supabase'
import { dateValue } from '../../shared/dates.js'
import { databaseMessage, daysUntil, EmptyState, formatDate, inputClass, labelClass, money, PersonaRrhh, RrhhHeader, SchemaWarning, StatusBadge } from './rrhh/shared'

type Contract = {
  id: string
  empresa_id: string
  persona_id: string
  numero?: string | null
  tipo: string
  estado: string
  fecha_inicio: string
  fecha_termino?: string | null
  fecha_firma?: string | null
  cargo_nombre?: string | null
  centro_costo_nombre?: string | null
  jornada?: string | null
  horas_semanales?: number | null
  sueldo_base: number
  moneda: string
  funciones?: string | null
  documento_url?: string | null
  alerta_dias: number
  notas?: string | null
  personas?: Pick<PersonaRrhh, 'id' | 'nombre' | 'rut'> | null
}

type Annex = {
  id: string
  contrato_id: string
  persona_id: string
  tipo: string
  estado: string
  fecha_emision: string
  fecha_vigencia: string
  titulo: string
  descripcion?: string | null
  documento_url?: string | null
  fecha_firma?: string | null
}

const emptyContract = {
  persona_id: '', numero: '', tipo: 'indefinido', estado: 'borrador', fecha_inicio: new Date().toISOString().slice(0, 10), fecha_termino: '', fecha_firma: '',
  cargo_nombre: '', centro_costo_nombre: '', jornada: 'Jornada completa', horas_semanales: 44, sueldo_base: 0, moneda: 'CLP', funciones: '', documento_url: '', alerta_dias: 45, notas: '',
}
const emptyAnnex = { contrato_id: '', tipo: 'modificacion', estado: 'borrador', fecha_emision: new Date().toISOString().slice(0, 10), fecha_vigencia: new Date().toISOString().slice(0, 10), titulo: '', descripcion: '', documento_url: '', fecha_firma: '' }

export function RrhhContratos() {
  const { activeEmpresaId, activeEmpresa } = useEmpresa()
  const [people, setPeople] = useState<PersonaRrhh[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [annexes, setAnnexes] = useState<Annex[]>([])
  const [contractForm, setContractForm] = useState(emptyContract)
  const [annexForm, setAnnexForm] = useState(emptyAnnex)
  const [editingContract, setEditingContract] = useState('')
  const [showContractForm, setShowContractForm] = useState(false)
  const [showAnnexForm, setShowAnnexForm] = useState(false)
  const [selectedContractId, setSelectedContractId] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [schemaReady, setSchemaReady] = useState(true)
  const [message, setMessage] = useState('')

  async function load() {
    if (!activeEmpresaId) return
    setLoading(true)
    const [peopleResult, contractsResult, annexesResult] = await Promise.all([
      supabase.from('personas').select('id, nombre, rut, tipo_relacion, activo, cargo, centro_costo, sueldo_base, moneda, tipo_contrato, jornada, horas_semanales').eq('empresa_id', activeEmpresaId).eq('activo', true).order('nombre'),
      supabase.from('rrhh_contratos').select('*, personas(id,nombre,rut)').eq('empresa_id', activeEmpresaId).order('fecha_inicio', { ascending: false }),
      supabase.from('rrhh_anexos').select('*').eq('empresa_id', activeEmpresaId).order('fecha_vigencia', { ascending: false }),
    ])
    if (contractsResult.error) {
      setSchemaReady(false)
      setMessage(databaseMessage(contractsResult.error))
      setContracts([])
    } else {
      setSchemaReady(true)
      setContracts((contractsResult.data || []) as unknown as Contract[])
    }
    if (!peopleResult.error) setPeople((peopleResult.data || []) as unknown as PersonaRrhh[])
    if (!annexesResult.error) setAnnexes((annexesResult.data || []) as Annex[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [activeEmpresaId])

  const summary = useMemo(() => ({
    valid: contracts.filter((item) => item.estado === 'vigente').length,
    pending: contracts.filter((item) => ['borrador', 'pendiente_firma'].includes(item.estado)).length,
    expiring: contracts.filter((item) => item.fecha_termino && item.estado === 'vigente' && Number(daysUntil(item.fecha_termino)) <= item.alerta_dias).length,
    annexes: annexes.length,
  }), [annexes, contracts])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return contracts.filter((item) => !needle || [item.personas?.nombre, item.personas?.rut, item.numero, item.cargo_nombre, item.estado].some((value) => String(value || '').toLowerCase().includes(needle)))
  }, [contracts, query])

  const selectedAnnexes = useMemo(() => annexes.filter((item) => item.contrato_id === selectedContractId), [annexes, selectedContractId])

  function choosePerson(personId: string) {
    const person = people.find((item) => item.id === personId)
    setContractForm((current) => ({ ...current, persona_id: personId, cargo_nombre: person?.cargo || current.cargo_nombre, centro_costo_nombre: person?.centro_costo || current.centro_costo_nombre, sueldo_base: Number(person?.sueldo_base || current.sueldo_base), moneda: person?.moneda || current.moneda, tipo: person?.tipo_contrato || current.tipo, jornada: person?.jornada || current.jornada, horas_semanales: Number(person?.horas_semanales || current.horas_semanales) }))
  }

  function resetContract() {
    setContractForm({ ...emptyContract, fecha_inicio: new Date().toISOString().slice(0, 10) })
    setEditingContract('')
    setShowContractForm(false)
  }

  function editContract(item: Contract) {
    setEditingContract(item.id)
    setContractForm({ persona_id: item.persona_id, numero: item.numero || '', tipo: item.tipo, estado: item.estado, fecha_inicio: dateValue(item.fecha_inicio), fecha_termino: dateValue(item.fecha_termino), fecha_firma: dateValue(item.fecha_firma), cargo_nombre: item.cargo_nombre || '', centro_costo_nombre: item.centro_costo_nombre || '', jornada: item.jornada || '', horas_semanales: Number(item.horas_semanales || 0), sueldo_base: Number(item.sueldo_base || 0), moneda: item.moneda || 'CLP', funciones: item.funciones || '', documento_url: item.documento_url || '', alerta_dias: Number(item.alerta_dias || 45), notas: item.notas || '' })
    setShowContractForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveContract() {
    if (!schemaReady) return setMessage('Primero instala el esquema completo en PostgreSQL con npm run db:init.')
    if (!activeEmpresaId) return setMessage('Selecciona una empresa antes de guardar.')
    if (!contractForm.persona_id) return setMessage('Selecciona el trabajador del contrato.')
    if (!contractForm.fecha_inicio) return setMessage('Indica la fecha de inicio del contrato.')
    if (contractForm.fecha_termino && contractForm.fecha_termino < contractForm.fecha_inicio) return setMessage('La fecha de término debe ser posterior al inicio.')
    if (['plazo_fijo', 'obra_faena'].includes(contractForm.tipo) && !contractForm.fecha_termino) return setMessage('Los contratos a plazo u obra deben tener fecha de término.')

    setSaving(true)
    try {
      const payload = { empresa_id: activeEmpresaId, persona_id: contractForm.persona_id, numero: contractForm.numero.trim() || null, tipo: contractForm.tipo, estado: contractForm.estado, fecha_inicio: contractForm.fecha_inicio, fecha_termino: contractForm.fecha_termino || null, fecha_firma: contractForm.fecha_firma || null, cargo_nombre: contractForm.cargo_nombre.trim() || null, centro_costo_nombre: contractForm.centro_costo_nombre.trim() || null, jornada: contractForm.jornada.trim() || null, horas_semanales: Number(contractForm.horas_semanales || 0), sueldo_base: Number(contractForm.sueldo_base || 0), moneda: contractForm.moneda || 'CLP', funciones: contractForm.funciones.trim() || null, documento_url: contractForm.documento_url.trim() || null, alerta_dias: Number(contractForm.alerta_dias || 45), notas: contractForm.notas.trim() || null }
      const result = editingContract
        ? await supabase.from('rrhh_contratos').update(payload).eq('id', editingContract).eq('empresa_id', activeEmpresaId)
        : await supabase.from('rrhh_contratos').insert(payload)
      if (result.error) return setMessage(databaseMessage(result.error))
      setMessage(editingContract ? 'Contrato actualizado correctamente.' : 'Contrato registrado correctamente.')
      resetContract()
      await load()
    } catch (error) {
      setMessage(databaseMessage(error as { code?: string; message?: string }))
    } finally {
      setSaving(false)
    }
  }

  function startAnnex(contract: Contract) {
    setSelectedContractId(contract.id)
    setAnnexForm({ ...emptyAnnex, contrato_id: contract.id, fecha_emision: new Date().toISOString().slice(0, 10), fecha_vigencia: new Date().toISOString().slice(0, 10) })
    setShowAnnexForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveAnnex() {
    const contract = contracts.find((item) => item.id === annexForm.contrato_id)
    if (!activeEmpresaId || !contract) return setMessage('Selecciona un contrato válido para el anexo.')
    if (annexForm.titulo.trim().length < 3) return setMessage('Escribe un título que identifique el anexo.')
    if (!annexForm.fecha_vigencia) return setMessage('Indica desde cuándo rige el anexo.')
    setSaving(true)
    try {
      const { error } = await supabase.from('rrhh_anexos').insert({ empresa_id: activeEmpresaId, persona_id: contract.persona_id, contrato_id: contract.id, tipo: annexForm.tipo, estado: annexForm.estado, fecha_emision: annexForm.fecha_emision, fecha_vigencia: annexForm.fecha_vigencia, titulo: annexForm.titulo.trim(), descripcion: annexForm.descripcion.trim() || null, documento_url: annexForm.documento_url.trim() || null, fecha_firma: annexForm.fecha_firma || null })
      if (error) return setMessage(databaseMessage(error))
      setMessage('Anexo registrado y asociado al contrato.')
      setShowAnnexForm(false)
      await load()
    } catch (error) {
      setMessage(databaseMessage(error as { code?: string; message?: string }))
    } finally {
      setSaving(false)
    }
  }

  async function updateContractStatus(item: Contract, estado: string) {
    if (estado === 'anulado' && !window.confirm('¿Anular este contrato? Permanecerá en el historial y no podrá tratarse como vigente.')) return
    const { error } = await supabase.from('rrhh_contratos').update({ estado }).eq('id', item.id).eq('empresa_id', activeEmpresaId)
    if (error) return setMessage(databaseMessage(error))
    setMessage(`Contrato marcado como ${estado.replace(/_/g, ' ')}.`)
    await load()
  }

  return <div className="space-y-5">
    <FeedbackToast message={message} onClose={() => setMessage('')} />
    <RrhhHeader title="Contratos y anexos" description={`Ciclo contractual de ${activeEmpresa?.nombre || 'la empresa activa'} con estados, vencimientos, documentos e historial sin sobrescritura.`} loading={loading} onRefresh={load} action={<button onClick={() => { resetContract(); setShowContractForm(true) }} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white"><Plus size={17} />Nuevo contrato</button>} />
    {!schemaReady && <SchemaWarning />}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card><p className="text-xs font-black uppercase text-emerald-600">Vigentes</p><p className="mt-2 text-3xl font-black">{summary.valid}</p></Card><Card><p className="text-xs font-black uppercase text-amber-600">Pendientes</p><p className="mt-2 text-3xl font-black">{summary.pending}</p></Card><Card><p className="text-xs font-black uppercase text-red-600">Próximos a vencer</p><p className="mt-2 text-3xl font-black text-red-700">{summary.expiring}</p></Card><Card><p className="text-xs font-black uppercase text-blue-600">Anexos registrados</p><p className="mt-2 text-3xl font-black text-blue-800">{summary.annexes}</p></Card></div>

    {showContractForm && <Card><div className="mb-5 flex items-start justify-between"><div><h3 className="text-xl font-black">{editingContract ? 'Editar contrato' : 'Nuevo contrato'}</h3><p className="mt-1 text-sm text-slate-500">Guardar como borrador permite completar el documento antes de enviarlo a firma.</p></div><button onClick={resetContract} className="rounded-lg bg-slate-100 p-2"><X size={18} /></button></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className={labelClass}>Trabajador *<select value={contractForm.persona_id} onChange={(e) => choosePerson(e.target.value)} className={inputClass}><option value="">Seleccionar</option>{people.filter((person) => ['contrato', 'honorarios'].includes(person.tipo_relacion)).map((person) => <option key={person.id} value={person.id}>{person.nombre} · {person.rut || 'sin RUT'}</option>)}</select></label>
        <label className={labelClass}>Número o referencia<input value={contractForm.numero} onChange={(e) => setContractForm({ ...contractForm, numero: e.target.value })} className={inputClass} placeholder="CT-2026-001" /></label>
        <label className={labelClass}>Tipo<select value={contractForm.tipo} onChange={(e) => setContractForm({ ...contractForm, tipo: e.target.value })} className={inputClass}><option value="indefinido">Indefinido</option><option value="plazo_fijo">Plazo fijo</option><option value="obra_faena">Obra o faena</option><option value="part_time">Part time</option><option value="practica">Práctica</option><option value="honorarios">Honorarios</option><option value="otro">Otro</option></select></label>
        <label className={labelClass}>Estado<select value={contractForm.estado} onChange={(e) => setContractForm({ ...contractForm, estado: e.target.value })} className={inputClass}><option value="borrador">Borrador</option><option value="pendiente_firma">Pendiente de firma</option><option value="vigente">Vigente</option><option value="vencido">Vencido</option><option value="terminado">Terminado</option><option value="anulado">Anulado</option></select></label>
        <label className={labelClass}>Inicio *<input type="date" value={contractForm.fecha_inicio} onChange={(e) => setContractForm({ ...contractForm, fecha_inicio: e.target.value })} className={inputClass} /></label>
        <label className={labelClass}>Término<input type="date" value={contractForm.fecha_termino} onChange={(e) => setContractForm({ ...contractForm, fecha_termino: e.target.value })} className={inputClass} /></label>
        <label className={labelClass}>Fecha firma<input type="date" value={contractForm.fecha_firma} onChange={(e) => setContractForm({ ...contractForm, fecha_firma: e.target.value })} className={inputClass} /></label>
        <label className={labelClass}>Avisar con anticipación<input type="number" min="0" max="365" value={contractForm.alerta_dias} onChange={(e) => setContractForm({ ...contractForm, alerta_dias: Number(e.target.value) })} className={inputClass} /><span className="mt-1 block text-xs font-normal text-slate-500">Días antes del vencimiento</span></label>
        <label className={labelClass}>Cargo<input value={contractForm.cargo_nombre} onChange={(e) => setContractForm({ ...contractForm, cargo_nombre: e.target.value })} className={inputClass} /></label>
        <label className={labelClass}>Centro de costo<input value={contractForm.centro_costo_nombre} onChange={(e) => setContractForm({ ...contractForm, centro_costo_nombre: e.target.value })} className={inputClass} /></label>
        <label className={labelClass}>Jornada<input value={contractForm.jornada} onChange={(e) => setContractForm({ ...contractForm, jornada: e.target.value })} className={inputClass} /></label>
        <label className={labelClass}>Horas semanales<input type="number" min="0" max="80" step="0.5" value={contractForm.horas_semanales} onChange={(e) => setContractForm({ ...contractForm, horas_semanales: Number(e.target.value) })} className={inputClass} /></label>
        <label className={labelClass}>Sueldo base<input type="number" min="0" value={contractForm.sueldo_base} onChange={(e) => setContractForm({ ...contractForm, sueldo_base: Number(e.target.value) })} className={inputClass} /></label>
        <label className={`${labelClass} md:col-span-2`}>URL documento<input type="url" value={contractForm.documento_url} onChange={(e) => setContractForm({ ...contractForm, documento_url: e.target.value })} className={inputClass} placeholder="https://..." /></label>
        <label className={`${labelClass} md:col-span-2`}>Funciones<textarea value={contractForm.funciones} onChange={(e) => setContractForm({ ...contractForm, funciones: e.target.value })} className={`${inputClass} min-h-24`} /></label>
        <label className={`${labelClass} md:col-span-2`}>Notas internas<textarea value={contractForm.notas} onChange={(e) => setContractForm({ ...contractForm, notas: e.target.value })} className={`${inputClass} min-h-24`} /></label>
      </div><div className="mt-5 flex gap-2"><button onClick={saveContract} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-black text-white disabled:opacity-50"><Save size={17} />{saving ? 'Guardando...' : 'Guardar contrato'}</button><button onClick={resetContract} className="rounded-xl bg-slate-200 px-5 py-3 font-bold text-slate-700">Cancelar</button></div>
    </Card>}

    {showAnnexForm && <Card className="border-blue-200 bg-blue-50/40"><div className="mb-4 flex items-start justify-between"><div><h3 className="text-xl font-black">Nuevo anexo</h3><p className="mt-1 text-sm text-slate-500">Se agregará al historial del contrato seleccionado sin modificar el documento original.</p></div><button onClick={() => setShowAnnexForm(false)} className="rounded-lg bg-white p-2"><X size={18} /></button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className={labelClass}>Tipo<select value={annexForm.tipo} onChange={(e) => setAnnexForm({ ...annexForm, tipo: e.target.value })} className={inputClass}><option value="remuneracion">Remuneración</option><option value="cargo">Cargo</option><option value="jornada">Jornada</option><option value="lugar_trabajo">Lugar de trabajo</option><option value="plazo">Plazo</option><option value="funciones">Funciones</option><option value="teletrabajo">Teletrabajo</option><option value="modificacion">Modificación general</option><option value="otro">Otro</option></select></label><label className={labelClass}>Estado<select value={annexForm.estado} onChange={(e) => setAnnexForm({ ...annexForm, estado: e.target.value })} className={inputClass}><option value="borrador">Borrador</option><option value="pendiente_firma">Pendiente de firma</option><option value="vigente">Vigente</option><option value="anulado">Anulado</option></select></label><label className={labelClass}>Emisión<input type="date" value={annexForm.fecha_emision} onChange={(e) => setAnnexForm({ ...annexForm, fecha_emision: e.target.value })} className={inputClass} /></label><label className={labelClass}>Vigencia *<input type="date" value={annexForm.fecha_vigencia} onChange={(e) => setAnnexForm({ ...annexForm, fecha_vigencia: e.target.value })} className={inputClass} /></label><label className={`${labelClass} md:col-span-2`}>Título *<input value={annexForm.titulo} onChange={(e) => setAnnexForm({ ...annexForm, titulo: e.target.value })} className={inputClass} placeholder="Cambio de jornada" /></label><label className={`${labelClass} md:col-span-2`}>URL documento<input type="url" value={annexForm.documento_url} onChange={(e) => setAnnexForm({ ...annexForm, documento_url: e.target.value })} className={inputClass} /></label><label className={`${labelClass} md:col-span-4`}>Descripción<textarea value={annexForm.descripcion} onChange={(e) => setAnnexForm({ ...annexForm, descripcion: e.target.value })} className={`${inputClass} min-h-24`} /></label></div><button onClick={saveAnnex} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-black text-white disabled:opacity-50"><FilePlus2 size={17} />Guardar anexo</button></Card>}

    <Card><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><FileSignature className="text-blue-700" /><h3 className="font-black">Historial contractual</h3></div><input value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm sm:w-80" placeholder="Buscar trabajador, RUT o contrato" /></div><div className="overflow-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Trabajador</th><th className="p-3">Contrato</th><th className="p-3">Vigencia</th><th className="p-3">Cargo</th><th className="p-3">Base</th><th className="p-3">Estado</th><th className="p-3 text-right">Acciones</th></tr></thead><tbody>{filtered.map((item) => { const remaining = daysUntil(item.fecha_termino); return <tr key={item.id} className="border-b align-top hover:bg-slate-50"><td className="p-3"><p className="font-black">{item.personas?.nombre || 'Sin trabajador'}</p><p className="mt-1 text-xs text-slate-500">{item.personas?.rut || ''}</p></td><td className="p-3"><p className="font-semibold capitalize">{item.tipo.replace(/_/g, ' ')}</p><p className="mt-1 text-xs text-slate-500">{item.numero || 'Sin número'}</p></td><td className="p-3"><p>{formatDate(item.fecha_inicio)} — {formatDate(item.fecha_termino)}</p>{remaining !== null && <p className={`mt-1 text-xs font-bold ${remaining <= 10 ? 'text-red-700' : 'text-slate-500'}`}>{remaining < 0 ? `Venció hace ${Math.abs(remaining)} días` : `${remaining} días restantes`}</p>}</td><td className="p-3">{item.cargo_nombre || '—'}<p className="mt-1 text-xs text-slate-500">{item.centro_costo_nombre || ''}</p></td><td className="p-3 font-semibold">{money(item.sueldo_base, item.moneda)}</td><td className="p-3"><select value={item.estado} onChange={(e) => updateContractStatus(item, e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold"><option value="borrador">Borrador</option><option value="pendiente_firma">Pendiente firma</option><option value="vigente">Vigente</option><option value="vencido">Vencido</option><option value="terminado">Terminado</option><option value="anulado">Anulado</option></select><div className="mt-2"><StatusBadge value={item.estado} /></div></td><td className="p-3"><div className="flex justify-end gap-2"><button onClick={() => { setSelectedContractId(item.id); setShowAnnexForm(false) }} title="Ver anexos" className="rounded-lg bg-blue-100 p-2 text-blue-700"><FilePlus2 size={16} /></button><button onClick={() => startAnnex(item)} title="Crear anexo" className="rounded-lg bg-emerald-100 p-2 text-emerald-700"><Plus size={16} /></button><button onClick={() => editContract(item)} title="Editar contrato" className="rounded-lg bg-amber-100 p-2 text-amber-800"><PencilLine size={16} /></button>{item.documento_url && <a href={item.documento_url} target="_blank" rel="noreferrer" title="Abrir documento" className="rounded-lg bg-slate-100 p-2 text-slate-700"><ExternalLink size={16} /></a>}</div></td></tr>})}{!loading && !filtered.length && <tr><td colSpan={7} className="p-4"><EmptyState>No hay contratos registrados.</EmptyState></td></tr>}</tbody></table></div></Card>

    {selectedContractId && <Card><div className="mb-4 flex items-center justify-between"><h3 className="font-black">Anexos del contrato</h3><button onClick={() => setSelectedContractId('')} className="rounded-lg bg-slate-100 p-2"><X size={16} /></button></div><div className="space-y-2">{selectedAnnexes.map((annex) => <div key={annex.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">{annex.titulo}</p><p className="mt-1 text-xs text-slate-500">{annex.tipo.replace(/_/g, ' ')} · vigente desde {formatDate(annex.fecha_vigencia)}</p>{annex.descripcion && <p className="mt-2 text-sm text-slate-600">{annex.descripcion}</p>}</div><div className="flex items-center gap-2"><StatusBadge value={annex.estado} />{annex.documento_url && <a href={annex.documento_url} target="_blank" rel="noreferrer" className="rounded-lg bg-slate-100 p-2"><ExternalLink size={16} /></a>}</div></div>)}{!selectedAnnexes.length && <EmptyState>Este contrato todavía no tiene anexos.</EmptyState>}</div></Card>}
  </div>
}
