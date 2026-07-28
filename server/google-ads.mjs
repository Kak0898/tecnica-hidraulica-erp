const DEFAULT_API_VERSION = 'v25'

function digits(value) {
  return String(value || '').replace(/\D/g, '')
}

function requiredConfiguration(env = process.env) {
  return {
    developerToken: String(env.GOOGLE_ADS_DEVELOPER_TOKEN || '').trim(),
    clientId: String(env.GOOGLE_ADS_CLIENT_ID || '').trim(),
    clientSecret: String(env.GOOGLE_ADS_CLIENT_SECRET || '').trim(),
    refreshToken: String(env.GOOGLE_ADS_REFRESH_TOKEN || '').trim(),
    customerId: digits(env.GOOGLE_ADS_CUSTOMER_ID),
    loginCustomerId: digits(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID),
    apiVersion: String(env.GOOGLE_ADS_API_VERSION || DEFAULT_API_VERSION).trim(),
  }
}

export function googleAdsConfiguration(env = process.env) {
  const config = requiredConfiguration(env)
  const missing = []
  if (!config.developerToken) missing.push('GOOGLE_ADS_DEVELOPER_TOKEN')
  if (!config.clientId) missing.push('GOOGLE_ADS_CLIENT_ID')
  if (!config.clientSecret) missing.push('GOOGLE_ADS_CLIENT_SECRET')
  if (!config.refreshToken) missing.push('GOOGLE_ADS_REFRESH_TOKEN')
  if (!config.customerId) missing.push('GOOGLE_ADS_CUSTOMER_ID')
  return { ...config, configured: missing.length === 0, missing }
}

function googleError(payload, fallback) {
  const detail = payload?.error?.details?.[0]?.errors?.[0]?.message
    || payload?.error_description
    || payload?.error?.message
    || payload?.error
  return String(detail || fallback)
}

async function accessToken(config, fetchImpl) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
  })
  const response = await fetchImpl('https://www.googleapis.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.access_token) {
    throw Object.assign(new Error(`Google rechazó la autorización: ${googleError(payload, `HTTP ${response.status}`)}`), { status: 502, code: 'GOOGLE_ADS_AUTH_ERROR' })
  }
  return payload.access_token
}

function campaignType(value) {
  const types = {
    SEARCH: 'busqueda',
    PERFORMANCE_MAX: 'performance_max',
    DISPLAY: 'display',
    VIDEO: 'video',
    SHOPPING: 'shopping',
  }
  return types[String(value || '').toUpperCase()] || 'otro'
}

function campaignStatus(value) {
  const status = String(value || '').toUpperCase()
  if (status === 'ENABLED') return 'habilitada'
  if (status === 'PAUSED') return 'pausada'
  return 'finalizada'
}

function percent(value) {
  const number = Number(value || 0)
  return Math.max(0, Math.min(100, number * 100))
}

export function mapGoogleAdsRows(payload) {
  const batches = Array.isArray(payload) ? payload : [payload]
  const rows = batches.flatMap((batch) => Array.isArray(batch?.results) ? batch.results : [])
  return rows.map((row) => ({
    campaign: {
      googleCampaignId: String(row.campaign?.id || ''),
      name: String(row.campaign?.name || 'Campaña sin nombre'),
      status: campaignStatus(row.campaign?.status),
      type: campaignType(row.campaign?.advertisingChannelType),
    },
    metric: {
      date: String(row.segments?.date || ''),
      impressions: Number(row.metrics?.impressions || 0),
      clicks: Number(row.metrics?.clicks || 0),
      cost: Number(row.metrics?.costMicros || 0) / 1_000_000,
      conversions: Number(row.metrics?.conversions || 0),
      conversionValue: Number(row.metrics?.conversionsValue || 0),
      impressionShare: percent(row.metrics?.searchImpressionShare),
      budgetLostShare: percent(row.metrics?.searchBudgetLostImpressionShare),
    },
  })).filter((row) => row.campaign.googleCampaignId && /^\d{4}-\d{2}-\d{2}$/.test(row.metric.date))
}

export async function fetchGoogleAdsMetrics({ startDate, endDate, fetchImpl = fetch, env = process.env }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
    throw Object.assign(new Error('El rango de fechas para Google Ads no es válido.'), { status: 400, code: 'INVALID_DATE_RANGE' })
  }
  const config = googleAdsConfiguration(env)
  if (!config.configured) {
    throw Object.assign(new Error(`Google Ads aún no está conectado. Faltan: ${config.missing.join(', ')}.`), { status: 503, code: 'GOOGLE_ADS_NOT_CONFIGURED' })
  }

  const token = await accessToken(config, fetchImpl)
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.search_impression_share,
      metrics.search_budget_lost_impression_share
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY segments.date DESC`

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'developer-token': config.developerToken,
  }
  if (config.loginCustomerId) headers['login-customer-id'] = config.loginCustomerId

  const response = await fetchImpl(`https://googleads.googleapis.com/${config.apiVersion}/customers/${config.customerId}/googleAds:searchStream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const requestId = response.headers?.get?.('request-id') || response.headers?.get?.('google-ads-request-id')
    const suffix = requestId ? ` Solicitud Google: ${requestId}.` : ''
    throw Object.assign(new Error(`Google Ads no pudo entregar las métricas: ${googleError(payload, `HTTP ${response.status}`)}.${suffix}`), { status: 502, code: 'GOOGLE_ADS_API_ERROR' })
  }
  return mapGoogleAdsRows(payload)
}

export async function persistGoogleAdsRows(client, { companyId, userId, rows }) {
  const campaignIds = new Set()
  const dates = new Set()
  for (const row of rows) {
    const campaignResult = await client.query(
      `insert into public.google_ads_campanas
         (empresa_id, google_campaign_id, nombre, tipo, estado, created_by)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (empresa_id, google_campaign_id) do update
         set nombre = excluded.nombre,
             tipo = excluded.tipo,
             estado = excluded.estado,
             updated_at = now()
       returning id`,
      [companyId, row.campaign.googleCampaignId, row.campaign.name, row.campaign.type, row.campaign.status, userId],
    )
    const campaignId = campaignResult.rows[0].id
    await client.query(
      `insert into public.google_ads_metricas_diarias
         (empresa_id, campana_id, fecha, impresiones, clics, costo, conversiones,
          valor_conversiones, cuota_impresiones, perdida_presupuesto, fuente, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'api', $11)
       on conflict (campana_id, fecha) do update
         set impresiones = excluded.impresiones,
             clics = excluded.clics,
             costo = excluded.costo,
             conversiones = excluded.conversiones,
             valor_conversiones = excluded.valor_conversiones,
             cuota_impresiones = excluded.cuota_impresiones,
             perdida_presupuesto = excluded.perdida_presupuesto,
             fuente = 'api',
             updated_at = now()`,
      [companyId, campaignId, row.metric.date, Math.round(row.metric.impressions), Math.round(row.metric.clicks), row.metric.cost, row.metric.conversions, row.metric.conversionValue, row.metric.impressionShare, row.metric.budgetLostShare, userId],
    )
    campaignIds.add(campaignId)
    dates.add(row.metric.date)
  }

  for (const date of dates) {
    await client.query(
      `delete from public.google_ads_recomendaciones
        where empresa_id = $1 and fecha = $2 and fuente = 'automatica' and estado = 'pendiente'`,
      [companyId, date],
    )
    await client.query(`select public.generar_recomendaciones_google_ads($1)`, [date])
  }

  return { campaigns: campaignIds.size, metrics: rows.length, dates: dates.size }
}
