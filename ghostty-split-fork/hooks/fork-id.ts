const FORK_STATES = ['session running', 'session waiting for a prompt']

// The id in /fork's confirmation, `<local-command-stdout><state> · [<name> · ]<8 hex>[ · <chip>]</local-command-stdout>`
// on one line, or undefined.
export const forkId = (text: string) => {
  const body = text.match(/^<local-command-stdout>([^\n]*)<\/local-command-stdout>$/)?.[1]
  if (body === undefined) return undefined
  const segments = body.trim().split(' · ')
  if (!FORK_STATES.includes(segments[0] ?? '')) return undefined
  return segments.slice(1).filter(segment => /^[0-9a-f]{8}$/.test(segment)).pop()
}
