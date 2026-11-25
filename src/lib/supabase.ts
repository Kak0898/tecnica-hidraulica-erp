import { API_URL, checkConnection, reportConnectionFailure } from './intranet-connection'

const SESSION_KEY = 'intranet_session'
const ACTIVITY_KEY = 'intranet_last_activity'
const IDLE_MS = 5 * 60 * 1000

type ApiError = { message: string; code?: string; name?: string }
type SessionUser = { id: string; email?: string; user_metadata?: Record<string, any> }
type Session = { access_token: string; token_type?: string; user: SessionUser }

let currentSession: Session | null = loadSession()
const authListeners = new Set<(event: string, session: Session | null) => void>()
let expiryTimer: number | undefined
let sessionNotice = ''
const idleNotice = 'Tu sesión se cerró tras 5 minutos de inactividad. Vuelve a iniciar sesión.'
const expiredNotice = 'Tu sesión venció. Vuelve a iniciar sesión.'

function loadSession(): Session | null {
  try {
    const value = window.localStorage.getItem(SESSION_KEY)
    return value ? JSON.parse(value) as Session : null
  } catch {
    return null
  }
}

function saveSession(session: Session | null) {
  currentSession = session
  if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  else window.localStorage.removeItem(SESSION_KEY)
}

function endSession(notice = '') {
  sessionNotice = notice
  saveSession(null)
  window.clearTimeout(expiryTimer)
  emitAuth('SIGNED_OUT')
}

function tokenExpiresAt(token: string) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const expiresAt = JSON.parse(atob(payload)).exp
    return Number.isFinite(expiresAt) ? expiresAt * 1000 : Infinity
  } catch {
    return Infinity
  }
}

function checkSession() {
  window.clearTimeout(expiryTimer)
  const stored = loadSession()
  if (stored?.access_token !== currentSession?.access_token) {
    if (!stored && Date.now() - Number(window.localStorage.getItem(ACTIVITY_KEY)) >= IDLE_MS) sessionNotice = idleNotice
    currentSession = stored
    if (stored) sessionNotice = ''
    emitAuth(stored ? 'SIGNED_IN' : 'SIGNED_OUT')
  }
  if (!currentSession) return null

  const now = Date.now()
  let lastActivity = Number(window.localStorage.getItem(ACTIVITY_KEY))
  if (!lastActivity || lastActivity > now) {
    lastActivity = now
    window.localStorage.setItem(ACTIVITY_KEY, String(now))
  }
  const idleAt = lastActivity + IDLE_MS
  const expiresAt = tokenExpiresAt(currentSession.access_token)
  const remaining = Math.min(idleAt, expiresAt) - now
  if (remaining <= 0) {
    endSession(idleAt <= expiresAt ? idleNotice : expiredNotice)
    return null
  }
  expiryTimer = window.setTimeout(checkSession, remaining)
  return currentSession
}

function recordSessionActivity() {
  if (!checkSession()) return
  const now = Date.now()
  if (now - Number(window.localStorage.getItem(ACTIVITY_KEY)) >= 1000) {
    window.localStorage.setItem(ACTIVITY_KEY, String(now))
    checkSession()
  }
}

export function getSessionNotice() {
  return sessionNotice
}

for (const event of ['pointerdown', 'keydown', 'wheel', 'input', 'touchmove']) {
  window.addEventListener(event, (event) => {
    if (event.isTrusted && currentSession) recordSessionActivity()
  }, { capture: true, passive: true })
}
window.addEventListener('pageshow', checkSession)
document.addEventListener('visibilitychange', checkSession)
window.addEventListener('storage', (event) => {
  if (event.key === SESSION_KEY || event.key === ACTIVITY_KEY || event.key === null) checkSession()
})
checkSession()

function emitAuth(event: string) {
  authListeners.forEach((listener) => listener(event, currentSession))
}

function errorFrom(payload: any, status: number): ApiError {
  return {
    message: payload?.error || payload?.message || `La API respondió con estado ${status}.`,
    code: payload?.code || `HTTP_${status}`,
    name: payload?.name || 'IntranetApiError',
  }
}

function connectionError(message: string, code: string) {
  return { data: null, error: { message, code, name: 'IntranetApiFetchError' }, response: null }
}

async function apiRequest(path: string, options: RequestInit = {}, write = Boolean(options.method && options.method !== 'GET')) {
  const publicRequest = path === '/auth/login' || path === '/auth/request-reset'
  const session = checkSession()
  if (!session && !publicRequest) {
    return connectionError(sessionNotice || 'Debes iniciar sesión.', 'HTTP_401')
  }
  if (!navigator.onLine) {
    reportConnectionFailure()
    return connectionError('Sin conexión a internet o a la red. Revisa tu conexión y vuelve a intentarlo.', 'NETWORK_ERROR')
  }
  const headers = new Headers(options.headers || {})
  if (!publicRequest && session) headers.set('Authorization', `Bearer ${session.access_token}`)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(`${API_URL}${path}`, { ...options, headers, signal: options.signal || controller.signal })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      if (response.status === 401 && !publicRequest && loadSession()?.access_token === session?.access_token) {
        endSession(expiredNotice)
      }
      if (response.status >= 500) {
        if (!payload) {
          reportConnectionFailure()
          return connectionError(write
            ? 'El servidor de intranet no respondió. Revisa si el cambio quedó registrado antes de volver a intentarlo.'
            : 'El servidor de intranet no respondió.', `HTTP_${response.status}`)
        }
        if (payload.code === 'SERVICE_UNAVAILABLE') reportConnectionFailure()
        else void checkConnection()
      }
      return { data: null, error: errorFrom(payload, response.status), response }
    }
    const expectedKey = path === '/auth/login' ? 'session' : path === '/auth/user' ? 'user' : 'data'
    if (!payload || typeof payload !== 'object' || !Object.prototype.hasOwnProperty.call(payload, expectedKey)
      || (path === '/auth/login' && !payload.session?.access_token)) {
      reportConnectionFailure()
      return connectionError(write
        ? 'No se pudo confirmar el guardado. Revisa si el cambio quedó registrado antes de volver a intentarlo.'
        : 'El servidor de intranet devolvió una respuesta inválida.', 'INVALID_RESPONSE')
    }
    return { data: payload, error: null, response }
  } catch {
    reportConnectionFailure()
    const message = navigator.onLine ? 'El servidor de intranet no respondió.' : 'Se perdió la conexión a internet o a la red.'
    return connectionError(write
      ? `${message} No se pudo confirmar el guardado. Revisa si el cambio quedó registrado antes de volver a intentarlo.`
      : message, controller.signal.aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR')
  } finally {
    window.clearTimeout(timeout)
  }
}

// Cotizaciones y presupuestos comparten la sesión y la conexión de la ventana principal.
Object.assign(window, {
  intranetFrame: {
    getSession: checkSession,
    recordSessionActivity,
    request: (path: string, body: any) => apiRequest(path, {
      method: 'POST', body: JSON.stringify(body || {}),
    }, path !== '/data/query' || body?.action !== 'select'),
  },
})

class QueryBuilder {
  private action = 'select'
  private selection = '*'
  private countMode: string | null = null
  private payload: any = null
  private filters: Array<{ column: string; operator: string; value: any }> = []
  private orders: Array<{ column: string; ascending?: boolean; nullsFirst?: boolean }> = []
  private rowLimit: number | null = null
  private rowOffset = 0
  private conflict = ''
  private singleMode: 'single' | 'maybe' | null = null

  constructor(private table: string) {}

  select(columns = '*', options: { count?: string } = {}) {
    this.selection = columns
    this.countMode = options.count || null
    return this
  }

  insert(payload: any) { this.action = 'insert'; this.payload = payload; return this }
  update(payload: any) { this.action = 'update'; this.payload = payload; return this }
  delete() { this.action = 'delete'; return this }
  upsert(payload: any, options: { onConflict?: string } = {}) {
    this.action = 'upsert'
    this.payload = payload
    this.conflict = options.onConflict || ''
    return this
  }

  eq(column: string, value: any) { this.filters.push({ column, operator: 'eq', value }); return this }
  neq(column: string, value: any) { this.filters.push({ column, operator: 'neq', value }); return this }
  gt(column: string, value: any) { this.filters.push({ column, operator: 'gt', value }); return this }
  gte(column: string, value: any) { this.filters.push({ column, operator: 'gte', value }); return this }
  lt(column: string, value: any) { this.filters.push({ column, operator: 'lt', value }); return this }
  lte(column: string, value: any) { this.filters.push({ column, operator: 'lte', value }); return this }
  like(column: string, value: any) { this.filters.push({ column, operator: 'like', value }); return this }
  ilike(column: string, value: any) { this.filters.push({ column, operator: 'ilike', value }); return this }
  in(column: string, value: any[]) { this.filters.push({ column, operator: 'in', value }); return this }
  is(column: string, value: any) { this.filters.push({ column, operator: 'is', value }); return this }
  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.orders.push({ column, ascending: options.ascending, nullsFirst: options.nullsFirst })
    return this
  }
  limit(value: number) { this.rowLimit = value; return this }
  range(from: number, to: number) { this.rowOffset = from; this.rowLimit = Math.max(0, to - from + 1); return this }
  single() { this.singleMode = 'single'; return this }
  maybeSingle() { this.singleMode = 'maybe'; return this }

  private async execute() {
    const result = await apiRequest('/data/query', {
      method: 'POST',
      body: JSON.stringify({
        table: this.table,
        action: this.action,
        select: this.selection,
        count: this.countMode,
        payload: this.payload,
        filters: this.filters,
        orders: this.orders,
        limit: this.rowLimit,
        offset: this.rowOffset,
        onConflict: this.conflict,
      }),
    }, this.action !== 'select')
    if (result.error) return { data: null, error: result.error, count: null }
    const rows = result.data?.data ?? []
    if (this.singleMode) {
      if (!Array.isArray(rows)) return { data: rows, error: null, count: result.data?.count ?? null }
      if (rows.length === 1) return { data: rows[0], error: null, count: result.data?.count ?? null }
      if (this.singleMode === 'maybe' && rows.length === 0) return { data: null, error: null, count: result.data?.count ?? null }
      return { data: null, error: { message: rows.length ? 'La consulta devolvió más de una fila.' : 'La consulta no devolvió filas.', code: 'PGRST116' }, count: result.data?.count ?? null }
    }
    return { data: rows, error: null, count: result.data?.count ?? null }
  }

  then(resolve: (value: any) => any, reject?: (reason: any) => any) {
    return this.execute().then(resolve, reject)
  }
}

const auth = {
  async getSession() {
    return { data: { session: checkSession() }, error: null }
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const result = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false)
    if (result.error) return { data: { session: null, user: null }, error: result.error }
    sessionNotice = ''
    window.localStorage.setItem(ACTIVITY_KEY, String(Date.now()))
    saveSession(result.data.session)
    checkSession()
    emitAuth('SIGNED_IN')
    return { data: { session: currentSession, user: currentSession?.user || null }, error: null }
  },

  async signOut() {
    endSession()
    return { error: null }
  },

  async updateUser(attributes: { password?: string; data?: Record<string, any> }) {
    const session = checkSession()
    const result = await apiRequest('/auth/user', { method: 'PATCH', body: JSON.stringify(attributes) })
    if (result.error) return { data: { user: null }, error: result.error }
    if (!session || checkSession()?.access_token !== session.access_token) {
      return { data: { user: null }, error: { message: 'Vuelve a iniciar sesión.', code: 'HTTP_401' } }
    }
    if (result.data.session) saveSession(result.data.session)
    else if (currentSession && result.data.user) saveSession({ ...currentSession, user: result.data.user })
    emitAuth('USER_UPDATED')
    return { data: { user: result.data.user }, error: null }
  },

  async resetPasswordForEmail(email: string, _options?: any) {
    const result = await apiRequest('/auth/request-reset', { method: 'POST', body: JSON.stringify({ email }) }, false)
    return { data: result.data, error: result.error }
  },

  async signInWithOtp(_attributes: any) {
    return { data: null, error: { message: 'El acceso por enlace de correo no está habilitado en el PostgreSQL propio.', code: 'OTP_DISABLED' } }
  },

  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    authListeners.add(callback)
    window.setTimeout(() => callback('INITIAL_SESSION', currentSession), 0)
    return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } }
  },
}

const comprobantes = {
  async list() {
    const result = await apiRequest('/comprobantes')
    return { data: result.data?.data || null, error: result.error }
  },
  async upload(form: FormData) {
    const result = await apiRequest('/comprobantes', { method: 'POST', body: form })
    return { data: result.data?.data || null, error: result.error }
  },
  async remove(quoteId: string | number, receiptId: string) {
    const result = await apiRequest(`/comprobantes/${encodeURIComponent(quoteId)}/${encodeURIComponent(receiptId)}`, { method: 'DELETE' })
    return { data: result.data?.data || null, error: result.error }
  },
  async updateRules(payload: Record<string, any>) {
    const result = await apiRequest('/comprobantes/reglas', { method: 'PATCH', body: JSON.stringify(payload) })
    return { data: result.data?.data || null, error: result.error }
  },
  async recalculate(sellerId: string, month: string) {
    const result = await apiRequest('/comprobantes/recalcular', { method: 'POST', body: JSON.stringify({ vendedor_id: sellerId, month }) })
    return { data: result.data?.data || null, error: result.error }
  },
  async updatePaymentStatus(quoteId: string | number, receiptId: string, paid: boolean) {
    const result = await apiRequest(`/comprobantes/${encodeURIComponent(quoteId)}/${encodeURIComponent(receiptId)}/pago`, {
      method: 'PATCH',
      body: JSON.stringify({ pagada: paid }),
    })
    return { data: result.data?.data || null, error: result.error }
  },
}

const cotizaciones = {
  async importRows(rows: Record<string, any>[], fileName: string) {
    const result = await apiRequest('/cotizaciones/import', { method: 'POST', body: JSON.stringify({ rows, file_name: fileName }) })
    return { data: result.data?.data || null, error: result.error }
  },
}

const whatsapp = {
  async send(messageId: string) {
    const result = await apiRequest(`/whatsapp/${encodeURIComponent(messageId)}/send`, { method: 'POST' })
    return { data: result.data?.data || null, error: result.error }
  },
  async conversations() {
    const result = await apiRequest('/whatsapp/conversations')
    return { data: result.data?.data || [], error: result.error }
  },
  async conversation(conversationId: string) {
    const result = await apiRequest(`/whatsapp/conversations?conversation_id=${encodeURIComponent(conversationId)}`)
    return { data: result.data?.data || null, error: result.error }
  },
  async draft(conversationId: string) {
    const result = await apiRequest(`/whatsapp/conversations/${encodeURIComponent(conversationId)}/draft`, { method: 'POST' }, false)
    return { data: result.data?.data || null, error: result.error }
  },
}

function storageBucket(bucket: string) {
  return {
    async upload(path: string, file: File, options: { upsert?: boolean } = {}) {
      const form = new FormData()
      form.append('file', file)
      const result = await apiRequest(`/storage/${encodeURIComponent(bucket)}/upload?path=${encodeURIComponent(path)}&upsert=${options.upsert === true}`, { method: 'POST', body: form })
      return { data: result.data?.data || null, error: result.error }
    },
    async remove(paths: string[]) {
      const result = await apiRequest(`/storage/${encodeURIComponent(bucket)}`, { method: 'DELETE', body: JSON.stringify({ paths }) })
      return { data: result.data?.data || null, error: result.error }
    },
    async createSignedUrl(path: string, expiresIn: number) {
      const result = await apiRequest(`/storage/${encodeURIComponent(bucket)}/signed-url`, { method: 'POST', body: JSON.stringify({ path, expiresIn }) }, false)
      return { data: result.data?.data || null, error: result.error }
    },
    getPublicUrl(path: string) {
      const encoded = path.split('/').map(encodeURIComponent).join('/')
      return { data: { publicUrl: `${API_URL}/files/public/${encodeURIComponent(bucket)}/${encoded}` } }
    },
  }
}

export const supabase: any = {
  from(table: string) { return new QueryBuilder(table) },
  auth,
  async rpc(name: string, args: Record<string, any> = {}) {
    const result = await apiRequest(`/rpc/${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify(args) })
    return { data: result.data?.data ?? null, error: result.error }
  },
  functions: {
    async invoke(name: string, options: { body?: any } = {}) {
      const result = await apiRequest(`/functions/${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify(options.body || {}) })
      return { data: result.data?.data ?? null, error: result.error }
    },
  },
  comprobantes,
  cotizaciones,
  whatsapp,
  storage: { from: storageBucket },
}
