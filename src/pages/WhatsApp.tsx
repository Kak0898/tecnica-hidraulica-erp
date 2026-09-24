import { useEffect, useMemo, useState } from 'react'
import { Clock3, ExternalLink, Inbox, MessageCircle, RefreshCw, Send, XCircle } from 'lucide-react'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
import { supabase } from '../lib/supabase'

type Cliente = { id: string; razon_social: string }
type Contacto = { id: string; nombre: string; telefono?: string; cliente_id?: string }
type MensajeCola = {
  id: string; telefono: string; plantilla?: string; mensaje: string
  estado: 'pendiente' | 'enviado' | 'fallido' | 'cancelado'
  scheduled_at?: string; created_at?: string; clientes?: Cliente | null; contactos?: Contacto | null
}
type MensajeConversacion = {
  id: string; content?: string | null; direction: 'incoming' | 'outgoing'
  message_type: string; ai_generated?: boolean; created_at: string
}
type ClienteWhatsApp = { id: string; phone: string; name?: string | null; company_name?: string | null }
type Conversacion = {
  id: string; status: string; ai_enabled: boolean; customer: ClienteWhatsApp | null
  last_message: MensajeConversacion | null; created_at: string
}
type DetalleConversacion = {
  conversation: Omit<Conversacion, 'customer' | 'last_message'>
  customer: ClienteWhatsApp
  messages: MensajeConversacion[]
}

const plantillas = {
  seguimiento_cotizacion: 'Hola, te escribimos para hacer seguimiento a la cotización enviada. Quedamos atentos a tus comentarios.',
  ot_recibida: 'Hola, confirmamos la recepción de tu equipo/servicio. Te avisaremos cuando el diagnóstico esté disponible.',
  ot_lista: 'Hola, tu trabajo ya está listo para retiro/entrega. Por favor coordina con nuestro equipo.',
  pago_pendiente: 'Hola, te contactamos por un pago pendiente asociado a tu servicio. Quedamos atentos.',
}
const emptyForm = { cliente_id: '', contacto_id: '', telefono: '', plantilla: 'seguimiento_cotizacion', mensaje: plantillas.seguimiento_cotizacion, scheduled_at: '' }

function formatDate(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}
function estadoClass(estado: string) {
  if (estado === 'enviado') return 'bg-emerald-50 text-emerald-700'
  if (estado === 'fallido' || estado === 'cancelado') return 'bg-red-50 text-red-700'
  return 'bg-amber-50 text-amber-700'
}
function whatsappUrl(telefono: string, mensaje: string) {
  const digits = String(telefono || '').replace(/\D/g, '')
  const phone = digits.startsWith('56') ? digits : digits.length === 9 ? `56${digits}` : digits
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(mensaje)}` : ''
}
function contactName(customer?: ClienteWhatsApp | null) {
  return customer?.name || customer?.company_name || customer?.phone || 'Contacto sin nombre'
}

export function WhatsApp() {
  const [view, setView] = useState<'inbox' | 'queue'>('inbox')
  const [mensajes, setMensajes] = useState<MensajeCola[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [contactos, setContactos] = useState<Contacto[]>([])
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState<DetalleConversacion | null>(null)
  const [reply, setReply] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sendingId, setSendingId] = useState('')
  const [message, setMessage] = useState('')

  async function selectConversation(id: string) {
    setSelectedId(id)
    setLoadingDetail(true)
    const { data, error } = await supabase.whatsapp.conversation(id)
    setLoadingDetail(false)
    if (error) { setMessage(error.message); return }
    setDetail(data as DetalleConversacion)
  }

  async function load() {
    setLoading(true)
    setMessage('')
    const [inboxResult, mensajesResult, clientesResult, contactosResult] = await Promise.all([
      supabase.whatsapp.conversations(),
      supabase.from('whatsapp_mensajes').select('*, clientes(id, razon_social), contactos(id, nombre, telefono, cliente_id)').order('created_at', { ascending: false }).limit(100),
      supabase.from('clientes').select('id, razon_social').order('razon_social', { ascending: true }),
      supabase.from('contactos').select('id, nombre, telefono, cliente_id').order('created_at', { ascending: false }),
    ])
    const firstError = inboxResult.error || mensajesResult.error || clientesResult.error || contactosResult.error
    if (firstError) setMessage(firstError.message)
    const inbox = (inboxResult.data || []) as Conversacion[]
    setConversaciones(inbox)
    setMensajes((mensajesResult.data || []) as MensajeCola[])
    setClientes((clientesResult.data || []) as Cliente[])
    setContactos((contactosResult.data || []) as Contacto[])
    setLoading(false)
    if (!selectedId && inbox[0]) await selectConversation(inbox[0].id)
    else if (selectedId) await selectConversation(selectedId)
  }

  useEffect(() => { load() }, [])

  const contactosFiltrados = useMemo(() => form.cliente_id ? contactos.filter((item) => item.cliente_id === form.cliente_id) : contactos, [contactos, form.cliente_id])

  async function createQueueMessage(input: { telefono: string; mensaje: string; cliente_id?: string; contacto_id?: string; plantilla?: string; scheduled_at?: string }) {
    return supabase.from('whatsapp_mensajes').insert({
      cliente_id: input.cliente_id || null, contacto_id: input.contacto_id || null,
      telefono: input.telefono.trim(), plantilla: input.plantilla || null,
      mensaje: input.mensaje.trim(), scheduled_at: input.scheduled_at || null, estado: 'pendiente',
    }).select('*').single()
  }

  async function save() {
    if (!form.telefono.trim() || !form.mensaje.trim()) { setMessage('Ingresa teléfono y mensaje.'); return }
    setSaving(true)
    const { error } = await createQueueMessage(form)
    setSaving(false)
    if (error) { setMessage(error.message); return }
    setForm(emptyForm)
    setMessage('Mensaje agregado a la cola.')
    await load()
  }

  async function sendNow(id: string) {
    setSendingId(id)
    setMessage('')
    const { data, error } = await supabase.whatsapp.send(id)
    setSendingId('')
    if (error) { setMessage(error.message); await load(); return false }
    setMensajes((current) => current.map((item) => item.id === id ? { ...item, ...data, estado: 'enviado' } : item))
    return true
  }

  async function sendReply() {
    if (!detail?.customer?.phone || !reply.trim()) return
    setSaving(true)
    const { data: queued, error } = await createQueueMessage({ telefono: detail.customer.phone, mensaje: reply })
    if (error) { setSaving(false); setMessage(error.message); return }
    const sent = await sendNow(queued.id)
    setSaving(false)
    if (!sent) return
    setReply('')
    setMessage('Respuesta enviada correctamente.')
    await load()
  }

  async function cancel(id: string) {
    const { error } = await supabase.from('whatsapp_mensajes').update({ estado: 'cancelado', sent_at: null }).eq('id', id)
    if (error) { setMessage(error.message); return }
    setMensajes((current) => current.map((item) => item.id === id ? { ...item, estado: 'cancelado' } : item))
  }

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><h2 className="text-3xl font-bold text-slate-950">WhatsApp</h2><p className="mt-2 text-slate-600">Conversaciones, respuestas y mensajes programados de la empresa.</p></div>
        <button onClick={load} disabled={loading || saving} className="inline-flex items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50"><RefreshCw size={18} />{loading ? 'Actualizando...' : 'Actualizar'}</button>
      </div>
      <FeedbackToast message={message} onClose={() => setMessage('')} />
      <div className="mb-4 inline-flex rounded border border-slate-300 bg-white p-1">
        <button onClick={() => setView('inbox')} className={`inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-semibold ${view === 'inbox' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}><Inbox size={17} />Conversaciones</button>
        <button onClick={() => setView('queue')} className={`inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-semibold ${view === 'queue' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}><Clock3 size={17} />Cola de mensajes</button>
      </div>

      {view === 'inbox' ? (
        <div className="grid min-h-[620px] overflow-hidden rounded border border-slate-200 bg-white shadow-sm lg:grid-cols-[340px_1fr]">
          <aside className="border-b border-slate-200 lg:border-b-0 lg:border-r">
            <div className="border-b px-4 py-3"><h3 className="font-bold text-slate-950">Conversaciones</h3><span className="text-xs text-slate-500">{conversaciones.length} contactos</span></div>
            <div className="max-h-[560px] overflow-y-auto">
              {conversaciones.map((conversation) => <button key={conversation.id} onClick={() => selectConversation(conversation.id)} className={`w-full border-b px-4 py-4 text-left ${selectedId === conversation.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <div className="flex items-start justify-between gap-3"><strong className="text-sm text-slate-950">{contactName(conversation.customer)}</strong><span className="shrink-0 text-[11px] text-slate-400">{formatDate(conversation.last_message?.created_at)}</span></div>
                <div className="mt-1 text-xs text-slate-500">{conversation.customer?.phone || '-'}</div>
                <p className="mt-2 truncate text-sm text-slate-600">{conversation.last_message?.direction === 'outgoing' ? 'Tú: ' : ''}{conversation.last_message?.content || `[${conversation.last_message?.message_type || 'sin mensajes'}]`}</p>
              </button>)}
              {!conversaciones.length && <div className="p-8 text-center text-sm text-slate-500">{loading ? 'Cargando...' : 'Todavía no hay conversaciones recibidas.'}</div>}
            </div>
          </aside>
          <section className="flex min-h-[620px] flex-col">
            {detail ? <>
              <header className="border-b px-5 py-4"><h3 className="font-bold text-slate-950">{contactName(detail.customer)}</h3><span className="text-sm text-slate-500">+{detail.customer.phone}</span></header>
              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-5">
                {loadingDetail ? <div className="text-center text-slate-500">Cargando historial...</div> : detail.messages.map((item) => <div key={item.id} className={`flex ${item.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[78%] rounded px-4 py-3 shadow-sm ${item.direction === 'outgoing' ? 'bg-emerald-100 text-emerald-950' : 'bg-white text-slate-800'}`}><p className="whitespace-pre-wrap text-sm">{item.content || `[${item.message_type}]`}</p><div className="mt-1 text-right text-[10px] text-slate-500">{formatDate(item.created_at)}{item.ai_generated ? ' · IA' : ''}</div></div></div>)}
              </div>
              <div className="border-t bg-white p-4"><div className="flex gap-2"><textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Escribe una respuesta" className="min-h-20 flex-1 resize-none rounded border border-slate-300 px-3 py-2" /><button onClick={sendReply} disabled={saving || !reply.trim()} title="Enviar respuesta" className="self-stretch rounded bg-emerald-600 px-4 text-white disabled:opacity-50"><Send size={20} /></button></div></div>
            </> : <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-500"><div><MessageCircle className="mx-auto mb-3" size={34} /><p>Selecciona una conversación para ver su historial.</p></div></div>}
          </section>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[390px_1fr]">
          <Card><div className="mb-4 flex items-center gap-2"><MessageCircle className="text-emerald-700" /><h3 className="text-lg font-bold text-slate-950">Nuevo mensaje</h3></div><div className="grid gap-3">
            <select className="rounded border border-slate-300 px-3 py-3" value={form.cliente_id} onChange={(event) => setForm({ ...form, cliente_id: event.target.value, contacto_id: '' })}><option value="">Cliente</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.razon_social}</option>)}</select>
            <select className="rounded border border-slate-300 px-3 py-3" value={form.contacto_id} onChange={(event) => { const contacto = contactos.find((item) => item.id === event.target.value); setForm({ ...form, contacto_id: event.target.value, telefono: contacto?.telefono || form.telefono }) }}><option value="">Contacto</option>{contactosFiltrados.map((item) => <option key={item.id} value={item.id}>{item.nombre} · {item.telefono || 'sin teléfono'}</option>)}</select>
            <input className="rounded border border-slate-300 px-3 py-3" placeholder="Teléfono WhatsApp" value={form.telefono} onChange={(event) => setForm({ ...form, telefono: event.target.value })} />
            <select className="rounded border border-slate-300 px-3 py-3" value={form.plantilla} onChange={(event) => setForm({ ...form, plantilla: event.target.value, mensaje: plantillas[event.target.value as keyof typeof plantillas] || form.mensaje })}>{Object.keys(plantillas).map((key) => <option key={key} value={key}>{key.replaceAll('_', ' ')}</option>)}</select>
            <textarea className="min-h-32 rounded border border-slate-300 px-3 py-3" value={form.mensaje} onChange={(event) => setForm({ ...form, mensaje: event.target.value })} />
            <input className="rounded border border-slate-300 px-3 py-3" type="datetime-local" value={form.scheduled_at} onChange={(event) => setForm({ ...form, scheduled_at: event.target.value })} />
          </div><button onClick={save} disabled={saving} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50"><Send size={18} />{saving ? 'Guardando...' : 'Agregar a cola'}</button></Card>
          <Card><div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-slate-950">Mensajes preparados</h3><span className="text-sm text-slate-500">{mensajes.length}</span></div><div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="py-3">Destino</th><th>Mensaje</th><th>Estado</th><th>Programado</th><th>Acciones</th></tr></thead><tbody>{mensajes.map((item) => <tr key={item.id} className="border-b align-top"><td className="py-3"><strong>{item.contactos?.nombre || item.clientes?.razon_social || item.telefono}</strong><div className="text-slate-500">{item.telefono}</div></td><td className="max-w-sm py-3 text-slate-700">{item.mensaje}</td><td className="py-3"><span className={`rounded px-2 py-1 text-xs font-semibold ${estadoClass(item.estado)}`}>{item.estado}</span></td><td className="py-3">{formatDate(item.scheduled_at)}</td><td className="py-3"><div className="flex gap-2"><button onClick={() => sendNow(item.id)} disabled={sendingId === item.id || item.estado === 'enviado' || item.estado === 'cancelado'} className="rounded bg-emerald-600 px-3 py-2 text-white disabled:opacity-50" title="Enviar ahora"><Send size={14} /></button><button onClick={() => window.open(whatsappUrl(item.telefono, item.mensaje), '_blank', 'noopener,noreferrer')} className="rounded border border-slate-300 px-3 py-2" title="Abrir en WhatsApp"><ExternalLink size={14} /></button><button onClick={() => cancel(item.id)} className="rounded bg-slate-700 px-3 py-2 text-white" title="Cancelar"><XCircle size={14} /></button></div></td></tr>)}</tbody></table>{!mensajes.length && <div className="py-8 text-center text-slate-500">No hay mensajes en cola.</div>}</div></Card>
        </div>
      )}
    </div>
  )
}
