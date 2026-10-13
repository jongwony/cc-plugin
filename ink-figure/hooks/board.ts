// The figure board's instruction: one system-prompt section the model reads while
// the `figureBoard` option is on and the Artifact tool is available to it. The model
// chooses the board's medium and keeps it; the mod only names the file a page
// published from a file uses.

export const BOARD_SECTION_ID = 'ink-figure:board'

// the config directory: CLAUDE_CONFIG_DIR, else .claude under the home directory;
// null when neither gives an absolute path
export const configDirOf = (env: { claudeConfigDir?: string; home?: string; userProfile?: string }): string | null => {
  const absolute = (path: string | undefined) => (path !== undefined && (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) ? path : undefined)
  const config = absolute(env.claudeConfigDir)
  if (config !== undefined) return config
  const home = absolute(env.home) ?? absolute(env.userProfile)
  return home === undefined ? null : `${home.replace(/[\\/]+$/, '')}/.claude`
}

// the page's file for one session, named by the session id
export const boardPathOf = (configDir: string, sessionId: string): string => `${configDir.replace(/[\\/]+$/, '')}/ink-figure/boards/${sessionId}.html`

export const boardSectionOf = (path: string, isArtifactDeferred = false): string =>
  [
    '# Figure board',
    '',
    'This session keeps the figures it draws in one place the person can open away from the terminal.',
    'When a reply to the person draws a figure as a ```mermaid or ```math fence, add the figure there before writing the reply\'s final text, with the paragraph that leads into it and the time, newest first, keeping what is already there. A fence shown as an example or as syntax is not a drawn figure.',
    'The medium and how it presents each figure are yours to choose so the figure is understood, unless the person named a medium; keep using the same place for the whole session so its link holds.',
    `A page published from a file uses \`${path}\` and is republished from that same file.${isArtifactDeferred ? ' The Artifact tool is deferred: load it through ToolSearch first.' : ''}`,
  ].join('\n')
