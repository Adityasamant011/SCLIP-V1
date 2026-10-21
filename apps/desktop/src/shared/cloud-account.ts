export const SCLIP_MANAGED_MODEL = 'z-ai/glm-5.3-flash'
export interface CloudAccountView {
  configured: boolean
  signedIn: boolean
  email?: string
  plan?: 'none' | 'byok' | 'managed'
  paidUntil?: string | null
  active?: boolean
  blocked?: boolean
  managedEnabled?: boolean
  sharedStockEnabled?: boolean
  credit?: { allowance: number; spent: number; reserved: number; ends_at: string } | null
  defaultModel?: string
}
