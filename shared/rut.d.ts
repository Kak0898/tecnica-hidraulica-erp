export type RutStatus = 'empty' | 'incomplete' | 'valid' | 'invalid'
export function cleanRut(value: unknown): string
export function calculateRutVerifier(body: unknown): string
export function isValidRut(value: unknown): boolean
export function formatRut(value: unknown): string
export function rutStatus(value: unknown): RutStatus
