export type LiteNode = object

export const adaptor: {
  kind(node: LiteNode): string
  getAttribute(node: LiteNode, name: string): string | null | undefined
  childNodes(node: LiteNode): LiteNode[]
  allAttributes(node: LiteNode): { name: string; value: string }[]
  setAttribute(node: LiteNode, name: string, value: string): void
}

export function texToSvg(tex: string): LiteNode
