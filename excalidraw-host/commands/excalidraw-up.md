---
description: Clone (if needed) and start a local self-hosted Excalidraw whiteboard server via its Vite dev server. Optional port arg.
argument-hint: "[port]"
---

# /excalidraw-up

Bring up a local self-hosted Excalidraw whiteboard server using the
**excalidraw-host** skill.

Optional argument: a port number. `$1` (if provided) is the desired `PORT`;
otherwise default to `3000`.

## Do this

Invoke the `excalidraw-host` skill and follow its steps end to end:

1. Pre-flight Node (>=18) and ensure yarn **classic** (1.22.x); if `yarn` is missing,
   `npm install -g yarn`.
2. Locate/create the `oss` workspace; clone `excalidraw` if absent, reuse if present.
3. `yarn install` at the repo root.
4. Start the Vite dev server **detached** (`nohup ... &`) on the requested port
   (`$1` or `3000`), logging to a file.
5. Parse the actual bound port from the Vite `Local: http://localhost:PORT/` log line
   (port may auto-increment on collision — never assume).
6. Verify readiness with `curl` (HTTP 200 + page title contains "Excalidraw").
7. Report the live URL, the bound port, the log path/PID, and the caveats
   (browser-local persistence only; live collaboration needs a separate
   excalidraw-room server).
