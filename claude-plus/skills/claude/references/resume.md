# Continuing an identified session

Read this whenever an identified session is continued rather than started — a
correction sent back within the turn that launched it, a later turn resuming it,
a fork, or a failed resume.

## Resuming

- Take the session id and working directory from the durable task record, not
  from the transcript.
- Write the new instructions to a fresh prompt file, then pass
  `-S <SESSION_ID>` to `claude-run.sh`. The rest of the invocation is unchanged,
  and the wrapper allocates a fresh run directory for the turn.
- Pass the same `-C <DIR>` again. Every pointer in the prompt re-resolves
  against whatever tree the run lands in, so omitting it moves the whole prompt
  to a different repository without saying so.

## Forking

- Fork when the user asks for a fresh independent judgment, or when a different
  task needs its own context while keeping what came before.
- Pass `-S <SESSION_ID> -F`. The wrapper mints the new id and prints it as
  `SESSION_ID:` with the original as `FORKED_FROM:`. Record both.
- When the new work should carry no prior context, start a new session instead
  and identify it as new in the result.

## When resume fails

- A returned `session_id` establishes an execution identity, not proof that its
  transcript was saved or remains available.
- Report the failed resume as its own result rather than folding it into the
  original run's.
- Reconstruct a fresh handoff from the retained artifacts only when the task's
  known context is sufficient; otherwise return the blocker with the run
  coordinates.
