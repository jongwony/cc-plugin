# CDP endpoints and launch reference

Operative facts a CDP client needs against the Chromium this skill launches (or a native launch on macOS).

## HTTP endpoints (`http://127.0.0.1:${PORT}`)

```
GET /json/list                → [{id, type, title, url, webSocketDebuggerUrl}]
GET /json/version             → {Browser, Protocol-Version, V8-Version}
GET /json/new?{url}           → {id, ...}  (open new tab)
GET /json/close/{targetId}    → "Target is closing"
GET /json/activate/{targetId} → "Target activated"
```

## Headed / headless detection

- `Browser` field of `/json/version` contains `HeadlessChrome` → headless instance; anything else → headed.
- Headless instances are out of policy for this skill: silent execution without user visibility. `claude --chrome` may launch one — check `/json/version` before relying on it.

## macOS native launch (no bootstrap; use instead of this skill on Darwin)

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --user-data-dir="$HOME/.cache/chrome-cdp-profile" --remote-debugging-port=9222
```

- `--user-data-dir` is required: since Chrome 136 the port flag is ignored on the platform-default profile, so the command without it opens no port and reports no error. Any non-default path works.
- A Chromium fork may still honour the flag on its default profile; that is fork behaviour and can disappear on update — do not build on it.
- The dedicated profile starts empty (no logins, extensions, tabs). To drive a browser already in use, attach to it instead of launching a new instance.
