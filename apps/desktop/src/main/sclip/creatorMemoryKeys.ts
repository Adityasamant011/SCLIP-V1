import { createHash } from 'node:crypto'
import type { CreatorPreference, StyleScope } from '../../shared/creator-style'

// Fixed-size membership filter. False positives conservatively reject a replay
// or old controlled wording; they never create positive evidence or an edit.
const BYTES = 1024
export const emptyFilter = () => '00'.repeat(BYTES)
const positions = (key: string) => {
  const bytes = createHash('sha256').update(key).digest()
  return [0, 4, 8, 12].map(n => bytes.readUInt32BE(n) % (BYTES * 8))
}
export function filterHas(filter: string, key: string) {
  const bytes = Buffer.from(filter, 'hex')
  return positions(key).every(n => !!(bytes[n >> 3]! & (1 << (n & 7))))
}
export function filterAdd(filter: string, key: string) {
  const bytes = Buffer.from(filter || emptyFilter(), 'hex')
  for (const n of positions(key)) bytes[n >> 3] = bytes[n >> 3]! | (1 << (n & 7))
  return bytes.toString('hex')
}
export function filterUnion(a: string, b: string) {
  const left = Buffer.from(a, 'hex'), right = Buffer.from(b, 'hex')
  for (let i = 0; i < BYTES; i++) left[i] = left[i]! | right[i]!
  return left.toString('hex')
}
export const validFilter = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]+$/.test(value) && value.length === BYTES * 2
export const controlKey = (scope: StyleScope, text: string) => JSON.stringify([scope, text.trim()])
export const preferenceKey = (p: Pick<CreatorPreference, 'scope' | 'hypothesis' | 'dimension' | 'origin' | 'applicability' | 'exceptionTo'>) => JSON.stringify([p.scope, p.hypothesis, p.dimension, p.origin, p.applicability ?? '', p.exceptionTo ?? ''])
