import { FormEvent, useState } from 'react'
import { Eye, EyeOff, KeyRound, LoaderCircle, LogOut, ShieldCheck } from 'lucide-react'
import { FeedbackToast } from '../components/FeedbackToast'
import { supabase } from '../lib/supabase'

export function CambioClaveInicial({ onComplete }: { onComplete: () => Promise<void> }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password.length < 8) return setMessage('La nueva contraseña debe tener al menos 8 caracteres.')
    if (password !== confirmation) return setMessage('Las contraseñas no coinciden.')

    setSaving(true)
    setMessage('')
    const { data } = await supabase.auth.getSession()
    const metadata = data.session?.user.user_metadata || {}
    const { error } = await supabase.auth.updateUser({
      password,
      data: {
        ...metadata,
        erp_requiere_cambio_clave: false,
      },
    })

    if (error) {
      setSaving(false)
      setMessage(`No se pudo actualizar la contraseña: ${error.message}`)
      return
    }

    await onComplete()
    setSaving(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07111f] px-5 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl sm:p-9">
        <div className="mb-7 flex items-start gap-4">
          <div className="rounded-2xl bg-blue-100 p-3 text-blue-700"><ShieldCheck size={25} /></div>
          <div><p className="text-sm font-bold text-blue-700">Primer ingreso</p><h1 className="mt-1 text-2xl font-black text-slate-950">Crea tu contraseña personal</h1></div>
        </div>

        <p className="mb-6 leading-6 text-slate-600">La administración te entregó una contraseña temporal. Debes reemplazarla antes de entrar a TH Control.</p>

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-bold text-slate-700">Nueva contraseña<div className="relative mt-2"><KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="w-full rounded-xl border border-slate-300 py-3 pl-11 pr-12 font-normal text-slate-950" placeholder="Mínimo 8 caracteres" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          <label className="block text-sm font-bold text-slate-700">Confirmar contraseña<input type={showPassword ? 'text' : 'password'} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal text-slate-950" placeholder="Repite la contraseña" /></label>
          <FeedbackToast message={message} onClose={() => setMessage('')} />
          <button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3.5 font-bold text-white disabled:opacity-60">{saving && <LoaderCircle className="animate-spin" size={18} />}{saving ? 'Guardando...' : 'Guardar y entrar'}</button>
        </form>

        <button onClick={() => supabase.auth.signOut()} className="mt-5 flex w-full items-center justify-center gap-2 text-sm font-bold text-slate-500"><LogOut size={16} />Cerrar sesión</button>
      </div>
    </main>
  )
}
