export type PrdiffDiff = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** The load that wrote this; the inventory is held under it in the module. */
  gen: number
  number: number
  error?: string
  /** The open file of this load: its index in the inventory and its read. */
  file?: { index: number; status: 'loading' | 'ready' | 'error'; error?: string }
}

declare module 'claude-code' {
  interface PluginState {
    prdiff: {
      diff: PrdiffDiff
      /** The last command's or press's failure, drawn until the next load; '' when none. */
      failure: string
    }
  }
}
