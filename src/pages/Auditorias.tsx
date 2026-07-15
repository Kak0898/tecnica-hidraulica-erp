import { useEffect, useState } from 'react'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
import { supabase } from '../lib/supabase'
import type { Audit } from '../types'

const emptyForm: Audit = {
  title: '',
  audit_type: 'inventario',
  status: 'pendiente',
  responsible: '',
}

export function Auditorias() {
  const [items, setItems] = useState<Audit[]>([])
  const [form, setForm] = useState<Audit>({ ...emptyForm })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('audits')
      .select('*')
      .order('created_at', { ascending: false })
    setLoading(false)

    if (error) {
      setMessage(error.message)
      setItems([])
      return
    }
    setItems(data || [])
  }

  useEffect(() => {
    void load()
  }, [])

  async function save() {
    if (!form.title.trim()) {
      setMessage('Ingresa el título de la auditoría.')
      return
    }

    setSaving(true)
    setMessage('')
    const { error } = await supabase.from('audits').insert({
      title: form.title.trim(),
      audit_type: form.audit_type,
      status: form.status,
      responsible: form.responsible?.trim() || null,
    })
    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setForm({ ...emptyForm })
    setMessage('Auditoría creada correctamente.')
    await load()
  }

  return (
    <div>
      <h2 className="mb-6 text-3xl font-bold">Auditorías</h2>
      <FeedbackToast message={message} onClose={() => setMessage('')} />
      <Card>
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <input className="rounded border p-3" placeholder="Título auditoría" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <select className="rounded border p-3" value={form.audit_type} onChange={(event) => setForm({ ...form, audit_type: event.target.value as Audit['audit_type'] })}>
            <option value="inventario">Inventario</option>
            <option value="mantencion">Mantención</option>
            <option value="seguridad">Seguridad</option>
            <option value="general">General</option>
          </select>
          <input className="rounded border p-3" placeholder="Responsable" value={form.responsible || ''} onChange={(event) => setForm({ ...form, responsible: event.target.value })} />
          <button onClick={save} disabled={saving} className="rounded bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
            {saving ? 'Creando...' : 'Crear'}
          </button>
        </div>
        {loading ? <p className="py-6 text-center text-sm text-slate-500">Cargando auditorías...</p> : items.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Aún no hay auditorías registradas.</p> : items.map((audit) => (
          <div className="border-b py-3" key={audit.id}>
            <b>{audit.title}</b>
            <p className="text-sm text-slate-500">{audit.audit_type} · {audit.status} · {audit.responsible || 'Sin responsable'}</p>
          </div>
        ))}
      </Card>
    </div>
  )
}
