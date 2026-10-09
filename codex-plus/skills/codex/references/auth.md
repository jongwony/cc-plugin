# Codex CLI login

Read once a `codex` command has failed on its login — a 401, `refresh_token_reused`,
"log out and sign in again", or no login at all — the failure has been reported, and
the user has taken up signing in again.

- To read the current login: `codex login status` ("Logged in using ChatGPT" when a
  ChatGPT login is present).
- When the error is 401 `refresh_token_reused`: the stored ChatGPT login is dead and
  no retry revives it — sign in again by device code (next bullet). A ChatGPT refresh
  token rotates on use, so a login restored into several machines from one shared
  snapshot (a base64 `auth.json` in an environment variable such as
  `CODEX_AUTH_JSON_B64`) survives at most one refresh among them.
- To sign in from a shell with no browser: run `codex login --device-auth` in the
  background; read the URL (`https://auth.openai.com/codex/device`) and the one-time
  code from its output; give both to the user, noting the code expires in 15 minutes;
  wait for the command to exit 0 ("Successfully logged in"); confirm with
  `codex login status`. The user approves in their own browser, so no token passes
  through the conversation.
- When the approval page says device code login must be enabled in ChatGPT's security
  settings: the user enables it on chatgpt.com in a web browser, under Settings — on a
  personal plan it is listed beneath the Developer mode (개발자 모드) settings, as
  "Codex, Excel, PowerPoint 및 Word에서 기기 코드 로그인 활성화" in the Korean UI; the
  ChatGPT iOS app's Security screen did not show it. Then rerun
  `codex login --device-auth` and hand over the new code.
- When the account is a workspace (business) account: a workspace admin enables device
  code login in the workspace permissions. Per OpenAI's docs
  (https://developers.openai.com/codex/auth), not yet exercised; the same page says
  codex falls back to browser login when device code login is not enabled server-side.
- When a new machine or container starts: the login is per machine. A device login
  lives in `$CODEX_HOME/auth.json` (default `~/.codex/auth.json`) on this machine only,
  and a setup that restores `auth.json` from a shared snapshot whenever it is absent
  restores the dead login again in every fresh container — sign in again there.
- When the user wants new containers to start logged in: two options, both their
  choice and neither yet exercised. Replace the snapshot with a fresh `auth.json`
  — it rotates like the last one, so it dies again after the first refresh among the
  containers sharing it. Or log in with an API key —
  `printenv OPENAI_API_KEY | codex login --with-api-key` — billed by API usage, with
  no refresh token to rotate.
