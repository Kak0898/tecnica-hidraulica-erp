import { useEffect, useMemo, useState } from 'react'
import { Ban, Copy, Eye, Pencil, Plus, Printer, RefreshCw, Save, Search, ShoppingCart, Trash2, X } from 'lucide-react'
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

const emptyProviderForm = {
  razon_social: '',
  rut: '',
  contacto_nombre: '',
  email: '',
  telefono: '',
  direccion: '',
  servicios: '',
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
  const rows = Array.from({ length: Math.max(10, order.items.length) }).map((_, index) => {
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
body{margin:0;background:#e5e7eb;font-family:Arial,Helvetica,sans-serif;color:#111827}
.toolbar{padding:16px;text-align:center}.toolbar button{border:0;border-radius:6px;background:#0f172a;color:white;padding:10px 18px;font-weight:700}
.sheet{width:216mm;min-height:279mm;margin:0 auto 24px;background:white;padding:10mm 12mm;border:1px solid #cbd5e1}
.top{display:grid;grid-template-columns:1fr 58mm;gap:8mm;align-items:start}
.brand{display:grid;grid-template-columns:31mm 1fr;gap:5mm;align-items:start}.brand img{width:30mm;max-height:24mm;object-fit:contain}.brand h1{margin:0;font-size:18px;text-transform:uppercase;font-weight:900}.brand p{margin:1mm 0 0;font-size:10.5px;font-weight:700;text-transform:uppercase;line-height:1.2}
.quote-block{border:1px solid #d5dbea;border-radius:8px;padding:3.5mm;text-align:center;color:#0f2a66}.quote-label{font-size:11px;font-weight:800;text-transform:uppercase}.quote-number{font-size:25px;font-weight:900;line-height:1.05}.date-block{margin-top:3mm;text-align:left;color:#111827}.date-row{display:grid;grid-template-columns:26mm 1fr;align-items:center;gap:2mm;margin-top:2mm;font-size:10.5px}.date-value{border:1px solid #cbd5e1;border-radius:5px;min-height:7mm;padding:1.5mm;text-align:center}
.info{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin:7mm 0}.info-table{width:100%;border-collapse:collapse;table-layout:fixed}.info-table th{background:#0f2a66;color:white;text-align:left;font-size:11px;padding:2mm}.info-table td{border:1px solid #cbd5e1;padding:2mm;font-size:11px;min-height:7mm}.info-table .label{width:30mm;background:#f8fafc;font-weight:800;color:#334155}
.block-title{margin:5mm 0 2mm;background:#0f2a66;color:white;padding:2mm 3mm;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.6px}
.main-table{width:100%;border-collapse:collapse;table-layout:fixed}.main-table th,.main-table td{border:1px solid #94a3b8;padding:2mm;font-size:11px;vertical-align:top}.main-table th{background:#eef2ff;color:#0f2a66;text-transform:uppercase}.main-table td{height:8.5mm}.qty{width:18mm}.code{width:30mm}.money{width:30mm}.num{text-align:right;white-space:nowrap}
.bottom{display:grid;grid-template-columns:1fr 72mm;gap:7mm;margin-top:5mm}.notes{border:1px solid #cbd5e1;min-height:34mm;padding:3mm;white-space:pre-wrap;font-size:11px;line-height:1.45}.totals{width:100%;border-collapse:collapse}.totals td{border:1px solid #94a3b8;padding:2.3mm;font-size:12px}.totals td:first-child{font-weight:800;background:#f8fafc}.totals .grand td{background:#0f2a66;color:white;font-weight:900;font-size:13px}
.terms{margin-top:5mm;border:1px solid #cbd5e1;padding:3mm;min-height:22mm;white-space:pre-wrap;font-size:11px;line-height:1.45}.signs{display:grid;grid-template-columns:1fr 1fr;gap:20mm;margin-top:18mm;text-align:center;font-size:11px}.sign{border-top:1px solid #334155;padding-top:2mm}.sign b{display:block;font-size:12px}.sign span{display:block;color:#475569;margin-top:1mm}
@media print{body{background:white}.toolbar{display:none}.sheet{border:0;margin:0;width:auto;min-height:auto;page-break-after:always}thead{display:table-header-group}}
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">Imprimir / guardar PDF</button></div>
<main class="sheet">
  <section class="top">
    <div class="brand">${logo}<div>${lines}</div></div>
    <section class="quote-block">
      <div class="quote-label">ORDEN DE COMPRA N°</div>
      <div class="quote-number">${esc(order.numero)}</div>
      <div class="date-block">
        <div class="date-row"><b>Fecha Emisión:</b><div class="date-value">${esc(formatDate(order.fecha_emision))}</div></div>
        <div class="date-row"><b>Fecha Entrega:</b><div class="date-value">${esc(formatDate(order.fecha_entrega))}</div></div>
        <div class="date-row"><b>R.U.T.:</b><div class="date-value">${esc(company?.rut || '')}</div></div>
      </div>
    </section>
  </section>

  <section class="info">
    <table class="info-table">
      <tr><th colspan="2">DATOS PROVEEDOR</th></tr>
      <tr><td class="label">Señor(es)</td><td>${esc(provider.razon_social)}</td></tr>
      <tr><td class="label">Contacto</td><td>${esc(provider.contacto_nombre)}</td></tr>
      <tr><td class="label">R.U.T.</td><td>${esc(provider.rut)}</td></tr>
      <tr><td class="label">Dirección</td><td>${esc(provider.direccion)}</td></tr>
      <tr><td class="label">E-mail</td><td>${esc(provider.email)}</td></tr>
      <tr><td class="label">Fono</td><td>${esc(provider.telefono)}</td></tr>
    </table>
    <table class="info-table">
      <tr><th colspan="2">DATOS ORDEN DE COMPRA</th></tr>
      <tr><td class="label">N° OC</td><td>${esc(order.numero)}</td></tr>
      <tr><td class="label">Razón social</td><td>${esc(company?.razon_social || company?.nombre || '')}</td></tr>
      <tr><td class="label">R.U.T.</td><td>${esc(company?.rut || '')}</td></tr>
      <tr><td class="label">Moneda</td><td>${esc(order.moneda || 'CLP')}</td></tr>
      <tr><td class="label">Estado</td><td>${esc(order.estado)}</td></tr>
      <tr><td class="label">Fecha</td><td>${esc(formatDate(order.fecha_emision))}</td></tr>
    </table>
  </section>

  <div class="block-title">Detalle de compra</div>
  <table class="main-table"><thead><tr><th class="qty">Cant.</th><th class="code">Código</th><th>Detalle</th><th class="money">Valor Unitario</th><th class="money">Valor Total</th></tr></thead><tbody>${rows}</tbody></table>
  <section class="bottom">
    <div><div class="block-title">Observaciones</div><div class="notes">${esc(order.observaciones)}</div></div>
    <table class="totals"><tr><td>Neto</td><td class="num">${esc(money(order.subtotal))}</td></tr><tr><td>IVA 19%</td><td class="num">${esc(money(order.iva))}</td></tr><tr class="grand"><td>Total</td><td class="num">${esc(money(order.total))}</td></tr></table>
  </section>
  <div class="block-title">Condiciones</div>
  <section class="terms">${esc(order.condiciones)}</section>
  <section class="signs">
    <div class="sign"><b>Rafael Espinoza Toledo</b><span>Gerente de Operaciones</span></div>
    <div class="sign"><b>Domingo Toro Segura</b><span>Gerente General</span></div>
  </section>
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
      <div className="mt-10 grid grid-cols-2 gap-16 text-center text-xs">
        <div className="border-t border-slate-600 pt-2"><b>Rafael Espinoza Toledo</b><p className="text-slate-500">Gerente de Operaciones</p></div>
        <div className="border-t border-slate-600 pt-2"><b>Domingo Toro Segura</b><p className="text-slate-500">Gerente General</p></div>
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
  const [showProviderForm, setShowProviderForm] = useState(false)
  const [providerForm, setProviderForm] = useState(emptyProviderForm)
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

  async function saveProvider() {
    if (!activeEmpresaId) return setMessage('Selecciona una empresa activa antes de crear el proveedor.')
    if (!providerForm.razon_social.trim()) return setMessage('Ingresa la razón social del proveedor.')
    setSaving(true)
    const { data, error } = await supabase.from('empresas_asociadas').insert({
      empresa_id: activeEmpresaId,
      tipo: 'proveedor',
      razon_social: providerForm.razon_social.trim(),
      rut: clean(providerForm.rut),
      contacto_nombre: clean(providerForm.contacto_nombre),
      email: clean(providerForm.email),
      telefono: clean(providerForm.telefono),
      direccion: clean(providerForm.direccion),
      servicios: clean(providerForm.servicios),
      estado: 'activa',
    }).select('*')
    setSaving(false)
    if (error) return setMessage(moduleMessage(error))
    const created = data?.[0] as Proveedor | undefined
    if (created) {
      setProviders((current) => [...current, created].sort((a, b) => a.razon_social.localeCompare(b.razon_social, 'es')))
      setForm((current) => ({ ...current, proveedor_id: created.id }))
    }
    setProviderForm(emptyProviderForm)
    setShowProviderForm(false)
    setMessage('Proveedor creado y seleccionado para esta OC.')
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!providers.length && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">No hay proveedores activos todavía.</p>}
            <button type="button" onClick={() => setShowProviderForm((current) => !current)} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-black text-blue-700">
              {showProviderForm ? <X size={16} /> : <Plus size={16} />}
              {showProviderForm ? 'Cerrar proveedor rápido' : 'Agregar proveedor rápido'}
            </button>
          </div>

          {showProviderForm && <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="font-black text-slate-950">Proveedor rápido</h4>
              <button type="button" onClick={() => setShowProviderForm(false)} className="rounded-lg bg-white p-2 text-slate-500"><X size={16} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`${labelClass} sm:col-span-2`}>Razón social *<input value={providerForm.razon_social} onChange={(event) => setProviderForm({ ...providerForm, razon_social: event.target.value })} className={inputClass} /></label>
              <label className={labelClass}>RUT<input value={providerForm.rut} onChange={(event) => setProviderForm({ ...providerForm, rut: event.target.value })} className={inputClass} /></label>
              <label className={labelClass}>Contacto<input value={providerForm.contacto_nombre} onChange={(event) => setProviderForm({ ...providerForm, contacto_nombre: event.target.value })} className={inputClass} /></label>
              <label className={labelClass}>Correo<input type="email" value={providerForm.email} onChange={(event) => setProviderForm({ ...providerForm, email: event.target.value })} className={inputClass} /></label>
              <label className={labelClass}>Teléfono<input value={providerForm.telefono} onChange={(event) => setProviderForm({ ...providerForm, telefono: event.target.value })} className={inputClass} /></label>
              <label className={`${labelClass} sm:col-span-2`}>Dirección<input value={providerForm.direccion} onChange={(event) => setProviderForm({ ...providerForm, direccion: event.target.value })} className={inputClass} /></label>
              <label className={`${labelClass} sm:col-span-2`}>Servicios o productos<textarea value={providerForm.servicios} onChange={(event) => setProviderForm({ ...providerForm, servicios: event.target.value })} className={`${inputClass} min-h-20 resize-y`} /></label>
            </div>
            <button type="button" onClick={saveProvider} disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><Save size={16} />Guardar proveedor</button>
          </div>}

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
