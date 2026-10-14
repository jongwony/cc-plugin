# Gemini CLI authentication

Read once a `gemini-run.sh` run has failed on authentication — an error naming OAuth, consent, or
sign-in, or a request for a browser login — and the failure has been reported.

- **A cached auth method overrides the key.** In headless mode the CLI uses the authentication
  method already recorded in `~/.gemini/settings.json` before it looks at `GEMINI_API_KEY`. When
  that method is a Google sign-in (`oauth-personal`), a run with the key set still asks for an
  interactive sign-in and fails. Read the recorded method with
  `grep -o '"selectedType"[^,}]*' ~/.gemini/settings.json`; no match, or no file, means none is
  recorded and the key is used.
- **To use the key:** the recorded method is `gemini-api-key`. Changing `~/.gemini/settings.json`
  changes it for every use of the CLI on the machine, so it is the user's to approve. Where it must
  stay as it is, a run can point `HOME` at a directory whose `.gemini/settings.json` holds only
  `{"security":{"auth":{"selectedType":"gemini-api-key"}}}`.
- **When `GEMINI_API_KEY` is unset:** the script stops before calling the CLI. Where the key comes
  from is in the user's own instructions; this skill does not name a source.
- **When the key is set and the model refuses** (a permission or policy error for one model while
  others answer): the key's project lacks access to that model. Which project a key belongs to and
  its billing tier are visible in Google AI Studio's API key page, not from here.
