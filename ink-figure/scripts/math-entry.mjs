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

// each conversion runs in a document of its own, so no macro, operator, label or
// equation number one fence defines (a failed one included) reaches the next
export const texToSvg = tex => {
  const doc = mathjax.document('', { InputJax: new TeX({ packages: ['base', 'ams'] }), OutputJax: new SVG({ fontCache: 'none' }) })
  return adaptor.firstChild(doc.convert(tex, { display: true }))
}
