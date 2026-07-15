import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useEmpresa } from './empresa'
import { supabase } from './supabase'

export const MODULE_GROUPS = [
  {
    label: 'Visión general',
    modules: [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'google_ads', label: 'Google Ads' },
    ],
  },
  {
    label: 'Comercial',
    modules: [
      { key: 'clientes', label: 'Clientes' },
      { key: 'empresas_asociadas', label: 'Empresas asociadas' },
      { key: 'presupuestos', label: 'Presupuestos' },
      { key: 'cotizaciones', label: 'Cotizaciones' },
      { key: 'publicaciones', label: 'Publicaciones' },
      { key: 'ordenes', label: 'Órdenes de trabajo' },
      { key: 'crm', label: 'CRM' },
      { key: 'whatsapp', label: 'WhatsApp' },
    ],
  },
  {
    label: 'Recursos humanos',
    modules: [
      { key: 'rrhh_personas', label: 'Equipo y fichas' },
      { key: 'rrhh_contratos', label: 'Contratos y anexos' },
      { key: 'rrhh_ausencias', label: 'Ausencias y licencias' },
      { key: 'rrhh_documentos', label: 'Documentos y alertas' },
      { key: 'personas_pagos', label: 'Remuneraciones y pagos' },
    ],
  },
  {
    label: 'Administración y operación',
    modules: [
      { key: 'flota', label: 'Flota de vehículos' },
      { key: 'maquinaria', label: 'Maquinaria' },
      { key: 'repuestos', label: 'Repuestos' },
      { key: 'epp_ropa', label: 'EPP y ropa' },
      { key: 'auditorias', label: 'Auditorías' },
      { key: 'importar_excel', label: 'Importar Excel' },
    ],
  },
  {
    label: 'Sistema',
    modules: [
      { key: 'ia', label: 'IA Técnica' },
    ],
  },
] as const

export const ALL_MODULES = [
  ...MODULE_GROUPS.flatMap((group) => group.modules.map((module) => module.key)),
  'configuracion',
  'usuarios_permisos',
] as const

export type ModuleKey = (typeof ALL_MODULES)[number]

export const PAGE_MODULE: Record<string, ModuleKey> = {
  dashboard: 'dashboard',
  'google-ads': 'google_ads',
  clientes: 'clientes',
  'empresas-asociadas': 'empresas_asociadas',
  presupuestos: 'presupuestos',
  cotizaciones: 'cotizaciones',
  'publicaciones-productos': 'publicaciones',
  ordenes: 'ordenes',
  crm: 'crm',
  whatsapp: 'whatsapp',
  'rrhh-personas': 'rrhh_personas',
  'rrhh-contratos': 'rrhh_contratos',
  'rrhh-ausencias': 'rrhh_ausencias',
  'rrhh-documentos': 'rrhh_documentos',
  'personas-pagos': 'personas_pagos',
  'flota-vehiculos': 'flota',
  maquinaria: 'maquinaria',
  repuestos: 'repuestos',
  'epp-ropa': 'epp_ropa',
  auditorias: 'auditorias',
  importar: 'importar_excel',
  ia: 'ia',
  supabase: 'configuracion',
  'usuarios-permisos': 'usuarios_permisos',
}

const PAGE_ORDER = [
  'dashboard', 'google-ads', 'clientes', 'empresas-asociadas', 'presupuestos',
  'cotizaciones', 'publicaciones-productos', 'ordenes', 'crm', 'whatsapp',
  'rrhh-personas', 'rrhh-contratos', 'rrhh-ausencias', 'rrhh-documentos',
  'personas-pagos', 'flota-vehiculos', 'maquinaria', 'repuestos', 'epp-ropa',
  'auditorias', 'importar', 'ia', 'supabase', 'usuarios-permisos',
]

type PermissionsContextValue = {
  loading: boolean
  isAdmin: boolean
  role: string
  modules: ModuleKey[]
  schemaReady: boolean
  error: string
  hasPermission: (module: ModuleKey) => boolean
  hasPagePermission: (page: string) => boolean
  firstAllowedPage: string
  refreshPermissions: () => Promise<void>
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null)

function isMissingPermissionsSchema(error: { code?: string; message?: string } | null) {
  return Boolean(error && (
    error.code === 'PGRST202' ||
    /mis_permisos_empresa|schema cache|function.*does not exist/i.test(error.message || '')
  ))
}

export function PermisosProvider({ children }: { children: ReactNode }) {
  const { activeEmpresaId, userEmail } = useEmpresa()
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [role, setRole] = useState('')
  const [modules, setModules] = useState<ModuleKey[]>([])
  const [schemaReady, setSchemaReady] = useState(true)
  const [error, setError] = useState('')

  const refreshPermissions = useCallback(async () => {
    if (!activeEmpresaId) {
      setLoading(false)
      setIsAdmin(false)
      setRole('')
      setModules([])
      setError('')
      return
    }

    setLoading(true)
    const { data, error: rpcError } = await supabase.rpc('mis_permisos_empresa', {
      p_empresa_id: activeEmpresaId,
    })

    if (rpcError) {
      const missingSchema = isMissingPermissionsSchema(rpcError)
      const legacyAdmin = userEmail.toLowerCase() === 'usuario.general@tecnicahidraulica.cl'
      setSchemaReady(!missingSchema)
      setIsAdmin(legacyAdmin)
      setRole(legacyAdmin ? 'admin' : (missingSchema ? 'operador' : ''))
      setModules(missingSchema || legacyAdmin ? [...ALL_MODULES] : [])
      setError(missingSchema
        ? 'Falta ejecutar el SQL 15_usuarios_permisos_modulos.sql para activar el control real de accesos.'
        : rpcError.message)
      setLoading(false)
      return
    }

    const payload = (data || {}) as { rol?: string; is_admin?: boolean; modulos?: string[] }
    const validModules = (payload.modulos || []).filter((module): module is ModuleKey =>
      (ALL_MODULES as readonly string[]).includes(module),
    )
    setSchemaReady(true)
    setIsAdmin(Boolean(payload.is_admin))
    setRole(payload.rol || '')
    setModules(validModules)
    setError('')
    setLoading(false)
  }, [activeEmpresaId, userEmail])

  useEffect(() => {
    void refreshPermissions()
  }, [refreshPermissions])

  const moduleSet = useMemo(() => new Set(modules), [modules])
  const hasPermission = useCallback((module: ModuleKey) => {
    if (module === 'configuracion' || module === 'usuarios_permisos') return isAdmin
    return isAdmin || moduleSet.has(module)
  }, [isAdmin, moduleSet])
  const hasPagePermission = useCallback((page: string) => {
    const module = PAGE_MODULE[page]
    return module ? hasPermission(module) : false
  }, [hasPermission])
  const firstAllowedPage = useMemo(
    () => PAGE_ORDER.find((page) => hasPagePermission(page)) || '',
    [hasPagePermission],
  )

  return (
    <PermissionsContext.Provider value={{
      loading,
      isAdmin,
      role,
      modules,
      schemaReady,
      error,
      hasPermission,
      hasPagePermission,
      firstAllowedPage,
      refreshPermissions,
    }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermisos() {
  const context = useContext(PermissionsContext)
  if (!context) throw new Error('usePermisos debe usarse dentro de PermisosProvider')
  return context
}
