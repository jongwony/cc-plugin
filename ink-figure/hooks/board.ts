// The figure board's instruction: one system-prompt section the model reads while
// the `figureBoard` option is on and the Artifact tool is available to it. The model
// chooses the board's medium and keeps it.

export const BOARD_SECTION_ID = 'ink-figure:board'

export const boardSectionOf = (isArtifactDeferred = false): string =>
  [
    '# Figure board',
    '',
    'This session keeps the figures it draws in one place the person can open away from the terminal.',
    'When a reply to the person draws a figure as a ```mermaid or ```math fence, add the figure there before writing the reply\'s final text, with the paragraph that leads into it and the time, newest first, keeping what is already there. A fence shown as an example or as syntax is not a drawn figure.',
    `The medium and how it presents each figure are yours to choose so the figure is understood, unless the person named a medium; keep using the same place for the whole session, updating it at the link it already has.${isArtifactDeferred ? ' The Artifact tool is deferred: load it through ToolSearch first.' : ''}`,
  ].join('\n')

// The line the turn-end report carries while the option is on and the section did not
// go in: the gate's reason (undefined: the main loop's prompt was never composed), and
// what session.start said of the session.
export const boardLineOf = (gate: string | null | undefined, start: string): string | null =>
  gate === null
    ? null
    : `[ink-figure] The figure board is on, but its section was not added to your system prompt: ${gate ?? 'prompt.compose did not run for this session'}${start ? ` (session.start: ${start})` : ''}.`
