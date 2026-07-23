import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'

type Empresa = {
  id: string
  nombre: string
  slug: string
  razon_social?: string
  rut?: string
  logo_url?: string
}

type UsuarioEmpresa = {
  rol: string
  empresas: Empresa | null
}

type EmpresaContextValue = {
  loading: boolean
  userEmail: string
  userName: string
  requiresPasswordChange: boolean
  empresas: UsuarioEmpresa[]
  activeEmpresa: Empresa | null
  activeEmpresaId: string
  refreshEmpresa: () => Promise<void>
  setEmpresaActiva: (empresaId: string) => Promise<{ error?: string }>
}

const EmpresaContext = createContext<EmpresaContextValue | null>(null)

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [userName, setUserName] = useState('')
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false)
  const [empresas, setEmpresas] = useState<UsuarioEmpresa[]>([])
  const [activeEmpresaId, setActiveEmpresaId] = useState('')
  const currentUserIdRef = useRef('')

  async function loadEmpresaForUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null) {
    setLoading(true)
    currentUserIdRef.current = user?.id || ''
    setUserEmail(user?.email || '')
    setUserName(String(user?.user_metadata?.erp_nombre || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || ''))
    setRequiresPasswordChange(user?.user_metadata?.erp_requiere_cambio_clave === true)

    if (!user) {
      setEmpresas([])
      setActiveEmpresaId('')
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('usuarios_empresas')
      .select('rol, empresas(id, nombre, slug, razon_social, rut, logo_url)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    const loaded = (data || []) as unknown as UsuarioEmpresa[]
    setEmpresas(loaded)

    const { data: activeData } = await supabase
      .from('usuario_empresa_activa')
      .select('empresa_id')
      .eq('user_id', user.id)
      .maybeSingle()

    setActiveEmpresaId(activeData?.empresa_id || loaded[0]?.empresas?.id || '')
    setLoading(false)
  }

  async function refreshEmpresa() {
    const { data: sessionData } = await supabase.auth.getSession()
    await loadEmpresaForUser(sessionData.session?.user || null)
  }

  async function setEmpresaActiva(empresaId: string) {
    const { error } = await supabase.rpc('set_empresa_activa', {
      p_empresa_id: empresaId,
    })

    if (error) return { error: error.message }

    setActiveEmpresaId(empresaId)
    window.dispatchEvent(new CustomEvent('erp-company-updated'))
    await refreshEmpresa()
    return {}
  }

  useEffect(() => {
    refreshEmpresa()

    const { data } = supabase.auth.onAuthStateChange((event: string, session: { user: { id: string; email?: string; user_metadata?: Record<string, unknown> } } | null) => {
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return
      if (event === 'SIGNED_IN' && session?.user.id === currentUserIdRef.current) return
      window.setTimeout(() => {
        void loadEmpresaForUser(session?.user || null)
      }, 0)
    })

    const onCompanyUpdated = () => {
      refreshEmpresa()
    }

    window.addEventListener('erp-company-updated', onCompanyUpdated)

    return () => {
      data.subscription.unsubscribe()
      window.removeEventListener('erp-company-updated', onCompanyUpdated)
    }
  }, [])

  const activeEmpresa = useMemo(() => {
    return empresas.find((item) => item.empresas?.id === activeEmpresaId)?.empresas || null
  }, [activeEmpresaId, empresas])

  return (
    <EmpresaContext.Provider
      value={{
        loading,
        userEmail,
        userName,
        requiresPasswordChange,
        empresas,
        activeEmpresa,
        activeEmpresaId,
        refreshEmpresa,
        setEmpresaActiva,
      }}
    >
      {children}
    </EmpresaContext.Provider>
  )
}

export function useEmpresa() {
  const context = useContext(EmpresaContext)
  if (!context) throw new Error('useEmpresa debe usarse dentro de EmpresaProvider')
  return context
}
