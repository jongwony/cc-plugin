# Local computer and browser use: failures

- When the delegated run exposes no relevant tool, inspect `command -v codex`,
  its effective `CODEX_HOME`, `codex plugin marketplace list`, and the installed
  plugin's connection instructions under the same launch configuration. Treat
  a redirected home as a possible cause; verify it before changing configuration.
- When a native app is unavailable or access is denied, report the app and exact
  error and follow the runtime's supported authorization or installation flow.
  Keep that result separate from browser availability.
- When browser selection fails, use the selected plugin's current diagnostics
  for the browser, extension, and native host. Read the diagnostic's documented
  flags and output rather than importing exit-code assumptions from another
  plugin version.
- When policy verification is unavailable or an action is denied, retain the
  failure and restore the supported runtime or authorization path. Changing
  transport, injecting input elsewhere, or suppressing policy is not a retry.
- When a backend exits or restarts during a test, record the replacement process
  and repeat the capability observation under the resulting state before
  claiming backend-free operation.
- When a call completes without the requested effect, inspect fresh UI state and
  report the mismatch. An observed input or scroll failure describes that call
  and target; exercise another supported path only if authorization still permits
  it and the failure was not a policy denial.
- When the failure remains unresolved, return the failing tool and operation,
  relevant error, observed state, and blocked portion of the task.
