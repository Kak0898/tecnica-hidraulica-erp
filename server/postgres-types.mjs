export const POSTGRES_DATE_OID = 1082

export function parsePostgresDate(value) {
  return value
}

export function configurePostgresTypes(types) {
  types.setTypeParser(POSTGRES_DATE_OID, parsePostgresDate)
}
