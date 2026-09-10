# Local computer and browser use

## Delegation

- When delegating local UI work, pass this reference, the target app or browser,
  the requested outcome, and the authorized interactions to the child prompt.
  Have that actual `codex exec` run discover its tools and exercise the required
  surface before reporting capability.
- When desktop UI availability is in question, test the delegated CLI directly.
  An installed Codex runtime can serve CUA and browser calls with the desktop
  window closed and can start a descendant `codex app-server` automatically.
  Record app and backend process state separately when testing this boundary.
- When comparing launch paths, hold the binary, effective `CODEX_HOME`, working
  directory, sandbox, authorization state, and target constant; collect actual
  calls from each
  path. A parent's tools or a plugin listing alone establish no child access.

## Runtime entry

- When `mcp__cua_repl.js` is exposed, use its initialized `cua` runtime. Follow
  the tool's first-call instructions exactly and read the returned documentation
  before further calls; the first invocation contains one entry-point call.
- When targeting a native app, select it with the documented `cua.getApp` entry
  point; use the returned native target API to read and operate its UI.
- When targeting a browser, follow the tool's browser-selection precedence for
  the user's tab mention, browser, or URL. Name Chrome explicitly when Chrome
  is requested, and give a new Chrome session the required session name.
- When an operation needs a browser API beyond the selected target's surface,
  follow the runtime's returned browser documentation and supported bridge.
  Keep target objects and methods within the API that created them.
- When unified CUA is absent, inspect the actual tools and installed plugin's
  instructions for a supported browser or computer-use entry point. Use a
  documented bootstrap only in the tool runtime those instructions require.
- When the required surface is unavailable or a policy check fails, report the
  exact blocked call and use
  [computer-use-troubleshooting.md](computer-use-troubleshooting.md).

## Execution and verification

- When reading UI, use the selected surface's documented state or DOM reader;
  bound the output to the task and use screenshots when visual evidence is needed.
- When changing UI, verify the requested effect from fresh state; for text input,
  verify the resulting value before submitting it.
- When a target is stale or unavailable, resolve its live identity using runtime
  instructions; otherwise reuse valid bindings. Distinguish duplicate tabs using
  the runtime's identifiers.
- When creating temporary test resources, close or discard only those resources
  after verification and report cleanup failures.
- When reporting a capability test, separate tool exposure, a completed call,
  observed UI effect, process state, and remaining limits. An app-closed success
  supports that tested installation and launch path; app-uninstalled and
  backend-free operation each require their own test.
