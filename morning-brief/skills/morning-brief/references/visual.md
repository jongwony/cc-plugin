# Visual page

Read at steps 4 and 6 of the procedure, and by the `morning-brief:refresh` skill.

## Figures

- The page is composed with the brief, section by section. For each section, the run finds by drawing the mix of text and figures that lowers the reader's load while still giving enough understanding. A figure sits beside the item or section it draws.
- A figure is drawn only for a relation among items that the text states and its layout does not already show: their order in time, who waits on whom, how measured quantities compare.
- Where a figure carries values, the page text drops them and keeps what changes the next choice. The page and the saved markdown may differ in wording; the markdown keeps compared values compactly in its text.
- Values the text compares are drawn as lengths, each value beside its length and the scale stated. One kind shares one scale in one figure; another kind sits beside as a value or in its own figure. A derived quantity a judgment rests on appears beside its inputs.
- Each item on the page has an address. Every figure element comes from a verified item and points to that address.
- An element, and any relation a figure's layout invites, keep the standing the text gives them, shown by more than color.
- Before publishing, each element is checked against its item, and where the host can show the page, it is looked at once.

## Page

- Before the page is written, the host's artifact design guidance (the `artifact-design` skill, or the Artifact tool's quickstart) and its `dataviz` skill are loaded where the host offers them, and followed: every figure takes dataviz's method for form, color, marks and labels. Where they are not offered, a figure stays plain and legible.
- Status colors mark status only. By the user's choice, and in place of dataviz's status palette, done, done with a remainder, and new take dataviz's categorical slots 3, 7 and 5 (aqua, violet, magenta), with each mode's own steps; unchanged takes the track neutral. Because that set is not validated for every pair, each status always carries a glyph and a label beside its color. Emphasis inside a figure takes a color outside these.
- Density: the page spans about 80% of the viewport, and the full width inside the side gutter below about 700px; body text is 16px at a line height near 1.55, with tight gaps between blocks.
- A figure stays whole at any width: it re-lays out to fit, without scrolling inside itself or clipping a label.
- Text wraps where its language breaks: a language read in word units keeps each word whole.
- One page serves every run, and its address is kept in `<dir>/artifact-url`. The page is a view of this run's brief alone, with the same day's refresh checkpoints laid over it once `morning-brief:refresh` runs: the previous page's content already entered through step 0. After a refusal that hands back the live page, the run publishes this brief whole to the same address; such a refusal is not "cannot write". A new page is made, and its address written, only where none exists at the address or the run cannot write to it.
- The page stays private; the run shares it with no one.
