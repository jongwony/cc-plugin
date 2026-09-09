# Codex computer-use troubleshooting

Load after a failed browser or native-app run. Entry points and verification are
in [computer-use.md](computer-use.md).

## No suitable tool in the run

Inspect the inventory of the failing invocation, then its resolved executable,
effective `CODEX_HOME`, and enabled MCP/plugin configuration. `command -v codex`
and configuration listings can help locate a mismatch, but inspect only relevant
fields and redact credentials from diagnostic output. A wrapper selecting another
home is one possible cause, not a diagnosis implied by a missing tool.

Check prerequisites using diagnostics documented by the installed runtime. Read
the fields that establish readiness as well as the exit code. Passing standalone
diagnostics does not prove that the delegated run loaded or connected the tool;
verify with a real call from that same launch path. Check connection, extension,
permission, and host prerequisites when the evidence points to them.

## A lock or permission message blocks observation

Report the tool's exact message and the step that failed. A reported lock may not
explain what the user sees; reconcile it with the visible prompt or the user's
observation before diagnosing the machine state. If user action is required,
state the concrete blocker. After the user reports resolving it or asks to retry,
repeat the failed observation and judge the new result. Follow the runtime's
permission policy for any prompt encountered.

## A URL is blocked by policy

Respect the block. For an isolated capability test, a permitted public example
page can replace a blocked URL scheme when it safely exercises the needed control
without reproducing the blocked action. If the requested task requires the
blocked destination, report the limitation and use only alternatives allowed by
the runtime's policy.

## Input fails or a successful call has no visible effect

Read the current UI state and verify the intended target and effect. A detached
error alone does not establish that every input method is broken; a successful
return alone does not establish that text, navigation, or scrolling occurred.
Use a documented alternative when the failure evidence supports it. Stop when
the effect is verified or a concrete blocker requires user action; report the
actual value or state difference rather than declaring all input paths unusable.
