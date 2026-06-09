---
name: excalidraw-host
description: Use when the user wants to spin up, run, start, or self-host a local Excalidraw whiteboard server from the official open-source repo (clone + Vite dev server, no Docker). Handles cloning, the yarn-classic toolchain, a configurable port, port-collision detection, and readiness verification.
---

# Self-Host Excalidraw (Vite dev server, no Docker)

Spin up the official open-source [Excalidraw](https://github.com/excalidraw/excalidraw)
whiteboard locally by cloning the repo and running its Vite dev server exactly as the
upstream README / Development Guide prescribes. This is **not** the Docker path — it is
the `yarn install` + `yarn start` developer flow, which serves the editor on
`http://localhost:3000`.

**Announce at start:** "I'm using the excalidraw-host skill to bring up a local Excalidraw server."

## What you get / caveats (tell the user these)

- A locally-running Excalidraw editor at `http://localhost:<PORT>` (default 3000).
- **Persistence is browser-local only.** The self-hosted web app stores scenes in the
  browser's `localStorage` — there is **no server-side storage**. Clearing the browser
  or switching browsers loses local scenes. Use the app's "Save to..." / export to a
  file for durable storage.
- **Live collaboration is NOT included.** Real-time multiplayer requires a separate
  `excalidraw-room` server (https://github.com/excalidraw/excalidraw-room). This skill
  only brings up the single-user editor.

## Ground-truth facts (verified against the repo)

- Repo: `https://github.com/excalidraw/excalidraw` (MIT, a Yarn **monorepo**).
- `package.json`: `"packageManager": "yarn@1.22.22"` (Yarn **CLASSIC**, 1.x),
  `"engines": { "node": ">=18.0.0" }`.
- Authoritative run sequence (from root `package.json` scripts):
  `yarn install` then `yarn start`. `start` = `yarn --cwd ./excalidraw-app start`,
  and `excalidraw-app`'s own `start` = `yarn && vite`. The dev server is **Vite v5**,
  default port **3000**.

## Parameters

- `PORT` — desired port (default `3000`). Vite reads `--port`.
- `WORKSPACE` — the "oss" workspace dir to clone into. Default: locate an existing
  `oss` dir (e.g. `~/Downloads/github/oss`), else create one.

## Steps

### 0. Pre-flight: Node and yarn-classic

Excalidraw needs Node >=18 and Yarn **classic** (1.x). Node 25 ships **without**
corepack, and `yarn` may be absent on PATH — handle both.

```bash
node --version   # must be >= v18
# Ensure yarn classic (1.22.x). If missing, install it globally via npm:
if ! command -v yarn >/dev/null 2>&1; then
  echo "yarn not found — installing yarn classic via npm"
  npm install -g yarn        # gives yarn 1.22.x
fi
yarn --version    # expect 1.22.x  (classic). Do NOT use yarn berry / 2+.
```

If `node --version` is below v18, stop and tell the user to upgrade Node first.

### 1. Locate / create the oss workspace

```bash
# Prefer an existing workspace dir; fall back to creating one.
WORKSPACE="${WORKSPACE:-$HOME/Downloads/github/oss}"
mkdir -p "$WORKSPACE"
echo "Workspace: $WORKSPACE"
```

### 2. Clone the repo if absent, reuse if present

```bash
REPO_DIR="$WORKSPACE/excalidraw"
if [ -d "$REPO_DIR/.git" ]; then
  echo "Reusing existing clone at $REPO_DIR"
else
  git clone https://github.com/excalidraw/excalidraw "$REPO_DIR"
fi
cd "$REPO_DIR"
```

### 3. Install dependencies

```bash
# From the repo root. Yarn classic resolves the whole monorepo's workspaces.
yarn install
```

This is the slow step (monorepo install). Let it finish before starting the server.

### 4. Start the dev server detached on a configurable port

Run the server in the **background** so it survives the turn, log to a file, and
report the log path. Pass `--port` so the port is configurable. (The root `start`
script forwards args to Vite via the `excalidraw-app` workspace.)

```bash
PORT="${PORT:-3000}"
LOG="$REPO_DIR/excalidraw-dev.log"
# Detached, surviving background process; logs captured for port detection.
nohup yarn start --port "$PORT" > "$LOG" 2>&1 &
SERVER_PID=$!
echo "Started Excalidraw dev server (pid $SERVER_PID), logging to $LOG"
```

### 5. Detect the ACTUAL bound port (port-collision gotcha)

**Do not assume the port.** If `$PORT` is already in use, Vite **auto-increments**
(e.g. 3000 busy -> it binds 3001). Parse the real port from the Vite
`Local: http://localhost:PORT/` line in the log instead of trusting `$PORT`.

```bash
# Wait for Vite to print its "Local:" line, then extract the bound port.
BOUND_PORT=""
for i in $(seq 1 60); do
  BOUND_PORT=$(grep -oE 'Local:[[:space:]]+https?://localhost:[0-9]+' "$LOG" \
                 | grep -oE '[0-9]+$' | tail -1)
  [ -n "$BOUND_PORT" ] && break
  sleep 1
done
if [ -z "$BOUND_PORT" ]; then
  echo "Could not detect bound port; inspect the log:"; tail -40 "$LOG"; exit 1
fi
echo "Vite bound to port $BOUND_PORT"
```

### 6. Verify readiness via curl

Confirm the server actually answers HTTP 200 and serves the Excalidraw page (title
contains "Excalidraw").

```bash
URL="http://localhost:$BOUND_PORT"
ok=0
for i in $(seq 1 30); do
  code=$(curl -s -o /tmp/excalidraw-check.html -w '%{http_code}' "$URL" || true)
  if [ "$code" = "200" ] && grep -qi 'Excalidraw' /tmp/excalidraw-check.html; then
    ok=1; break
  fi
  sleep 1
done
if [ "$ok" = "1" ]; then
  echo "READY: Excalidraw is serving at $URL"
else
  echo "Server not ready (last HTTP code: $code). Inspect log:"; tail -40 "$LOG"
fi
```

### 7. Report to the user

Report:
- The live URL: `http://localhost:<BOUND_PORT>`.
- That the bound port may differ from the requested one (collision auto-increment).
- The server log path (`$LOG`) and PID, so they can tail it or stop it
  (`kill <pid>`).
- The persistence + collaboration caveats from the top of this skill.

## Stopping the server

```bash
# Find and stop the dev server (adjust the port to the bound one):
lsof -ti tcp:<BOUND_PORT> | xargs -r kill
# or kill the recorded PID directly.
```

## Troubleshooting

- **"yarn: command not found"** — Node 25 has no corepack; run `npm install -g yarn`
  (installs classic 1.22.x). Re-run from step 0.
- **Server didn't print a Local: line** — `tail -40 "$LOG"`. A failed `yarn install`
  is the usual cause; re-run step 3.
- **Wrong port reported** — always trust the parsed `Local:` line over the requested
  `$PORT`; Vite silently moves to the next free port.
