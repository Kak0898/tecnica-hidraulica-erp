import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const assignableModules = [
  'dashboard', 'google_ads', 'clientes', 'empresas_asociadas',
  'presupuestos', 'cotizaciones', 'publicaciones', 'ordenes',
  'crm', 'whatsapp', 'personas_pagos', 'flota', 'maquinaria',
  'repuestos', 'epp_ropa', 'auditorias', 'importar_excel', 'ia',
] as const

type RequestPayload = {
  empresa_id?: string
  nombre_completo?: string
  email?: string
  password?: string
  rol?: 'admin' | 'operador'
  modulos?: string[]
}

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json(405, { error: 'Método no permitido.' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: 'La función no tiene configuradas las credenciales de Supabase.' })
  }
  if (!authorization) return json(401, { error: 'Debes iniciar sesión nuevamente.' })

  let payload: RequestPayload
  try {
    payload = await request.json()
  } catch {
    return json(400, { error: 'La solicitud no contiene datos válidos.' })
  }

  const empresaId = String(payload.empresa_id || '').trim()
  const nombreCompleto = String(payload.nombre_completo || '').trim().replace(/\s+/g, ' ')
  const email = String(payload.email || '').trim().toLowerCase()
  const password = String(payload.password || '')
  const role = payload.rol === 'admin' ? 'admin' : 'operador'
  const requestedModules = Array.isArray(payload.modulos) ? payload.modulos : []
  const moduleSet = new Set(requestedModules.filter((module) => assignableModules.includes(module as typeof assignableModules[number])))

  if (!empresaId) return json(400, { error: 'Selecciona una empresa antes de crear el usuario.' })
  if (nombreCompleto.length < 2) return json(400, { error: 'Ingresa el nombre completo de la persona.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Ingresa un correo válido.' })
  if (password.length < 8) return json(400, { error: 'La contraseña temporal debe tener al menos 8 caracteres.' })
  if (role === 'operador' && moduleSet.size === 0) return json(400, { error: 'Selecciona al menos una sección para el usuario.' })

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) return json(401, { error: 'La sesión no es válida. Inicia sesión nuevamente.' })

  const { data: membership, error: membershipError } = await userClient
    .from('usuarios_empresas')
    .select('rol, activo')
    .eq('empresa_id', empresaId)
    .eq('user_id', authData.user.id)
    .maybeSingle()

  if (membershipError || !membership?.activo || !['owner', 'admin'].includes(membership.rol)) {
    return json(403, { error: 'Solo un propietario o administrador puede crear usuarios.' })
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      erp_nombre: nombreCompleto,
      erp_email_comercial: email,
      erp_cargo: role === 'admin' ? 'Administrador' : 'Usuario TH',
      erp_requiere_cambio_clave: true,
    },
  })

  if (createError || !created.user) {
    const duplicate = /already|registered|exists/i.test(createError?.message || '')
    return json(duplicate ? 409 : 400, {
      error: duplicate
        ? 'Ese correo ya tiene una cuenta. Si ya pertenece a la empresa, edítalo desde el listado.'
        : createError?.message || 'No fue posible crear la cuenta.',
    })
  }

  const userId = created.user.id
  const permissionRows = assignableModules.map((module) => ({
    empresa_id: empresaId,
    user_id: userId,
    modulo: module,
    permitido: role === 'operador' && moduleSet.has(module),
  }))

  try {
    const { error: profileError } = await adminClient.from('perfiles_usuarios').upsert({
      user_id: userId,
      nombre_completo: nombreCompleto,
      creado_por: authData.user.id,
    }, { onConflict: 'user_id' })
    if (profileError) throw profileError

    const { error: companyError } = await adminClient.from('usuarios_empresas').upsert({
      empresa_id: empresaId,
      user_id: userId,
      rol: role,
      activo: true,
      permisos_inicializados: true,
    }, { onConflict: 'empresa_id,user_id' })
    if (companyError) throw companyError

    const { error: permissionsError } = await adminClient.from('usuario_permisos').upsert(permissionRows, {
      onConflict: 'empresa_id,user_id,modulo',
    })
    if (permissionsError) throw permissionsError

    const { error: activeCompanyError } = await adminClient.from('usuario_empresa_activa').upsert({
      user_id: userId,
      empresa_id: empresaId,
    }, { onConflict: 'user_id', ignoreDuplicates: true })
    if (activeCompanyError) throw activeCompanyError
  } catch (error) {
    await adminClient.auth.admin.deleteUser(userId)
    const errorMessage = error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : ''
    return json(500, {
      error: errorMessage
        ? `La cuenta no se guardó y fue revertida: ${errorMessage}`
        : 'La cuenta no se guardó y fue revertida.',
    })
  }

  return json(201, {
    user_id: userId,
    email,
    nombre_completo: nombreCompleto,
    requiere_cambio_clave: true,
  })
})
