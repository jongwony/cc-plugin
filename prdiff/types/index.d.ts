export type PrdiffView = { kind: 'list' } | { kind: 'diff'; number: number }

export type PrdiffPr = {
  number: number
  title: string
  headRefName: string
  baseRefName: string
  author: string
  isDraft: boolean
}

export type PrdiffList = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  gen: number
  repo?: string
  current?: number
  items: PrdiffPr[]
  error?: string
}

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
      view: PrdiffView
      list: PrdiffList
      diff: PrdiffDiff
      top: number
    }
  }
}
