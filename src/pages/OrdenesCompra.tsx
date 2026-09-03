import { useEffect, useMemo, useState } from 'react'
import { Ban, Copy, Eye, Pencil, Plus, Printer, RefreshCw, Save, Search, ShoppingCart, Trash2 } from 'lucide-react'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
import { useEmpresa } from '../lib/empresa'
import { supabase } from '../lib/supabase'
import { EmptyState, StatusBadge, formatDate, inputClass, labelClass, money } from './rrhh/shared'

type Proveedor = {
  id: string
  tipo: string
  razon_social: string
  nombre_fantasia?: string | null
  rut?: string | null
  contacto_nombre?: string | null
  email?: string | null
  telefono?: string | null
  direccion?: string | null
  servicios?: string | null
  estado: string
}

type CompraItem = {
  cantidad: string
  codigo: string
  descripcion: string
  valor_unitario: string
}

type OrdenCompra = {
  id: string
  empresa_id: string
  proveedor_id?: string | null
  numero: string
  fecha_emision: string
  fecha_entrega?: string | null
  proveedor_snapshot?: Record<string, any> | null
  items: CompraItem[]
  subtotal: number
  iva: number
  total: number
  moneda: string
  condiciones?: string | null
  observaciones?: string | null
  estado: 'borrador' | 'emitida' | 'anulada'
  created_at: string
  empresas_asociadas?: Proveedor | null
}

const blankItem = { cantidad: '1', codigo: '', descripcion: '', valor_unitario: '' }
const today = () => new Date().toISOString().slice(0, 10)

function nextNumber() {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  return `OC-${stamp}`
}

const emptyForm = {
  numero: nextNumber(),
  proveedor_id: '',
  fecha_emision: today(),
  fecha_entrega: '',
  condiciones: '',
  observaciones: '',
  estado: 'borrador' as OrdenCompra['estado'],
  items: [{ ...blankItem }],
}

function clean(value: string) {
  return value.trim() || null
}

function numeric(value: string | number) {
  const parsed = Number(String(value || '0').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function providerSnapshot(provider?: Proveedor | null) {
  if (!provider) return {}
  return {
    razon_social: provider.razon_social,
    nombre_fantasia: provider.nombre_fantasia || '',
    rut: provider.rut || '',
    contacto_nombre: provider.contacto_nombre || '',
    email: provider.email || '',
    telefono: provider.telefono || '',
    direccion: provider.direccion || '',
  }
}

function providerName(order: OrdenCompra) {
  return order.proveedor_snapshot?.razon_social || order.empresas_asociadas?.razon_social || 'Sin proveedor'
}

function itemTotal(item: CompraItem) {
  return numeric(item.cantidad) * numeric(item.valor_unitario)
}

function normalizedItems(items: CompraItem[]) {
  return items
    .map((item) => ({
      cantidad: String(item.cantidad || '').trim() || '1',
      codigo: String(item.codigo || '').trim(),
      descripcion: String(item.descripcion || '').trim(),
      valor_unitario: String(item.valor_unitario || '').trim(),
    }))
    .filter((item) => item.descripcion || item.codigo || numeric(item.valor_unitario) > 0)
}

function moduleMessage(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return ''
  if (['42P01', 'PGRST205'].includes(error.code || '') || /ordenes_compra|schema cache|does not exist/i.test(error.message || '')) {
    return 'Falta instalar el módulo Órdenes de compra en PostgreSQL.'
  }
  if (/no autorizada|permiso|permission/i.test(error.message || '')) return error.message || 'Tu usuario no tiene permiso para esta sección.'
  return error.message || 'No fue posible completar la operación.'
}

function companyLines(company: ReturnType<typeof useEmpresa>['activeEmpresa']) {
  const business = (company?.descripcion_corta || company?.rubro || '').replace(/_/g, ' ')
  return [
    company?.razon_social || company?.nombre || 'Empresa',
    business,
    company?.rut ? `R.U.T.: ${company.rut}` : '',
    company?.direccion || '',
    [company?.telefono, company?.email].filter(Boolean).join(' - '),
    company?.website || '',
  ].filter(Boolean)
}

function buildPrintHtml(order: OrdenCompra, company: ReturnType<typeof useEmpresa>['activeEmpresa']) {
  const provider = order.proveedor_snapshot || order.empresas_asociadas || {}
  const rows = Array.from({ length: Math.max(12, order.items.length) }).map((_, index) => {
    const item = order.items[index]
    return `<tr>
      <td>${esc(item?.cantidad || '')}</td>
      <td>${esc(item?.codigo || '')}</td>
      <td>${esc(item?.descripcion || '')}</td>
      <td class="num">${item ? esc(money(numeric(item.valor_unitario))) : ''}</td>
      <td class="num">${item ? esc(money(itemTotal(item))) : ''}</td>
    </tr>`
  }).join('')
  const logo = company?.logo_url ? `<img src="${esc(company.logo_url)}" alt="Logo">` : ''
  const lines = companyLines(company).map((line, index) => index === 0 ? `<h1>${esc(line)}</h1>` : `<p>${esc(line)}</p>`).join('')

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${esc(order.numero)} - Orden de compra</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#e2e8f0;font-family:Arial,Helvetica,sans-serif;color:#0f172a}
.toolbar{padding:16px;text-align:center}.toolbar button{border:0;border-radius:8px;background:#0f172a;color:white;padding:10px 18px;font-weight:700}
.sheet{width:216mm;min-height:279mm;margin:0 auto 24px;background:white;padding:12mm;border:1px solid #cbd5e1}
.top{display:grid;grid-template-columns:1fr 66mm;gap:10mm;align-items:start;border-bottom:2px solid #0f172a;padding-bottom:7mm}
.brand{display:grid;grid-template-columns:26mm 1fr;gap:5mm;align-items:start}.brand img{width:24mm;height:24mm;object-fit:contain}.brand h1{margin:0 0 2mm;font-size:18px;text-transform:uppercase}.brand p{margin:1mm 0;font-size:11px;font-weight:700;text-transform:uppercase}
.title{text-align:right}.title h2{margin:0;font-size:24px;letter-spacing:1px}.title strong{display:block;margin-top:3mm;font-size:18px}.meta{margin-top:3mm;font-size:12px;line-height:1.5}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin:7mm 0}.box{border:1.5px solid #334155;border-radius:6px;padding:4mm}.box h3{margin:0 0 3mm;font-size:12px;letter-spacing:.8px;text-transform:uppercase}.field{display:grid;grid-template-columns:31mm 1fr;gap:2mm;margin:2mm 0;font-size:12px}.label{font-weight:700}.value{min-height:16px;border-bottom:1px solid #94a3b8}
table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #334155;padding:2.2mm;font-size:11px;vertical-align:top}th{background:#f1f5f9;text-align:center;text-transform:uppercase}.qty{width:24mm}.code{width:34mm}.money{width:33mm}.num{text-align:right;white-space:nowrap}td{height:9mm}
.totals{margin-left:auto;margin-top:5mm;width:72mm}.totals div{display:grid;grid-template-columns:1fr 34mm;border:1px solid #334155;border-top:0}.totals div:first-child{border-top:1px solid #334155}.totals span,.totals b{padding:2.3mm;font-size:12px}.totals span{text-align:right;border-left:1px solid #334155}.totals .grand{background:#0f172a;color:white}
.notes{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:7mm}.note{min-height:28mm;white-space:pre-wrap;font-size:12px;line-height:1.45}.signs{display:grid;grid-template-columns:1fr 1fr;gap:45mm;margin-top:18mm;text-align:center;font-size:12px}.signs div{border-top:1px solid #334155;padding-top:2mm}
@media print{body{background:white}.toolbar{display:none}.sheet{border:0;margin:0;width:auto;min-height:auto;page-break-after:always}thead{display:table-header-group}}
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">Imprimir / guardar PDF</button></div>
<main class="sheet">
  <section class="top">
    <div class="brand">${logo}<div>${lines}</div></div>
    <div class="title"><h2>ORDEN DE COMPRA</h2><strong>${esc(order.numero)}</strong><div class="meta">Fecha emisión: ${esc(formatDate(order.fecha_emision))}<br>Fecha entrega: ${esc(formatDate(order.fecha_entrega))}</div></div>
  </section>
  <section class="grid">
    <div class="box"><h3>Proveedor</h3>
      <div class="field"><span class="label">Razón social</span><span class="value">${esc(provider.razon_social)}</span></div>
      <div class="field"><span class="label">R.U.T.</span><span class="value">${esc(provider.rut)}</span></div>
      <div class="field"><span class="label">Dirección</span><span class="value">${esc(provider.direccion)}</span></div>
      <div class="field"><span class="label">Contacto</span><span class="value">${esc(provider.contacto_nombre)}</span></div>
      <div class="field"><span class="label">Teléfono</span><span class="value">${esc(provider.telefono)}</span></div>
      <div class="field"><span class="label">Correo</span><span class="value">${esc(provider.email)}</span></div>
    </div>
    <div class="box"><h3>Datos de compra</h3>
      <div class="field"><span class="label">Estado</span><span class="value">${esc(order.estado)}</span></div>
      <div class="field"><span class="label">Moneda</span><span class="value">${esc(order.moneda || 'CLP')}</span></div>
      <div class="field"><span class="label">Condiciones</span><span class="value">${esc(order.condiciones)}</span></div>
    </div>
  </section>
  <table><thead><tr><th class="qty">Cantidad</th><th class="code">Código</th><th>Descripción</th><th class="money">Valor unit.</th><th class="money">Total</th></tr></thead><tbody>${rows}</tbody></table>
  <section class="totals"><div><b>Subtotal neto</b><span>${esc(money(order.subtotal))}</span></div><div><b>IVA 19%</b><span>${esc(money(order.iva))}</span></div><div class="grand"><b>Total</b><span>${esc(money(order.total))}</span></div></section>
  <section class="notes"><div><b>Observaciones</b><div class="note">${esc(order.observaciones)}</div></div><div><b>Condiciones</b><div class="note">${esc(order.condiciones)}</div></div></section>
  <section class="signs"><div>Solicitado por</div><div>Autorizado por</div></section>
</main>
</body>
</html>`
}

function Preview({ order, company }: { order: OrdenCompra; company: ReturnType<typeof useEmpresa>['activeEmpresa'] }) {
  const provider = order.proveedor_snapshot || order.empresas_asociadas || {}
  const rows = Array.from({ length: Math.max(8, Math.min(12, order.items.length || 8)) }).map((_, index) => order.items[index] || null)
  return <div className="rounded-2xl bg-slate-100 p-3">
    <div className="mx-auto aspect-[216/279] max-w-[760px] overflow-hidden rounded border border-slate-300 bg-white p-6 text-slate-900 shadow-sm">
      <div className="grid grid-cols-[1fr_220px] gap-6 border-b-2 border-slate-900 pb-4">
        <div className="grid grid-cols-[72px_1fr] gap-4">
          {company?.logo_url ? <img src={company.logo_url} alt="Logo empresa" className="h-16 w-16 object-contain" /> : <div className="h-16 w-16 rounded border border-slate-300" />}
          <div>{companyLines(company).map((line, index) => index === 0 ? <h3 key={line} className="text-base font-black uppercase">{line}</h3> : <p key={line} className="text-[11px] font-bold uppercase leading-tight">{line}</p>)}</div>
        </div>
        <div className="text-right"><h3 className="text-xl font-black">ORDEN DE COMPRA</h3><p className="mt-2 text-lg font-black">{order.numero}</p><p className="mt-2 text-xs text-slate-600">Emisión: {formatDate(order.fecha_emision)}</p><p className="text-xs text-slate-600">Entrega: {formatDate(order.fecha_entrega)}</p></div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
        <div className="rounded border border-slate-500 p-3"><b>Proveedor</b><p className="mt-2">{provider.razon_social || 'Sin proveedor'}</p><p>{provider.rut || 'Sin RUT'}</p><p>{provider.direccion || 'Sin dirección'}</p><p>{provider.telefono || ''}</p></div>
        <div className="rounded border border-slate-500 p-3"><b>Condiciones</b><p className="mt-2 whitespace-pre-wrap">{order.condiciones || 'Sin condiciones'}</p><p className="mt-2"><b>Estado:</b> {order.estado}</p></div>
      </div>
      <table className="mt-4 w-full table-fixed border-collapse text-xs">
        <thead><tr className="bg-slate-100"><th className="w-16 border border-slate-500 p-2">Cant.</th><th className="w-24 border border-slate-500 p-2">Código</th><th className="border border-slate-500 p-2">Descripción</th><th className="w-24 border border-slate-500 p-2">Unit.</th><th className="w-24 border border-slate-500 p-2">Total</th></tr></thead>
        <tbody>{rows.map((item, index) => <tr key={index}><td className="h-8 border border-slate-500 p-1 text-center">{item?.cantidad}</td><td className="border border-slate-500 p-1">{item?.codigo}</td><td className="border border-slate-500 p-1">{item?.descripcion}</td><td className="border border-slate-500 p-1 text-right">{item ? money(numeric(item.valor_unitario)) : ''}</td><td className="border border-slate-500 p-1 text-right">{item ? money(itemTotal(item)) : ''}</td></tr>)}</tbody>
      </table>
      <div className="ml-auto mt-4 w-64 text-xs">
        <div className="grid grid-cols-2 border border-slate-500"><b className="p-2">Subtotal neto</b><span className="border-l border-slate-500 p-2 text-right">{money(order.subtotal)}</span></div>
        <div className="grid grid-cols-2 border-x border-b border-slate-500"><b className="p-2">IVA 19%</b><span className="border-l border-slate-500 p-2 text-right">{money(order.iva)}</span></div>
        <div className="grid grid-cols-2 bg-slate-950 text-white"><b className="p-2">Total</b><span className="p-2 text-right">{money(order.total)}</span></div>
      </div>
    </div>
  </div>
}

export function OrdenesCompra() {
  const { activeEmpresaId, activeEmpresa } = useEmpresa()
  const [orders, setOrders] = useState<OrdenCompra[]>([])
  const [providers, setProviders] = useState<Proveedor[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState('')
  const [previewId, setPreviewId] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    if (!activeEmpresaId) return
    setLoading(true)
    setMessage('')
    const [ordersResult, providersResult] = await Promise.all([
      supabase.from('ordenes_compra').select('*, empresas_asociadas(id, razon_social, rut, telefono, direccion, email, contacto_nombre)').eq('empresa_id', activeEmpresaId).order('fecha_emision', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('empresas_asociadas').select('*').eq('empresa_id', activeEmpresaId).in('tipo', ['proveedor', 'contratista', 'taller', 'leasing']).eq('estado', 'activa').order('razon_social', { ascending: true }),
    ])
    if (ordersResult.error) {
      setOrders([])
      setMessage(moduleMessage(ordersResult.error))
    } else {
      setOrders((ordersResult.data || []) as OrdenCompra[])
    }
    if (!providersResult.error) setProviders((providersResult.data || []) as Proveedor[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [activeEmpresaId])

  const selectedProvider = useMemo(() => providers.find((item) => item.id === form.proveedor_id) || null, [form.proveedor_id, providers])
  const totals = useMemo(() => {
    const subtotal = normalizedItems(form.items).reduce((sum, item) => sum + itemTotal(item), 0)
    const iva = Math.round(subtotal * 0.19)
    return { subtotal, iva, total: subtotal + iva }
  }, [form.items])

  const previewOrder = useMemo<OrdenCompra>(() => {
    const existing = orders.find((item) => item.id === previewId)
    if (existing && !editingId) return existing
    return {
      id: editingId || 'preview',
      empresa_id: activeEmpresaId,
      numero: form.numero,
      proveedor_id: form.proveedor_id || null,
      fecha_emision: form.fecha_emision,
      fecha_entrega: form.fecha_entrega || null,
      proveedor_snapshot: providerSnapshot(selectedProvider),
      items: normalizedItems(form.items),
      subtotal: totals.subtotal,
      iva: totals.iva,
      total: totals.total,
      moneda: 'CLP',
      condiciones: form.condiciones,
      observaciones: form.observaciones,
      estado: form.estado,
      created_at: new Date().toISOString(),
      empresas_asociadas: selectedProvider,
    }
  }, [activeEmpresaId, editingId, form, orders, previewId, selectedProvider, totals])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return orders.filter((item) => !term || [item.numero, providerName(item), item.proveedor_snapshot?.rut, item.observaciones, item.condiciones].some((value) => String(value || '').toLowerCase().includes(term)))
  }, [orders, query])

  function resetForm() {
    setForm({ ...emptyForm, numero: nextNumber(), fecha_emision: today(), items: [{ ...blankItem }] })
    setEditingId('')
  }

  function updateItem(index: number, field: keyof CompraItem, value: string) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }))
  }

  function addItem() {
    setForm((current) => ({ ...current, items: [...current.items, { ...blankItem }] }))
  }

  function removeItem(index: number) {
    setForm((current) => ({ ...current, items: current.items.length === 1 ? [{ ...blankItem }] : current.items.filter((_, itemIndex) => itemIndex !== index) }))
  }

  function edit(order: OrdenCompra, duplicate = false) {
    const provider = order.proveedor_id || providers.find((item) => item.razon_social === order.proveedor_snapshot?.razon_social)?.id || ''
    setForm({
      numero: duplicate ? nextNumber() : order.numero,
      proveedor_id: provider,
      fecha_emision: duplicate ? today() : order.fecha_emision,
      fecha_entrega: order.fecha_entrega || '',
      condiciones: order.condiciones || '',
      observaciones: order.observaciones || '',
      estado: duplicate ? 'borrador' : order.estado,
      items: order.items?.length ? order.items.map((item) => ({ ...blankItem, ...item, cantidad: String(item.cantidad || '1'), valor_unitario: String(item.valor_unitario || '') })) : [{ ...blankItem }],
    })
    setEditingId(duplicate ? '' : order.id)
    setPreviewId('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function save() {
    if (!activeEmpresaId) return setMessage('Selecciona una empresa activa antes de guardar.')
    if (!form.numero.trim()) return setMessage('Ingresa el número de la orden de compra.')
    if (!selectedProvider) return setMessage('Selecciona un proveedor guardado en Empresas asociadas.')
    const items = normalizedItems(form.items)
    if (!items.length) return setMessage('Agrega al menos una línea de compra.')

    setSaving(true)
    const payload = {
      empresa_id: activeEmpresaId,
      proveedor_id: selectedProvider.id,
      numero: form.numero.trim(),
      fecha_emision: form.fecha_emision,
      fecha_entrega: form.fecha_entrega || null,
      proveedor_snapshot: providerSnapshot(selectedProvider),
      items,
      subtotal: totals.subtotal,
      iva: totals.iva,
      total: totals.total,
      moneda: 'CLP',
      condiciones: clean(form.condiciones),
      observaciones: clean(form.observaciones),
      estado: form.estado,
    }
    const queryBuilder = editingId
      ? supabase.from('ordenes_compra').update(payload).eq('id', editingId).select('*')
      : supabase.from('ordenes_compra').insert(payload).select('*')
    const { data, error } = await queryBuilder
    setSaving(false)
    if (error) return setMessage(moduleMessage(error))
    setPreviewId(data?.[0]?.id || '')
    setMessage(editingId ? 'Orden de compra actualizada.' : 'Orden de compra guardada.')
    resetForm()
    await load()
  }

  async function cancel(order: OrdenCompra) {
    if (!window.confirm(`¿Anular la orden de compra ${order.numero}?`)) return
    const { error } = await supabase.from('ordenes_compra').update({ estado: 'anulada' }).eq('id', order.id).select('id')
    if (error) return setMessage(moduleMessage(error))
    setMessage('Orden de compra anulada.')
    await load()
  }

  async function remove(order: OrdenCompra) {
    if (!window.confirm(`¿Eliminar definitivamente la orden de compra ${order.numero}?`)) return
    const { error } = await supabase.from('ordenes_compra').delete().eq('id', order.id).select('id')
    if (error) return setMessage(moduleMessage(error))
    setMessage('Orden de compra eliminada.')
    await load()
  }

  function print(order = previewOrder) {
    const win = window.open('', '_blank', 'noopener,noreferrer')
    if (!win) return setMessage('El navegador bloqueó la ventana de impresión.')
    win.document.write(buildPrintHtml(order, activeEmpresa))
    win.document.close()
  }

  return <div className="mx-auto max-w-7xl space-y-5 pb-8">
    <FeedbackToast message={message} onClose={() => setMessage('')} />
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-blue-700">Compras</p>
        <h2 className="text-3xl font-black text-slate-950">Órdenes de compra</h2>
        <p className="mt-2 max-w-3xl text-slate-600">Emite OC con datos de la empresa activa y proveedores guardados en Empresas asociadas.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => print()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white"><Printer size={17} />Imprimir vista</button>
        <button type="button" onClick={load} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} />Actualizar</button>
      </div>
    </div>

    <div className="grid gap-5 xl:grid-cols-[480px_1fr]">
      <div className="space-y-5">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><ShoppingCart className="text-blue-700" /><h3 className="text-lg font-black">{editingId ? 'Editar OC' : 'Nueva OC'}</h3></div>
            {editingId && <button type="button" onClick={resetForm} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold">Nueva</button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>Número<input value={form.numero} onChange={(event) => setForm({ ...form, numero: event.target.value })} className={inputClass} /></label>
            <label className={labelClass}>Estado<select value={form.estado} onChange={(event) => setForm({ ...form, estado: event.target.value as OrdenCompra['estado'] })} className={inputClass}><option value="borrador">Borrador</option><option value="emitida">Emitida</option><option value="anulada">Anulada</option></select></label>
            <label className={labelClass}>Fecha emisión<input type="date" value={form.fecha_emision} onChange={(event) => setForm({ ...form, fecha_emision: event.target.value })} className={inputClass} /></label>
            <label className={labelClass}>Fecha entrega<input type="date" value={form.fecha_entrega} onChange={(event) => setForm({ ...form, fecha_entrega: event.target.value })} className={inputClass} /></label>
            <label className={`${labelClass} sm:col-span-2`}>Proveedor<select value={form.proveedor_id} onChange={(event) => setForm({ ...form, proveedor_id: event.target.value })} className={inputClass}><option value="">Selecciona proveedor</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.razon_social} · {provider.rut || 'sin RUT'}</option>)}</select></label>
          </div>
          {!providers.length && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Primero agrega proveedores activos en Empresas asociadas.</p>}

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between"><h4 className="font-black">Detalle</h4><button type="button" onClick={addItem} className="inline-flex items-center gap-2 rounded-lg bg-blue-100 px-3 py-2 text-sm font-bold text-blue-700"><Plus size={16} />Línea</button></div>
            {form.items.map((item, index) => <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-2 sm:grid-cols-[74px_1fr_120px_36px]">
                <input value={item.cantidad} onChange={(event) => updateItem(index, 'cantidad', event.target.value)} className={inputClass} placeholder="Cant." />
                <input value={item.codigo} onChange={(event) => updateItem(index, 'codigo', event.target.value)} className={inputClass} placeholder="Código / parte" />
                <input value={item.valor_unitario} onChange={(event) => updateItem(index, 'valor_unitario', event.target.value)} className={`${inputClass} text-right`} placeholder="Valor" />
                <button type="button" onClick={() => removeItem(index)} className="mt-1.5 rounded-lg bg-red-50 p-2 text-red-700" aria-label="Eliminar línea"><Trash2 size={16} /></button>
              </div>
              <textarea value={item.descripcion} onChange={(event) => updateItem(index, 'descripcion', event.target.value)} className={`${inputClass} min-h-20 resize-y`} placeholder="Descripción del producto o servicio" />
              <p className="mt-2 text-right text-sm font-black text-slate-700">Línea: {money(itemTotal(item))}</p>
            </div>)}
          </div>

          <div className="mt-4 grid gap-3">
            <label className={labelClass}>Condiciones<textarea value={form.condiciones} onChange={(event) => setForm({ ...form, condiciones: event.target.value })} className={`${inputClass} min-h-20 resize-y`} placeholder="Forma de pago, despacho, plazo..." /></label>
            <label className={labelClass}>Observaciones<textarea value={form.observaciones} onChange={(event) => setForm({ ...form, observaciones: event.target.value })} className={`${inputClass} min-h-20 resize-y`} /></label>
          </div>
          <div className="mt-4 rounded-xl bg-slate-950 p-4 text-white">
            <div className="flex justify-between text-sm"><span>Subtotal neto</span><b>{money(totals.subtotal)}</b></div>
            <div className="mt-1 flex justify-between text-sm"><span>IVA 19%</span><b>{money(totals.iva)}</b></div>
            <div className="mt-2 flex justify-between border-t border-white/20 pt-2 text-lg font-black"><span>Total</span><span>{money(totals.total)}</span></div>
          </div>
          <button type="button" onClick={save} disabled={saving} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-black text-white disabled:opacity-50"><Save size={17} />{saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Guardar OC'}</button>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2"><Search size={18} className="text-blue-700" /><h3 className="font-black">Órdenes guardadas</h3></div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="mb-3 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Buscar por número o proveedor" />
          {loading ? <p className="py-8 text-center text-slate-500">Cargando órdenes...</p> : !filtered.length ? <EmptyState>Aún no hay órdenes de compra.</EmptyState> : <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
            {filtered.map((order) => <div key={order.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2"><div><button type="button" onClick={() => { setPreviewId(order.id); setEditingId('') }} className="text-left font-black text-slate-950 hover:text-blue-700">{order.numero}</button><p className="mt-1 text-sm text-slate-500">{providerName(order)}</p><p className="mt-1 text-xs text-slate-500">{formatDate(order.fecha_emision)} · {money(order.total)}</p></div><StatusBadge value={order.estado} /></div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => { setPreviewId(order.id); setEditingId('') }} className="rounded-lg bg-slate-100 p-2 text-slate-700" title="Ver"><Eye size={16} /></button>
                <button type="button" onClick={() => edit(order)} className="rounded-lg bg-blue-100 p-2 text-blue-700" title="Editar"><Pencil size={16} /></button>
                <button type="button" onClick={() => edit(order, true)} className="rounded-lg bg-emerald-100 p-2 text-emerald-700" title="Usar como base"><Copy size={16} /></button>
                <button type="button" onClick={() => print(order)} className="rounded-lg bg-slate-950 p-2 text-white" title="Imprimir"><Printer size={16} /></button>
                {order.estado !== 'anulada' && <button type="button" onClick={() => cancel(order)} className="rounded-lg bg-amber-100 p-2 text-amber-700" title="Anular"><Ban size={16} /></button>}
              </div>
            </div>)}
          </div>}
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h3 className="font-black">Previsualización</h3><p className="mt-1 text-sm text-slate-500">Esta es la hoja que se imprime o guarda como PDF.</p></div>
          <button type="button" onClick={() => print()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white"><Printer size={17} />Imprimir</button>
        </div>
        <Preview order={previewOrder} company={activeEmpresa} />
      </Card>
    </div>
  </div>
}
