(function () {
  const apiUrl = String(window.ERP_API_URL || '/api').replace(/\/$/, '');
  const sessionKey = 'intranet_session';

  function session() {
    try { return JSON.parse(localStorage.getItem(sessionKey) || 'null'); }
    catch { return null; }
  }

  async function request(path, body) {
    const current = session();
    const response = await fetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(current?.access_token ? { Authorization: `Bearer ${current.access_token}` } : {}),
      },
      body: JSON.stringify(body || {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { data: null, error: { message: payload.error || `Error HTTP ${response.status}`, code: payload.code || `HTTP_${response.status}` } };
    return { data: payload, error: null };
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
