import { useEffect, useMemo, useState } from 'react'
import { Building2, CheckCheck, Eye, EyeOff, KeyRound, Pencil, Power, PowerOff, RefreshCw, Save, ShieldCheck, UserPlus, UsersRound, X } from 'lucide-react'
import { Card } from '../components/Card'
import { FeedbackToast } from '../components/FeedbackToast'
import { useEmpresa } from '../lib/empresa'
import { ALL_MODULES, MODULE_GROUPS, type ModuleKey, usePermisos } from '../lib/permisos'
import { supabase } from '../lib/supabase'

type UserAccess = {
  user_id: string
  email: string
  nombre_completo: string
  rol: string
  activo: boolean
  modulos: ModuleKey[]
  persona_id?: string | null
  persona_nombre?: string | null
}

type PersonOption = { id: string; nombre: string; usuario_id?: string | null }

const assignableModules = MODULE_GROUPS.flatMap((group) => group.modules.map((module) => module.key))

const presets: Array<{ label: string; modules: ModuleKey[] }> = [
  { label: 'RR.HH. y pagos', modules: ['rrhh_personas', 'rrhh_contratos', 'rrhh_ausencias', 'rrhh_documentos', 'personas_pagos'] },
  { label: 'Comercial', modules: ['dashboard', 'clientes', 'presupuestos', 'cotizaciones', 'ordenes_compra', 'comprobantes_comisiones', 'publicaciones', 'crm', 'whatsapp'] },
  { label: 'Operaciones', modules: ['dashboard', 'ordenes', 'maquinaria', 'repuestos', 'epp_ropa', 'documentos_empresa', 'auditorias', 'importar_excel'] },
  { label: 'Marketing', modules: ['dashboard', 'google_ads', 'publicaciones', 'crm', 'whatsapp'] },
]

function permissionsError(error: { code?: string; message?: string } | null) {
  if (!error) return ''
  if (/vincular_usuario_persona|rrhh_personas|persona_id|persona_nombre/i.test(error.message || '')) {
    return 'Falta instalar el módulo de Recursos Humanos en PostgreSQL.'
  }
  if (/listar_usuarios_empresa_detalle|actualizar_nombre_usuario_empresa/i.test(error.message || '')) {
    return 'Falta instalar el módulo de perfiles de usuario en PostgreSQL.'
  }
  if (error.code === 'PGRST202' || /listar_usuarios_empresa|guardar_permisos_usuario|schema cache/i.test(error.message || '')) {
    return 'Falta instalar el módulo de permisos en PostgreSQL.'
  }
  return error.message || 'No fue posible completar la operación.'
}

async function functionErrorMessage(error: unknown) {
  const fallback = error instanceof Error
    ? error.message
    : String((error as { message?: string } | null)?.message || 'No fue posible crear la cuenta.')
  const errorName = (error as { name?: string } | null)?.name || ''
  if (
    /FunctionsFetchError/i.test(errorName)
    || /Failed to send a request to the Edge Function|Failed to fetch/i.test(fallback)
  ) {
    return 'No se pudo contactar la API segura de usuarios. Verifica que el backend Node.js esté iniciado.'
  }
  const context = (error as { context?: Response } | null)?.context
  if (!context) return fallback

  try {
    const payload = await context.clone().json() as { error?: string }
    return payload.error || fallback
  } catch {
    return fallback
  }
}

function roleLabel(role: string) {
  if (role === 'owner') return 'Propietario'
  if (role === 'admin') return 'Administrador'
  return 'Usuario por módulos'
}

export function UsuariosPermisos() {
  const { activeEmpresaId, activeEmpresa, empresas, userEmail } = useEmpresa()
  const { isAdmin, schemaReady, refreshPermissions } = usePermisos()
  const [users, setUsers] = useState<UserAccess[]>([])
  const [people, setPeople] = useState<PersonOption[]>([])
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState<'admin' | 'operador'>('operador')
  const [selected, setSelected] = useState<Set<ModuleKey>>(new Set())
  const [editingUser, setEditingUser] = useState<UserAccess | null>(null)
  const [linkedPersonId, setLinkedPersonId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [credentialUser, setCredentialUser] = useState<UserAccess | null>(null)
  const [credentialEmail, setCredentialEmail] = useState('')
  const [credentialPassword, setCredentialPassword] = useState('')
  const [credentialConfirmation, setCredentialConfirmation] = useState('')
  const [showCredentialPassword, setShowCredentialPassword] = useState(false)
  const [credentialSaving, setCredentialSaving] = useState(false)
  const [assignEmail, setAssignEmail] = useState('')
  const [assignEmpresaId, setAssignEmpresaId] = useState('')
  const [assignRole, setAssignRole] = useState<'admin' | 'operador'>('operador')
  const [assignSelected, setAssignSelected] = useState<Set<ModuleKey>>(new Set())
  const [assignSaving, setAssignSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function loadUsers() {
    if (!activeEmpresaId || !isAdmin || !schemaReady) {
      setLoading(false)
      return
    }

    setLoading(true)
    const [usersResult, peopleResult] = await Promise.all([
      supabase.rpc('listar_usuarios_empresa_detalle', { p_empresa_id: activeEmpresaId }),
      supabase.from('personas').select('id, nombre, usuario_id').eq('empresa_id', activeEmpresaId).order('nombre'),
    ])

    const { data, error } = usersResult

    if (error) {
      setMessage(permissionsError(error))
      setUsers([])
    } else {
      setUsers(((data || []) as UserAccess[]).map((user) => ({
        ...user,
        modulos: (user.modulos || []).filter((module) => (ALL_MODULES as readonly string[]).includes(module)),
      })))
    }
    if (!peopleResult.error) setPeople((peopleResult.data || []) as PersonOption[])
    else setPeople([])
    setLoading(false)
  }

  useEffect(() => {
    void loadUsers()
  }, [activeEmpresaId, isAdmin, schemaReady])

  const summary = useMemo(() => ({
    total: users.length,
    active: users.filter((user) => user.activo).length,
    admins: users.filter((user) => ['owner', 'admin'].includes(user.rol)).length,
  }), [users])
  const currentRole = empresas.find((item) => item.empresas?.id === activeEmpresaId)?.rol || ''
  const adminCompanies = empresas.filter((item) => item.empresas && ['owner', 'admin'].includes(item.rol))

  function resetForm() {
    setFullName('')
    setEmail('')
    setTemporaryPassword('')
    setShowPassword(false)
    setRole('operador')
    setSelected(new Set())
    setEditingUser(null)
    setLinkedPersonId('')
  }

  function editUser(user: UserAccess) {
    setEditingUser(user)
    setFullName(user.nombre_completo)
    setEmail(user.email)
    setRole(user.rol === 'owner' || user.rol === 'admin' ? 'admin' : 'operador')
    setSelected(new Set(user.modulos))
    setLinkedPersonId(user.persona_id || '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openCredentials(user: UserAccess) {
    setCredentialUser(user)
    setCredentialEmail(user.email)
    setCredentialPassword('')
    setCredentialConfirmation('')
    setShowCredentialPassword(false)
    window.setTimeout(() => document.getElementById('credenciales-usuario')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
  }

  function closeCredentials() {
    setCredentialUser(null)
    setCredentialEmail('')
    setCredentialPassword('')
    setCredentialConfirmation('')
    setShowCredentialPassword(false)
  }

  function canChangeCredentials(user: UserAccess) {
    if (user.email.toLowerCase() === userEmail.toLowerCase() || user.rol === 'owner') return false
    if (currentRole === 'owner') return ['admin', 'operador'].includes(user.rol)
    return currentRole === 'admin' && user.rol === 'operador'
  }

  async function saveCredentials() {
    if (!credentialUser || !activeEmpresaId) return
    const nextEmail = credentialEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) return setMessage('Ingresa un correo válido para iniciar sesión.')
    if (credentialPassword && credentialPassword.length < 8) return setMessage('La contraseña temporal debe tener al menos 8 caracteres.')
    if (credentialPassword !== credentialConfirmation) return setMessage('Las contraseñas no coinciden.')
    if (nextEmail === credentialUser.email.toLowerCase() && !credentialPassword) return setMessage('Cambia el correo o ingresa una nueva contraseña temporal.')

    setCredentialSaving(true)
    setMessage('')
    try {
      const { error } = await supabase.functions.invoke('actualizar-credenciales-usuario', {
        body: {
          empresa_id: activeEmpresaId,
          user_id: credentialUser.user_id,
          email: nextEmail,
          password: credentialPassword,
        },
      })
      if (error) return setMessage(await functionErrorMessage(error))
      const changedPassword = Boolean(credentialPassword)
      closeCredentials()
      await loadUsers()
      setMessage(changedPassword
        ? 'Usuario y contraseña temporal actualizados. Las sesiones anteriores se cerraron y deberá crear una clave personal al ingresar.'
        : 'Usuario de acceso actualizado. Las sesiones anteriores se cerraron y ya puede ingresar con el nuevo correo.')
    } catch (error) {
      setMessage(await functionErrorMessage(error))
    } finally {
      setCredentialSaving(false)
    }
  }

  function toggleModule(module: ModuleKey) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(module)) next.delete(module)
      else next.add(module)
      return next
    })
  }

  function toggleAssignModule(module: ModuleKey) {
    setAssignSelected((current) => {
      const next = new Set(current)
      if (next.has(module)) next.delete(module)
      else next.add(module)
      return next
    })
  }

  async function assignExistingUserToCompany() {
    const targetEmail = assignEmail.trim().toLowerCase()
    if (!targetEmail) return setMessage('Selecciona o escribe el correo del usuario que quieres asignar.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) return setMessage('Ingresa un correo válido.')
    if (!assignEmpresaId) return setMessage('Selecciona la empresa a la que quieres dar acceso.')
    if (assignRole === 'operador' && assignSelected.size === 0) return setMessage('Selecciona al menos una sección para esa empresa.')

    setAssignSaving(true)
    const selectedModules = assignRole === 'admin' ? [...ALL_MODULES] : Array.from(assignSelected)
    const { data, error } = await supabase.rpc('guardar_permisos_usuario', {
      p_empresa_id: assignEmpresaId,
      p_email: targetEmail,
      p_rol: assignRole,
      p_modulos: selectedModules,
    })
    setAssignSaving(false)

    if (error || !data) {
      return setMessage(error
        ? permissionsError(error)
        : 'No se pudo asignar la empresa. Verifica que el usuario ya exista y que seas administrador de esa empresa.')
    }

    const targetCompany = adminCompanies.find((item) => item.empresas?.id === assignEmpresaId)?.empresas
    setMessage(`Acceso asignado correctamente a ${targetEmail}${targetCompany?.nombre ? ` en ${targetCompany.nombre}` : ''}.`)
    setAssignEmail('')
    setAssignEmpresaId('')
    setAssignRole('operador')
    setAssignSelected(new Set())
    if (assignEmpresaId === activeEmpresaId) await loadUsers()
  }

  async function saveAccess() {
    if (!activeEmpresaId) return setMessage('Selecciona una empresa activa antes de guardar permisos.')
    if (fullName.trim().length < 2) return setMessage('Ingresa el nombre completo de la persona.')
    if (!email.trim()) return setMessage('Ingresa el correo del usuario.')
    if (!editingUser && temporaryPassword.length < 8) return setMessage('La contraseña temporal debe tener al menos 8 caracteres.')
    if (role === 'operador' && selected.size === 0) return setMessage('Selecciona al menos una sección para este usuario.')

    setSaving(true)
    const selectedModules = role === 'admin' ? [...ALL_MODULES] : Array.from(selected)

    if (!editingUser) {
      const { error } = await supabase.functions.invoke('crear-usuario-empresa', {
        body: {
          empresa_id: activeEmpresaId,
          nombre_completo: fullName.trim(),
          email: email.trim(),
          password: temporaryPassword,
          rol: role,
          modulos: selectedModules,
          persona_id: linkedPersonId || null,
        },
      })
      setSaving(false)

      if (error) return setMessage(await functionErrorMessage(error))
      setMessage('Usuario creado correctamente. Ya puede ingresar con la contraseña temporal y deberá cambiarla en su primer acceso.')
      resetForm()
      await loadUsers()
      return
    }

    const { data, error } = await supabase.rpc('guardar_permisos_usuario', {
      p_empresa_id: activeEmpresaId,
      p_email: email.trim(),
      p_rol: role,
      p_modulos: selectedModules,
    })

    if (error || !data) {
      setSaving(false)
      return setMessage(error
        ? permissionsError(error)
        : 'No se pudo actualizar el acceso. Verifica que tu cuenta siga siendo administradora.')
    }

    const { data: nameUpdated, error: nameError } = await supabase.rpc('actualizar_nombre_usuario_empresa', {
      p_empresa_id: activeEmpresaId,
      p_user_id: editingUser.user_id,
      p_nombre_completo: fullName.trim(),
    })
    if (nameError) {
      setSaving(false)
      return setMessage(permissionsError(nameError))
    }
    if (!nameUpdated) {
      setSaving(false)
      return setMessage('Los permisos se actualizaron, pero no fue posible guardar el nombre.')
    }

    const { data: linked, error: linkError } = await supabase.rpc('vincular_usuario_persona', {
      p_empresa_id: activeEmpresaId,
      p_user_id: editingUser.user_id,
      p_persona_id: linkedPersonId || null,
    })
    setSaving(false)

    if (linkError) return setMessage(permissionsError(linkError))
    if (!linked) return setMessage('El acceso se actualizó, pero no fue posible vincular la ficha laboral seleccionada.')
    setMessage('Nombre, permisos y ficha laboral actualizados correctamente.')
    resetForm()
    await loadUsers()
    if (email.trim().toLowerCase() === userEmail.toLowerCase()) await refreshPermissions()
  }

  async function toggleUserStatus(user: UserAccess) {
    const nextActive = !user.activo
    if (!nextActive && !confirm(`¿Desactivar el acceso de ${user.email} a esta empresa?`)) return

    const { data, error } = await supabase.rpc('cambiar_estado_usuario_empresa', {
      p_empresa_id: activeEmpresaId,
      p_user_id: user.user_id,
      p_activo: nextActive,
    })
    if (error) return setMessage(permissionsError(error))
    if (!data) return setMessage('No se pudo cambiar el estado. No puedes desactivarte a ti mismo ni desactivar al propietario de la empresa.')
    setMessage(nextActive ? 'Acceso del usuario activado correctamente.' : 'Acceso del usuario desactivado correctamente.')
    await loadUsers()
  }

  if (!isAdmin) {
    return <Card><div className="py-10 text-center"><ShieldCheck className="mx-auto text-slate-400" size={38} /><h2 className="mt-4 text-xl font-bold">Acceso solo para administradores</h2><p className="mt-2 text-slate-600">Tu cuenta no puede modificar los permisos de otros usuarios.</p></div></Card>
  }

  if (!schemaReady) {
    return <div className="space-y-5"><div><h2 className="text-3xl font-black text-slate-950">Usuarios y permisos</h2><p className="mt-2 text-slate-600">Control de acceso por empresa y sección.</p></div><Card className="border-amber-300 bg-amber-50"><div className="flex gap-3"><ShieldCheck className="mt-1 shrink-0 text-amber-700" /><div><h3 className="font-bold text-amber-950">Falta preparar PostgreSQL</h3><p className="mt-2 text-sm leading-6 text-amber-900">Ejecuta <b>npm run db:init</b> para instalar el esquema completo antes de administrar accesos.</p></div></div></Card></div>
  }

  const editingOwner = editingUser?.rol === 'owner'

  return (
    <div className="space-y-5">
      <FeedbackToast message={message} onClose={() => setMessage('')} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-3xl font-black text-slate-950">Usuarios y permisos</h2>
          <p className="mt-2 text-slate-600">Define qué secciones puede utilizar cada persona en {activeEmpresa?.nombre || 'la empresa activa'}.</p>
        </div>
        <button onClick={loadUsers} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Actualizar usuarios</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Usuarios asociados</p><p className="mt-2 text-3xl font-black">{summary.total}</p></Card>
        <Card><p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Accesos activos</p><p className="mt-2 text-3xl font-black text-emerald-700">{summary.active}</p></Card>
        <Card><p className="text-xs font-bold uppercase tracking-wide text-blue-600">Administradores</p><p className="mt-2 text-3xl font-black text-blue-700">{summary.admins}</p></Card>
      </div>

      <Card>
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-blue-100 p-3 text-blue-700"><UserPlus size={21} /></div>
          <div><h3 className="font-bold text-slate-950">{editingUser ? 'Editar usuario y acceso' : 'Crear nuevo usuario'}</h3><p className="text-sm text-slate-500">Registra a la persona, crea su cuenta y define las secciones que podrá utilizar.</p></div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_260px]">
          <label className="text-sm font-bold text-slate-700">Nombre completo<input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nombre y apellido" className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal text-slate-950" /></label>
          <label className="text-sm font-bold text-slate-700">Correo del usuario<input type="email" value={email} disabled={Boolean(editingUser)} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@tecnicahidraulica.cl" className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal text-slate-950 disabled:bg-slate-100" /></label>
          <label className="text-sm font-bold text-slate-700">Tipo de acceso<select value={role} disabled={editingOwner} onChange={(event) => setRole(event.target.value as 'admin' | 'operador')} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal text-slate-950 disabled:bg-slate-100"><option value="operador">Usuario por módulos</option><option value="admin">Administrador completo</option></select></label>
        </div>

        {!editingUser && <div className="mt-4 grid gap-3 lg:grid-cols-2"><label className="text-sm font-bold text-slate-700">Contraseña temporal<div className="relative mt-2"><KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type={showPassword ? 'text' : 'password'} value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} autoComplete="new-password" placeholder="Mínimo 8 caracteres" className="w-full rounded-xl border border-slate-300 py-3 pl-11 pr-12 font-normal text-slate-950" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar contraseña temporal' : 'Mostrar contraseña temporal'} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><b>Primer ingreso:</b> entrega esta contraseña de forma privada. El sistema obligará al usuario a crear una nueva antes de entrar.</div></div>}

        <label className="mt-4 block text-sm font-bold text-slate-700">Ficha laboral vinculada <span className="font-normal text-slate-500">(opcional)</span><select value={linkedPersonId} onChange={(event) => setLinkedPersonId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal text-slate-950"><option value="">Sin ficha vinculada</option>{people.map((person) => <option key={person.id} value={person.id} disabled={Boolean(person.usuario_id && person.usuario_id !== editingUser?.user_id)}>{person.nombre}{person.usuario_id && person.usuario_id !== editingUser?.user_id ? ' · ya vinculada' : ''}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">Esto permite relacionar el acceso al sistema con contratos, ausencias, documentos y remuneraciones de la misma persona.</span></label>

        {editingOwner && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">El propietario conserva acceso completo y no puede limitarse.</div>}
        {role === 'admin' && !editingOwner && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">Los administradores tienen acceso a todas las secciones y pueden administrar otros usuarios.</div>}

        {role === 'operador' && (
          <div className="mt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold text-slate-950">Secciones permitidas</h4><div className="flex flex-wrap gap-2"><button onClick={() => setSelected(new Set(assignableModules))} className="rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800"><CheckCheck size={14} className="mr-1 inline" />Todas</button><button onClick={() => setSelected(new Set())} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700"><X size={14} className="mr-1 inline" />Ninguna</button></div></div>
            <div className="mb-4 flex flex-wrap gap-2">{presets.map((preset) => <button key={preset.label} onClick={() => setSelected(new Set(preset.modules))} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800">Perfil {preset.label}</button>)}</div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {MODULE_GROUPS.map((group) => <div key={group.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">{group.label}</p><div className="space-y-2">{group.modules.map((module) => <label key={module.key} className="flex cursor-pointer items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={selected.has(module.key)} onChange={() => toggleModule(module.key)} className="h-4 w-4 rounded accent-blue-600" />{module.label}</label>)}</div></div>)}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2"><button onClick={saveAccess} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-50"><Save size={17} />{saving ? 'Guardando...' : editingUser ? 'Actualizar usuario' : 'Crear usuario y guardar'}</button>{editingUser && <button onClick={resetForm} className="inline-flex items-center gap-2 rounded-xl bg-slate-200 px-5 py-3 font-bold text-slate-700"><X size={17} />Cancelar</button>}</div>
      </Card>

      <Card>
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><Building2 size={21} /></div>
          <div><h3 className="font-bold text-slate-950">Asignar usuario existente a otra empresa</h3><p className="text-sm text-slate-500">Usa esto cuando el vendedor o trabajador ya tiene cuenta y necesita entrar también a otra empresa.</p></div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_240px]">
          <label className="text-sm font-bold text-slate-700">Usuario existente
            <input list="usuarios-existentes" value={assignEmail} onChange={(event) => setAssignEmail(event.target.value)} placeholder="correo@empresa.cl" className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal text-slate-950" />
            <datalist id="usuarios-existentes">{users.map((user) => <option key={user.user_id} value={user.email}>{user.nombre_completo}</option>)}</datalist>
          </label>
          <label className="text-sm font-bold text-slate-700">Empresa destino
            <select value={assignEmpresaId} onChange={(event) => setAssignEmpresaId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal text-slate-950">
              <option value="">Seleccionar empresa</option>
              {adminCompanies.map((item) => item.empresas && <option key={item.empresas.id} value={item.empresas.id}>{item.empresas.nombre}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold text-slate-700">Rol en esa empresa
            <select value={assignRole} onChange={(event) => setAssignRole(event.target.value as 'admin' | 'operador')} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal text-slate-950"><option value="operador">Usuario por módulos</option><option value="admin">Administrador completo</option></select>
          </label>
        </div>

        {assignRole === 'admin' ? <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">El usuario quedará como administrador completo en la empresa seleccionada.</div> : <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold text-slate-950">Secciones permitidas en la empresa destino</h4><div className="flex flex-wrap gap-2"><button onClick={() => setAssignSelected(new Set(assignableModules))} className="rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800"><CheckCheck size={14} className="mr-1 inline" />Todas</button><button onClick={() => setAssignSelected(new Set())} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700"><X size={14} className="mr-1 inline" />Ninguna</button></div></div>
          <div className="mb-4 flex flex-wrap gap-2">{presets.map((preset) => <button key={preset.label} onClick={() => setAssignSelected(new Set(preset.modules))} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800">Perfil {preset.label}</button>)}</div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {MODULE_GROUPS.map((group) => <div key={group.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">{group.label}</p><div className="space-y-2">{group.modules.map((module) => <label key={module.key} className="flex cursor-pointer items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={assignSelected.has(module.key)} onChange={() => toggleAssignModule(module.key)} className="h-4 w-4 rounded accent-blue-600" />{module.label}</label>)}</div></div>)}
          </div>
        </div>}

        <div className="mt-6 flex flex-wrap gap-2"><button onClick={assignExistingUserToCompany} disabled={assignSaving || !adminCompanies.length} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50"><Building2 size={17} />{assignSaving ? 'Asignando...' : 'Asignar empresa'}</button>{!adminCompanies.length && <span className="self-center text-sm font-semibold text-slate-500">No tienes empresas administrables para asignar.</span>}</div>
      </Card>

      {credentialUser && <div id="credenciales-usuario"><Card className="border-blue-200 bg-blue-50/40">
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-xl bg-blue-100 p-3 text-blue-700"><KeyRound size={21} /></div>
          <div><h3 className="font-bold text-slate-950">Cambiar usuario o contraseña</h3><p className="mt-1 text-sm text-slate-600">Cuenta de {credentialUser.nombre_completo}. Puedes cambiar el correo de acceso, la contraseña temporal o ambos.</p></div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="text-sm font-bold text-slate-700">Correo para iniciar sesión<input type="email" value={credentialEmail} onChange={(event) => setCredentialEmail(event.target.value)} autoComplete="off" className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal text-slate-950" /></label>
          <label className="text-sm font-bold text-slate-700">Nueva contraseña temporal <span className="font-normal text-slate-500">(opcional)</span><div className="relative mt-2"><input type={showCredentialPassword ? 'text' : 'password'} value={credentialPassword} onChange={(event) => setCredentialPassword(event.target.value)} autoComplete="new-password" placeholder="Mínimo 8 caracteres" className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-3 pr-12 font-normal text-slate-950" /><button type="button" onClick={() => setShowCredentialPassword((value) => !value)} aria-label={showCredentialPassword ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{showCredentialPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          <label className="text-sm font-bold text-slate-700">Confirmar contraseña<input type={showCredentialPassword ? 'text' : 'password'} value={credentialConfirmation} onChange={(event) => setCredentialConfirmation(event.target.value)} autoComplete="new-password" placeholder="Repite la contraseña" className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal text-slate-950" /></label>
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">Al guardar, se cerrarán las sesiones anteriores. Si asignas una contraseña temporal, el usuario deberá reemplazarla en su siguiente ingreso.</div>
        <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={saveCredentials} disabled={credentialSaving} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-50"><KeyRound size={17} />{credentialSaving ? 'Actualizando...' : 'Guardar credenciales'}</button><button type="button" onClick={closeCredentials} disabled={credentialSaving} className="rounded-xl bg-slate-200 px-5 py-3 font-bold text-slate-700 disabled:opacity-50">Cancelar</button></div>
      </Card></div>}

      <Card>
        <div className="mb-4 flex items-center gap-2"><UsersRound size={20} className="text-blue-700" /><h3 className="font-bold text-slate-950">Usuarios de la empresa</h3></div>
        <div className="overflow-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Persona</th><th className="p-3">Rol</th><th className="p-3">Secciones</th><th className="p-3">Estado</th><th className="p-3">Acciones</th></tr></thead><tbody>
          {users.map((user) => <tr key={user.user_id} className="border-b"><td className="p-3"><div className="font-bold text-slate-900">{user.nombre_completo}{user.email.toLowerCase() === userEmail.toLowerCase() && <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700">Tú</span>}</div><div className="mt-1 text-xs text-slate-500">{user.email}</div>{user.persona_nombre && <div className="mt-1 text-xs font-semibold text-emerald-700">Ficha: {user.persona_nombre}</div>}</td><td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${['owner', 'admin'].includes(user.rol) ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'}`}>{roleLabel(user.rol)}</span></td><td className="p-3">{['owner', 'admin'].includes(user.rol) ? 'Todas' : `${user.modulos.length} habilitadas`}</td><td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${user.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>{user.activo ? 'Activo' : 'Desactivado'}</span></td><td className="p-3"><div className="flex gap-2"><button onClick={() => editUser(user)} title="Editar usuario y permisos" aria-label={`Editar permisos de ${user.nombre_completo}`} className="rounded-lg bg-amber-100 p-2 text-amber-800"><Pencil size={16} /></button><button onClick={() => openCredentials(user)} disabled={!canChangeCredentials(user)} title={canChangeCredentials(user) ? 'Cambiar usuario o contraseña' : 'Credenciales protegidas'} aria-label={`Cambiar credenciales de ${user.nombre_completo}`} className="rounded-lg bg-blue-100 p-2 text-blue-700 disabled:cursor-not-allowed disabled:opacity-30"><KeyRound size={16} /></button><button onClick={() => toggleUserStatus(user)} disabled={user.rol === 'owner' || user.email.toLowerCase() === userEmail.toLowerCase()} title={user.activo ? 'Desactivar usuario' : 'Activar usuario'} aria-label={`${user.activo ? 'Desactivar' : 'Activar'} a ${user.nombre_completo}`} className={`rounded-lg p-2 disabled:cursor-not-allowed disabled:opacity-30 ${user.activo ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{user.activo ? <PowerOff size={16} /> : <Power size={16} />}</button></div></td></tr>)}
          {!loading && !users.length && <tr><td colSpan={5} className="p-8 text-center text-slate-500">No hay usuarios disponibles o todavía falta configurar el módulo.</td></tr>}
        </tbody></table></div>
      </Card>
    </div>
  )
}
