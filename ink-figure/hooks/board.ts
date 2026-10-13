// The figure board's instruction: one system-prompt section the model reads while
// the `figureBoard` option is on and the Artifact tool is available to it. The model
// composes and publishes the page; the mod only names the page's file.

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
    'This session keeps the figures it draws on one private Artifact page, so they can be read away from the terminal.',
    'When a reply to the person draws a figure as a ```mermaid or ```math fence, add the figure to that page before writing the reply\'s final text, with the paragraph that leads into it and the time, newest first, keeping the figures already there. A fence shown as an example or as syntax is not a drawn figure.',
    `The page is the file \`${path}\`: publish it with the Artifact tool and republish that same file each time, so its URL stays the one the person keeps beside the session.${isArtifactDeferred ? ' The Artifact tool is deferred: load it through ToolSearch first.' : ''}`,
    'How the page is laid out and how it draws each figure is yours to compose.',
  ].join('\n')
