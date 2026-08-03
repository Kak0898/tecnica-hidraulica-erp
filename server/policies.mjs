export const ALL_MODULES = [
  'dashboard', 'google_ads', 'clientes', 'empresas_asociadas',
  'presupuestos', 'cotizaciones', 'comprobantes_comisiones', 'publicaciones', 'ordenes',
  'crm', 'whatsapp', 'rrhh_personas', 'rrhh_contratos',
  'rrhh_ausencias', 'rrhh_documentos', 'personas_pagos',
  'flota', 'maquinaria', 'repuestos', 'epp_ropa', 'auditorias',
  'importar_excel', 'ia', 'configuracion', 'usuarios_permisos',
]

const access = (read, write = read) => ({ read, write, companyScoped: true })

export const TABLE_ACCESS = {
  empresas: { read: [], write: ['configuracion'], companyScoped: false, special: 'companies' },
  usuarios_empresas: { read: [], write: [], companyScoped: false, special: 'memberships' },
  usuario_empresa_activa: { read: [], write: [], companyScoped: false, special: 'active_company' },
  perfiles_usuarios: { read: [], write: [], companyScoped: false, special: 'profile' },
  usuario_permisos: { read: ['usuarios_permisos'], write: ['usuarios_permisos'], companyScoped: true },
  sistema_modulos: { read: [], write: [], companyScoped: false, special: 'catalog' },

  clientes: access(['clientes', 'presupuestos', 'cotizaciones', 'ordenes', 'crm', 'whatsapp'], ['clientes']),
  contactos: access(['clientes', 'presupuestos', 'cotizaciones', 'ordenes', 'crm', 'whatsapp'], ['clientes']),
  machines: access(['dashboard', 'maquinaria', 'ordenes', 'auditorias', 'ia'], ['maquinaria', 'importar_excel']),
  spare_parts: access(['dashboard', 'repuestos'], ['repuestos', 'importar_excel']),
  erp_counters: access(['presupuestos', 'cotizaciones'], ['presupuestos', 'cotizaciones']),
  cotizaciones: access(['cotizaciones'], ['cotizaciones']),
  cotizacion_items: access(['cotizaciones'], ['cotizaciones']),
  cotizacion_documentos: access(['presupuestos', 'cotizaciones', 'comprobantes_comisiones', 'ordenes'], ['presupuestos', 'cotizaciones', 'comprobantes_comisiones']),
  ordenes_trabajo: access(['ordenes', 'ia'], ['ordenes']),
  audits: access(['auditorias'], ['auditorias']),
  equipo_eventos: access(['maquinaria', 'ordenes', 'auditorias'], ['maquinaria', 'ordenes', 'auditorias']),
  archivos: access(['maquinaria', 'ordenes', 'auditorias', 'personas_pagos'], ['maquinaria', 'ordenes', 'auditorias', 'personas_pagos']),
  import_logs: access(['importar_excel'], ['importar_excel']),

  personas: access(
    ['rrhh_personas', 'rrhh_contratos', 'rrhh_ausencias', 'rrhh_documentos', 'personas_pagos', 'flota', 'epp_ropa', 'usuarios_permisos', 'presupuestos', 'cotizaciones', 'comprobantes_comisiones'],
    ['rrhh_personas', 'personas_pagos'],
  ),
  pagos_personas: access(['personas_pagos'], ['personas_pagos']),
  documentos_personas: access(['personas_pagos'], ['personas_pagos']),
  horas_extra: access(['personas_pagos'], ['personas_pagos']),
  rrhh_centros_costo: access(['rrhh_personas', 'rrhh_contratos'], ['rrhh_personas']),
  rrhh_cargos: access(['rrhh_personas', 'rrhh_contratos'], ['rrhh_personas']),
  rrhh_contratos: access(['rrhh_contratos'], ['rrhh_contratos']),
  rrhh_anexos: access(['rrhh_contratos'], ['rrhh_contratos']),
  rrhh_ausencias: access(['rrhh_ausencias', 'rrhh_personas'], ['rrhh_ausencias']),
  rrhh_saldos_vacaciones: access(['rrhh_ausencias'], ['rrhh_ausencias']),
  rrhh_tipos_documento: access(['rrhh_documentos'], ['rrhh_documentos']),
  rrhh_documentos_empleado: access(['rrhh_documentos', 'rrhh_contratos', 'personas_pagos'], ['rrhh_documentos']),
  rrhh_alertas: access(['rrhh_personas', 'rrhh_documentos'], ['rrhh_documentos']),
  rrhh_eventos: access(['rrhh_personas', 'rrhh_contratos', 'rrhh_ausencias', 'rrhh_documentos'], []),

  google_ads_campanas: access(['google_ads'], ['google_ads']),
  google_ads_metricas_diarias: access(['google_ads'], ['google_ads']),
  google_ads_recomendaciones: access(['google_ads'], ['google_ads']),
  crm_oportunidades: access(['crm'], ['crm']),
  whatsapp_mensajes: access(['whatsapp'], ['whatsapp']),
  ia_consultas: access(['ia'], ['ia']),
  empresas_asociadas: access(['empresas_asociadas', 'flota'], ['empresas_asociadas']),
  vehiculos_empresa: access(['flota'], ['flota']),
  epp_items: access(['epp_ropa'], ['epp_ropa', 'importar_excel']),
  epp_worker_sizes: access(['epp_ropa'], ['epp_ropa', 'importar_excel']),
  productos_comerciales: access(['publicaciones'], ['publicaciones']),
  publicaciones_productos: access(['publicaciones'], ['publicaciones']),
}

export const RELATIONS = {
  usuarios_empresas: {
    empresas: { target: 'empresas', sourceKey: 'empresa_id', targetKey: 'id', many: false },
  },
  clientes: {
    contactos: { target: 'contactos', sourceKey: 'id', targetKey: 'cliente_id', many: true },
  },
  whatsapp_mensajes: {
    clientes: { target: 'clientes', sourceKey: 'cliente_id', targetKey: 'id', many: false },
    contactos: { target: 'contactos', sourceKey: 'contacto_id', targetKey: 'id', many: false },
  },
  ordenes_trabajo: {
    clientes: { target: 'clientes', sourceKey: 'cliente_id', targetKey: 'id', many: false },
    machines: { target: 'machines', sourceKey: 'equipo_id', targetKey: 'id', many: false },
  },
  crm_oportunidades: {
    clientes: { target: 'clientes', sourceKey: 'cliente_id', targetKey: 'id', many: false },
  },
  ia_consultas: {
    machines: { target: 'machines', sourceKey: 'equipo_id', targetKey: 'id', many: false },
    ordenes_trabajo: { target: 'ordenes_trabajo', sourceKey: 'orden_trabajo_id', targetKey: 'id', many: false },
  },
  pagos_personas: {
    personas: { target: 'personas', sourceKey: 'persona_id', targetKey: 'id', many: false },
  },
  documentos_personas: {
    personas: { target: 'personas', sourceKey: 'persona_id', targetKey: 'id', many: false },
  },
  horas_extra: {
    personas: { target: 'personas', sourceKey: 'persona_id', targetKey: 'id', many: false },
  },
  rrhh_contratos: {
    personas: { target: 'personas', sourceKey: 'persona_id', targetKey: 'id', many: false },
  },
  rrhh_ausencias: {
    personas: { target: 'personas', sourceKey: 'persona_id', targetKey: 'id', many: false },
  },
  rrhh_documentos_empleado: {
    personas: { target: 'personas', sourceKey: 'persona_id', targetKey: 'id', many: false },
    rrhh_tipos_documento: { target: 'rrhh_tipos_documento', sourceKey: 'tipo_documento_id', targetKey: 'id', many: false },
  },
  vehiculos_empresa: {
    empresas_asociadas: { target: 'empresas_asociadas', sourceKey: 'empresa_asociada_id', targetKey: 'id', many: false },
    personas: { target: 'personas', sourceKey: 'conductor_id', targetKey: 'id', many: false },
  },
  productos_comerciales: {
    publicaciones_productos: { target: 'publicaciones_productos', sourceKey: 'id', targetKey: 'producto_id', many: true },
  },
  google_ads_metricas_diarias: {
    google_ads_campanas: { target: 'google_ads_campanas', sourceKey: 'campana_id', targetKey: 'id', many: false },
  },
  google_ads_recomendaciones: {
    google_ads_campanas: { target: 'google_ads_campanas', sourceKey: 'campana_id', targetKey: 'id', many: false },
  },
}

export const RPC_ALLOWLIST = new Set([
  'actualizar_nombre_usuario_empresa',
  'bootstrap_empresa_tecnica_hidraulica',
  'cambiar_estado_usuario_empresa',
  'crear_ot_desde_cotizacion_documento',
  'create_empresa_owner',
  'generar_recomendaciones_google_ads',
  'guardar_permisos_usuario',
  'listar_usuarios_empresa_detalle',
  'mis_permisos_empresa',
  'next_erp_cotizacion',
  'next_erp_pre_cotizacion',
  'set_empresa_activa',
  'sincronizar_alertas_rrhh',
  'vincular_usuario_persona',
])

export const SET_RETURNING_RPCS = new Set(['listar_usuarios_empresa_detalle'])

export function hasAnyModule(accessRecord, required = []) {
  if (!required.length) return true
  if (accessRecord?.isAdmin) return true
  const allowed = accessRecord?.modules || new Set()
  return required.some((module) => allowed.has(module))
}
