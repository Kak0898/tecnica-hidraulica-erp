import assert from 'node:assert/strict'
import test from 'node:test'
import { googleAdsConfiguration, mapGoogleAdsRows } from './google-ads.mjs'

test('informa exactamente la configuración faltante de Google Ads', () => {
  const status = googleAdsConfiguration({ GOOGLE_ADS_CLIENT_ID: 'cliente', GOOGLE_ADS_CUSTOMER_ID: '123-456-7890' })
  assert.equal(status.configured, false)
  assert.equal(status.customerId, '1234567890')
  assert.deepEqual(status.missing, ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN'])
})

test('convierte la respuesta de Google Ads a campañas y métricas internas', () => {
  const rows = mapGoogleAdsRows([{ results: [{
    campaign: { id: '1234', name: 'Servicio hidráulico', status: 'ENABLED', advertisingChannelType: 'SEARCH' },
    segments: { date: '2026-07-28' },
    metrics: { impressions: '100', clicks: '9', costMicros: '12500000', conversions: 2.5, conversionsValue: 40000, searchImpressionShare: 0.42, searchBudgetLostImpressionShare: 0.15 },
  }] }])
  assert.deepEqual(rows[0], {
    campaign: { googleCampaignId: '1234', name: 'Servicio hidráulico', status: 'habilitada', type: 'busqueda' },
    metric: { date: '2026-07-28', impressions: 100, clicks: 9, cost: 12.5, conversions: 2.5, conversionValue: 40000, impressionShare: 42, budgetLostShare: 15 },
  })
})
