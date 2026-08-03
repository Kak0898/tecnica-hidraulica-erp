const API_URL = String(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
const SESSION_KEY = 'intranet_session'

type ApiError = { message: string; code?: string; name?: string }
type SessionUser = { id: string; email?: string; user_metadata?: Record<string, any> }
type Session = { access_token: string; token_type?: string; user: SessionUser }

let currentSession: Session | null = loadSession()
const authListeners = new Set<(event: string, session: Session | null) => void>()

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

async function apiRequest(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {})
  if (currentSession?.access_token) headers.set('Authorization', `Bearer ${currentSession.access_token}`)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(`${API_URL}${path}`, { ...options, headers, signal: options.signal || controller.signal })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      if (response.status === 401 && currentSession) {
        saveSession(null)
        emitAuth('SIGNED_OUT')
      }
      return { data: null, error: errorFrom(payload, response.status), response }
    }
    return { data: payload, error: null, response }
  } catch (cause) {
    const timedOut = cause instanceof DOMException && cause.name === 'AbortError'
    return {
      data: null,
      error: {
        message: timedOut ? 'La operación tardó demasiado. Revisa la conexión y vuelve a intentarlo.' : cause instanceof Error ? cause.message : 'No fue posible contactar la API.',
        code: timedOut ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
        name: 'IntranetApiFetchError',
      },
      response: null,
    }
  } finally {
    window.clearTimeout(timeout)
  }
}

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
    })
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
    return { data: { session: currentSession }, error: null }
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const result = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    if (result.error) return { data: { session: null, user: null }, error: result.error }
    saveSession(result.data.session)
    emitAuth('SIGNED_IN')
    return { data: { session: currentSession, user: currentSession?.user || null }, error: null }
  },

  async signOut() {
    saveSession(null)
    emitAuth('SIGNED_OUT')
    return { error: null }
  },

  async updateUser(attributes: { password?: string; data?: Record<string, any> }) {
    const result = await apiRequest('/auth/user', { method: 'PATCH', body: JSON.stringify(attributes) })
    if (result.error) return { data: { user: null }, error: result.error }
    if (result.data.session) saveSession(result.data.session)
    else if (currentSession && result.data.user) saveSession({ ...currentSession, user: result.data.user })
    emitAuth('USER_UPDATED')
    return { data: { user: result.data.user }, error: null }
  },

  async resetPasswordForEmail(email: string, _options?: any) {
    const result = await apiRequest('/auth/request-reset', { method: 'POST', body: JSON.stringify({ email }) })
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
}

const cotizaciones = {
  async importRows(rows: Record<string, any>[], fileName: string) {
    const result = await apiRequest('/cotizaciones/import', { method: 'POST', body: JSON.stringify({ rows, file_name: fileName }) })
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
      const result = await apiRequest(`/storage/${encodeURIComponent(bucket)}/signed-url`, { method: 'POST', body: JSON.stringify({ path, expiresIn }) })
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
  storage: { from: storageBucket },
}
