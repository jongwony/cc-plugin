export type LiteNode = object

export const adaptor: {
  kind(node: LiteNode): string
  getAttribute(node: LiteNode, name: string): string | null | undefined
  childNodes(node: LiteNode): LiteNode[]
}

export function texToSvg(tex: string): LiteNode
