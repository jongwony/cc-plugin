// The figure board's instruction: one system-prompt section the model reads while
// the `figureBoard` option is on and the request offers the Artifact tool. The model
// composes and publishes the page; the mod only names the page's file.

export const BOARD_SECTION_ID = 'ink-figure:board'

// the page's file for one session: under the Claude config directory, outside any
// working tree, named by the session id so a resumed session finds the same file
export const boardPathOf = (configDir: string, sessionId: string): string => `${configDir.replace(/\/+$/, '')}/ink-figure/boards/${sessionId}.html`

export const boardSectionOf = (path: string): string =>
  [
    '# Figure board',
    '',
    'This session keeps its figures on one private Artifact page, so they can be read away from the terminal.',
    'When a reply you write to the person carries a ```mermaid or ```math fence, add each of its figures to that page before the turn ends, with the paragraph that led into the figure and when it was added, newest first, keeping the figures already there.',
    `The page is the file \`${path}\`: publish it with the Artifact tool, and republish that same file each time so its URL stays the one the person keeps beside the session.`,
    'How the page is laid out and how it draws each figure is yours to compose.',
  ].join('\n')
