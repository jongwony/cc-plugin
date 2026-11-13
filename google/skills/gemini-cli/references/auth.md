# Gemini CLI authentication

Read when `gemini-run.sh` stops on an auth-method mismatch, or a run fails on authentication.

- **A selected auth method overrides the key.** In headless mode the CLI uses the auth method a
  settings file selects before it looks at `GEMINI_API_KEY`. The script therefore checks the user
  settings file (`$GEMINI_CLI_HOME/.gemini/settings.json`), the project file
  (`.gemini/settings.json` in the `-C` directory) and the system settings file, and stops when any
  selects a method other than `gemini-api-key`, naming the file.
- **The user settings file is the skill's own by default.** With `GEMINI_CLI_HOME` unset the
  script creates `${XDG_STATE_HOME:-~/.local/state}/gemini-cli-skill/.gemini/settings.json`
  selecting `gemini-api-key`, so `~/.gemini/settings.json` plays no part. A stop naming that file
  means `GEMINI_CLI_HOME` points at it or the skill's file was edited.
- **Personal-account sign-in no longer serves Gemini CLI.** Since 2026-06-18 Gemini CLI answers
  no requests for Google AI Pro, Ultra or free Code Assist for individuals
  (https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/);
  a file selecting `oauth-personal` only makes runs fail. Gemini Code Assist Standard/Enterprise
  and paid API keys are unaffected.
- **To read a file's method:** `grep -o '"selectedType"[^,}]*' <settings file>`; no match, or no
  file, means that file selects none.
- **To run on the key:** set the named file's `security.auth.selectedType` to `gemini-api-key`.
  A project or system file is shared beyond this skill, so changing one is the user's to approve.
- **To run with the selected method anyway:** pass `--any-auth`. The run is then billed to
  whatever account that method signs in as, not to the key.
- **When the key is set and one model refuses** (a permission or policy error while other models
  answer): the key's project lacks access to that model. Which project a key belongs to and its
  billing tier are visible in Google AI Studio's API key page.
