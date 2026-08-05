import { useEffect, useMemo, useRef, useState } from 'react'
import { BadgeDollarSign, Calculator, CalendarRange, ExternalLink, FileCheck2, LoaderCircle, Printer, RefreshCw, Save, Trash2, UploadCloud, UsersRound } from 'lucide-react'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
import { useEmpresa } from '../lib/empresa'
import { supabase } from '../lib/supabase'
import { formatRut, rutStatus } from '../../shared/rut.js'
import { quoteImportLabel } from '../../shared/quote-import.js'

type CommissionRules = {
  comision_arriendo_mensual: number
  comision_trabajo_hidraulico_pct: number
  comision_venta_apilador: number
}

type Seller = {
  id: string
  nombre: string
  email?: string
  usuario_id?: string
  sueldo_base?: number | string
  moneda?: string
  configuracion_extra?: { comercial?: Record<string, number> }
  commission_rules?: CommissionRules
}

type Receipt = {
  id: string
  cotizacion_id: string
  cotizacion_numero: string
  cliente_id?: string
  cliente_nombre?: string
  cliente_rut?: string
  vendedor_id: string
  vendedor_nombre: string
  vendedor_email?: string
  fecha_transferencia: string
  rut_transferencia: string
  tipo_operacion: 'arriendo' | 'trabajo_hidraulico' | 'venta_apilador'
  moneda_cotizacion: string
  tipo_cambio_clp: number
  neto_cotizacion: number
  neto_calculo_clp: number
  costo_trabajo_clp: number
  ganancia_calculo_clp: number
  meses_arriendo: number
  cantidad_apiladores: number
  comision_clp: number
  comision_calculada_clp?: number
  comision_origen?: 'regla_vendedor' | 'manual'
  reglas_aplicadas?: CommissionRules
  archivo_path: string
  archivo_nombre: string
  archivo_original: string
  subido_en: string
  notas?: string
}

type Quote = {
  id: string | number
  numero: string | number
  fecha_emision?: string
  cliente_id?: string
  cliente_nombre?: string
  cliente_rut?: string
  neto?: number | string
  total?: number | string
  neto_calculable?: number | string
  serie_cotizacion?: string
  origen_documento?: string
  importacion_archivo?: string
  created_by?: string
  vendedor_nombre?: string
  vendedor_email?: string
  data?: {
    moneda?: string
    vendedorNombre?: string
    vendedorEmail?: string
    comprobantes_transferencia?: Receipt[]
  }
}

type ApiPayload = {
  quotes: Quote[]
  sellers: Seller[]
  can_manage_all: boolean
  current_person_id?: string | null
  storage_location: string
}

const today = new Date().toISOString().slice(0, 10)
const currentMonth = today.slice(0, 7)
const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100'
const labelClass = 'text-sm font-bold text-slate-700'

const initialForm = {
  quote_id: '',
  fecha_transferencia: today,
  rut_transferencia: '',
  vendedor_id: '',
  tipo_operacion: 'arriendo' as Receipt['tipo_operacion'],
  meses_arriendo: 1,
  cantidad_apiladores: 1,
  costo_trabajo_clp: 0,
  tipo_cambio_clp: 0,
  notas: '',
  comision_manual_clp: '',
}

const defaultRules: CommissionRules = {
  comision_arriendo_mensual: 35000,
  comision_trabajo_hidraulico_pct: 6,
  comision_venta_apilador: 600000,
}

function clp(value?: number | string) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0))
}

function documentMoney(value: number | string | undefined, currency = 'CLP') {
  const amount = Number(value || 0)
  if (currency === 'UF') return `UF ${amount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: currency === 'CLP' ? 0 : 2 }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString('es-CL', { maximumFractionDigits: 4 })}`
  }
}

function operationLabel(value: Receipt['tipo_operacion']) {
  if (value === 'arriendo') return 'Arriendo'
  if (value === 'trabajo_hidraulico') return 'Trabajo hidráulico'
  return 'Venta de apilador'
}

function dateLabel(value?: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

function monthLabel(value: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`))
}

function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function ComprobantesComisiones() {
  const { activeEmpresaId } = useEmpresa()
  const fileRef = useRef<HTMLInputElement>(null)
  const [payload, setPayload] = useState<ApiPayload>({ quotes: [], sellers: [], can_manage_all: false, storage_location: '/var/www/desarrollo/doc/cotizaciones' })
  const [form, setForm] = useState(initialForm)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [month, setMonth] = useState(currentMonth)
  const [calculatorSellerId, setCalculatorSellerId] = useState('')
  const [rulesSellerId, setRulesSellerId] = useState('')
  const [ruleForm, setRuleForm] = useState<CommissionRules>(defaultRules)
  const [savingRules, setSavingRules] = useState(false)
  const [recalculating, setRecalculating] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.comprobantes.list()
    if (error) setMessage(`No se pudieron cargar los comprobantes: ${error.message}`)
    if (data) {
      const next = data as ApiPayload
      setPayload(next)
      const defaultSeller = next.current_person_id || next.sellers[0]?.id || ''
      setForm((current) => ({ ...current, vendedor_id: current.vendedor_id || defaultSeller }))
      setCalculatorSellerId((current) => current || defaultSeller)
      const selectedRulesId = rulesSellerId || defaultSeller
      const selectedRules = next.sellers.find((seller) => seller.id === selectedRulesId)?.commission_rules || defaultRules
      setRulesSellerId(selectedRulesId)
      setRuleForm({ ...defaultRules, ...selectedRules })
    }
    setLoading(false)
  }

  useEffect(() => {
    if (activeEmpresaId) void load()
  }, [activeEmpresaId])

  const selectedQuote = useMemo(
    () => payload.quotes.find((quote) => String(quote.id) === form.quote_id) || null,
    [form.quote_id, payload.quotes],
  )
  const quoteCurrency = String(selectedQuote?.data?.moneda || 'CLP').toUpperCase()
  const receiptRows = useMemo(
    () => payload.quotes.flatMap((quote) => (quote.data?.comprobantes_transferencia || []).map((receipt) => ({ ...receipt, quote }))),
    [payload.quotes],
  )
  const selectedCalculatorSeller = payload.sellers.find((seller) => seller.id === calculatorSellerId) || null
  const selectedFormSeller = payload.sellers.find((seller) => seller.id === form.vendedor_id) || null
  const monthlyRows = useMemo(
    () => receiptRows.filter((receipt) => receipt.vendedor_id === calculatorSellerId && receipt.fecha_transferencia.startsWith(`${month}-`)),
    [calculatorSellerId, month, receiptRows],
  )
  const uniqueClients = useMemo(() => new Set(monthlyRows.map((receipt) => receipt.cliente_id || receipt.cliente_rut || receipt.cliente_nombre).filter(Boolean)).size, [monthlyRows])
  const monthlyCommission = monthlyRows.reduce((sum, receipt) => sum + Number(receipt.comision_clp || 0), 0)
  const baseSalary = Number(selectedCalculatorSeller?.sueldo_base || 0)
  const projectedTotal = baseSalary + monthlyCommission
  const rutState = rutStatus(form.rut_transferencia)

  function chooseQuote(quoteId: string) {
    const quote = payload.quotes.find((item) => String(item.id) === quoteId)
    const quoteEmail = String(quote?.vendedor_email || quote?.data?.vendedorEmail || '').toLowerCase()
    const seller = payload.sellers.find((item) => item.usuario_id === quote?.created_by || String(item.email || '').toLowerCase() === quoteEmail)
    setForm((current) => ({
      ...current,
      quote_id: quoteId,
      rut_transferencia: formatRut(quote?.cliente_rut || ''),
      vendedor_id: seller?.id || current.vendedor_id || payload.current_person_id || '',
      tipo_cambio_clp: 0,
    }))
  }

  function chooseRulesSeller(sellerId: string) {
    const seller = payload.sellers.find((item) => item.id === sellerId)
    setRulesSellerId(sellerId)
    setRuleForm({ ...defaultRules, ...(seller?.commission_rules || {}) })
  }

  async function saveRules() {
    if (!rulesSellerId) return setMessage('Selecciona el vendedor cuyas reglas deseas guardar.')
    setSavingRules(true)
    const { error } = await supabase.comprobantes.updateRules({ vendedor_id: rulesSellerId, ...ruleForm })
    if (error) {
      setMessage(`No se pudieron guardar las reglas: ${error.message}`)
      setSavingRules(false)
      return
    }
    setMessage('Reglas personales guardadas. Se aplicarán a las próximas comisiones.')
    await load()
    setSavingRules(false)
  }

  async function recalculateMonth() {
    if (!calculatorSellerId || !month) return setMessage('Selecciona vendedor y mes antes de recalcular.')
    if (!window.confirm('¿Recalcular las comisiones automáticas de este mes con las reglas actuales del vendedor? Las comisiones ingresadas manualmente no cambiarán.')) return
    setRecalculating(true)
    const { data, error } = await supabase.comprobantes.recalculate(calculatorSellerId, month)
    if (error) setMessage(`No se pudo recalcular: ${error.message}`)
    else setMessage(`${Number(data?.recalculated || 0)} comisión(es) recalculadas. Total del mes: ${clp(data?.total_commission || 0)}.`)
    await load()
    setRecalculating(false)
  }

  async function saveReceipt() {
    if (!form.quote_id) return setMessage('Selecciona la cotización pagada.')
    if (!file) return setMessage('Selecciona el comprobante en PDF o imagen.')
    if (rutState !== 'valid') return setMessage('El RUT de quien transfirió no es válido.')
    if (!form.vendedor_id) return setMessage('Selecciona el vendedor responsable.')
    if (form.tipo_operacion === 'trabajo_hidraulico' && quoteCurrency !== 'CLP' && !(Number(form.tipo_cambio_clp) > 0)) {
      return setMessage(`Indica el tipo de cambio a CLP para la cotización en ${quoteCurrency}.`)
    }
    setSaving(true)
    const body = new FormData()
    Object.entries(form).forEach(([key, value]) => body.append(key, String(value)))
    body.append('file', file)
    const { error } = await supabase.comprobantes.upload(body)
    if (error) {
      setMessage(`No se pudo guardar el comprobante: ${error.message}`)
      setSaving(false)
      return
    }
    setMessage('Comprobante guardado y comisión calculada correctamente.')
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
    setForm((current) => ({ ...initialForm, vendedor_id: current.vendedor_id, fecha_transferencia: today }))
    await load()
    setSaving(false)
  }

  async function openReceipt(receipt: Receipt) {
    const { data, error } = await supabase.storage.from('comprobantes-transferencia').createSignedUrl(receipt.archivo_path, 3600)
    if (error || !data?.signedUrl) return setMessage(`No se pudo abrir el comprobante: ${error?.message || 'archivo no disponible'}`)
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function deleteReceipt(receipt: Receipt) {
    if (!window.confirm(`¿Eliminar el comprobante de la cotización N° ${receipt.cotizacion_numero}? Esta acción también elimina el archivo privado.`)) return
    const { error } = await supabase.comprobantes.remove(receipt.cotizacion_id, receipt.id)
    if (error) return setMessage(`No se pudo eliminar el comprobante: ${error.message}`)
    setMessage('Comprobante eliminado correctamente.')
    await load()
  }

  function printMonthlyReport() {
    if (!selectedCalculatorSeller) {
      setMessage('Selecciona un vendedor para imprimir el informe.')
      return
    }

    const rows = monthlyRows.map((receipt) => {
      const rules = receipt.reglas_aplicadas || selectedCalculatorSeller.commission_rules || defaultRules
      const formula = receipt.comision_origen === 'manual'
        ? `Manual: ${clp(receipt.comision_clp)}`
        : receipt.tipo_operacion === 'arriendo'
          ? `${receipt.meses_arriendo} mes(es) x ${clp(rules.comision_arriendo_mensual)}`
          : receipt.tipo_operacion === 'venta_apilador'
            ? `${receipt.cantidad_apiladores} unidad(es) x ${clp(rules.comision_venta_apilador)}`
            : `(${clp(receipt.neto_calculo_clp)} - ${clp(receipt.costo_trabajo_clp)}) x ${Number(rules.comision_trabajo_hidraulico_pct || 0).toLocaleString('es-CL')}%`
      const base = receipt.tipo_operacion === 'trabajo_hidraulico'
        ? `Neto ${clp(receipt.neto_calculo_clp)} · Costo ${clp(receipt.costo_trabajo_clp)} · Ganancia ${clp(receipt.ganancia_calculo_clp)}`
        : receipt.tipo_operacion === 'arriendo'
          ? `${receipt.meses_arriendo} mes(es) de arriendo`
          : `${receipt.cantidad_apiladores} apilador(es)`
      return { receipt, formula, base }
    })

    const byType = rows.reduce<Record<string, number>>((acc, row) => {
      const key = operationLabel(row.receipt.tipo_operacion)
      acc[key] = (acc[key] || 0) + Number(row.receipt.comision_clp || 0)
      return acc
    }, {})

    const rules = selectedCalculatorSeller.commission_rules || defaultRules
    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Comisiones ${esc(selectedCalculatorSeller.nombre)} ${esc(month)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a}
  .toolbar{padding:16px;text-align:center}
  button{border:0;border-radius:8px;background:#0f172a;color:white;padding:10px 16px;font-weight:800}
  .sheet{width:216mm;min-height:279mm;margin:0 auto 24px;background:white;padding:15mm;border:1px solid #cbd5e1}
  .header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #0f172a;padding-bottom:14px}
  h1{margin:0;font-size:24px;letter-spacing:.3px}
  h2{margin:18px 0 8px;font-size:15px;text-transform:uppercase;letter-spacing:.8px}
  .muted{color:#64748b;font-size:12px}
  .right{text-align:right}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}
  .box{border:1px solid #cbd5e1;border-radius:10px;padding:10px;background:#f8fafc}
  .box b{display:block;font-size:12px;color:#475569;text-transform:uppercase}
  .box strong{display:block;margin-top:6px;font-size:18px}
  table{width:100%;border-collapse:collapse;margin-top:10px;font-size:11px}
  th{background:#0f172a;color:white;text-align:left;padding:7px;border:1px solid #0f172a}
  td{border:1px solid #cbd5e1;padding:7px;vertical-align:top}
  .num{text-align:right;white-space:nowrap}
  .total-row td{font-weight:900;background:#ecfdf5}
  .rules{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px}
  .signs{display:grid;grid-template-columns:1fr 1fr;gap:70px;margin-top:48px;text-align:center;font-size:12px}
  .signs div{border-top:1px solid #0f172a;padding-top:8px}
  @media print{body{background:white}.toolbar{display:none}.sheet{border:0;margin:0;width:auto;min-height:auto}}
</style>
</head>
<body>
  <div class="toolbar"><button onclick="window.focus(); window.print()">Imprimir / PDF</button></div>
  <main class="sheet">
    <section class="header">
      <div>
        <h1>Informe de Comisiones Comerciales</h1>
        <p class="muted">Detalle para revisión y pago mensual</p>
      </div>
      <div class="right">
        <b>Técnica Hidráulica ERP</b><br>
        <span class="muted">Emitido: ${esc(dateLabel(today))}</span>
      </div>
    </section>

    <section class="grid">
      <div class="box"><b>Vendedor</b><strong>${esc(selectedCalculatorSeller.nombre)}</strong><span class="muted">${esc(selectedCalculatorSeller.email || '')}</span></div>
      <div class="box"><b>Período</b><strong>${esc(monthLabel(month))}</strong></div>
      <div class="box"><b>Comprobantes</b><strong>${rows.length}</strong></div>
      <div class="box"><b>Total a pagar</b><strong>${esc(clp(monthlyCommission))}</strong></div>
    </section>

    <h2>Reglas vigentes del vendedor</h2>
    <section class="rules">
      <div class="box"><b>Arriendo</b><strong>${esc(clp(rules.comision_arriendo_mensual))}</strong><span class="muted">por mes arrendado</span></div>
      <div class="box"><b>Trabajo hidráulico</b><strong>${Number(rules.comision_trabajo_hidraulico_pct || 0).toLocaleString('es-CL')}%</strong><span class="muted">sobre ganancia</span></div>
      <div class="box"><b>Venta apilador</b><strong>${esc(clp(rules.comision_venta_apilador))}</strong><span class="muted">por unidad</span></div>
    </section>

    <h2>Resumen</h2>
    <table>
      <thead><tr><th>Concepto</th><th class="num">Monto</th></tr></thead>
      <tbody>
        ${Object.entries(byType).map(([label, amount]) => `<tr><td>${esc(label)}</td><td class="num">${esc(clp(amount))}</td></tr>`).join('') || '<tr><td>Sin registros</td><td class="num">$0</td></tr>'}
        <tr class="total-row"><td>Total comisiones</td><td class="num">${esc(clp(monthlyCommission))}</td></tr>
        <tr><td>Sueldo base referencial</td><td class="num">${esc(clp(baseSalary))}</td></tr>
        <tr class="total-row"><td>Total proyectado sueldo + comisiones</td><td class="num">${esc(clp(projectedTotal))}</td></tr>
      </tbody>
    </table>

    <h2>Detalle por cotización</h2>
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Cotización / Cliente</th>
          <th>Negocio</th>
          <th>Base</th>
          <th>Fórmula</th>
          <th class="num">Comisión</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(({ receipt, formula, base }) => `<tr>
          <td>${esc(dateLabel(receipt.fecha_transferencia))}</td>
          <td><b>N° ${esc(receipt.cotizacion_numero)}</b><br>${esc(receipt.cliente_nombre || 'Sin cliente')}<br><span class="muted">${esc(receipt.cliente_rut || '')}</span></td>
          <td>${esc(operationLabel(receipt.tipo_operacion))}${receipt.comision_origen === 'manual' ? '<br><span class="muted">Ajuste manual</span>' : ''}</td>
          <td>${esc(base)}</td>
          <td>${esc(formula)}</td>
          <td class="num"><b>${esc(clp(receipt.comision_clp))}</b></td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:24px">No hay comprobantes clasificados para este vendedor y mes.</td></tr>'}
        <tr class="total-row"><td colspan="5">Total del período</td><td class="num">${esc(clp(monthlyCommission))}</td></tr>
      </tbody>
    </table>

    <p class="muted">Este informe se calcula desde comprobantes registrados y reglas personales del vendedor. Las comisiones manuales quedan marcadas como ajuste manual.</p>

    <section class="signs">
      <div>Revisado por jefatura</div>
      <div>Recibido por vendedor</div>
    </section>
  </main>
  <script>
    window.addEventListener('load', () => {
      window.setTimeout(() => {
        window.focus()
        window.print()
      }, 350)
    })
  </script>
</body>
</html>`

    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    const win = window.open(url, '_blank')
    if (!win) {
      URL.revokeObjectURL(url)
      setMessage('El navegador bloqueó la ventana de impresión.')
      return
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const activeRules = { ...defaultRules, ...(selectedFormSeller?.commission_rules || {}) }
  const netClpPreview = Number(selectedQuote?.neto_calculable || selectedQuote?.neto || 0) * (quoteCurrency === 'CLP' ? 1 : Number(form.tipo_cambio_clp || 0))
  const profitPreview = Math.max(0, netClpPreview - Number(form.costo_trabajo_clp || 0))
  const calculatedPreview = form.tipo_operacion === 'arriendo'
    ? activeRules.comision_arriendo_mensual * Math.max(1, Number(form.meses_arriendo || 1))
    : form.tipo_operacion === 'venta_apilador'
      ? activeRules.comision_venta_apilador * Math.max(1, Number(form.cantidad_apiladores || 1))
      : profitPreview * activeRules.comision_trabajo_hidraulico_pct / 100
  const manualPreview = String(form.comision_manual_clp).trim() === '' ? null : Number(form.comision_manual_clp)
  const finalCommissionPreview = manualPreview === null || !Number.isFinite(manualPreview) ? calculatedPreview : manualPreview

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-blue-700">Comercial y remuneraciones</p>
        <h2 className="text-3xl font-black text-slate-950">Comprobantes y comisiones</h2>
        <p className="mt-2 max-w-4xl text-slate-600">Vincula cada transferencia con su cotización, identifica el negocio y calcula la comisión mensual del vendedor sin duplicar registros.</p>
      </div>
      <button type="button" onClick={load} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} />Actualizar</button>
    </div>

    <Card className="border-violet-200 bg-violet-50/40">
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><Calculator size={22} /></div>
        <div><h3 className="text-xl font-black text-slate-950">Reglas personales de comisión</h3><p className="mt-1 text-sm text-slate-600">Cada vendedor puede mantener sus propios montos y porcentaje. Un administrador puede seleccionar y revisar cualquier vendedor.</p></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className={labelClass}>Vendedor<select value={rulesSellerId} onChange={(event) => chooseRulesSeller(event.target.value)} disabled={!payload.can_manage_all && payload.sellers.length === 1} className={inputClass}><option value="">Seleccionar vendedor</option>{payload.sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.nombre}</option>)}</select></label>
        <label className={labelClass}>Arriendo por mes (CLP)<input type="number" min="0" step="1000" value={ruleForm.comision_arriendo_mensual} onChange={(event) => setRuleForm({ ...ruleForm, comision_arriendo_mensual: Number(event.target.value) })} className={inputClass} /></label>
        <label className={labelClass}>Trabajo hidráulico (% ganancia)<input type="number" min="0" max="100" step="0.01" value={ruleForm.comision_trabajo_hidraulico_pct} onChange={(event) => setRuleForm({ ...ruleForm, comision_trabajo_hidraulico_pct: Number(event.target.value) })} className={inputClass} /></label>
        <label className={labelClass}>Venta de apilador por unidad (CLP)<input type="number" min="0" step="1000" value={ruleForm.comision_venta_apilador} onChange={(event) => setRuleForm({ ...ruleForm, comision_venta_apilador: Number(event.target.value) })} className={inputClass} /></label>
      </div>
      <button type="button" onClick={saveRules} disabled={savingRules || !rulesSellerId} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 font-black text-white disabled:opacity-50">{savingRules ? <LoaderCircle size={18} className="animate-spin" /> : <Save size={18} />}{savingRules ? 'Guardando reglas...' : 'Guardar reglas del vendedor'}</button>
    </Card>

    <Card>
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-xl bg-blue-100 p-3 text-blue-700"><UploadCloud size={22} /></div>
        <div><h3 className="text-xl font-black text-slate-950">Subir comprobante de transferencia</h3><p className="mt-1 text-sm text-slate-500">Se guarda como N° cotización + fecha + RUT en <span className="font-bold">{payload.storage_location}</span>.</p></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className={`${labelClass} md:col-span-2`}>Cotización pagada *<select value={form.quote_id} onChange={(event) => chooseQuote(event.target.value)} className={inputClass}><option value="">Seleccionar cotización</option>{payload.quotes.map((quote) => { const currency = String(quote.data?.moneda || 'CLP').toUpperCase(); return <option key={quote.id} value={quote.id}>{quoteImportLabel(quote)} · {quote.cliente_nombre || 'Sin cliente'} · {documentMoney(quote.neto_calculable || quote.neto, currency)}</option> })}</select></label>
        <label className={labelClass}>Fecha de transferencia *<input type="date" value={form.fecha_transferencia} onChange={(event) => setForm({ ...form, fecha_transferencia: event.target.value })} className={inputClass} /></label>
        <label className={labelClass}>RUT de quien transfiere *<input value={form.rut_transferencia} onChange={(event) => setForm({ ...form, rut_transferencia: formatRut(event.target.value) })} className={`${inputClass} ${rutState === 'valid' ? 'border-emerald-400' : rutState === 'invalid' ? 'border-red-400' : ''}`} placeholder="76.171.450-3" />{rutState === 'valid' && <span className="mt-1 block text-xs font-bold text-emerald-700">RUT válido</span>}{rutState === 'invalid' && <span className="mt-1 block text-xs font-bold text-red-700">Dígito verificador incorrecto</span>}</label>
        <label className={labelClass}>Vendedor responsable *<select value={form.vendedor_id} onChange={(event) => setForm({ ...form, vendedor_id: event.target.value })} disabled={!payload.can_manage_all && payload.sellers.length === 1} className={inputClass}><option value="">Seleccionar vendedor</option>{payload.sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.nombre}</option>)}</select></label>
        <label className={labelClass}>Tipo de negocio *<select value={form.tipo_operacion} onChange={(event) => setForm({ ...form, tipo_operacion: event.target.value as Receipt['tipo_operacion'] })} className={inputClass}><option value="arriendo">Arriendo · {clp(activeRules.comision_arriendo_mensual)} por mes</option><option value="trabajo_hidraulico">Trabajo hidráulico · {activeRules.comision_trabajo_hidraulico_pct}% de ganancia</option><option value="venta_apilador">Venta de apilador · {clp(activeRules.comision_venta_apilador)} c/u</option></select></label>
        {form.tipo_operacion === 'arriendo' && <label className={labelClass}>Meses arrendados *<input type="number" min="1" step="1" value={form.meses_arriendo} onChange={(event) => setForm({ ...form, meses_arriendo: Number(event.target.value) })} className={inputClass} /></label>}
        {form.tipo_operacion === 'venta_apilador' && <label className={labelClass}>Cantidad de apiladores *<input type="number" min="1" step="1" value={form.cantidad_apiladores} onChange={(event) => setForm({ ...form, cantidad_apiladores: Number(event.target.value) })} className={inputClass} /></label>}
        {form.tipo_operacion === 'trabajo_hidraulico' && <><label className={labelClass}>Costo real del trabajo (CLP) *<input type="number" min="0" value={form.costo_trabajo_clp} onChange={(event) => setForm({ ...form, costo_trabajo_clp: Number(event.target.value) })} className={inputClass} /></label>{quoteCurrency !== 'CLP' && <label className={labelClass}>Tipo de cambio {quoteCurrency} → CLP *<input type="number" min="0" step="0.01" value={form.tipo_cambio_clp || ''} onChange={(event) => setForm({ ...form, tipo_cambio_clp: Number(event.target.value) })} className={inputClass} placeholder="Ej. 950" /></label>}</>}
        <label className={labelClass}>Comisión acordada (CLP, opcional)<input type="number" min="0" value={form.comision_manual_clp} onChange={(event) => setForm({ ...form, comision_manual_clp: event.target.value })} className={inputClass} placeholder="Vacío = cálculo automático" /><span className="mt-1 block text-xs font-normal text-slate-500">Úsala solo si este negocio tiene un acuerdo especial.</span></label>
        <label className={`${labelClass} md:col-span-2`}>Comprobante privado *<input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(event) => setFile(event.target.files?.[0] || null)} className={`${inputClass} text-sm`} />{file && <span className="mt-1 block text-xs font-bold text-blue-700">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span>}</label>
        <label className={`${labelClass} md:col-span-2`}>Notas internas<input value={form.notas} onChange={(event) => setForm({ ...form, notas: event.target.value })} className={inputClass} placeholder="Ej. abono total, pago de OC..." /></label>
      </div>
      {selectedQuote && <div className="mt-4 grid gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:grid-cols-2 xl:grid-cols-4"><div><p className="text-xs font-black uppercase text-blue-700">Cliente</p><p className="mt-1 font-bold text-slate-900">{selectedQuote.cliente_nombre || 'Sin nombre'}</p><p className="mt-1 text-xs text-blue-700">{quoteImportLabel(selectedQuote)}</p></div><div><p className="text-xs font-black uppercase text-blue-700">Neto calculable</p><p className="mt-1 font-bold text-slate-900">{documentMoney(selectedQuote.neto_calculable || selectedQuote.neto, quoteCurrency)}</p></div><div><p className="text-xs font-black uppercase text-blue-700">{form.tipo_operacion === 'trabajo_hidraulico' ? 'Ganancia neta' : 'Regla aplicada'}</p><p className="mt-1 font-bold text-slate-900">{form.tipo_operacion === 'trabajo_hidraulico' ? clp(profitPreview) : form.tipo_operacion === 'arriendo' ? `${form.meses_arriendo} mes(es)` : `${form.cantidad_apiladores} unidad(es)`}</p></div><div><p className="text-xs font-black uppercase text-blue-700">Comisión {manualPreview === null ? 'calculada' : 'manual'}</p><p className="mt-1 text-xl font-black text-emerald-800">{clp(finalCommissionPreview)}</p>{form.tipo_operacion === 'trabajo_hidraulico' && profitPreview === 0 && <p className="mt-1 text-xs font-bold text-amber-700">El costo es igual o mayor al neto: la ganancia automática es $0.</p>}</div></div>}
      <button type="button" onClick={saveReceipt} disabled={saving || loading} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-black text-white shadow-sm disabled:opacity-50">{saving ? <LoaderCircle className="animate-spin" size={18} /> : <FileCheck2 size={18} />}{saving ? 'Guardando comprobante...' : 'Guardar comprobante y calcular'}</button>
    </Card>

    <Card>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><CalendarRange size={22} /></div><div><h3 className="text-xl font-black">Calculadora mensual por vendedor</h3><p className="mt-1 text-sm text-slate-500">Sueldo base + arriendos + trabajos hidráulicos + ventas de apiladores.</p></div></div><div className="flex flex-col gap-2 sm:flex-row"><button type="button" onClick={printMonthlyReport} disabled={!calculatorSellerId} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-800 disabled:opacity-50"><Printer size={17} />Imprimir informe</button><button type="button" onClick={recalculateMonth} disabled={recalculating || !calculatorSellerId} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-800 disabled:opacity-50"><RefreshCw size={17} className={recalculating ? 'animate-spin' : ''} />{recalculating ? 'Recalculando...' : 'Recalcular mes'}</button></div></div>
      <div className="grid gap-4 md:grid-cols-2 xl:w-2/3"><label className={labelClass}>Vendedor<select value={calculatorSellerId} onChange={(event) => setCalculatorSellerId(event.target.value)} className={inputClass}><option value="">Seleccionar</option>{payload.sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.nombre}</option>)}</select></label><label className={labelClass}>Mes<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className={inputClass} /></label></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl bg-slate-100 p-4"><p className="text-xs font-black uppercase text-slate-500">Sueldo base</p><p className="mt-2 text-2xl font-black">{clp(baseSalary)}</p></div><div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-black uppercase text-blue-700">Clientes del mes</p><p className="mt-2 text-2xl font-black text-blue-950">{uniqueClients}</p><p className="mt-1 text-xs text-blue-700">{monthlyRows.length} comprobante(s)</p></div><div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs font-black uppercase text-amber-700">Comisiones</p><p className="mt-2 text-2xl font-black text-amber-950">{clp(monthlyCommission)}</p></div><div className="rounded-2xl bg-emerald-100 p-4"><p className="text-xs font-black uppercase text-emerald-800">Total proyectado</p><p className="mt-2 text-2xl font-black text-emerald-950">{clp(projectedTotal)}</p></div></div>
      <div className="mt-5 overflow-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Fecha / cotización</th><th className="p-3">Cliente</th><th className="p-3">Negocio</th><th className="p-3">Base de cálculo</th><th className="p-3 text-right">Comisión</th></tr></thead><tbody>{monthlyRows.map((receipt) => <tr key={receipt.id} className="border-b"><td className="p-3"><p className="font-black">N° {receipt.cotizacion_numero}</p><p className="mt-1 text-xs text-slate-500">{dateLabel(receipt.fecha_transferencia)}</p></td><td className="p-3"><p className="font-semibold">{receipt.cliente_nombre || 'Sin cliente'}</p><p className="mt-1 text-xs text-slate-500">{receipt.cliente_rut || ''}</p></td><td className="p-3 font-semibold">{operationLabel(receipt.tipo_operacion)}</td><td className="p-3">{receipt.tipo_operacion === 'arriendo' ? `${receipt.meses_arriendo} mes(es)` : receipt.tipo_operacion === 'venta_apilador' ? `${receipt.cantidad_apiladores} unidad(es)` : `Ganancia: ${clp(receipt.ganancia_calculo_clp)}`}</td><td className="p-3 text-right"><p className="font-black text-emerald-700">{clp(receipt.comision_clp)}</p>{receipt.comision_origen === 'manual' && <span className="mt-1 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black uppercase text-violet-700">Manual</span>}</td></tr>)}{!loading && !monthlyRows.length && <tr><td colSpan={5} className="p-8 text-center text-slate-500">No hay comprobantes clasificados para este vendedor y mes.</td></tr>}</tbody></table></div>
    </Card>

    <Card>
      <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-violet-100 p-3 text-violet-700"><UsersRound size={22} /></div><div><h3 className="text-xl font-black">Comprobantes registrados</h3><p className="mt-1 text-sm text-slate-500">Cada archivo solo se abre mediante un enlace privado temporal.</p></div></div>
      <div className="overflow-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Transferencia</th><th className="p-3">Cotización / cliente</th><th className="p-3">Vendedor</th><th className="p-3">Clasificación</th><th className="p-3">Comisión</th><th className="p-3 text-right">Archivo</th></tr></thead><tbody>{receiptRows.map((receipt) => <tr key={receipt.id} className="border-b align-top hover:bg-slate-50"><td className="p-3"><p className="font-black">{dateLabel(receipt.fecha_transferencia)}</p><p className="mt-1 text-xs text-slate-500">RUT {receipt.rut_transferencia}</p></td><td className="p-3"><p className="font-black">N° {receipt.cotizacion_numero}</p><p className="mt-1 text-xs text-slate-500">{receipt.cliente_nombre || 'Sin cliente'} · {receipt.cliente_rut || 'sin RUT'}</p></td><td className="p-3"><p className="font-semibold">{receipt.vendedor_nombre}</p><p className="mt-1 text-xs text-slate-500">{receipt.vendedor_email || ''}</p></td><td className="p-3"><span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-800">{operationLabel(receipt.tipo_operacion)}</span></td><td className="p-3 font-black text-emerald-700">{clp(receipt.comision_clp)}</td><td className="p-3"><div className="flex justify-end gap-2"><button onClick={() => openReceipt(receipt)} title="Abrir comprobante" className="rounded-lg bg-blue-100 p-2 text-blue-700"><ExternalLink size={16} /></button><button onClick={() => deleteReceipt(receipt)} title="Eliminar comprobante" className="rounded-lg bg-red-100 p-2 text-red-700"><Trash2 size={16} /></button></div></td></tr>)}{!loading && !receiptRows.length && <tr><td colSpan={6} className="p-8 text-center text-slate-500">Aún no hay comprobantes de transferencia guardados.</td></tr>}</tbody></table></div>
    </Card>

    <div className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-600"><BadgeDollarSign className="mr-2 inline text-slate-500" size={17} />El total es una proyección interna. Antes de liquidar, Recursos Humanos debe validar costos, duración del arriendo y cantidad de equipos vendidos.</div>
    <FeedbackToast message={message} onClose={() => setMessage('')} />
  </div>
}
