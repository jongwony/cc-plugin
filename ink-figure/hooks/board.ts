// The figure board's instruction: one system-prompt section the model reads while
// the `figureBoard` option is on and the Artifact tool is available to it. The model
// chooses the board's medium and keeps it; its title carries the session's short id when
// the engine gives one.

export const BOARD_SECTION_ID = 'ink-figure:board'

// the session's short id: the first 8 characters, enough to tell sessions apart
export const shortIdOf = (sessionId: string | undefined): string | undefined => {
  const id = sessionId?.trim().slice(0, 8)
  return id ? id : undefined
}

export const boardSectionOf = (isArtifactDeferred = false, sessionId?: string): string => {
  const id = shortIdOf(sessionId)
  return [
    '# Figure board',
    '',
    'This session keeps the figures it draws in one place the person can open away from the terminal.',
    'When a reply to the person draws a figure as a ```mermaid or ```math fence, add the figure there before writing the reply\'s final text, with the paragraph that leads into it and the time, newest first, keeping what is already there. A fence shown as an example or as syntax is not a drawn figure.',
    `The medium and how it presents each figure are yours to choose so the figure is understood, unless the person named a medium; keep using the same place for the whole session, updating it at the link it already has.${isArtifactDeferred ? ' The Artifact tool is deferred: load it through ToolSearch first.' : ''}`,
    ...(id ? [`The place's title ends with this session's id, \`· ${id}\`, so it is told apart from other sessions' boards.`] : []),
  ].join('\n')
}
