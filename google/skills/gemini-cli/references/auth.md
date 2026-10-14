# Gemini CLI authentication

Read when `gemini-run.sh` stops on an auth-method mismatch, or a run fails on authentication.

- **A selected auth method overrides the key.** In headless mode the CLI uses the auth method a
  settings file selects before it looks at `GEMINI_API_KEY`. When that method is a Google sign-in
  with cached credentials, the run succeeds silently under that account and its quota; without
  them it asks for an interactive sign-in and fails. The script therefore checks the user
  settings file (`~/.gemini/settings.json`, or under `$GEMINI_CLI_HOME`), the project file
  (`.gemini/settings.json` in the `-C` directory) and the system settings file, and stops when any
  selects a method other than `gemini-api-key`, naming the file.
- **To read a file's method:** `grep -o '"selectedType"[^,}]*' <settings file>`; no match, or no
  file, means that file selects none.
- **To run on the key:** set that file's `security.auth.selectedType` to `gemini-api-key`.
  Changing the user settings file changes the CLI's auth for every use on the machine, so it is
  the user's to approve.
- **To leave the files as they are:** point `GEMINI_CLI_HOME` at a directory whose
  `.gemini/settings.json` holds only `{"security":{"auth":{"selectedType":"gemini-api-key"}}}`.
  Sessions are then stored there, so every run of a session keeps the same `GEMINI_CLI_HOME`.
  This reaches the user file only; a project or system file that selects another method still
  wins.
- **To run with the selected method anyway:** pass `--any-auth`. The run is then billed to
  whatever account that method signs in as, not to the key.
- **When the key is set and one model refuses** (a permission or policy error while other models
  answer): the key's project lacks access to that model. Which project a key belongs to and its
  billing tier are visible in Google AI Studio's API key page.
