export function renderMermaidAscii(text: string, options?: {
  useAscii?: boolean
  paddingX?: number
  paddingY?: number
  boxBorderPadding?: number
  colorMode?: 'none' | 'auto' | 'ansi16' | 'ansi256' | 'truecolor' | 'html'
  theme?: Partial<Record<'fg' | 'border' | 'line' | 'arrow' | 'accent' | 'bg' | 'corner' | 'junction', string>>
}): string
