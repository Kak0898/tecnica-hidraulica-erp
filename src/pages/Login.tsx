import { FormEvent, useState } from 'react'
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!email.trim() || (!recoveryMode && !password)) {
      setMessage('Completa tu correo y contraseña.')
      return
    }

    setLoading(true)
    setMessage('')

    if (recoveryMode) {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      })
      setMessage(error ? error.message : 'Te enviamos un enlace seguro para cambiar tu contraseña.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    setMessage(error ? 'Usuario o contraseña incorrectos.' : '')
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-[#07111f] text-white lg:grid lg:grid-cols-[1.15fr_0.85fr]">
      <section className="relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute right-10 top-10 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative flex items-center gap-4">
          <img src="/modulos/cotizaciones/assets/th-logo.jpeg" alt="Técnica Hidráulica" className="h-14 w-14 rounded-2xl object-cover ring-1 ring-white/20" />
          <div>
            <p className="text-lg font-bold">Técnica Hidráulica</p>
            <p className="text-sm text-slate-400">Plataforma de gestión empresarial</p>
          </div>
        </div>

        <div className="relative max-w-2xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">TH Control</p>
          <h1 className="text-5xl font-black leading-[1.08] tracking-tight">Toda la operación de TH, en un solo lugar.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
            Cotizaciones, órdenes de trabajo, campañas, trabajadores y remuneraciones con información protegida por empresa.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-4 text-sm">
            {['Operación comercial', 'Google Ads', 'Personas y pagos'].map((label) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-slate-200 backdrop-blur">
                <ShieldCheck className="mb-3 text-cyan-300" size={20} />
                {label}
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-500">Acceso interno · Datos protegidos · Sesión segura</p>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10 text-slate-950">
        <div className="w-full max-w-md">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <img src="/modulos/cotizaciones/assets/th-logo.jpeg" alt="Técnica Hidráulica" className="h-12 w-12 rounded-xl object-cover" />
            <div>
              <p className="font-bold">TH Control</p>
              <p className="text-sm text-slate-500">Técnica Hidráulica</p>
            </div>
          </div>

          <div className="mb-8">
            <p className="text-sm font-semibold text-blue-700">Acceso al sistema</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">{recoveryMode ? 'Recuperar contraseña' : 'Bienvenido nuevamente'}</h2>
            <p className="mt-3 text-slate-500">
              {recoveryMode ? 'Recibirás un enlace de recuperación en tu correo.' : 'Ingresa con el usuario autorizado por TH.'}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Correo electrónico</span>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nombre@tecnicahidraulica.cl"
                  className="h-13 w-full rounded-xl border border-slate-300 bg-white py-3 pl-12 pr-4 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </label>

            {!recoveryMode && (
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Contraseña</span>
                <div className="relative">
                  <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    className="h-13 w-full rounded-xl border border-slate-300 bg-white py-3 pl-12 pr-12 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                  />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </label>
            )}

            {message && <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">{message}</div>}

            <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3.5 font-bold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 disabled:opacity-60">
              {loading && <LoaderCircle className="animate-spin" size={18} />}
              {recoveryMode ? 'Enviar enlace' : 'Iniciar sesión'}
            </button>
          </form>

          <button onClick={() => { setRecoveryMode((value) => !value); setMessage('') }} className="mt-6 w-full text-center text-sm font-semibold text-blue-700 hover:text-blue-900">
            {recoveryMode ? 'Volver al inicio de sesión' : '¿Olvidaste tu contraseña?'}
          </button>

          <p className="mt-10 border-t border-slate-200 pt-6 text-center text-xs leading-5 text-slate-500">
            Las cuentas son creadas por la administración de TH. No compartas tu contraseña.
          </p>
        </div>
      </section>
    </main>
  )
}
