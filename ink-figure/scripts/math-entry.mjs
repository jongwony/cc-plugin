// The MathJax surface hooks/math.ts imports from hooks/vendor/math/mathjax.js:
// TeX (base + ams) to an SVG lite-DOM node, and the adaptor that reads it.
import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js'
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js'

export const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)

// an mspace a `\\` or `\newline` became where no table takes it as a row break
const forcedBreakIn = node => {
  if (node.isKind?.('mspace') && node.attributes.get('linebreak') === 'newline') return true
  return (node.childNodes ?? []).some(child => child && forcedBreakIn(child))
}

// Each conversion runs in a document of its own, so no macro, operator, label or
// equation number one fence defines (a failed one included) reaches the next.
// Throws where the TeX holds a forced line break: MathJax 3 lays it out as an
// empty space, so the rows would run together on one line.
export const texToSvg = tex => {
  const input = new TeX({ packages: ['base', 'ams'] })
  let forced = false
  input.postFilters.add(({ data }) => {
    forced = forcedBreakIn(data.root)
  })
  const doc = mathjax.document('', { InputJax: input, OutputJax: new SVG({ fontCache: 'none' }) })
  const svg = adaptor.firstChild(doc.convert(tex, { display: true }))
  if (forced) throw new Error('a line break MathJax draws as a space')
  return svg
}
