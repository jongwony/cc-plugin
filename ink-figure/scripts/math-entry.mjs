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

let input = null
let doc = null

// each conversion starts from fresh equation numbers and labels, as if alone
export const texToSvg = tex => {
  input ??= new TeX({ packages: ['base', 'ams'] })
  doc ??= mathjax.document('', { InputJax: input, OutputJax: new SVG({ fontCache: 'none' }) })
  input.reset()
  return adaptor.firstChild(doc.convert(tex, { display: true }))
}
