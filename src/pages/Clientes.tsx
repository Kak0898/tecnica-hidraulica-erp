import { useEffect, useMemo, useState } from 'react'
import { Building2, RefreshCw, Search, UserPlus } from 'lucide-react'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
import { supabase } from '../lib/supabase'

type Contacto = {
  id: string
  nombre: string
  email?: string
  telefono?: string
  cargo?: string
}

type Cliente = {
  id: string
  razon_social: string
  nombre_fantasia?: string
  rut?: string
  giro?: string
  email?: string
  telefono?: string
  direccion?: string
  comuna?: string
  ciudad?: string
  estado?: string
  contactos?: Contacto[]
}

const emptyForm = {
  razon_social: '',
  rut: '',
  giro: '',
  email: '',
  telefono: '',
  direccion: '',
  comuna: '',
  ciudad: '',
  contacto_nombre: '',
  contacto_email: '',
  contacto_telefono: '',
}

function clean(value: string) {
  return value.trim() || null
}

export function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('clientes')
      .select('*, contactos(id, nombre, email, telefono, cargo)')
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      setClientes([])
    } else {
      setClientes((data || []) as Cliente[])
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return clientes

    return clientes.filter((cliente) => {
      return [
        cliente.razon_social,
        cliente.rut,
        cliente.email,
        cliente.telefono,
        cliente.direccion,
        cliente.contactos?.map((contacto) => contacto.nombre).join(' '),
      ].some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [clientes, search])

  async function save() {
    if (!form.razon_social.trim()) {
      setMessage('Ingresa la razón social del cliente.')
      return
    }

    setSaving(true)
    setMessage('')

    const { data: cliente, error } = await supabase
      .from('clientes')
      .insert({
        razon_social: form.razon_social.trim(),
        rut: clean(form.rut),
        giro: clean(form.giro),
        email: clean(form.email),
        telefono: clean(form.telefono),
        direccion: clean(form.direccion),
        comuna: clean(form.comuna),
        ciudad: clean(form.ciudad),
      })
      .select('id')
      .single()

    if (error) {
      setSaving(false)
      setMessage(error.message)
      return
    }

    if (cliente?.id && form.contacto_nombre.trim()) {
      const { error: contactError } = await supabase
        .from('contactos')
        .insert({
          cliente_id: cliente.id,
          nombre: form.contacto_nombre.trim(),
          email: clean(form.contacto_email),
          telefono: clean(form.contacto_telefono),
          principal: true,
        })

      if (contactError) {
        setMessage(`Cliente creado, pero falló el contacto: ${contactError.message}`)
      }
    }

    setForm(emptyForm)
    setSaving(false)
    setMessage('Cliente guardado.')
    await load()
  }

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-950">Clientes</h2>
          <p className="mt-2 text-slate-600">Base comercial compartida por cotizaciones, OT e historial de equipos.</p>
        </div>

        <button
          onClick={load}
          disabled={loading || saving}
          className="inline-flex items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50"
        >
          <RefreshCw size={18} />
          {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      <FeedbackToast message={message} onClose={() => setMessage('')} />

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <UserPlus size={20} className="text-blue-700" />
            <h3 className="text-lg font-bold text-slate-950">Nuevo Cliente</h3>
          </div>

          <div className="grid gap-3">
            <input className="rounded border border-slate-300 px-3 py-3" placeholder="Razón social" value={form.razon_social} onChange={(event) => setForm({ ...form, razon_social: event.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="RUT" value={form.rut} onChange={(event) => setForm({ ...form, rut: event.target.value })} />
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="Giro" value={form.giro} onChange={(event) => setForm({ ...form, giro: event.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="Teléfono" value={form.telefono} onChange={(event) => setForm({ ...form, telefono: event.target.value })} />
            </div>
            <input className="rounded border border-slate-300 px-3 py-3" placeholder="Dirección" value={form.direccion} onChange={(event) => setForm({ ...form, direccion: event.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="Comuna" value={form.comuna} onChange={(event) => setForm({ ...form, comuna: event.target.value })} />
              <input className="rounded border border-slate-300 px-3 py-3" placeholder="Ciudad / Región" value={form.ciudad} onChange={(event) => setForm({ ...form, ciudad: event.target.value })} />
            </div>

            <div className="mt-2 border-t border-slate-200 pt-3">
              <div className="mb-2 text-sm font-semibold text-slate-700">Contacto principal</div>
              <input className="mb-3 rounded border border-slate-300 px-3 py-3" placeholder="Nombre contacto" value={form.contacto_nombre} onChange={(event) => setForm({ ...form, contacto_nombre: event.target.value })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="rounded border border-slate-300 px-3 py-3" placeholder="Email contacto" value={form.contacto_email} onChange={(event) => setForm({ ...form, contacto_email: event.target.value })} />
                <input className="rounded border border-slate-300 px-3 py-3" placeholder="Teléfono contacto" value={form.contacto_telefono} onChange={(event) => setForm({ ...form, contacto_telefono: event.target.value })} />
              </div>
            </div>
          </div>

          <button onClick={save} disabled={saving} className="mt-4 w-full rounded bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar cliente'}
          </button>
        </Card>

        <Card>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-950">Clientes Registrados</h3>
              <p className="text-sm text-slate-500">{filtered.length} de {clientes.length}</p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
              <input className="w-full rounded border border-slate-300 py-3 pl-10 pr-3 md:w-80" placeholder="Buscar cliente" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-3">Cliente</th>
                  <th className="py-3">Contacto</th>
                  <th className="py-3">Teléfono</th>
                  <th className="py-3">Dirección</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((cliente) => {
                  const contacto = cliente.contactos?.[0]
                  return (
                    <tr key={cliente.id} className="border-b align-top">
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Building2 size={18} className="mt-0.5 shrink-0 text-slate-400" />
                          <div>
                            <div className="font-semibold text-slate-950">{cliente.razon_social}</div>
                            <div className="text-slate-500">{cliente.rut || 'Sin RUT'} · {cliente.giro || 'Sin giro'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="font-medium text-slate-800">{contacto?.nombre || '-'}</div>
                        <div className="text-slate-500">{contacto?.email || cliente.email || '-'}</div>
                      </td>
                      <td className="py-3">{contacto?.telefono || cliente.telefono || '-'}</td>
                      <td className="py-3">{[cliente.direccion, cliente.comuna, cliente.ciudad].filter(Boolean).join(', ') || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {!filtered.length && <div className="py-8 text-center text-slate-500">{loading ? 'Cargando clientes...' : 'No hay clientes para mostrar.'}</div>}
          </div>
        </Card>
      </div>
    </div>
  )
}
