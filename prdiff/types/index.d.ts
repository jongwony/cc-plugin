export type PrdiffDiff = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** The load that wrote this; the inventory is held under it in the module. */
  gen: number
  number: number
  error?: string
  /** The open file of this load: its index in the inventory, the pick that opened it (counting up within the load), its read, and the pick's own fault (a rejected scroll). */
  file?: { index: number; pick: number; status: 'loading' | 'ready' | 'error'; error?: string; fault?: string }
}

declare module 'claude-code' {
  interface PluginState {
    prdiff: {
      diff: PrdiffDiff
    }
  }
}
