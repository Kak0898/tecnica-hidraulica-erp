import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, MessageCircle, RefreshCw, Send, XCircle } from 'lucide-react'
import { Card } from '../components/Card'
import { supabase } from '../lib/supabase'

type Cliente = {
  id: string
  razon_social: string
}

type Contacto = {
  id: string
  nombre: string
  telefono?: string
  cliente_id?: string
}

type Mensaje = {
  id: string
  telefono: string
  plantilla?: string
  mensaje: string
  estado: 'pendiente' | 'enviado' | 'fallido' | 'cancelado'
  scheduled_at?: string
  sent_at?: string
  error?: string
  created_at?: string
  clientes?: Cliente | null
  contactos?: Contacto | null
}

const plantillas = {
  seguimiento_cotizacion: 'Hola, te escribimos para hacer seguimiento a la cotización enviada. Quedamos atentos a tus comentarios.',
  ot_recibida: 'Hola, confirmamos la recepción de tu equipo/servicio. Te avisaremos cuando el diagnóstico esté disponible.',
  ot_lista: 'Hola, tu trabajo ya está listo para retiro/entrega. Por favor coordina con nuestro equipo.',
  pago_pendiente: 'Hola, te contactamos por un pago pendiente asociado a tu servicio. Quedamos atentos.',
}

const emptyForm = {
  cliente_id: '',
  contacto_id: '',
  telefono: '',
  plantilla: 'seguimiento_cotizacion',
  mensaje: plantillas.seguimiento_cotizacion,
  scheduled_at: '',
}

function estadoClass(estado: string) {
  if (estado === 'enviado') return 'bg-emerald-50 text-emerald-700'
  if (estado === 'fallido' || estado === 'cancelado') return 'bg-red-50 text-red-700'
  return 'bg-amber-50 text-amber-700'
}

function normalizePhone(value: string) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('56')) return digits
  if (digits.length === 9) return `56${digits}`
  return digits
}

function whatsappUrl(telefono: string, mensaje: string) {
  const phone = normalizePhone(telefono)
  if (!phone) return ''
  return `https://wa.me/${phone}?text=${encodeURIComponent(mensaje)}`
}

export function WhatsApp() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [contactos, setContactos] = useState<Contacto[]>([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')

    const [mensajesResult, clientesResult, contactosResult] = await Promise.all([
      supabase
        .from('whatsapp_mensajes')
        .select('*, clientes(id, razon_social), contactos(id, nombre, telefono, cliente_id)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('clientes')
        .select('id, razon_social')
        .order('razon_social', { ascending: true }),
      supabase
        .from('contactos')
        .select('id, nombre, telefono, cliente_id')
        .order('created_at', { ascending: false }),
    ])

    if (mensajesResult.error) setMessage(mensajesResult.error.message)
    setMensajes((mensajesResult.data || []) as Mensaje[])
    setClientes((clientesResult.data || []) as Cliente[])
    setContactos((contactosResult.data || []) as Contacto[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const contactosFiltrados = useMemo(() => {
    if (!form.cliente_id) return contactos
    return contactos.filter((contacto) => contacto.cliente_id === form.cliente_id)
  }, [contactos, form.cliente_id])

  function updatePlantilla(value: string) {
    setForm((current) => ({
      ...current,
      plantilla: value,
      mensaje: plantillas[value as keyof typeof plantillas] || current.mensaje,
    }))
  }

  function updateContacto(contactoId: string) {
    const contacto = contactos.find((item) => item.id === contactoId)
    setForm((current) => ({
      ...current,
      contacto_id: contactoId,
      telefono: contacto?.telefono || current.telefono,
    }))
  }

  async function save() {
    if (!form.telefono.trim() || !form.mensaje.trim()) {
      setMessage('Ingresa teléfono y mensaje.')
      return
    }

    setSaving(true)
    setMessage('')

    const { error } = await supabase.from('whatsapp_mensajes').insert({
      cliente_id: form.cliente_id || null,
      contacto_id: form.contacto_id || null,
      telefono: form.telefono.trim(),
      plantilla: form.plantilla,
      mensaje: form.mensaje.trim(),
      scheduled_at: form.scheduled_at || null,
      estado: 'pendiente',
    })

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setForm(emptyForm)
    setMessage('Mensaje agregado a la cola.')
    await load()
  }

  async function updateEstado(id: string, estado: Mensaje['estado']) {
    const { error } = await supabase
      .from('whatsapp_mensajes')
      .update({
        estado,
        sent_at: estado === 'enviado' ? new Date().toISOString() : null,
      })
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMensajes((current) => current.map((item) => item.id === id ? { ...item, estado } : item))
  }

  async function openWhatsApp(item: Mensaje) {
    const url = whatsappUrl(item.telefono, item.mensaje)
    if (!url) {
      setMessage('El teléfono no es válido para abrir WhatsApp.')
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
    await updateEstado(item.id, 'enviado')
  }

  function openDraft() {
    const url = whatsappUrl(form.telefono, form.mensaje)
    if (!url) {
      setMessage('Ingresa un teléfono válido para abrir WhatsApp.')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-950">WhatsApp</h2>
          <p className="mt-2 text-slate-600">Cola de mensajes por empresa para seguimiento comercial y taller.</p>
        </div>

        <button onClick={load} disabled={loading || saving} className="inline-flex items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50">
          <RefreshCw size={18} />
          Actualizar
        </button>
      </div>

      {message && <div className="mb-4 rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <MessageCircle className="text-emerald-700" />
            <h3 className="text-lg font-bold text-slate-950">Nuevo Mensaje</h3>
          </div>

          <div className="grid gap-3">
            <select className="rounded border border-slate-300 px-3 py-3" value={form.cliente_id} onChange={(event) => setForm({ ...form, cliente_id: event.target.value, contacto_id: '' })}>
              <option value="">Cliente</option>
              {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.razon_social}</option>)}
            </select>
            <select className="rounded border border-slate-300 px-3 py-3" value={form.contacto_id} onChange={(event) => updateContacto(event.target.value)}>
              <option value="">Contacto</option>
              {contactosFiltrados.map((contacto) => <option key={contacto.id} value={contacto.id}>{contacto.nombre} · {contacto.telefono || 'sin teléfono'}</option>)}
            </select>
            <input className="rounded border border-slate-300 px-3 py-3" placeholder="Teléfono WhatsApp" value={form.telefono} onChange={(event) => setForm({ ...form, telefono: event.target.value })} />
            <select className="rounded border border-slate-300 px-3 py-3" value={form.plantilla} onChange={(event) => updatePlantilla(event.target.value)}>
              <option value="seguimiento_cotizacion">Seguimiento cotización</option>
              <option value="ot_recibida">OT recibida</option>
              <option value="ot_lista">OT lista</option>
              <option value="pago_pendiente">Pago pendiente</option>
            </select>
            <textarea className="min-h-36 rounded border border-slate-300 px-3 py-3" placeholder="Mensaje" value={form.mensaje} onChange={(event) => setForm({ ...form, mensaje: event.target.value })} />
            <input className="rounded border border-slate-300 px-3 py-3" type="datetime-local" value={form.scheduled_at} onChange={(event) => setForm({ ...form, scheduled_at: event.target.value })} />
          </div>

          <button onClick={save} disabled={saving} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
            <Send size={18} />
            {saving ? 'Guardando...' : 'Agregar a cola'}
          </button>
          <button onClick={openDraft} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded bg-slate-900 px-4 py-3 font-semibold text-white">
            <ExternalLink size={18} />
            Abrir WhatsApp Business
          </button>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-950">Mensajes</h3>
            <span className="text-sm text-slate-500">{mensajes.length} registros</span>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-3">Destino</th>
                  <th className="py-3">Mensaje</th>
                  <th className="py-3">Estado</th>
                  <th className="py-3">Programado</th>
                  <th className="py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {mensajes.map((item) => (
                  <tr key={item.id} className="border-b align-top">
                    <td className="py-3">
                      <div className="font-semibold text-slate-950">{item.contactos?.nombre || item.clientes?.razon_social || '-'}</div>
                      <div className="text-slate-500">{item.telefono}</div>
                    </td>
                    <td className="py-3">
                      <div className="max-w-md text-slate-700">{item.mensaje}</div>
                      <div className="text-xs text-slate-400">{item.plantilla || '-'}</div>
                    </td>
                    <td className="py-3"><span className={`rounded px-2 py-1 text-xs font-semibold ${estadoClass(item.estado)}`}>{item.estado}</span></td>
                    <td className="py-3">{item.scheduled_at || '-'}</td>
	                    <td className="py-3">
	                      <div className="flex gap-2">
	                        <button onClick={() => openWhatsApp(item)} className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">
                            <ExternalLink size={14} />
                            Abrir
                          </button>
	                        <button onClick={() => updateEstado(item.id, 'cancelado')} className="rounded bg-slate-700 px-3 py-2 text-xs font-semibold text-white"><XCircle size={14} /></button>
	                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!mensajes.length && <div className="py-8 text-center text-slate-500">{loading ? 'Cargando mensajes...' : 'No hay mensajes en cola.'}</div>}
          </div>
        </Card>
      </div>
    </div>
  )
}
