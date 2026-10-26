export type PrdiffDiff = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** The load that wrote this; the inventory is held under it in the module. */
  gen: number
  number: number
  error?: string
}

export type PrdiffFile = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** The read that wrote this. */
  gen: number
  /** The file's index in the PR's inventory. */
  index: number
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    prdiff: {
      diff: PrdiffDiff
      file: PrdiffFile
    }
  }
}
