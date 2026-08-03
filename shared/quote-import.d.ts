export type NormalizedQuoteImport = {
  valid: boolean
  errors: string[]
  sourceRow: number
  data: Record<string, any>
}

export function normalizeQuoteImportRow(source: Record<string, any>, context?: Record<string, any>): NormalizedQuoteImport
export function quoteImportLabel(quote: Record<string, any>): string
