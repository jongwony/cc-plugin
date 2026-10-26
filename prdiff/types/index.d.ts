export type PrdiffDiff = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** The load that wrote this; the inventory is held under it in the module. */
  gen: number
  /** The module instance that wrote it; another instance's state is not loaded in this one. */
  owner?: string
  number: number
  error?: string
  /** The open file of this load: its index in the inventory, the pick that opened it (counting up within the load), and its read. */
  file?: { index: number; pick: number; status: 'loading' | 'ready' | 'error'; error?: string }
}

declare module 'claude-code' {
  interface PluginState {
    prdiff: {
      diff: PrdiffDiff
    }
  }
}
