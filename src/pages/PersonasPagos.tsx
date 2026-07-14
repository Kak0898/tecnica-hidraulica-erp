import { useEffect, useMemo, useRef, useState } from 'react'
import { Banknote, Calculator, CheckCircle2, Clock3, Download, ExternalLink, FileText, Printer, RefreshCw, RotateCcw, Trash2, UserMinus, UserPlus, WalletCards } from 'lucide-react'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
import { supabase } from '../lib/supabase'

const RETENCION_HONORARIOS_2026 = 15.25
const TOPE_PREVISIONAL_UF_2026 = 90
const TOPE_AFC_UF_2026 = 135.2

const AFP_COMISIONES = {
  Capital: 1.44,
  Cuprum: 1.44,
  Habitat: 1.27,
  Modelo: 0.58,
  Planvital: 1.16,
  Provida: 1.45,
  Uno: 0.46,
}

type Persona = {
  id: string
  tipo_relacion: 'contrato' | 'honorarios' | 'proveedor' | 'externo'
  rut?: string
  nombre: string
  email?: string
  telefono?: string
  cargo?: string
  centro_costo?: string
  banco?: string
  tipo_cuenta?: string
  numero_cuenta?: string
  activo?: boolean
}

type PagoPersona = {
  id: string
  persona_id: string
  periodo: string
  tipo_pago: string
  estado: 'pendiente' | 'aprobado' | 'pagado' | 'anulado'
  bruto: number
  retencion: number
  descuentos: number
  liquido: number
  fecha_pago?: string
  numero_documento?: string
  documento_url?: string
  comprobante_url?: string
  notas?: string
  detalle?: Record<string, unknown> | null
  personas?: Persona | null
  created_at?: string
}

type DocumentoPersona = {
  id: string
  persona_id: string
  pago_id?: string
  tipo: string
  periodo?: string
  nombre: string
  url?: string
  notas?: string
  personas?: Persona | null
}

type HoraExtra = {
  id: string
  persona_id: string
  fecha: string
  horas: number
  valor_hora: number
  factor: number
  monto: number
  estado: 'pendiente' | 'aprobada' | 'liquidada' | 'anulada'
  notas?: string
  pago_id?: string
  personas?: Persona | null
}

const emptyPersona = {
  tipo_relacion: 'contrato' as Persona['tipo_relacion'],
  rut: '',
  nombre: '',
  email: '',
  telefono: '',
  cargo: '',
  centro_costo: '',
  banco: '',
  tipo_cuenta: '',
  numero_cuenta: '',
}

const emptyPago = {
  persona_id: '',
  periodo: new Date().toISOString().slice(0, 7),
  tipo_pago: 'sueldo',
  estado: 'pendiente',
  bruto: 0,
  retencion: 0,
  descuentos: 0,
  liquido: 0,
  fecha_pago: '',
  numero_documento: '',
  documento_url: '',
  comprobante_url: '',
  notas: '',
  detalle: null as Record<string, unknown> | null,
}

const emptyDocumento = {
  persona_id: '',
  pago_id: '',
  tipo: 'liquidacion',
  periodo: new Date().toISOString().slice(0, 7),
  nombre: '',
  url: '',
  notas: '',
}

const emptyHoraExtra = {
  persona_id: '',
  fecha: new Date().toISOString().slice(0, 10),
  horas: 0,
  valor_hora: 0,
  factor: 1.5,
  estado: 'aprobada' as HoraExtra['estado'],
  notas: '',
}

const emptySueldo = {
  persona_id: '',
  periodo: new Date().toISOString().slice(0, 7),
  sueldo_base: 0,
  gratificacion: 0,
  bonos_imponibles: 0,
  horas_extra: 0,
  no_imponibles: 0,
  valor_uf: 0,
  tope_previsional_uf: TOPE_PREVISIONAL_UF_2026,
  tope_afc_uf: TOPE_AFC_UF_2026,
  afp: 'Modelo',
  afp_comision: AFP_COMISIONES.Modelo,
  salud_tipo: 'fonasa',
  salud_adicional: 0,
  contrato_tipo: 'indefinido',
  mutual_tasa: 0,
  sis_tasa: 1.62,
  aporte_previsional_empleador_tasa: 1,
  impuesto_unico: 0,
  otros_descuentos: 0,
  anticipos: 0,
}

function money(value: number) {
  return `$${Math.round(Number(value || 0)).toLocaleString('es-CL')}`
}

function monthToDate(value: string) {
  return value ? `${value}-01` : null
}

function nextMonthDate(value: string) {
  if (!value) return null
  const [year, month] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
}

function calcPago(tipo: string, bruto: number, descuentos: number) {
  const gross = Number(bruto || 0)
  const discount = Number(descuentos || 0)
  const retencion = tipo === 'honorario' ? Math.round(gross * (RETENCION_HONORARIOS_2026 / 100)) : 0
  const liquido = Math.max(0, gross - retencion - discount)
  return { retencion, liquido }
}

function calcSueldo(form: typeof emptySueldo) {
  const imponible = Math.round(
    Number(form.sueldo_base || 0) +
    Number(form.gratificacion || 0) +
    Number(form.bonos_imponibles || 0) +
    Number(form.horas_extra || 0),
  )
  const noImponible = Math.round(Number(form.no_imponibles || 0))
  const valorUf = Number(form.valor_uf || 0)
  const topePrevisional = valorUf > 0 ? Math.round(valorUf * Number(form.tope_previsional_uf || 0)) : 0
  const topeAfc = valorUf > 0 ? Math.round(valorUf * Number(form.tope_afc_uf || 0)) : 0
  const basePrevisional = topePrevisional > 0 ? Math.min(imponible, topePrevisional) : imponible
  const baseAfc = topeAfc > 0 ? Math.min(imponible, topeAfc) : imponible
  const afpObligatoria = Math.round(basePrevisional * 0.1)
  const afpComision = Math.round(basePrevisional * (Number(form.afp_comision || 0) / 100))
  const saludBase = Math.round(basePrevisional * 0.07)
  const saludAdicional = Math.round(Number(form.salud_adicional || 0))
  const afc = form.contrato_tipo === 'indefinido' ? Math.round(baseAfc * 0.006) : 0
  const afcEmpleador = Math.round(baseAfc * (form.contrato_tipo === 'indefinido' ? 0.024 : 0.03))
  const mutualEmpleador = Math.round(basePrevisional * (Number(form.mutual_tasa || 0) / 100))
  const sisEmpleador = Math.round(basePrevisional * (Number(form.sis_tasa || 0) / 100))
  const aportePrevisionalEmpleador = Math.round(basePrevisional * (Number(form.aporte_previsional_empleador_tasa || 0) / 100))
  const impuestoUnico = Math.round(Number(form.impuesto_unico || 0))
  const otrosDescuentos = Math.round(Number(form.otros_descuentos || 0))
  const anticipos = Math.round(Number(form.anticipos || 0))
  const totalHaberes = imponible + noImponible
  const totalDescuentos = afpObligatoria + afpComision + saludBase + saludAdicional + afc + impuestoUnico + otrosDescuentos + anticipos
  const liquido = Math.max(0, totalHaberes - totalDescuentos)
  const costoEmpleador = totalHaberes + afcEmpleador + mutualEmpleador + sisEmpleador + aportePrevisionalEmpleador

  return {
    imponible,
    noImponible,
    valorUf,
    topePrevisional,
    topeAfc,
    basePrevisional,
    baseAfc,
    totalHaberes,
    afpObligatoria,
    afpComision,
    saludBase,
    saludAdicional,
    afc,
    afcEmpleador,
    mutualEmpleador,
    sisEmpleador,
    aportePrevisionalEmpleador,
    impuestoUnico,
    otrosDescuentos,
    anticipos,
    totalDescuentos,
    liquido,
    costoEmpleador,
  }
}

function estadoClass(estado: string) {
  if (estado === 'pagado') return 'bg-emerald-50 text-emerald-700'
  if (estado === 'aprobado') return 'bg-blue-50 text-blue-700'
  if (estado === 'anulado') return 'bg-red-50 text-red-700'
  return 'bg-amber-50 text-amber-700'
}

function csvCell(value: unknown) {
  const text = String(value ?? '').replace(/"/g, '""')
  return `"${text}"`
}

function downloadText(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function PersonasPagos() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [pagos, setPagos] = useState<PagoPersona[]>([])
  const [documentos, setDocumentos] = useState<DocumentoPersona[]>([])
  const [horasExtra, setHorasExtra] = useState<HoraExtra[]>([])
  const [personaForm, setPersonaForm] = useState(emptyPersona)
  const [pagoForm, setPagoForm] = useState(emptyPago)
  const [documentoForm, setDocumentoForm] = useState(emptyDocumento)
  const [sueldoForm, setSueldoForm] = useState(emptySueldo)
  const [horaExtraForm, setHoraExtraForm] = useState(emptyHoraExtra)
  const [liquidacionPreview, setLiquidacionPreview] = useState<{ html: string; filename: string } | null>(null)
  const liquidacionFrameRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')

    const [personasResult, pagosResult, documentosResult, horasExtraResult] = await Promise.all([
      supabase
        .from('personas')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('pagos_personas')
        .select('*, personas(id, nombre, rut, tipo_relacion, cargo, email, banco, tipo_cuenta, numero_cuenta)')
        .order('periodo', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('documentos_personas')
        .select('*, personas(id, nombre, rut, tipo_relacion, cargo)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('horas_extra')
        .select('*, personas(id, nombre, rut, tipo_relacion, cargo)')
        .order('fecha', { ascending: false })
        .limit(200),
    ])

    if (personasResult.error) setMessage(personasResult.error.message)
    setPersonas((personasResult.data || []) as Persona[])
    setPagos((pagosResult.data || []) as PagoPersona[])
    setDocumentos((documentosResult.data || []) as DocumentoPersona[])
    setHorasExtra((horasExtraResult.data || []) as HoraExtra[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const resumen = useMemo(() => {
    const pendientes = pagos.filter((pago) => pago.estado === 'pendiente' || pago.estado === 'aprobado')
    const pagados = pagos.filter((pago) => pago.estado === 'pagado')
    return {
      personas: personas.filter((persona) => persona.activo !== false).length,
      pendientes: pendientes.reduce((sum, pago) => sum + Number(pago.liquido || 0), 0),
      pagados: pagados.reduce((sum, pago) => sum + Number(pago.liquido || 0), 0),
      honorarios: pagos.filter((pago) => pago.tipo_pago === 'honorario').reduce((sum, pago) => sum + Number(pago.retencion || 0), 0),
    }
  }, [personas, pagos])

  const sueldoCalculado = useMemo(() => calcSueldo(sueldoForm), [sueldoForm])

  const personasActivas = useMemo(() => personas.filter((persona) => persona.activo !== false), [personas])

  const horasExtraPeriodo = useMemo(() => horasExtra.filter((item) => (
    item.persona_id === sueldoForm.persona_id
    && item.fecha?.slice(0, 7) === sueldoForm.periodo
    && item.estado === 'aprobada'
  )), [horasExtra, sueldoForm.persona_id, sueldoForm.periodo])

  const totalHorasExtraPeriodo = useMemo(() => horasExtraPeriodo.reduce((total, item) => total + Number(item.monto || 0), 0), [horasExtraPeriodo])

  const anticiposPeriodo = useMemo(() => pagos.filter((pago) => (
    pago.persona_id === sueldoForm.persona_id
    && pago.tipo_pago === 'anticipo'
    && pago.estado === 'pagado'
    && pago.periodo?.slice(0, 7) === sueldoForm.periodo
  )).reduce((total, pago) => total + Number(pago.liquido || 0), 0), [pagos, sueldoForm.persona_id, sueldoForm.periodo])

  const pagosTransferibles = useMemo(() => {
    return pagos.filter((pago) => ['pendiente', 'aprobado'].includes(pago.estado) && Number(pago.liquido || 0) > 0)
  }, [pagos])

  const pagosAprobados = useMemo(() => {
    return pagos.filter((pago) => pago.estado === 'aprobado')
  }, [pagos])

  function liquidacionDetalle(persona?: Persona | null) {
    return {
      version: 'sueldo-cl-2026-v2',
      persona: persona ? {
        id: persona.id,
        nombre: persona.nombre,
        rut: persona.rut || null,
        cargo: persona.cargo || null,
        centro_costo: persona.centro_costo || null,
      } : null,
      periodo: sueldoForm.periodo,
      contrato_tipo: sueldoForm.contrato_tipo,
      afp: sueldoForm.afp,
      salud_tipo: sueldoForm.salud_tipo,
      parametros: {
        valor_uf: sueldoForm.valor_uf,
        tope_previsional_uf: sueldoForm.tope_previsional_uf,
        tope_afc_uf: sueldoForm.tope_afc_uf,
        afp_comision: sueldoForm.afp_comision,
        mutual_tasa: sueldoForm.mutual_tasa,
        sis_tasa: sueldoForm.sis_tasa,
        aporte_previsional_empleador_tasa: sueldoForm.aporte_previsional_empleador_tasa,
      },
      haberes: {
        sueldo_base: sueldoForm.sueldo_base,
        gratificacion: sueldoForm.gratificacion,
        bonos_imponibles: sueldoForm.bonos_imponibles,
        horas_extra: sueldoForm.horas_extra,
        no_imponibles: sueldoForm.no_imponibles,
        imponible: sueldoCalculado.imponible,
        total_haberes: sueldoCalculado.totalHaberes,
      },
      bases: {
        previsional: sueldoCalculado.basePrevisional,
        afc: sueldoCalculado.baseAfc,
        tope_previsional: sueldoCalculado.topePrevisional,
        tope_afc: sueldoCalculado.topeAfc,
      },
      descuentos_trabajador: {
        afp_obligatoria: sueldoCalculado.afpObligatoria,
        afp_comision: sueldoCalculado.afpComision,
        salud_base: sueldoCalculado.saludBase,
        salud_adicional: sueldoCalculado.saludAdicional,
        afc: sueldoCalculado.afc,
        impuesto_unico: sueldoCalculado.impuestoUnico,
        otros_descuentos: sueldoCalculado.otrosDescuentos,
        anticipos: sueldoCalculado.anticipos,
        total_descuentos: sueldoCalculado.totalDescuentos,
      },
      aportes_empleador: {
        afc: sueldoCalculado.afcEmpleador,
        mutual: sueldoCalculado.mutualEmpleador,
        sis: sueldoCalculado.sisEmpleador,
        aporte_previsional: sueldoCalculado.aportePrevisionalEmpleador,
      },
      liquido: sueldoCalculado.liquido,
      costo_empleador: sueldoCalculado.costoEmpleador,
    }
  }

  function updatePago(values: Partial<typeof pagoForm>) {
    setPagoForm((current) => {
      const next = { ...current, ...values }
      const calculated = calcPago(next.tipo_pago, next.bruto, next.descuentos)
      return { ...next, ...calculated }
    })
  }

  function updateSueldo(values: Partial<typeof sueldoForm>) {
    setSueldoForm((current) => {
      const next = { ...current, ...values }
      if (values.afp && values.afp in AFP_COMISIONES) {
        next.afp_comision = AFP_COMISIONES[values.afp as keyof typeof AFP_COMISIONES]
      }
      return next
    })
  }

  function usarSueldoComoPago() {
    if (!sueldoForm.persona_id) {
      setMessage('Selecciona una persona para usar el cálculo como pago.')
      return
    }

    setPagoForm({
      ...emptyPago,
      persona_id: sueldoForm.persona_id,
      periodo: sueldoForm.periodo,
      tipo_pago: 'sueldo',
      estado: 'pendiente',
      bruto: sueldoCalculado.totalHaberes,
      retencion: 0,
      descuentos: sueldoCalculado.totalDescuentos,
      liquido: sueldoCalculado.liquido,
      detalle: liquidacionDetalle(personas.find((item) => item.id === sueldoForm.persona_id)),
      notas: `Liquidación ${sueldoForm.periodo}. AFP ${sueldoForm.afp}. Salud ${sueldoForm.salud_tipo}.`,
    })
    setMessage('Cálculo copiado al formulario de pago.')
  }

  function generarLiquidacion() {
    const persona = personas.find((item) => item.id === sueldoForm.persona_id)
    if (!persona) {
      setMessage('Selecciona una persona para generar liquidación.')
      return
    }

    const rowsHaberes: Array<[string, number]> = [
      ['Sueldo base', sueldoForm.sueldo_base],
      ['Gratificación', sueldoForm.gratificacion],
      ['Bonos imponibles', sueldoForm.bonos_imponibles],
      ['Horas extra', sueldoForm.horas_extra],
      ['Haberes no imponibles', sueldoForm.no_imponibles],
    ]

    const rowsDescuentos: Array<[string, number]> = [
      [`AFP 10% (${sueldoForm.afp})`, sueldoCalculado.afpObligatoria],
      [`Comisión AFP ${sueldoForm.afp_comision}%`, sueldoCalculado.afpComision],
      [`Salud 7% (${sueldoForm.salud_tipo})`, sueldoCalculado.saludBase],
      ['Salud adicional / Isapre', sueldoCalculado.saludAdicional],
      ['AFC trabajador', sueldoCalculado.afc],
      ['Impuesto único', sueldoCalculado.impuestoUnico],
      ['Otros descuentos', sueldoCalculado.otrosDescuentos],
      ['Anticipos', sueldoCalculado.anticipos],
    ]

    const rowsEmpleador: Array<[string, number]> = [
      [`AFC empleador ${sueldoForm.contrato_tipo === 'indefinido' ? '2.4%' : '3%'}`, sueldoCalculado.afcEmpleador],
      [`Mutual ${sueldoForm.mutual_tasa}%`, sueldoCalculado.mutualEmpleador],
      [`SIS ${sueldoForm.sis_tasa}%`, sueldoCalculado.sisEmpleador],
      [`Aporte previsional empleador ${sueldoForm.aporte_previsional_empleador_tasa}%`, sueldoCalculado.aportePrevisionalEmpleador],
    ]

    const tableRows = (rows: Array<[string, number]>) => rows.map(([label, value]) => `
      <tr>
        <td>${label}</td>
        <td class="num">${money(Number(value || 0))}</td>
      </tr>
    `).join('')

    const html = `<!doctype html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Liquidación ${persona.nombre} ${sueldoForm.periodo}</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;margin:32px;color:#111827}
          h1{font-size:22px;margin:0 0 4px}
          .muted{color:#64748b;font-size:13px}
          .box{border:1px solid #cbd5e1;border-radius:8px;padding:14px;margin:16px 0}
          .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
          .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
          table{width:100%;border-collapse:collapse;margin-top:10px}
          th{background:#0f172a;color:white;text-align:left;padding:8px}
          td{border:1px solid #cbd5e1;padding:8px;font-size:13px}
          .num{text-align:right}
          .total{font-weight:800;background:#f1f5f9}
          .final{font-size:18px;font-weight:900;color:#065f46}
          .sign{display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:72px;text-align:center}
          .line{border-top:1px solid #111827;padding-top:8px}
          @media print{button{display:none}body{margin:18mm}}
        </style>
      </head>
      <body>
        <h1>Liquidación de Remuneraciones</h1>
        <div class="muted">Periodo ${sueldoForm.periodo}</div>
        <div class="box">
          <b>Trabajador:</b> ${persona.nombre}<br>
          <b>RUT:</b> ${persona.rut || '-'}<br>
          <b>Cargo:</b> ${persona.cargo || '-'}<br>
          <b>Centro de costo:</b> ${persona.centro_costo || '-'}
        </div>
        <div class="grid3">
          <div class="box"><b>Base imponible:</b><br>${money(sueldoCalculado.imponible)}</div>
          <div class="box"><b>Base previsional:</b><br>${money(sueldoCalculado.basePrevisional)}</div>
          <div class="box"><b>Base AFC:</b><br>${money(sueldoCalculado.baseAfc)}</div>
        </div>
        <div class="grid">
          <div>
            <table>
              <tr><th colspan="2">Haberes</th></tr>
              ${tableRows(rowsHaberes)}
              <tr class="total"><td>Total imponible</td><td class="num">${money(sueldoCalculado.imponible)}</td></tr>
              <tr class="total"><td>Total haberes</td><td class="num">${money(sueldoCalculado.totalHaberes)}</td></tr>
            </table>
          </div>
          <div>
            <table>
              <tr><th colspan="2">Descuentos</th></tr>
              ${tableRows(rowsDescuentos)}
              <tr class="total"><td>Total descuentos</td><td class="num">${money(sueldoCalculado.totalDescuentos)}</td></tr>
            </table>
          </div>
        </div>
        <div class="box final">Líquido a pagar: ${money(sueldoCalculado.liquido)}</div>
        <div class="box">
          <table>
            <tr><th colspan="2">Aportes y costo empleador</th></tr>
            ${tableRows(rowsEmpleador)}
            <tr class="total"><td>Costo empresa estimado</td><td class="num">${money(sueldoCalculado.costoEmpleador)}</td></tr>
          </table>
        </div>
        <div class="muted">Cálculo referencial. Verificar topes imponibles, impuesto único mensual, pactos de salud/Isapre y normativa vigente antes del pago definitivo.</div>
        <div class="sign">
          <div class="line">Empleador</div>
          <div class="line">Trabajador</div>
        </div>
      </body>
      </html>`

    setLiquidacionPreview({
      html,
      filename: `liquidacion-${persona.nombre.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-')}-${sueldoForm.periodo}.html`,
    })
    setMessage('Liquidación generada. Revísala y usa Imprimir / PDF para guardarla.')
  }

  function imprimirLiquidacion() {
    const contentWindow = liquidacionFrameRef.current?.contentWindow
    if (!contentWindow) {
      setMessage('La vista de la liquidación todavía se está preparando. Intenta nuevamente.')
      return
    }
    contentWindow.focus()
    contentWindow.print()
  }

  function descargarLiquidacion() {
    if (!liquidacionPreview) return
    downloadText(liquidacionPreview.filename, liquidacionPreview.html, 'text/html;charset=utf-8')
    setMessage('Archivo de liquidación descargado.')
  }

  async function savePersona() {
    if (!personaForm.nombre.trim()) {
      setMessage('Ingresa el nombre de la persona.')
      return
    }

    setSaving(true)
    setMessage('')

    const { error } = await supabase.from('personas').insert({
      tipo_relacion: personaForm.tipo_relacion,
      rut: personaForm.rut.trim() || null,
      nombre: personaForm.nombre.trim(),
      email: personaForm.email.trim() || null,
      telefono: personaForm.telefono.trim() || null,
      cargo: personaForm.cargo.trim() || null,
      centro_costo: personaForm.centro_costo.trim() || null,
      banco: personaForm.banco.trim() || null,
      tipo_cuenta: personaForm.tipo_cuenta.trim() || null,
      numero_cuenta: personaForm.numero_cuenta.trim() || null,
    })

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setPersonaForm(emptyPersona)
    setMessage('Persona guardada.')
    await load()
  }

  async function removePersona(persona: Persona) {
    if (!window.confirm(`¿Eliminar a ${persona.nombre} de la nómina?`)) return

    setSaving(true)
    const hasHistory = pagos.some((pago) => pago.persona_id === persona.id)
      || documentos.some((documento) => documento.persona_id === persona.id)
      || horasExtra.some((item) => item.persona_id === persona.id)

    const result = hasHistory
      ? await supabase.from('personas').update({ activo: false }).eq('id', persona.id)
      : await supabase.from('personas').delete().eq('id', persona.id)

    setSaving(false)
    if (result.error) {
      setMessage(result.error.message)
      return
    }

    setMessage(hasHistory ? 'Trabajador desactivado. Su historial de pagos se conservó.' : 'Trabajador eliminado.')
    await load()
  }

  async function reactivatePersona(persona: Persona) {
    const { error } = await supabase.from('personas').update({ activo: true }).eq('id', persona.id)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Trabajador reactivado.')
    await load()
  }

  async function saveHoraExtra() {
    if (!horaExtraForm.persona_id || !horaExtraForm.fecha || Number(horaExtraForm.horas) <= 0 || Number(horaExtraForm.valor_hora) <= 0) {
      setMessage('Completa trabajador, fecha, horas y valor de la hora.')
      return
    }

    setSaving(true)
    const monto = Math.round(Number(horaExtraForm.horas) * Number(horaExtraForm.valor_hora) * Number(horaExtraForm.factor))
    const { error } = await supabase.from('horas_extra').insert({
      persona_id: horaExtraForm.persona_id,
      fecha: horaExtraForm.fecha,
      horas: Number(horaExtraForm.horas),
      valor_hora: Number(horaExtraForm.valor_hora),
      factor: Number(horaExtraForm.factor),
      monto,
      estado: horaExtraForm.estado,
      notas: horaExtraForm.notas.trim() || null,
    })
    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setHoraExtraForm((current) => ({ ...emptyHoraExtra, persona_id: current.persona_id }))
    setMessage(`Horas extra registradas por ${money(monto)}.`)
    await load()
  }

  async function updateHoraExtra(id: string, estado: HoraExtra['estado']) {
    const { error } = await supabase.from('horas_extra').update({ estado }).eq('id', id)
    if (error) {
      setMessage(error.message)
      return
    }
    setHorasExtra((current) => current.map((item) => item.id === id ? { ...item, estado } : item))
  }

  async function deleteHoraExtra(id: string) {
    if (!window.confirm('¿Eliminar este registro de horas extra?')) return
    const { error } = await supabase.from('horas_extra').delete().eq('id', id)
    if (error) {
      setMessage(error.message)
      return
    }
    setHorasExtra((current) => current.filter((item) => item.id !== id))
    setMessage('Registro de horas extra eliminado.')
  }

  async function savePago() {
    if (!pagoForm.persona_id) {
      setMessage('Selecciona una persona para el pago.')
      return
    }

    setSaving(true)
    setMessage('')

    const calculated = calcPago(pagoForm.tipo_pago, pagoForm.bruto, pagoForm.descuentos)
    const { data: savedPayment, error } = await supabase.from('pagos_personas').insert({
      persona_id: pagoForm.persona_id,
      periodo: monthToDate(pagoForm.periodo),
      tipo_pago: pagoForm.tipo_pago,
      estado: pagoForm.estado,
      bruto: Number(pagoForm.bruto || 0),
      retencion: calculated.retencion,
      descuentos: Number(pagoForm.descuentos || 0),
      liquido: calculated.liquido,
      fecha_pago: pagoForm.fecha_pago || null,
      numero_documento: pagoForm.numero_documento.trim() || null,
      documento_url: pagoForm.documento_url.trim() || null,
      comprobante_url: pagoForm.comprobante_url.trim() || null,
      notas: pagoForm.notas.trim() || null,
      detalle: pagoForm.detalle || {},
    }).select('id').single()

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    if (pagoForm.tipo_pago === 'sueldo' && savedPayment?.id) {
      await supabase
        .from('horas_extra')
        .update({ estado: 'liquidada', pago_id: savedPayment.id })
        .eq('persona_id', pagoForm.persona_id)
        .eq('estado', 'aprobada')
        .gte('fecha', `${pagoForm.periodo}-01`)
        .lt('fecha', nextMonthDate(pagoForm.periodo))
    }

    setPagoForm(emptyPago)
    setMessage('Pago registrado.')
    await load()
  }

  async function saveDocumento() {
    if (!documentoForm.persona_id || !documentoForm.nombre.trim()) {
      setMessage('Selecciona persona e ingresa nombre del documento.')
      return
    }

    setSaving(true)
    setMessage('')

    const { error } = await supabase.from('documentos_personas').insert({
      persona_id: documentoForm.persona_id,
      pago_id: documentoForm.pago_id || null,
      tipo: documentoForm.tipo,
      periodo: monthToDate(documentoForm.periodo),
      nombre: documentoForm.nombre.trim(),
      url: documentoForm.url.trim() || null,
      notas: documentoForm.notas.trim() || null,
    })

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setDocumentoForm(emptyDocumento)
    setMessage('Documento guardado.')
    await load()
  }

  async function updateEstadoPago(id: string, estado: PagoPersona['estado']) {
    const { error } = await supabase
      .from('pagos_personas')
      .update({
        estado,
        fecha_pago: estado === 'pagado' ? new Date().toISOString().slice(0, 10) : null,
      })
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setPagos((current) => current.map((pago) => pago.id === id ? { ...pago, estado } : pago))
  }

  async function aprobarPendientes() {
    const ids = pagos.filter((pago) => pago.estado === 'pendiente').map((pago) => pago.id)
    if (!ids.length) {
      setMessage('No hay pagos pendientes para aprobar.')
      return
    }

    const { error } = await supabase
      .from('pagos_personas')
      .update({ estado: 'aprobado' })
      .in('id', ids)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(`${ids.length} pagos aprobados.`)
    await load()
  }

  async function marcarAprobadosPagados() {
    const ids = pagosAprobados.map((pago) => pago.id)
    if (!ids.length) {
      setMessage('No hay pagos aprobados para marcar como pagados.')
      return
    }

    const { error } = await supabase
      .from('pagos_personas')
      .update({
        estado: 'pagado',
        fecha_pago: new Date().toISOString().slice(0, 10),
      })
      .in('id', ids)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(`${ids.length} pagos marcados como pagados.`)
    await load()
  }

  function exportarPlanillaBanco() {
    if (!pagosTransferibles.length) {
      setMessage('No hay pagos pendientes o aprobados para exportar.')
      return
    }

    const header = [
      'nombre',
      'rut',
      'banco',
      'tipo_cuenta',
      'numero_cuenta',
      'email',
      'monto_liquido',
      'tipo_pago',
      'periodo',
      'glosa',
    ]

    const rows = pagosTransferibles.map((pago) => [
      pago.personas?.nombre || '',
      pago.personas?.rut || '',
      pago.personas?.banco || '',
      pago.personas?.tipo_cuenta || '',
      pago.personas?.numero_cuenta || '',
      pago.personas?.email || '',
      Math.round(Number(pago.liquido || 0)),
      pago.tipo_pago,
      pago.periodo,
      `${pago.tipo_pago} ${pago.periodo}`,
    ])

    const csv = [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\n')
    downloadText(`planilla-pagos-${new Date().toISOString().slice(0, 10)}.csv`, csv)
    setMessage(`Planilla generada con ${rows.length} pagos.`)
  }

  function exportarHonorariosSII() {
    const honorarios = pagos.filter((pago) => pago.tipo_pago === 'honorario' && pago.estado !== 'anulado')
    if (!honorarios.length) {
      setMessage('No hay pagos de honorarios para exportar.')
      return
    }

    const header = ['nombre', 'rut', 'periodo', 'bruto', 'retencion_15_25', 'liquido', 'numero_boleta', 'estado']
    const rows = honorarios.map((pago) => [
      pago.personas?.nombre || '',
      pago.personas?.rut || '',
      pago.periodo,
      Math.round(Number(pago.bruto || 0)),
      Math.round(Number(pago.retencion || 0)),
      Math.round(Number(pago.liquido || 0)),
      pago.numero_documento || '',
      pago.estado,
    ])

    const csv = [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\n')
    downloadText(`honorarios-sii-${new Date().toISOString().slice(0, 10)}.csv`, csv)
    setMessage(`Resumen de honorarios generado con ${rows.length} registros.`)
  }

  function abrirSIIHonorarios() {
    window.open('https://www.sii.cl/servicios_online/1040-.html', '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-950">Personas y Pagos</h2>
          <p className="mt-2 text-slate-600">Control de empleados, honorarios, liquidaciones, boletas y comprobantes por empresa.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={exportarPlanillaBanco} className="inline-flex items-center justify-center gap-2 rounded bg-slate-900 px-4 py-3 text-white">
            <Download size={18} />
            Planilla banco
          </button>
          <button onClick={abrirSIIHonorarios} className="inline-flex items-center justify-center gap-2 rounded bg-emerald-700 px-4 py-3 text-white">
            <ExternalLink size={18} />
            SII honorarios
          </button>
          <button onClick={load} disabled={loading || saving} className="inline-flex items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50">
            <RefreshCw size={18} />
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      <FeedbackToast message={message} onClose={() => setMessage('')} />

      <div className="mb-4 grid gap-4 md:grid-cols-4">
        <Card><p className="text-sm text-slate-500">Personas</p><p className="mt-2 text-3xl font-bold text-slate-950">{resumen.personas}</p></Card>
        <Card><p className="text-sm text-slate-500">Pendiente/Aprobado</p><p className="mt-2 text-3xl font-bold text-amber-700">{money(resumen.pendientes)}</p></Card>
        <Card><p className="text-sm text-slate-500">Pagado</p><p className="mt-2 text-3xl font-bold text-emerald-700">{money(resumen.pagados)}</p></Card>
        <Card><p className="text-sm text-slate-500">Retención honorarios</p><p className="mt-2 text-3xl font-bold text-blue-700">{money(resumen.honorarios)}</p></Card>
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center">
          <div>
            <h3 className="font-bold text-slate-950">Operación de pago</h3>
            <p className="text-sm text-slate-500">
              {pagosTransferibles.length} pagos listos para planilla · {pagosAprobados.length} aprobados listos para marcar como pagados.
            </p>
          </div>
          <button onClick={aprobarPendientes} className="inline-flex items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 text-sm font-semibold text-white">
            <CheckCircle2 size={17} />
            Aprobar pendientes
          </button>
          <button onClick={marcarAprobadosPagados} className="inline-flex items-center justify-center gap-2 rounded bg-emerald-600 px-4 py-3 text-sm font-semibold text-white">
            <Banknote size={17} />
            Marcar pagados
          </button>
          <button onClick={exportarHonorariosSII} className="inline-flex items-center justify-center gap-2 rounded bg-slate-700 px-4 py-3 text-sm font-semibold text-white">
            <Download size={17} />
            Resumen honorarios
          </button>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <UserPlus className="text-blue-700" />
              <h3 className="text-lg font-bold text-slate-950">Nuevo trabajador</h3>
            </div>
            <div className="grid gap-3">
              <select className="rounded border border-slate-300 px-3 py-3" value={personaForm.tipo_relacion} onChange={(event) => setPersonaForm({ ...personaForm, tipo_relacion: event.target.value as Persona['tipo_relacion'] })}>
                <option value="contrato">Contrato</option>
                <option value="honorarios">Honorarios</option>
                <option value="proveedor">Proveedor</option>
                <option value="externo">Externo</option>
              </select>
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="Nombre" value={personaForm.nombre} onChange={(event) => setPersonaForm({ ...personaForm, nombre: event.target.value })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="rounded border border-slate-300 px-3 py-3" placeholder="RUT" value={personaForm.rut} onChange={(event) => setPersonaForm({ ...personaForm, rut: event.target.value })} />
                <input className="rounded border border-slate-300 px-3 py-3" placeholder="Cargo" value={personaForm.cargo} onChange={(event) => setPersonaForm({ ...personaForm, cargo: event.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="rounded border border-slate-300 px-3 py-3" placeholder="Email" value={personaForm.email} onChange={(event) => setPersonaForm({ ...personaForm, email: event.target.value })} />
                <input className="rounded border border-slate-300 px-3 py-3" placeholder="Teléfono" value={personaForm.telefono} onChange={(event) => setPersonaForm({ ...personaForm, telefono: event.target.value })} />
              </div>
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="Centro de costo" value={personaForm.centro_costo} onChange={(event) => setPersonaForm({ ...personaForm, centro_costo: event.target.value })} />
              <div className="grid gap-3 sm:grid-cols-3">
                <input className="rounded border border-slate-300 px-3 py-3" placeholder="Banco" value={personaForm.banco} onChange={(event) => setPersonaForm({ ...personaForm, banco: event.target.value })} />
                <input className="rounded border border-slate-300 px-3 py-3" placeholder="Tipo cuenta" value={personaForm.tipo_cuenta} onChange={(event) => setPersonaForm({ ...personaForm, tipo_cuenta: event.target.value })} />
                <input className="rounded border border-slate-300 px-3 py-3" placeholder="N° cuenta" value={personaForm.numero_cuenta} onChange={(event) => setPersonaForm({ ...personaForm, numero_cuenta: event.target.value })} />
              </div>
            </div>
            <button onClick={savePersona} disabled={saving} className="mt-4 w-full rounded bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{saving ? 'Guardando...' : 'Agregar trabajador'}</button>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-2">
              <Clock3 className="text-violet-700" />
              <h3 className="text-lg font-bold text-slate-950">Registrar horas extra</h3>
            </div>
            <div className="grid gap-3">
              <select className="rounded border border-slate-300 px-3 py-3" value={horaExtraForm.persona_id} onChange={(event) => setHoraExtraForm({ ...horaExtraForm, persona_id: event.target.value })}>
                <option value="">Trabajador</option>
                {personasActivas.filter((persona) => persona.tipo_relacion === 'contrato').map((persona) => <option key={persona.id} value={persona.id}>{persona.nombre}</option>)}
              </select>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="rounded border border-slate-300 px-3 py-3" type="date" value={horaExtraForm.fecha} onChange={(event) => setHoraExtraForm({ ...horaExtraForm, fecha: event.target.value })} />
                <select className="rounded border border-slate-300 px-3 py-3" value={horaExtraForm.estado} onChange={(event) => setHoraExtraForm({ ...horaExtraForm, estado: event.target.value as HoraExtra['estado'] })}>
                  <option value="pendiente">Pendiente</option>
                  <option value="aprobada">Aprobada</option>
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <input className="rounded border border-slate-300 px-3 py-3" type="number" min="0" step="0.25" placeholder="Horas" value={horaExtraForm.horas} onChange={(event) => setHoraExtraForm({ ...horaExtraForm, horas: Number(event.target.value) })} />
                <input className="rounded border border-slate-300 px-3 py-3" type="number" min="0" placeholder="Valor hora" value={horaExtraForm.valor_hora} onChange={(event) => setHoraExtraForm({ ...horaExtraForm, valor_hora: Number(event.target.value) })} />
                <input className="rounded border border-slate-300 px-3 py-3" type="number" min="1.5" step="0.1" placeholder="Factor" value={horaExtraForm.factor} onChange={(event) => setHoraExtraForm({ ...horaExtraForm, factor: Number(event.target.value) })} />
              </div>
              <textarea className="min-h-20 rounded border border-slate-300 px-3 py-3" placeholder="Motivo u observación" value={horaExtraForm.notas} onChange={(event) => setHoraExtraForm({ ...horaExtraForm, notas: event.target.value })} />
              <div className="rounded border border-violet-100 bg-violet-50 p-3 text-sm text-violet-900">
                Monto estimado: <b>{money(Number(horaExtraForm.horas) * Number(horaExtraForm.valor_hora) * Number(horaExtraForm.factor))}</b>
              </div>
            </div>
            <button onClick={saveHoraExtra} disabled={saving} className="mt-4 w-full rounded bg-violet-700 px-4 py-3 font-semibold text-white disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar horas extra'}</button>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-2">
              <Calculator className="text-blue-700" />
              <h3 className="text-lg font-bold text-slate-950">Calculadora de Sueldo</h3>
            </div>

            <div className="grid gap-4">
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Trabajador
                <select className="rounded border border-slate-300 bg-white px-3 py-3 font-normal text-slate-950" value={sueldoForm.persona_id} onChange={(event) => updateSueldo({ persona_id: event.target.value })}>
                  <option value="">Seleccionar trabajador</option>
                  {personasActivas.filter((persona) => persona.tipo_relacion === 'contrato').map((persona) => <option key={persona.id} value={persona.id}>{persona.nombre} · {persona.rut || 'sin RUT'}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Periodo de liquidación<input className="rounded border border-slate-300 px-3 py-3 font-normal text-slate-950" type="month" value={sueldoForm.periodo} onChange={(event) => updateSueldo({ periodo: event.target.value })} /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Tipo de contrato<select className="rounded border border-slate-300 bg-white px-3 py-3 font-normal text-slate-950" value={sueldoForm.contrato_tipo} onChange={(event) => updateSueldo({ contrato_tipo: event.target.value })}>
                  <option value="indefinido">Contrato indefinido</option>
                  <option value="plazo_fijo">Plazo fijo / obra</option>
                </select></label>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <h4 className="font-bold text-slate-950">Haberes del período</h4>
                <p className="mt-1 text-xs text-slate-500">Estos montos forman el total imponible y los haberes no imponibles.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Sueldo base imponible<input className="rounded border border-slate-300 px-3 py-3 font-normal text-slate-950" type="number" min="0" value={sueldoForm.sueldo_base} onChange={(event) => updateSueldo({ sueldo_base: Number(event.target.value) })} /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Gratificación imponible<input className="rounded border border-slate-300 px-3 py-3 font-normal text-slate-950" type="number" min="0" value={sueldoForm.gratificacion} onChange={(event) => updateSueldo({ gratificacion: Number(event.target.value) })} /></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Bonos imponibles<input className="rounded border border-slate-300 px-3 py-3 font-normal text-slate-950" type="number" min="0" value={sueldoForm.bonos_imponibles} onChange={(event) => updateSueldo({ bonos_imponibles: Number(event.target.value) })} /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Monto horas extra<input className="rounded border border-slate-300 px-3 py-3 font-normal text-slate-950" type="number" min="0" value={sueldoForm.horas_extra} onChange={(event) => updateSueldo({ horas_extra: Number(event.target.value) })} /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Haberes no imponibles<input className="rounded border border-slate-300 px-3 py-3 font-normal text-slate-950" type="number" min="0" value={sueldoForm.no_imponibles} onChange={(event) => updateSueldo({ no_imponibles: Number(event.target.value) })} /></label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => sueldoForm.persona_id ? updateSueldo({ horas_extra: totalHorasExtraPeriodo }) : setMessage('Selecciona un trabajador antes de cargar sus horas extra.')} className="rounded border border-violet-200 bg-violet-50 px-3 py-2 text-left text-xs font-semibold text-violet-800">
                  Cargar {horasExtraPeriodo.reduce((total, item) => total + Number(item.horas), 0)} h aprobadas · {money(totalHorasExtraPeriodo)}
                </button>
                <button type="button" onClick={() => sueldoForm.persona_id ? updateSueldo({ anticipos: anticiposPeriodo }) : setMessage('Selecciona un trabajador antes de cargar sus anticipos pagados.')} className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-semibold text-amber-800">
                  Cargar anticipos pagados · {money(anticiposPeriodo)}
                </button>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <h4 className="font-bold text-slate-950">Bases y parámetros previsionales</h4>
                <p className="mt-1 text-xs text-slate-500">La base previsional y la base AFC se calculan aplicando estos topes al total imponible.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Valor UF del mes<input className="rounded border border-slate-300 px-3 py-3 font-normal text-slate-950" type="number" min="0" value={sueldoForm.valor_uf} onChange={(event) => updateSueldo({ valor_uf: Number(event.target.value) })} /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Tope previsional (UF)<input className="rounded border border-slate-300 px-3 py-3 font-normal text-slate-950" type="number" min="0" step="0.1" value={sueldoForm.tope_previsional_uf} onChange={(event) => updateSueldo({ tope_previsional_uf: Number(event.target.value) })} /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Tope AFC (UF)<input className="rounded border border-slate-300 px-3 py-3 font-normal text-slate-950" type="number" min="0" step="0.1" value={sueldoForm.tope_afc_uf} onChange={(event) => updateSueldo({ tope_afc_uf: Number(event.target.value) })} /></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">AFP<select className="rounded border border-slate-300 bg-white px-3 py-3 font-normal text-slate-950" value={sueldoForm.afp} onChange={(event) => updateSueldo({ afp: event.target.value })}>
                  {Object.entries(AFP_COMISIONES).map(([afp, comision]) => <option key={afp} value={afp}>{afp} · {comision}%</option>)}
                </select></label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Comisión AFP (%)<input className="rounded border border-slate-300 px-3 py-3 font-normal text-slate-950" type="number" min="0" step="0.01" value={sueldoForm.afp_comision} onChange={(event) => updateSueldo({ afp_comision: Number(event.target.value) })} /></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Sistema de salud<select className="rounded border border-slate-300 bg-white px-3 py-3 font-normal text-slate-950" value={sueldoForm.salud_tipo} onChange={(event) => updateSueldo({ salud_tipo: event.target.value })}>
                  <option value="fonasa">Fonasa 7%</option>
                  <option value="isapre">Isapre 7% + adicional</option>
                </select></label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Adicional de salud / Isapre<input className="rounded border border-slate-300 px-3 py-3 font-normal text-slate-950" type="number" min="0" value={sueldoForm.salud_adicional} onChange={(event) => updateSueldo({ salud_adicional: Number(event.target.value) })} /></label>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <h4 className="font-bold text-slate-950">Aportes del empleador</h4>
                <p className="mt-1 text-xs text-slate-500">Se suman al costo empresa, pero no se descuentan del líquido del trabajador.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Mutual empleador (%)<input className="rounded border border-slate-300 px-3 py-3 font-normal text-slate-950" type="number" min="0" step="0.01" value={sueldoForm.mutual_tasa} onChange={(event) => updateSueldo({ mutual_tasa: Number(event.target.value) })} /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">SIS empleador (%)<input className="rounded border border-slate-300 px-3 py-3 font-normal text-slate-950" type="number" min="0" step="0.01" value={sueldoForm.sis_tasa} onChange={(event) => updateSueldo({ sis_tasa: Number(event.target.value) })} /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Aporte previsional empleador (%)<input className="rounded border border-slate-300 px-3 py-3 font-normal text-slate-950" type="number" min="0" step="0.01" value={sueldoForm.aporte_previsional_empleador_tasa} onChange={(event) => updateSueldo({ aporte_previsional_empleador_tasa: Number(event.target.value) })} /></label>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <h4 className="font-bold text-slate-950">Otros descuentos del trabajador</h4>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Impuesto único<input className="rounded border border-slate-300 px-3 py-3 font-normal text-slate-950" type="number" min="0" value={sueldoForm.impuesto_unico} onChange={(event) => updateSueldo({ impuesto_unico: Number(event.target.value) })} /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Otros descuentos<input className="rounded border border-slate-300 px-3 py-3 font-normal text-slate-950" type="number" min="0" value={sueldoForm.otros_descuentos} onChange={(event) => updateSueldo({ otros_descuentos: Number(event.target.value) })} /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Anticipos pagados<input className="rounded border border-slate-300 px-3 py-3 font-normal text-slate-950" type="number" min="0" value={sueldoForm.anticipos} onChange={(event) => updateSueldo({ anticipos: Number(event.target.value) })} /></label>
              </div>
            </div>

            <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex justify-between"><span>Total imponible</span><b>{money(sueldoCalculado.imponible)}</b></div>
              <div className="mt-1 flex justify-between"><span>Base previsional</span><b>{money(sueldoCalculado.basePrevisional)}</b></div>
              <div className="mt-1 flex justify-between"><span>Base AFC</span><b>{money(sueldoCalculado.baseAfc)}</b></div>
              <div className="mt-1 flex justify-between"><span>Total haberes</span><b>{money(sueldoCalculado.totalHaberes)}</b></div>
              <div className="mt-1 flex justify-between"><span>AFP 10% + comisión</span><b>{money(sueldoCalculado.afpObligatoria + sueldoCalculado.afpComision)}</b></div>
              <div className="mt-1 flex justify-between"><span>Salud</span><b>{money(sueldoCalculado.saludBase + sueldoCalculado.saludAdicional)}</b></div>
              <div className="mt-1 flex justify-between"><span>AFC trabajador</span><b>{money(sueldoCalculado.afc)}</b></div>
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base"><span>Líquido</span><b>{money(sueldoCalculado.liquido)}</b></div>
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2"><span>Aportes empleador</span><b>{money(sueldoCalculado.afcEmpleador + sueldoCalculado.mutualEmpleador + sueldoCalculado.sisEmpleador + sueldoCalculado.aportePrevisionalEmpleador)}</b></div>
              <div className="mt-1 flex justify-between text-base"><span>Costo empresa</span><b>{money(sueldoCalculado.costoEmpleador)}</b></div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button onClick={usarSueldoComoPago} className="inline-flex items-center justify-center gap-2 rounded bg-emerald-600 px-4 py-3 font-semibold text-white">
                <Banknote size={18} />
                Usar como pago
              </button>
              <button onClick={generarLiquidacion} className="inline-flex items-center justify-center gap-2 rounded bg-slate-900 px-4 py-3 font-semibold text-white">
                <Printer size={18} />
                Generar liquidación
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">Parámetros referenciales 2026 y editables: tope previsional 90 UF, AFC 135,2 UF, SIS 1,62% y aporte previsional empleador 1% hasta julio. El impuesto único y la UF mensual se ingresan manualmente. Validar la liquidación definitiva con Previred o asesoría contable.</p>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-2">
              <Banknote className="text-emerald-700" />
              <h3 className="text-lg font-bold text-slate-950">Registrar Pago</h3>
            </div>
            <div className="grid gap-3">
              <select className="rounded border border-slate-300 px-3 py-3" value={pagoForm.persona_id} onChange={(event) => updatePago({ persona_id: event.target.value })}>
                <option value="">Persona</option>
                {personasActivas.map((persona) => <option key={persona.id} value={persona.id}>{persona.nombre} · {persona.tipo_relacion}</option>)}
              </select>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="rounded border border-slate-300 px-3 py-3" type="month" value={pagoForm.periodo} onChange={(event) => updatePago({ periodo: event.target.value })} />
                <select className="rounded border border-slate-300 px-3 py-3" value={pagoForm.tipo_pago} onChange={(event) => updatePago({ tipo_pago: event.target.value })}>
                  <option value="sueldo">Sueldo</option>
                  <option value="honorario">Honorario</option>
                  <option value="anticipo">Anticipo</option>
                  <option value="bono">Bono</option>
                  <option value="reembolso">Reembolso</option>
                  <option value="comision">Comisión</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <input className="rounded border border-slate-300 px-3 py-3" type="number" placeholder="Bruto" value={pagoForm.bruto} onChange={(event) => updatePago({ bruto: Number(event.target.value) })} />
                <input className="rounded border border-slate-300 px-3 py-3" type="number" placeholder="Descuentos" value={pagoForm.descuentos} onChange={(event) => updatePago({ descuentos: Number(event.target.value) })} />
                <select className="rounded border border-slate-300 px-3 py-3" value={pagoForm.estado} onChange={(event) => updatePago({ estado: event.target.value })}>
                  <option value="pendiente">Pendiente</option>
                  <option value="aprobado">Aprobado</option>
                  <option value="pagado">Pagado</option>
                  <option value="anulado">Anulado</option>
                </select>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex justify-between"><span>Retención</span><b>{money(pagoForm.retencion)}</b></div>
                <div className="mt-1 flex justify-between"><span>Líquido</span><b>{money(pagoForm.liquido)}</b></div>
                {pagoForm.tipo_pago === 'honorario' && <p className="mt-2 text-xs text-slate-500">Cálculo honorarios 2026: {RETENCION_HONORARIOS_2026}%.</p>}
              </div>
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="N° boleta / liquidación" value={pagoForm.numero_documento} onChange={(event) => updatePago({ numero_documento: event.target.value })} />
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="URL documento" value={pagoForm.documento_url} onChange={(event) => updatePago({ documento_url: event.target.value })} />
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="URL comprobante pago" value={pagoForm.comprobante_url} onChange={(event) => updatePago({ comprobante_url: event.target.value })} />
              <textarea className="min-h-24 rounded border border-slate-300 px-3 py-3" placeholder="Notas" value={pagoForm.notas} onChange={(event) => updatePago({ notas: event.target.value })} />
            </div>
            <button onClick={savePago} disabled={saving} className="mt-4 w-full rounded bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar pago'}</button>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-2">
              <FileText className="text-slate-700" />
              <h3 className="text-lg font-bold text-slate-950">Documento</h3>
            </div>
            <div className="grid gap-3">
              <select className="rounded border border-slate-300 px-3 py-3" value={documentoForm.persona_id} onChange={(event) => setDocumentoForm({ ...documentoForm, persona_id: event.target.value })}>
                <option value="">Persona</option>
                {personasActivas.map((persona) => <option key={persona.id} value={persona.id}>{persona.nombre}</option>)}
              </select>
              <div className="grid gap-3 sm:grid-cols-2">
                <select className="rounded border border-slate-300 px-3 py-3" value={documentoForm.tipo} onChange={(event) => setDocumentoForm({ ...documentoForm, tipo: event.target.value })}>
                  <option value="liquidacion">Liquidación</option>
                  <option value="boleta_honorarios">Boleta honorarios</option>
                  <option value="contrato">Contrato</option>
                  <option value="anexo">Anexo</option>
                  <option value="comprobante">Comprobante</option>
                  <option value="otro">Otro</option>
                </select>
                <input className="rounded border border-slate-300 px-3 py-3" type="month" value={documentoForm.periodo} onChange={(event) => setDocumentoForm({ ...documentoForm, periodo: event.target.value })} />
              </div>
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="Nombre documento" value={documentoForm.nombre} onChange={(event) => setDocumentoForm({ ...documentoForm, nombre: event.target.value })} />
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="URL archivo" value={documentoForm.url} onChange={(event) => setDocumentoForm({ ...documentoForm, url: event.target.value })} />
              <textarea className="min-h-20 rounded border border-slate-300 px-3 py-3" placeholder="Notas" value={documentoForm.notas} onChange={(event) => setDocumentoForm({ ...documentoForm, notas: event.target.value })} />
            </div>
            <button onClick={saveDocumento} disabled={saving} className="mt-4 w-full rounded bg-slate-800 px-4 py-3 font-semibold text-white disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar documento'}</button>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <WalletCards className="text-blue-700" />
              <h3 className="text-lg font-bold text-slate-950">Pagos</h3>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-3">Persona</th>
                    <th className="py-3">Periodo</th>
                    <th className="py-3">Tipo</th>
                    <th className="py-3">Bruto</th>
                    <th className="py-3">Retención</th>
                    <th className="py-3">Líquido</th>
                    <th className="py-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map((pago) => (
                    <tr key={pago.id} className="border-b align-top">
                      <td className="py-3">
                        <div className="font-semibold text-slate-950">{pago.personas?.nombre || '-'}</div>
                        <div className="text-slate-500">{pago.personas?.rut || ''}</div>
                      </td>
                      <td className="py-3">{pago.periodo}</td>
                      <td className="py-3">{pago.tipo_pago}</td>
                      <td className="py-3">{money(pago.bruto)}</td>
                      <td className="py-3">{money(pago.retencion)}</td>
                      <td className="py-3 font-semibold">{money(pago.liquido)}</td>
                      <td className="py-3">
                        <select className={`rounded px-2 py-1 text-xs font-semibold ${estadoClass(pago.estado)}`} value={pago.estado} onChange={(event) => updateEstadoPago(pago.id, event.target.value as PagoPersona['estado'])}>
                          <option value="pendiente">Pendiente</option>
                          <option value="aprobado">Aprobado</option>
                          <option value="pagado">Pagado</option>
                          <option value="anulado">Anulado</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!pagos.length && <div className="py-8 text-center text-slate-500">{loading ? 'Cargando pagos...' : 'No hay pagos registrados.'}</div>}
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-2">
              <Clock3 className="text-violet-700" />
              <h3 className="text-lg font-bold text-slate-950">Horas extra</h3>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead><tr className="border-b text-slate-500"><th className="py-3">Trabajador</th><th className="py-3">Fecha</th><th className="py-3">Horas</th><th className="py-3">Factor</th><th className="py-3">Monto</th><th className="py-3">Estado</th><th className="py-3 text-right">Acción</th></tr></thead>
                <tbody>{horasExtra.map((item) => <tr key={item.id} className="border-b border-slate-100">
                  <td className="py-3 font-semibold text-slate-950">{item.personas?.nombre || '-'}</td>
                  <td className="py-3">{item.fecha}</td>
                  <td className="py-3">{Number(item.horas).toLocaleString('es-CL')}</td>
                  <td className="py-3">{Number(item.factor).toLocaleString('es-CL')}x</td>
                  <td className="py-3 font-semibold">{money(item.monto)}</td>
                  <td className="py-3"><select value={item.estado} disabled={item.estado === 'liquidada'} title={item.estado === 'liquidada' ? 'Una hora extra liquidada queda bloqueada para conservar el historial del pago.' : 'Cambiar estado'} onChange={(event) => updateHoraExtra(item.id, event.target.value as HoraExtra['estado'])} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold disabled:bg-slate-100">
                    <option value="pendiente">Pendiente</option><option value="aprobada">Aprobada</option><option value="liquidada">Liquidada</option><option value="anulada">Anulada</option>
                  </select></td>
                  <td className="py-3 text-right"><button onClick={() => item.estado === 'liquidada' ? setMessage('No se puede eliminar una hora extra liquidada porque ya forma parte de un pago.') : deleteHoraExtra(item.id)} className={`rounded-lg p-2 hover:bg-red-50 ${item.estado === 'liquidada' ? 'text-slate-300' : 'text-red-600'}`} aria-label="Eliminar horas extra" title={item.estado === 'liquidada' ? 'La hora extra ya fue liquidada' : 'Eliminar horas extra'}><Trash2 size={17} /></button></td>
                </tr>)}</tbody>
              </table>
              {!horasExtra.length && <div className="py-8 text-center text-slate-500">{loading ? 'Cargando horas extra...' : 'No hay horas extra registradas.'}</div>}
            </div>
          </Card>

          <Card>
            <h3 className="mb-4 text-lg font-bold text-slate-950">Trabajadores y personas</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {personas.map((persona) => (
                <div key={persona.id} className={`rounded border p-4 ${persona.activo === false ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-semibold text-slate-950">{persona.nombre}</div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${persona.activo === false ? 'bg-slate-200 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>{persona.activo === false ? 'Inactivo' : 'Activo'}</span>
                  </div>
                  <div className="text-sm text-slate-500">{persona.rut || 'Sin RUT'} · {persona.tipo_relacion}</div>
                  <div className="mt-2 text-sm text-slate-600">{persona.cargo || '-'} · {persona.centro_costo || '-'}</div>
                  <div className="mt-2 text-xs text-slate-500">{[persona.banco, persona.tipo_cuenta, persona.numero_cuenta].filter(Boolean).join(' · ') || 'Sin cuenta bancaria'}</div>
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    {persona.activo === false ? <button onClick={() => reactivatePersona(persona)} className="inline-flex items-center gap-2 text-xs font-bold text-blue-700"><RotateCcw size={15} /> Reactivar</button> : <button onClick={() => removePersona(persona)} className="inline-flex items-center gap-2 text-xs font-bold text-red-700"><UserMinus size={15} /> Eliminar</button>}
                  </div>
                </div>
              ))}
              {!personas.length && <div className="py-8 text-center text-slate-500 md:col-span-2">{loading ? 'Cargando personas...' : 'No hay personas registradas.'}</div>}
            </div>
          </Card>

          <Card>
            <h3 className="mb-4 text-lg font-bold text-slate-950">Documentos</h3>
            <div className="space-y-3">
              {documentos.map((documento) => (
                <div key={documento.id} className="flex flex-col gap-2 rounded border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold text-slate-950">{documento.nombre}</div>
                    <div className="text-sm text-slate-500">{documento.personas?.nombre || '-'} · {documento.tipo} · {documento.periodo || '-'}</div>
                  </div>
                  {documento.url && <a href={documento.url} target="_blank" rel="noreferrer" className="rounded bg-slate-900 px-3 py-2 text-center text-sm font-semibold text-white">Abrir</a>}
                </div>
              ))}
              {!documentos.length && <div className="py-8 text-center text-slate-500">{loading ? 'Cargando documentos...' : 'No hay documentos registrados.'}</div>}
            </div>
          </Card>
        </div>
      </div>

      {liquidacionPreview && <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6">
        <button className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" aria-label="Cerrar vista de liquidación" onClick={() => setLiquidacionPreview(null)} />
        <section role="dialog" aria-modal="true" aria-label="Vista previa de liquidación" className="relative flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h3 className="text-lg font-black text-slate-950">Liquidación generada</h3>
              <p className="text-sm text-slate-500">Revisa los datos antes de imprimir o guardar como PDF.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={descargarLiquidacion} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"><Download size={17} /> Descargar respaldo</button>
              <button onClick={imprimirLiquidacion} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"><Printer size={17} /> Imprimir / PDF</button>
              <button onClick={() => setLiquidacionPreview(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cerrar</button>
            </div>
          </header>
          <iframe ref={liquidacionFrameRef} title="Liquidación de remuneraciones" srcDoc={liquidacionPreview.html} className="min-h-0 flex-1 bg-white" />
        </section>
      </div>}
    </div>
  )
}
