(function () {
  const apiUrl = String(window.ERP_API_URL || '/api').replace(/\/$/, '');
  const sessionKey = 'intranet_session';
  let frame;
  try { frame = window.parent.intranetFrame; }
  catch { /* El módulo también se puede abrir en otra ventana. */ }

  if (frame) {
    for (const type of ['pointerdown', 'keydown', 'wheel', 'input', 'touchmove']) {
      window.addEventListener(type, (event) => {
        if (event.isTrusted) frame.recordSessionActivity();
      }, { capture: true, passive: true });
    }
  }

  function session() {
    if (frame) return frame.getSession();
    try { return JSON.parse(localStorage.getItem(sessionKey) || 'null'); }
    catch { return null; }
  }

  async function request(path, body) {
    if (frame) return frame.request(path, body);
    const current = session();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`${apiUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(current?.access_token ? { Authorization: `Bearer ${current.access_token}` } : {}),
        },
        body: JSON.stringify(body || {}),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return { data: null, error: { message: payload?.error || `Error HTTP ${response.status}`, code: payload?.code || `HTTP_${response.status}` } };
      if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'data')) throw new Error('Respuesta inválida');
      return { data: payload, error: null };
    } catch {
      return { data: null, error: { message: navigator.onLine ? 'El servidor de intranet no respondió correctamente.' : 'Sin conexión a internet o a la red.', code: 'NETWORK_ERROR' } };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  class Query {
    constructor(table) {
      this.table = table;
      this.action = 'select';
      this.selection = '*';
      this.payload = null;
      this.filters = [];
      this.orders = [];
      this.rowLimit = null;
      this.singleMode = null;
    }
    select(columns='*') { this.selection = columns; return this; }
    insert(payload) { this.action = 'insert'; this.payload = payload; return this; }
    update(payload) { this.action = 'update'; this.payload = payload; return this; }
    delete() { this.action = 'delete'; return this; }
    eq(column, value) { this.filters.push({column, operator:'eq', value}); return this; }
    order(column, options={}) { this.orders.push({column, ascending:options.ascending, nullsFirst:options.nullsFirst}); return this; }
    limit(value) { this.rowLimit = value; return this; }
    single() { this.singleMode = 'single'; return this; }
    maybeSingle() { this.singleMode = 'maybe'; return this; }
    async execute() {
      const result = await request('/data/query', {
        table:this.table, action:this.action, select:this.selection,
        payload:this.payload, filters:this.filters, orders:this.orders,
        limit:this.rowLimit, offset:0,
      });
      if (result.error) return {data:null, error:result.error};
      const rows = result.data?.data || [];
      if (this.singleMode) {
        if (rows.length === 1) return {data:rows[0], error:null};
        if (this.singleMode === 'maybe' && rows.length === 0) return {data:null, error:null};
        return {data:null, error:{message:rows.length ? 'La consulta devolvió más de una fila.' : 'La consulta no devolvió filas.', code:'PGRST116'}};
      }
      return {data:rows, error:null};
    }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
  }

  window.intranetApi = {
    from(table) { return new Query(table); },
    auth: { async getSession() { return {data:{session:session()}, error:null}; } },
    async rpc(name, args={}) {
      const result = await request(`/rpc/${encodeURIComponent(name)}`, args);
      return {data:result.data?.data ?? null, error:result.error};
    },
  };
})();
