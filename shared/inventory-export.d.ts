import type { WorkBook } from 'xlsx'

type InventoryRows = Record<string, Record<string, unknown>[]>

export const inventoryExportTables: ReadonlyArray<{ name: string; table: string }>
export function buildInventoryWorkbook(rowsByTable: InventoryRows, company: string): WorkBook
export function downloadInventoryWorkbook(rowsByTable: InventoryRows, company: string, slug: string): void
