import { useEffect, useMemo, useState } from 'react'
import { Building2, CheckCircle2, Database, LogIn, LogOut, RefreshCw, ShieldAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Card } from '../components/Card'

type Empresa = {
  id: string
  nombre: string
  slug: string
  razon_social?: string
  rut?: string
  email?: string
  telefono?: string
  direccion?: string
  website?: string
  logo_url?: string
  logo_path?: string
  descripcion_corta?: string
  firma_nombre?: string
  firma_cargo?: string
  firma_email?: string
  firma_telefono?: string
  firma_celular?: string
  condiciones_default?: string
  observaciones_default?: string
}

type UsuarioEmpresa = {
  rol: string
  empresas: Empresa | null
}

export function SupabaseSetup() {
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [empresas, setEmpresas] = useState<UsuarioEmpresa[]>([])
  const [activeEmpresaId, setActiveEmpresaId] = useState('')
  const [message, setMessage] = useState('')
  const [empresaForm, setEmpresaForm] = useState({
    nombre: '',
    slug: '',
    rut: '',
    email: '',
    telefono: '',
    direccion: '',
  })
  const [brandingForm, setBrandingForm] = useState({
    razon_social: '',
    rut: '',
    email: '',
    telefono: '',
    direccion: '',
    website: '',
    descripcion_corta: '',
    logo_url: '',
    firma_nombre: '',
    firma_cargo: '',
    firma_email: '',
    firma_telefono: '',
    firma_celular: '',
    condiciones_default: '',
    observaciones_default: '',
  })

  const activeEmpresa = useMemo(() => {
    return empresas.find((item) => item.empresas?.id === activeEmpresaId)?.empresas || null
  }, [activeEmpresaId, empresas])

  const hasEnv = useMemo(() => {
    return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
  }, [])

  async function load() {
    setLoading(true)
    setMessage('')

    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user

    setUserEmail(user?.email || '')
    setUserId(user?.id || '')

    if (!user) {
      setEmpresas([])
      setActiveEmpresaId('')
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('usuarios_empresas')
      .select('rol, empresas(id, nombre, slug, razon_social, rut, email, telefono, direccion, website, logo_url, logo_path, descripcion_corta, firma_nombre, firma_cargo, firma_email, firma_telefono, firma_celular, condiciones_default, observaciones_default)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    let loadedEmpresas: UsuarioEmpresa[] = []

    if (error) {
      setMessage(`No se pudo leer empresas. Probablemente falta ejecutar schema.sql: ${error.message}`)
      setEmpresas([])
    } else {
      loadedEmpresas = (data || []) as unknown as UsuarioEmpresa[]
      setEmpresas(loadedEmpresas)
    }

    const { data: activeData } = await supabase
      .from('usuario_empresa_activa')
      .select('empresa_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const activeId = activeData?.empresa_id || loadedEmpresas[0]?.empresas?.id || ''
    setActiveEmpresaId(activeId)
    const selectedEmpresa = loadedEmpresas.find((item) => item.empresas?.id === activeId)?.empresas
      || loadedEmpresas[0]?.empresas

    if (selectedEmpresa) {
      setBrandingForm({
        razon_social: selectedEmpresa.razon_social || selectedEmpresa.nombre || '',
        rut: selectedEmpresa.rut || '',
        email: selectedEmpresa.email || '',
        telefono: selectedEmpresa.telefono || '',
        direccion: selectedEmpresa.direccion || '',
        website: selectedEmpresa.website || '',
        descripcion_corta: selectedEmpresa.descripcion_corta || '',
        logo_url: selectedEmpresa.logo_url || '',
        firma_nombre: selectedEmpresa.firma_nombre || '',
        firma_cargo: selectedEmpresa.firma_cargo || '',
        firma_email: selectedEmpresa.firma_email || '',
        firma_telefono: selectedEmpresa.firma_telefono || '',
        firma_celular: selectedEmpresa.firma_celular || '',
        condiciones_default: selectedEmpresa.condiciones_default || '',
        observaciones_default: selectedEmpresa.observaciones_default || '',
      })
    }

    setLoading(false)
  }

  useEffect(() => {
    load()

    const { data } = supabase.auth.onAuthStateChange(() => {
      load()
    })

    return () => data.subscription.unsubscribe()
  }, [])

  async function sendMagicLink() {
    if (!email.trim()) {
      setMessage('Ingresa un correo para iniciar sesión.')
      return
    }

    setActionLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    })

    setActionLoading(false)
    setMessage(error ? error.message : 'Te envié un enlace de acceso al correo.')
  }

  async function signOut() {
    setActionLoading(true)
    await supabase.auth.signOut()
    setActionLoading(false)
    setMessage('Sesión cerrada.')
  }

  async function createEmpresaBase() {
    if (!userId) {
      setMessage('Primero inicia sesión.')
      return
    }

    setActionLoading(true)
    setMessage('')

    const { error } = await supabase.rpc('bootstrap_empresa_tecnica_hidraulica')

    if (error) {
      setActionLoading(false)
      setMessage(`No se pudo crear/asociar la empresa: ${error.message}`)
      return
    }

    setActionLoading(false)
    setMessage('Empresa inicial creada y asociada al usuario owner.')
    window.dispatchEvent(new CustomEvent('erp-company-updated'))
    await load()
  }

  function slugify(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  function updateEmpresaForm(key: keyof typeof empresaForm, value: string) {
    setEmpresaForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'nombre' && !current.slug ? { slug: slugify(value) } : {}),
    }))
  }

  async function createEmpresa() {
    if (!userId) {
      setMessage('Primero inicia sesión.')
      return
    }

    if (!empresaForm.nombre.trim()) {
      setMessage('Ingresa el nombre de la empresa.')
      return
    }

    setActionLoading(true)
    setMessage('')

    const { error } = await supabase.rpc('create_empresa_owner', {
      p_nombre: empresaForm.nombre.trim(),
      p_slug: empresaForm.slug.trim() || slugify(empresaForm.nombre),
      p_rut: empresaForm.rut.trim() || null,
      p_email: empresaForm.email.trim() || null,
      p_telefono: empresaForm.telefono.trim() || null,
      p_direccion: empresaForm.direccion.trim() || null,
      p_rubro: 'servicio_tecnico_hidraulico',
    })

    if (error) {
      setActionLoading(false)
      setMessage(`No se pudo crear la empresa: ${error.message}`)
      return
    }

    setEmpresaForm({
      nombre: '',
      slug: '',
      rut: '',
      email: '',
      telefono: '',
      direccion: '',
    })
    setActionLoading(false)
    setMessage('Empresa creada y marcada como activa.')
    window.dispatchEvent(new CustomEvent('erp-company-updated'))
    await load()
  }

  async function setEmpresaActiva(empresaId: string) {
    setActionLoading(true)
    setMessage('')

    const { error } = await supabase.rpc('set_empresa_activa', {
      p_empresa_id: empresaId,
    })

    setActionLoading(false)

    if (error) {
      setMessage(`No se pudo activar la empresa: ${error.message}`)
      return
    }

    setActiveEmpresaId(empresaId)
    setMessage('Empresa activa actualizada.')
    window.dispatchEvent(new CustomEvent('erp-company-updated'))
    await load()
  }

  function updateBrandingForm(key: keyof typeof brandingForm, value: string) {
    setBrandingForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  async function uploadLogo(file: File) {
    if (!activeEmpresaId) {
      setMessage('Selecciona una empresa activa antes de subir logo.')
      return
    }

    setActionLoading(true)
    setMessage('')

    const extension = file.name.split('.').pop()?.toLowerCase() || 'png'
    const path = `${activeEmpresaId}/logo.${extension}`
    const { error: uploadError } = await supabase.storage
      .from('empresa-assets')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      })

    if (uploadError) {
      setActionLoading(false)
      setMessage(`No se pudo subir el logo: ${uploadError.message}`)
      return
    }

    const { data } = supabase.storage.from('empresa-assets').getPublicUrl(path)

    setBrandingForm((current) => ({
      ...current,
      logo_url: data.publicUrl,
    }))

    const { error: updateError } = await supabase
      .from('empresas')
      .update({
        logo_url: data.publicUrl,
        logo_path: path,
      })
      .eq('id', activeEmpresaId)

    setActionLoading(false)

    if (updateError) {
      setMessage(`Logo subido, pero no se pudo guardar en empresa: ${updateError.message}`)
      return
    }

    setMessage('Logo actualizado.')
    window.dispatchEvent(new CustomEvent('erp-company-updated'))
    await load()
  }

  async function saveBranding() {
    if (!activeEmpresaId) {
      setMessage('Selecciona una empresa activa.')
      return
    }

    setActionLoading(true)
    setMessage('')

    const { error } = await supabase
      .from('empresas')
      .update({
        razon_social: brandingForm.razon_social.trim() || null,
        rut: brandingForm.rut.trim() || null,
        email: brandingForm.email.trim() || null,
        telefono: brandingForm.telefono.trim() || null,
        direccion: brandingForm.direccion.trim() || null,
        website: brandingForm.website.trim() || null,
        descripcion_corta: brandingForm.descripcion_corta.trim() || null,
        logo_url: brandingForm.logo_url.trim() || null,
        firma_nombre: brandingForm.firma_nombre.trim() || null,
        firma_cargo: brandingForm.firma_cargo.trim() || null,
        firma_email: brandingForm.firma_email.trim() || null,
        firma_telefono: brandingForm.firma_telefono.trim() || null,
        firma_celular: brandingForm.firma_celular.trim() || null,
        condiciones_default: brandingForm.condiciones_default.trim() || null,
        observaciones_default: brandingForm.observaciones_default.trim() || null,
      })
      .eq('id', activeEmpresaId)

    setActionLoading(false)

    if (error) {
      setMessage(`No se pudieron guardar los datos: ${error.message}`)
      return
    }

    setMessage('Datos comerciales guardados.')
    window.dispatchEvent(new CustomEvent('erp-company-updated'))
    await load()
  }

  return (
    <div className="mx-auto max-w-5xl pb-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-950">Supabase</h2>
          <p className="mt-2 text-slate-600">Conexión, sesión y empresas del ERP.</p>
        </div>

        <button
          onClick={load}
          disabled={loading || actionLoading}
          className="inline-flex items-center justify-center gap-2 rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50"
        >
          <RefreshCw size={18} />
          Actualizar
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="flex items-start gap-3">
            {hasEnv ? <CheckCircle2 className="text-emerald-600" /> : <ShieldAlert className="text-red-600" />}
            <div>
              <h3 className="font-bold text-slate-950">Variables</h3>
              <p className="mt-1 text-sm text-slate-600">
                {hasEnv ? 'URL y anon key detectadas.' : 'Faltan variables Vite de Supabase.'}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            {userId ? <CheckCircle2 className="text-emerald-600" /> : <LogIn className="text-amber-600" />}
            <div>
              <h3 className="font-bold text-slate-950">Sesión</h3>
              <p className="mt-1 break-all text-sm text-slate-600">{userEmail || 'Sin usuario conectado.'}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <Database className={empresas.length ? 'text-emerald-600' : 'text-amber-600'} />
            <div>
              <h3 className="font-bold text-slate-950">Empresa</h3>
              <p className="mt-1 text-sm text-slate-600">
              {activeEmpresaId ? 'Empresa activa seleccionada.' : empresas.length ? `${empresas.length} empresa(s) asociada(s).` : 'Sin empresa asociada.'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {message && (
        <div className="mt-4 rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">
          {message}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-lg font-bold text-slate-950">Iniciar Sesión</h3>

          {userId ? (
            <div>
              <p className="mb-4 text-sm text-slate-600">Sesión activa como {userEmail}.</p>
              <button
                onClick={signOut}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded bg-slate-800 px-4 py-3 text-white disabled:opacity-50"
              >
                <LogOut size={18} />
                Cerrar sesión
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-3"
                placeholder="correo@empresa.cl"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <button
                onClick={sendMagicLink}
                disabled={actionLoading}
                className="rounded bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
              >
                Enviar acceso
              </button>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="mb-4 text-lg font-bold text-slate-950">Empresas</h3>

          {empresas.length ? (
            <div className="space-y-3">
              {empresas.map((item) => (
                <div key={`${item.empresas?.id}-${item.rol}`} className="rounded border border-slate-200 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold text-slate-950">{item.empresas?.nombre || 'Empresa sin nombre'}</div>
                      <div className="text-sm text-slate-500">{item.empresas?.slug} · {item.rol}</div>
                    </div>

                    {item.empresas?.id === activeEmpresaId ? (
                      <span className="inline-flex items-center justify-center rounded bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                        Activa
                      </span>
                    ) : (
                      <button
                        onClick={() => item.empresas?.id && setEmpresaActiva(item.empresas.id)}
                        disabled={actionLoading}
                        className="rounded bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Usar esta
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <p className="mb-4 text-sm text-slate-600">
                Crea Técnica Hidráulica Ltda. y asocia el usuario actual como owner.
              </p>
              <button
                onClick={createEmpresaBase}
                disabled={!userId || actionLoading}
                className="rounded bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
              >
                Crear empresa base
              </button>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <div className="mb-4 flex items-center gap-2">
          <Building2 size={20} className="text-blue-700" />
          <h3 className="text-lg font-bold text-slate-950">Crear Otra Empresa</h3>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="rounded border border-slate-300 px-3 py-3"
            placeholder="Nombre empresa"
            value={empresaForm.nombre}
            onChange={(event) => updateEmpresaForm('nombre', event.target.value)}
          />
          <input
            className="rounded border border-slate-300 px-3 py-3"
            placeholder="slug-empresa"
            value={empresaForm.slug}
            onChange={(event) => updateEmpresaForm('slug', slugify(event.target.value))}
          />
          <input
            className="rounded border border-slate-300 px-3 py-3"
            placeholder="RUT"
            value={empresaForm.rut}
            onChange={(event) => updateEmpresaForm('rut', event.target.value)}
          />
          <input
            className="rounded border border-slate-300 px-3 py-3"
            placeholder="Email"
            value={empresaForm.email}
            onChange={(event) => updateEmpresaForm('email', event.target.value)}
          />
          <input
            className="rounded border border-slate-300 px-3 py-3"
            placeholder="Teléfono"
            value={empresaForm.telefono}
            onChange={(event) => updateEmpresaForm('telefono', event.target.value)}
          />
          <input
            className="rounded border border-slate-300 px-3 py-3"
            placeholder="Dirección"
            value={empresaForm.direccion}
            onChange={(event) => updateEmpresaForm('direccion', event.target.value)}
          />
        </div>

        <button
          onClick={createEmpresa}
          disabled={!userId || actionLoading}
          className="mt-4 rounded bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          Crear empresa
        </button>
      </Card>

      <Card className="mt-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-emerald-700" />
            <h3 className="text-lg font-bold text-slate-950">Datos Para Cotizaciones</h3>
          </div>
          <div className="text-sm text-slate-500">
            {activeEmpresa ? activeEmpresa.nombre : 'Sin empresa activa'}
          </div>
        </div>

        {brandingForm.logo_url && (
          <div className="mb-4 flex items-center gap-4 rounded border border-slate-200 p-3">
            <img src={brandingForm.logo_url} alt="Logo empresa" className="h-16 max-w-48 object-contain" />
            <div className="min-w-0 text-sm text-slate-600">
              <div className="font-semibold text-slate-950">Logo actual</div>
              <div className="truncate">{brandingForm.logo_url}</div>
            </div>
          </div>
        )}

        <div className="mb-4 rounded border border-dashed border-slate-300 bg-slate-50 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-950">Subir logo</div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label
              htmlFor="empresa-logo-upload"
              className={`inline-flex w-fit items-center justify-center rounded px-4 py-3 text-sm font-semibold ${
                activeEmpresaId && !actionLoading
                  ? 'cursor-pointer bg-blue-600 text-white'
                  : 'cursor-not-allowed bg-slate-300 text-slate-500'
              }`}
            >
              Seleccionar archivo
            </label>
            <input
              id="empresa-logo-upload"
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              disabled={!activeEmpresaId || actionLoading}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) uploadLogo(file)
              }}
            />
            <span className="text-sm text-slate-500">
              {activeEmpresaId ? 'PNG, JPG, WebP o SVG.' : 'Primero inicia sesión y selecciona una empresa activa.'}
            </span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input className="rounded border border-slate-300 px-3 py-3" placeholder="Razón social" value={brandingForm.razon_social} onChange={(event) => updateBrandingForm('razon_social', event.target.value)} />
          <input className="rounded border border-slate-300 px-3 py-3" placeholder="RUT empresa" value={brandingForm.rut} onChange={(event) => updateBrandingForm('rut', event.target.value)} />
          <input className="rounded border border-slate-300 px-3 py-3" placeholder="Email comercial" value={brandingForm.email} onChange={(event) => updateBrandingForm('email', event.target.value)} />
          <input className="rounded border border-slate-300 px-3 py-3" placeholder="Teléfono empresa" value={brandingForm.telefono} onChange={(event) => updateBrandingForm('telefono', event.target.value)} />
          <input className="rounded border border-slate-300 px-3 py-3 md:col-span-2" placeholder="Dirección" value={brandingForm.direccion} onChange={(event) => updateBrandingForm('direccion', event.target.value)} />
          <input className="rounded border border-slate-300 px-3 py-3" placeholder="Sitio web" value={brandingForm.website} onChange={(event) => updateBrandingForm('website', event.target.value)} />
          <input className="rounded border border-slate-300 px-3 py-3" placeholder="Descripción corta / giro" value={brandingForm.descripcion_corta} onChange={(event) => updateBrandingForm('descripcion_corta', event.target.value)} />
          <input className="rounded border border-slate-300 px-3 py-3" placeholder="Nombre firma" value={brandingForm.firma_nombre} onChange={(event) => updateBrandingForm('firma_nombre', event.target.value)} />
          <input className="rounded border border-slate-300 px-3 py-3" placeholder="Cargo firma" value={brandingForm.firma_cargo} onChange={(event) => updateBrandingForm('firma_cargo', event.target.value)} />
          <input className="rounded border border-slate-300 px-3 py-3" placeholder="Email firma" value={brandingForm.firma_email} onChange={(event) => updateBrandingForm('firma_email', event.target.value)} />
          <input className="rounded border border-slate-300 px-3 py-3" placeholder="Teléfono firma" value={brandingForm.firma_telefono} onChange={(event) => updateBrandingForm('firma_telefono', event.target.value)} />
          <input className="rounded border border-slate-300 px-3 py-3" placeholder="Celular firma" value={brandingForm.firma_celular} onChange={(event) => updateBrandingForm('firma_celular', event.target.value)} />
          <input className="rounded border border-slate-300 px-3 py-3" placeholder="URL logo externa" value={brandingForm.logo_url} onChange={(event) => updateBrandingForm('logo_url', event.target.value)} />
          <textarea className="min-h-28 rounded border border-slate-300 px-3 py-3 md:col-span-2" placeholder="Observaciones por defecto" value={brandingForm.observaciones_default} onChange={(event) => updateBrandingForm('observaciones_default', event.target.value)} />
          <textarea className="min-h-24 rounded border border-slate-300 px-3 py-3 md:col-span-2" placeholder="Condiciones por defecto" value={brandingForm.condiciones_default} onChange={(event) => updateBrandingForm('condiciones_default', event.target.value)} />
        </div>

        <button
          onClick={saveBranding}
          disabled={!activeEmpresaId || actionLoading}
          className="mt-4 rounded bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          Guardar datos para cotizaciones
        </button>
      </Card>
    </div>
  )
}
