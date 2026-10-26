export type PrdiffDiff = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** The load that wrote this; the parsed diff is held under it in the module. */
  gen: number
  number: number
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    prdiff: {
      diff: PrdiffDiff
      top: number
    }
  }
}
