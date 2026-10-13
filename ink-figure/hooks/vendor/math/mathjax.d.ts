export type LiteNode = object

export const adaptor: {
  kind(node: LiteNode): string
  getAttribute(node: LiteNode, name: string): string | null | undefined
  childNodes(node: LiteNode): LiteNode[]
  allAttributes(node: LiteNode): { name: string; value: string }[]
  setAttribute(node: LiteNode, name: string, value: string): void
  removeAttribute(node: LiteNode, name: string): void
  outerHTML(node: LiteNode): string
}

export function texToSvg(tex: string): LiteNode
