import { useEffect, useMemo, useState } from 'react'
import { Ban, ClipboardList, Eye, FileText, Printer, RefreshCw, Wrench } from 'lucide-react'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
import { supabase } from '../lib/supabase'

type Cliente = {
  id: string
  razon_social: string
  rut?: string
  direccion?: string
  ciudad?: string
  comuna?: string
  telefono?: string
}

type Equipo = {
  id: string
  code: string
  name: string
  cliente_id?: string
  brand?: string
  model?: string
  serial?: string
  serial_number?: string
}

type OtItem = {
  cantidad: string | number
  codigo?: string
  descripcion: string
}

type OrdenTrabajo = {
  id: string
  folio: string
  titulo?: string
  estado: string
  prioridad: string
  descripcion_problema?: string
  diagnostico?: string
  solucion?: string
  fecha_ingreso?: string
  horas_estimadas?: number
  costo_estimado?: number
  precio_final?: number
  cotizacion_documento_id?: number
  cliente_snapshot?: Record<string, any>
  items?: OtItem[]
  nota_tecnica?: string
  clientes?: Cliente | null
  machines?: Equipo | null
}

type CotizacionDocumento = {
  id: number
  numero?: number
  pre_numero?: string
  cliente_nombre?: string
  cliente_id?: string
  cliente_rut?: string
  cliente_direccion?: string
  cliente_ciudad?: string
  cliente_comuna?: string
  cliente_telefono?: string
  cliente_email?: string
  referencia?: string
  observaciones?: string
  total?: number
  estado?: string
  fecha_emision?: string
  items?: any[]
  data?: Record<string, any>
  created_at?: string
}

type OtPreview = {
  folio: string
  fecha: string
  cliente: string
  rut: string
  direccion: string
  ciudad: string
  telefono: string
  local: string
  titulo: string
  referencia: string
  notaTecnica: string
  horas: string
  valorHora: string
  items: OtItem[]
}

const emptyForm = {
  folio: '',
  titulo: '',
  cliente_id: '',
  equipo_id: '',
  prioridad: 'normal',
  descripcion_problema: '',
  nota_tecnica: '',
  horas_estimadas: '',
  valor_hora: '',
}

function nextManualFolio() {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  return `OT-${stamp}`
}

function money(value?: number | string) {
  return `$${Math.round(Number(value || 0)).toLocaleString('es-CL')}`
}

function dateLabel(value?: string) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString('es-CL')
  return date.toLocaleDateString('es-CL')
}

function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function quoteFolio(doc?: CotizacionDocumento | null) {
  if (!doc) return ''
  return doc.numero ? String(doc.numero) : doc.pre_numero || `DOC-${doc.id}`
}

function flattenQuoteItems(doc?: CotizacionDocumento | null): OtItem[] {
  if (!doc) return []
  const fromData = Array.isArray(doc.data?.referencias)
    ? doc.data.referencias.flatMap((ref: any) => Array.isArray(ref?.items) ? ref.items : [])
    : []
  const raw = fromData.length ? fromData : Array.isArray(doc.items) ? doc.items : []
  return raw
    .map((item: any) => ({
      cantidad: item?.cantidad || 1,
      codigo: item?.codigo || item?.parte || item?.n_parte || '',
      descripcion: String(item?.descripcion || item?.detalle || item?.texto || '').trim(),
    }))
    .filter((item) => item.descripcion || item.codigo)
}

function quoteToPreview(doc: CotizacionDocumento): OtPreview {
  const folio = `OT-${quoteFolio(doc)}`
  const reference = [doc.referencia, doc.observaciones].filter(Boolean).join('\n')
  const items = flattenQuoteItems(doc)
  return {
    folio,
    fecha: dateLabel(doc.fecha_emision || doc.created_at),
    cliente: doc.cliente_nombre || '',
    rut: doc.cliente_rut || '',
    direccion: doc.cliente_direccion || '',
    ciudad: [doc.cliente_comuna, doc.cliente_ciudad].filter(Boolean).join(' / '),
    telefono: doc.cliente_telefono || '',
    local: '',
    titulo: `Servicio desde cotización ${quoteFolio(doc)}`,
    referencia: reference,
    notaTecnica: reference,
    horas: '',
    valorHora: '',
    items: items.length ? items : [{ cantidad: 1, codigo: '', descripcion: reference || `Trabajo según cotización ${quoteFolio(doc)}` }],
  }
}

function manualToPreview(form: typeof emptyForm, cliente?: Cliente, equipo?: Equipo): OtPreview {
  const equipment = equipo ? `Equipo: ${[equipo.code, equipo.name, equipo.brand, equipo.model, equipo.serial || equipo.serial_number].filter(Boolean).join(' · ')}` : ''
  const description = [form.descripcion_problema, equipment].filter(Boolean).join('\n')
  return {
    folio: form.folio,
    fecha: dateLabel(),
    cliente: cliente?.razon_social || '',
    rut: cliente?.rut || '',
    direccion: cliente?.direccion || '',
    ciudad: [cliente?.comuna, cliente?.ciudad].filter(Boolean).join(' / '),
    telefono: cliente?.telefono || '',
    local: '',
    titulo: form.titulo,
    referencia: description,
    notaTecnica: form.nota_tecnica,
    horas: form.horas_estimadas,
    valorHora: form.valor_hora,
    items: description ? [{ cantidad: 1, codigo: '', descripcion: description }] : [],
  }
}

function orderToPreview(order: OrdenTrabajo, matchingQuote?: CotizacionDocumento | null): OtPreview {
  const snap = order.cliente_snapshot || {}
  const quotePreview = matchingQuote ? quoteToPreview(matchingQuote) : null
  const items = Array.isArray(order.items) && order.items.length ? order.items : quotePreview?.items || []
  return {
    folio: order.folio,
    fecha: dateLabel(order.fecha_ingreso),
    cliente: snap.razon_social || order.clientes?.razon_social || quotePreview?.cliente || '',
    rut: snap.rut || order.clientes?.rut || quotePreview?.rut || '',
    direccion: snap.direccion || order.clientes?.direccion || quotePreview?.direccion || '',
    ciudad: snap.ciudad || order.clientes?.ciudad || quotePreview?.ciudad || '',
    telefono: snap.telefono || order.clientes?.telefono || quotePreview?.telefono || '',
    local: snap.local || '',
    titulo: order.titulo || quotePreview?.titulo || '',
    referencia: order.descripcion_problema || quotePreview?.referencia || '',
    notaTecnica: order.nota_tecnica || order.diagnostico || order.solucion || '',
    horas: order.horas_estimadas ? String(order.horas_estimadas) : '',
    valorHora: order.costo_estimado ? String(order.costo_estimado) : '',
    items,
  }
}

function printHtml(preview: OtPreview) {
  const itemRows = Array.from({ length: 19 }).map((_, index) => {
    const item = preview.items[index]
    return `<tr><td>${esc(item?.cantidad || '')}</td><td>${esc(item?.codigo || '')}</td><td>${esc(item?.descripcion || '')}</td></tr>`
  }).join('')

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${esc(preview.folio)} - Orden de Trabajo</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#111827}
  .toolbar{padding:16px;text-align:center}
  button{border:0;border-radius:6px;background:#111827;color:white;padding:10px 16px;font-weight:700}
  .sheet{width:210mm;min-height:297mm;margin:0 auto 24px;background:#fff;padding:13mm 11mm;border:1px solid #cbd5e1}
  .top{display:grid;grid-template-columns:1.15fr .85fr;gap:10mm;align-items:start}
  .brand h1{margin:0;font-size:22px;letter-spacing:1px}
  .brand p{margin:2px 0;text-align:center;font-size:12px;font-weight:700}
  .brand .line{border-top:1px solid #64748b;margin:6px 0}
  .services{display:grid;grid-template-columns:1fr 1fr;gap:4mm;font-size:10px;line-height:1.25}
  .folio{text-align:center}
  .folio h2{margin:4px 0 14px;font-size:18px;letter-spacing:1px}
  .folio .num{font-family:"Courier New",monospace;font-size:24px;letter-spacing:3px}
  .special{margin:8mm 0 2mm;font-size:16px;letter-spacing:2px;font-weight:700}
  .client-grid{display:grid;grid-template-columns:1fr .95fr;gap:7mm;margin-bottom:4mm}
  .box{border:1.6px solid #64748b;border-radius:7px;padding:4mm}
  .field{display:grid;grid-template-columns:auto 1fr;gap:2mm;align-items:end;margin:2.5mm 0;font-size:13px}
  .label{font-weight:700}
  .value{min-height:17px;border-bottom:1px solid #64748b;padding:0 2mm}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  th,td{border:1.4px solid #64748b;padding:2.2mm;font-size:12px;vertical-align:top}
  th{text-align:center;letter-spacing:.8px}
  td{height:9.5mm}
  .qty{width:32mm}.part{width:36mm}
  .bottom{display:grid;grid-template-columns:1fr 95mm;gap:7mm;margin-top:4mm}
  .note-lines{min-height:30mm;border-bottom:1px solid #64748b;white-space:pre-wrap;font-size:12px;line-height:1.45;padding:2mm}
  .rightbox{display:grid;gap:4mm}
  .total-field{border:1.6px solid #64748b;border-radius:7px;display:grid;grid-template-columns:1fr 30mm;min-height:13mm;align-items:center}
  .total-field b{padding-left:4mm;font-size:13px}.total-field span{border-left:1.4px solid #64748b;height:100%;display:flex;align-items:center;justify-content:center}
  .signs{display:grid;grid-template-columns:1fr 1fr;gap:55mm;margin-top:22mm;text-align:center;font-size:13px}
  .signs div{border-top:1px solid #64748b;padding-top:2mm}
  @media print{body{background:white}.toolbar{display:none}.sheet{border:0;margin:0;width:auto;min-height:auto;page-break-after:always}}
</style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Imprimir / PDF</button></div>
  <main class="sheet">
    <section class="top">
      <div class="brand">
        <h1>TECNICA HIDRAULICA LIMITADA</h1>
        <p>VENTA Y REPARACION DE SISTEMAS OLEOHIDRAULICOS</p>
        <p>APILADORES ELECTRICOS, TRANSPALETAS</p>
        <p>R.U.T.: 76.171.450 - 3</p>
        <p>FONO/FAX: 22 764 5666 - ESTACION CENTRAL - SANTIAGO</p>
        <div class="line"></div>
        <div class="services">
          <div>· Mantención de Maquinaria Pesada<br>· Mantención de Maquinaria Logística<br>· Equipos Agrícolas<br>· Minería Industrial<br>· Repuestos</div>
          <div>· Cilindros<br>· Bombas<br>· Sellos Hidráulicos<br>· O Ring<br>· Polipack</div>
        </div>
      </div>
      <div class="folio">
        <h2>ORDEN DE TRABAJO</h2>
        <div class="num">${esc(preview.folio)}</div>
      </div>
    </section>

    <div class="special">NOS ESPECIALIZAMOS EN TODAS LAS MARCAS</div>
    <section class="client-grid">
      <div class="box">
        <div class="field"><span class="label">Señor(es):</span><span class="value">${esc(preview.cliente)}</span></div>
        <div class="field"><span class="label">Dirección:</span><span class="value">${esc(preview.direccion)}</span></div>
        <div class="field"><span class="label">Local N°:</span><span class="value">${esc(preview.local)}</span></div>
      </div>
      <div class="box">
        <div class="field"><span class="label">Fecha:</span><span class="value">${esc(preview.fecha)}</span></div>
        <div class="field"><span class="label">R.U.T.:</span><span class="value">${esc(preview.rut)}</span></div>
        <div class="field"><span class="label">Ciudad:</span><span class="value">${esc(preview.ciudad)}</span></div>
        <div class="field"><span class="label">Fono:</span><span class="value">${esc(preview.telefono)}</span></div>
      </div>
    </section>

    <table>
      <thead><tr><th class="qty">CANTIDAD</th><th class="part">N° PARTE</th><th>DESCRIPCION</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>

    <section class="bottom">
      <div>
        <b>Nota Técnica</b>
        <div class="note-lines">${esc(preview.notaTecnica)}</div>
      </div>
      <div class="rightbox">
        <div class="total-field"><b>CANTIDAD DE HORAS DE TRABAJO</b><span>${esc(preview.horas)}</span></div>
        <div class="total-field"><b>VALOR HORA HOMBRE</b><span>${preview.valorHora ? money(preview.valorHora) : '$'}</span></div>
      </div>
    </section>

    <section class="signs"><div>Conforme</div><div>Firma Técnico</div></section>
  </main>
</body>
</html>`
}

function OrdenPreview({ preview }: { preview: OtPreview }) {
  const rows = Array.from({ length: 12 }).map((_, index) => preview.items[index] || { cantidad: '', codigo: '', descripcion: '' })
  return (
    <div className="bg-slate-100 p-3">
      <div className="mx-auto aspect-[210/297] max-w-[760px] overflow-hidden rounded border border-slate-300 bg-white p-6 text-slate-900 shadow-sm">
        <div className="grid grid-cols-[1.1fr_.9fr] gap-6">
          <div>
            <h3 className="text-lg font-black tracking-wide">TECNICA HIDRAULICA LIMITADA</h3>
            <p className="text-center text-[11px] font-bold leading-tight">VENTA Y REPARACION DE SISTEMAS OLEOHIDRAULICOS<br />APILADORES ELECTRICOS, TRANSPALETAS</p>
            <p className="text-center text-[11px] font-bold">R.U.T.: 76.171.450 - 3</p>
            <p className="border-b border-slate-500 pb-1 text-center text-[11px] font-bold">FONO/FAX: 22 764 5666 - ESTACION CENTRAL - SANTIAGO</p>
            <div className="mt-2 grid grid-cols-2 gap-3 text-[10px] leading-tight text-slate-700">
              <p>· Mantención de Maquinaria Pesada<br />· Mantención de Maquinaria Logística<br />· Equipos Agrícolas<br />· Minería Industrial<br />· Repuestos</p>
              <p>· Cilindros<br />· Bombas<br />· Sellos Hidráulicos<br />· O Ring<br />· Polipack</p>
            </div>
          </div>
          <div className="text-center">
            <h3 className="text-base font-black tracking-wide">ORDEN DE TRABAJO</h3>
            <p className="mt-4 font-mono text-2xl tracking-[.2em]">{preview.folio}</p>
          </div>
        </div>

        <p className="mt-4 text-base font-black tracking-[.16em]">NOS ESPECIALIZAMOS EN TODAS LAS MARCAS</p>
        <div className="mt-2 grid grid-cols-2 gap-4 text-xs">
          <div className="rounded-md border border-slate-500 p-3">
            <p><b>Señor(es):</b> {preview.cliente}</p>
            <p className="mt-2"><b>Dirección:</b> {preview.direccion}</p>
            <p className="mt-2"><b>Local N°:</b> {preview.local}</p>
          </div>
          <div className="rounded-md border border-slate-500 p-3">
            <p><b>Fecha:</b> {preview.fecha}</p>
            <p className="mt-2"><b>R.U.T.:</b> {preview.rut}</p>
            <p className="mt-2"><b>Ciudad:</b> {preview.ciudad}</p>
            <p className="mt-2"><b>Fono:</b> {preview.telefono}</p>
          </div>
        </div>

        <table className="mt-4 w-full table-fixed border-collapse text-xs">
          <thead><tr><th className="w-24 border border-slate-500 p-2 text-center">CANTIDAD</th><th className="w-28 border border-slate-500 p-2 text-center">N° PARTE</th><th className="border border-slate-500 p-2 text-center">DESCRIPCION</th></tr></thead>
          <tbody>{rows.map((item, index) => <tr key={index}><td className="h-8 border border-slate-500 p-1 text-center">{item.cantidad}</td><td className="border border-slate-500 p-1">{item.codigo}</td><td className="border border-slate-500 p-1">{item.descripcion}</td></tr>)}</tbody>
        </table>

        <div className="mt-4 grid grid-cols-[1fr_260px] gap-4 text-xs">
          <div><b>Nota Técnica</b><div className="mt-1 min-h-20 whitespace-pre-wrap border-b border-slate-500 p-2">{preview.notaTecnica}</div></div>
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_70px] rounded-md border border-slate-500"><b className="p-2">CANTIDAD DE HORAS DE TRABAJO</b><span className="border-l border-slate-500 p-2 text-center">{preview.horas}</span></div>
            <div className="grid grid-cols-[1fr_70px] rounded-md border border-slate-500"><b className="p-2">VALOR HORA HOMBRE</b><span className="border-l border-slate-500 p-2 text-center">{preview.valorHora ? money(preview.valorHora) : '$'}</span></div>
          </div>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-28 text-center text-xs"><span className="border-t border-slate-500 pt-1">Conforme</span><span className="border-t border-slate-500 pt-1">Firma Técnico</span></div>
      </div>
    </div>
  )
}

export function OrdenesTrabajo() {
  const [ordenes, setOrdenes] = useState<OrdenTrabajo[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [cotizaciones, setCotizaciones] = useState<CotizacionDocumento[]>([])
  const [selectedDoc, setSelectedDoc] = useState('')
  const [previewOrderId, setPreviewOrderId] = useState('')
  const [form, setForm] = useState({ ...emptyForm, folio: nextManualFolio() })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cancellingId, setCancellingId] = useState('')
  const [confirmingCancelId, setConfirmingCancelId] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')

    const [ordenesResult, clientesResult, equiposResult, cotizacionesResult] = await Promise.all([
      supabase
        .from('ordenes_trabajo')
        .select('*, clientes(id, razon_social, rut, direccion, comuna, ciudad, telefono), machines(id, code, name, brand, model, serial, serial_number)')
        .order('created_at', { ascending: false }),
      supabase
        .from('clientes')
        .select('id, razon_social, rut, direccion, comuna, ciudad, telefono')
        .order('razon_social', { ascending: true }),
      supabase
        .from('machines')
        .select('id, code, name, cliente_id, brand, model, serial, serial_number')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('cotizacion_documentos')
        .select('*')
        .in('estado', ['cotizacion_emitida', 'COTIZACION'])
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    if (ordenesResult.error) setMessage(ordenesResult.error.message)
    else if (cotizacionesResult.error) setMessage(cotizacionesResult.error.message)
    setOrdenes((ordenesResult.data || []) as OrdenTrabajo[])
    setClientes((clientesResult.data || []) as Cliente[])
    setEquipos((equiposResult.data || []) as Equipo[])
    setCotizaciones((cotizacionesResult.data || []) as CotizacionDocumento[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const selectedQuote = useMemo(() => cotizaciones.find((doc) => String(doc.id) === selectedDoc) || null, [cotizaciones, selectedDoc])
  const selectedOrder = useMemo(() => ordenes.find((orden) => orden.id === previewOrderId) || null, [ordenes, previewOrderId])
  const selectedCliente = useMemo(() => clientes.find((cliente) => cliente.id === form.cliente_id), [clientes, form.cliente_id])
  const selectedEquipo = useMemo(() => equipos.find((equipo) => equipo.id === form.equipo_id), [equipos, form.equipo_id])

  const equiposFiltrados = useMemo(() => {
    if (!form.cliente_id) return equipos
    return equipos.filter((equipo) => !equipo.cliente_id || equipo.cliente_id === form.cliente_id)
  }, [equipos, form.cliente_id])

  const preview = useMemo(() => {
    if (selectedOrder) {
      const matchingQuote = cotizaciones.find((doc) => doc.id === selectedOrder.cotizacion_documento_id || `OT-${quoteFolio(doc)}` === selectedOrder.folio)
      return orderToPreview(selectedOrder, matchingQuote)
    }
    if (selectedQuote) return quoteToPreview(selectedQuote)
    return manualToPreview(form, selectedCliente, selectedEquipo)
  }, [selectedOrder, selectedQuote, form, selectedCliente, selectedEquipo, cotizaciones])

  function showQuotePreview(docId: string) {
    setSelectedDoc(docId)
    setPreviewOrderId('')
  }

  function printPreview(target = preview) {
    const win = window.open('', '_blank', 'noopener,noreferrer')
    if (!win) {
      setMessage('El navegador bloqueó la ventana de impresión.')
      return
    }
    win.document.write(printHtml(target))
    win.document.close()
  }

  async function createManual() {
    if (!form.folio.trim()) {
      setMessage('Ingresa un folio para la OT.')
      return
    }
    if (!form.titulo.trim() && !form.descripcion_problema.trim()) {
      setMessage('Ingresa un título o describe el trabajo antes de crear la OT.')
      return
    }

    setSaving(true)
    setMessage('')
    const manualPreview = manualToPreview(form, selectedCliente, selectedEquipo)

    const { data, error } = await supabase
      .from('ordenes_trabajo')
      .insert({
        folio: form.folio.trim(),
        titulo: form.titulo.trim() || null,
        cliente_id: form.cliente_id || null,
        equipo_id: form.equipo_id || null,
        prioridad: form.prioridad,
        descripcion_problema: form.descripcion_problema.trim() || null,
        nota_tecnica: form.nota_tecnica.trim() || null,
        horas_estimadas: form.horas_estimadas ? Number(form.horas_estimadas) : null,
        costo_estimado: form.valor_hora ? Number(form.valor_hora) : null,
        cliente_snapshot: {
          razon_social: manualPreview.cliente,
          rut: manualPreview.rut,
          direccion: manualPreview.direccion,
          ciudad: manualPreview.ciudad,
          telefono: manualPreview.telefono,
        },
        items: manualPreview.items,
      })
      .select('*')

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setForm({ ...emptyForm, folio: nextManualFolio() })
    setSelectedDoc('')
    setPreviewOrderId(data?.[0]?.id || '')
    setMessage('Orden de trabajo manual creada.')
    await load()
  }

  async function createFromQuote() {
    const docId = Number(selectedDoc)
    if (!docId || !selectedQuote) {
      setMessage('Selecciona una cotización emitida.')
      return
    }

    setSaving(true)
    setMessage('')

    const { data, error } = await supabase.rpc('crear_ot_desde_cotizacion_documento', {
      doc_id: docId,
    })

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setPreviewOrderId(data?.id || '')
    setMessage(`OT creada o recuperada desde la cotización ${quoteFolio(selectedQuote)}.`)
    await load()
  }

  async function cancelOrder(order: OrdenTrabajo) {
    setCancellingId(order.id)
    setConfirmingCancelId('')
    setMessage('')
    const { error } = await supabase
      .from('ordenes_trabajo')
      .update({ estado: 'cancelada' })
      .eq('id', order.id)
    setCancellingId('')

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(`Orden ${order.folio} cancelada.`)
    await load()
  }

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-950">Órdenes de Trabajo</h2>
          <p className="mt-2 text-slate-600">Crea OT desde cotizaciones, revisa el formato tipo talonario y genera impresión para taller.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => printPreview()} className="inline-flex items-center justify-center gap-2 rounded bg-slate-900 px-4 py-3 text-white">
            <Printer size={18} />
            Imprimir vista
          </button>
          <button onClick={load} disabled={loading || saving} className="inline-flex items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50">
            <RefreshCw size={18} />
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      <FeedbackToast message={message} onClose={() => setMessage('')} />

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <FileText size={20} className="text-blue-700" />
              <h3 className="text-lg font-bold text-slate-950">Desde Cotización</h3>
            </div>

            <select className="w-full rounded border border-slate-300 px-3 py-3" value={selectedDoc} onChange={(event) => showQuotePreview(event.target.value)}>
              <option value="">Selecciona cotización emitida</option>
              {cotizaciones.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.numero ? `Cot. ${doc.numero}` : doc.pre_numero || `Doc ${doc.id}`} · {doc.cliente_nombre || 'Sin cliente'} · {money(doc.total)}
                </option>
              ))}
            </select>

            {selectedQuote && (
              <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <b className="text-slate-950">Vista previa cargada:</b> {flattenQuoteItems(selectedQuote).length} línea(s) de trabajo desde la cotización {quoteFolio(selectedQuote)}.
              </div>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button onClick={createFromQuote} disabled={saving || !selectedQuote} className="rounded bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
                {saving ? 'Creando OT...' : 'Crear OT'}
              </button>
              <button onClick={() => printPreview()} disabled={!selectedQuote && !selectedOrder} className="inline-flex items-center justify-center gap-2 rounded border border-slate-300 px-4 py-3 font-semibold text-slate-700 disabled:opacity-50">
                <Printer size={17} />
                Imprimir
              </button>
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-2">
              <Wrench size={20} className="text-blue-700" />
              <h3 className="text-lg font-bold text-slate-950">OT Manual</h3>
            </div>

            <div className="grid gap-3">
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="Folio" value={form.folio} onChange={(event) => { setPreviewOrderId(''); setSelectedDoc(''); setForm({ ...form, folio: event.target.value }) }} />
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="Título" value={form.titulo} onChange={(event) => { setPreviewOrderId(''); setSelectedDoc(''); setForm({ ...form, titulo: event.target.value }) }} />
              <select className="rounded border border-slate-300 px-3 py-3" value={form.cliente_id} onChange={(event) => { setPreviewOrderId(''); setSelectedDoc(''); setForm({ ...form, cliente_id: event.target.value, equipo_id: '' }) }}>
                <option value="">Cliente</option>
                {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.razon_social}</option>)}
              </select>
              <select className="rounded border border-slate-300 px-3 py-3" value={form.equipo_id} onChange={(event) => { setPreviewOrderId(''); setSelectedDoc(''); setForm({ ...form, equipo_id: event.target.value }) }}>
                <option value="">Equipo</option>
                {equiposFiltrados.map((equipo) => <option key={equipo.id} value={equipo.id}>{equipo.code} · {equipo.name}</option>)}
              </select>
              <select className="rounded border border-slate-300 px-3 py-3" value={form.prioridad} onChange={(event) => setForm({ ...form, prioridad: event.target.value })}>
                <option value="baja">Baja</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
              <textarea className="min-h-28 rounded border border-slate-300 px-3 py-3" placeholder="Problema reportado / alcance" value={form.descripcion_problema} onChange={(event) => { setPreviewOrderId(''); setSelectedDoc(''); setForm({ ...form, descripcion_problema: event.target.value }) }} />
              <textarea className="min-h-20 rounded border border-slate-300 px-3 py-3" placeholder="Nota técnica" value={form.nota_tecnica} onChange={(event) => { setPreviewOrderId(''); setSelectedDoc(''); setForm({ ...form, nota_tecnica: event.target.value }) }} />
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="rounded border border-slate-300 px-3 py-3" type="number" placeholder="Horas estimadas" value={form.horas_estimadas} onChange={(event) => { setPreviewOrderId(''); setSelectedDoc(''); setForm({ ...form, horas_estimadas: event.target.value }) }} />
                <input className="rounded border border-slate-300 px-3 py-3" type="number" placeholder="Valor hora hombre" value={form.valor_hora} onChange={(event) => { setPreviewOrderId(''); setSelectedDoc(''); setForm({ ...form, valor_hora: event.target.value }) }} />
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button onClick={createManual} disabled={saving} className="rounded bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
                {saving ? 'Creando OT...' : 'Guardar OT'}
              </button>
              <button onClick={() => printPreview(manualToPreview(form, selectedCliente, selectedEquipo))} className="inline-flex items-center justify-center gap-2 rounded border border-slate-300 px-4 py-3 font-semibold text-slate-700">
                <Printer size={17} />
                Imprimir borrador
              </button>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Eye size={20} className="text-blue-700" />
                <h3 className="text-lg font-bold text-slate-950">Vista previa OT</h3>
              </div>
              <button onClick={() => printPreview()} className="inline-flex items-center justify-center gap-2 rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
                <Printer size={16} />
                Imprimir
              </button>
            </div>
            <OrdenPreview preview={preview} />
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-2">
              <ClipboardList size={20} className="text-blue-700" />
              <h3 className="text-lg font-bold text-slate-950">Trabajos</h3>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-3">OT</th>
                    <th className="py-3">Cliente</th>
                    <th className="py-3">Equipo</th>
                    <th className="py-3">Estado</th>
                    <th className="py-3">Prioridad</th>
                    <th className="py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenes.map((orden) => (
                    <tr key={orden.id} className={`border-b align-top ${previewOrderId === orden.id ? 'bg-blue-50' : ''}`}>
                      <td className="py-3">
                        <button onClick={() => { setPreviewOrderId(orden.id); setSelectedDoc('') }} className="text-left font-semibold text-blue-700 underline-offset-2 hover:underline">{orden.folio}</button>
                        <div className="max-w-xs text-slate-500">{orden.titulo || orden.descripcion_problema || '-'}</div>
                      </td>
                      <td className="py-3">{orden.clientes?.razon_social || orden.cliente_snapshot?.razon_social || '-'}</td>
                      <td className="py-3">{orden.machines ? `${orden.machines.code} · ${orden.machines.name}` : '-'}</td>
                      <td className="py-3"><span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{orden.estado.replace(/_/g, ' ')}</span></td>
                      <td className="py-3">{orden.prioridad}</td>
                      <td className="py-3 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-2">
                          <button onClick={() => printPreview(orderToPreview(orden, cotizaciones.find((doc) => doc.id === orden.cotizacion_documento_id || `OT-${quoteFolio(doc)}` === orden.folio)))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                            <Printer size={14} /> Imprimir
                          </button>
                          {!['cancelada', 'cerrada'].includes(orden.estado) ? (
                            confirmingCancelId === orden.id ? (
                              <>
                                <button
                                  onClick={() => void cancelOrder(orden)}
                                  disabled={cancellingId === orden.id}
                                  aria-label={`Confirmar cancelación ${orden.folio}`}
                                  className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                                >
                                  {cancellingId === orden.id ? 'Cancelando...' : 'Confirmar'}
                                </button>
                                <button
                                  onClick={() => setConfirmingCancelId('')}
                                  aria-label={`Mantener ${orden.folio}`}
                                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
                                >
                                  Mantener
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setConfirmingCancelId(orden.id)}
                                aria-label={`Cancelar ${orden.folio}`}
                                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                              >
                                <Ban size={14} /> Cancelar
                              </button>
                            )
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!ordenes.length && <div className="py-8 text-center text-slate-500">{loading ? 'Cargando OT...' : 'No hay órdenes de trabajo.'}</div>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
