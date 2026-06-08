# excalidraw-host (Claude Code plugin)

A Claude Code plugin that packages a **skill** for self-hosting the official
open-source [Excalidraw](https://github.com/excalidraw/excalidraw) whiteboard on your
machine — by cloning the repo and running its **Vite dev server** the way the upstream
README / Development Guide prescribes. This is the developer `yarn` flow, **not** the
Docker path.

## What it does

When you ask Claude Code to "spin up / run / self-host a local Excalidraw server", the
`excalidraw-host` skill triggers and:

1. Pre-flights Node (>=18) and ensures **Yarn classic** (1.22.x) — installing it via
   `npm install -g yarn` if absent (Node 25 ships without corepack).
2. Locates (or creates) an `oss` workspace dir, clones `excalidraw` if absent, reuses
   it if present.
3. Runs `yarn install` at the monorepo root.
4. Starts the Vite dev server **detached** on a configurable port (default 3000),
   logging to a file.
5. **Detects the actually-bound port** from the Vite `Local: http://localhost:PORT/`
   log line — Vite auto-increments on collision (3000 busy -> 3001), so the requested
   port is never assumed.
6. Verifies readiness via `curl` (HTTP 200 + page title contains "Excalidraw").
7. Reports the live URL, log path, and PID.

### Caveats it surfaces

- **Persistence is browser-local only** — scenes live in the browser's `localStorage`;
  there is no server-side storage.
- **Live collaboration is not included** — real-time multiplayer needs a separate
  `excalidraw-room` server.

## The one verified run sequence

```bash
git clone https://github.com/excalidraw/excalidraw   # if not already cloned
cd excalidraw
yarn install                                          # Yarn classic 1.22.x
yarn start --port 3000                                # Vite dev server -> http://localhost:3000
```

(`yarn start` = `yarn --cwd ./excalidraw-app start`, whose own `start` is `yarn && vite`.)

## Usage

- Natural language: "run a local Excalidraw server" / "self-host Excalidraw on port 3030".
- Slash command: `/excalidraw-up [port]`.

## How to install

This plugin lives at this directory. Installing it into your Claude Code config is a
**manual user step** (not performed by the plugin author):

### Option A — install the skill directly

Copy or symlink the skill into your user skills dir:

```bash
# symlink (stays in sync with this repo):
ln -s "$(pwd)/skills/excalidraw-host" ~/.claude/skills/excalidraw-host
# or copy:
cp -R skills/excalidraw-host ~/.claude/skills/
```

### Option B — install as a Claude Code plugin / marketplace

Add this plugin directory to your Claude Code plugin configuration (it follows the
standard layout: `.claude-plugin/plugin.json`, `skills/`, `commands/`). For example,
point a local marketplace entry / `enabledPlugins` at this directory, or use the
plugin install flow:

```
/plugin install <path-to>/excalidraw-host
```

> Note: installing into `~/.claude` (or any user-global config) is a step **you**
> perform — this plugin does not write to your global config.

## Layout

```
excalidraw-host/
├── .claude-plugin/
│   └── plugin.json                       # plugin manifest (name, description, version)
├── skills/
│   └── excalidraw-host/
│       └── SKILL.md                      # the skill (full self-host process)
├── commands/
│   └── excalidraw-up.md                  # /excalidraw-up [port] slash command
└── README.md
```
