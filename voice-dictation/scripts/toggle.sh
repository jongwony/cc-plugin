#!/bin/bash
# Toggle the voice-dictation push-to-talk daemon as a background process.
# Output: STARTED or STOPPED
#
# Lock-based (not a PID file, not an argv signature): the daemon takes an
# exclusive flock on $LOCK before doing anything else and holds it for its whole
# lifetime, so "is a daemon running" is answered by asking who holds that lock —
# the daemon's own exclusion primitive, read at its authoritative source. The
# flock is released by the kernel on exit or crash, so there is no stale state to
# reap, which is also why a PID file was never an option here (`uv run` re-parents
# into a child python process, leaving the launcher PID a dead pointer).
#
# An argv path signature answers a *different* question — "is a process running
# from this install path" — and the two answers diverge as soon as a second
# install exists. With a daemon up from another plugin cache, pgrep finds
# nothing, this script reports STARTED, and the daemon it spawns dies on the
# flock a moment later: a false STARTED with the stale daemon still running and
# nothing in the output to say so. Reading the lock cannot produce that gap,
# since whoever holds it is found regardless of the path it was started from.
#
# The lock path is per-mode, so toggling production leaves a `--debug` daemon
# (its own lock path) running — the coexistence the debug harness intends, which
# the shared script path could not distinguish.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAEMON="$SCRIPT_DIR/dictation_daemon.py"
# Must match LOCK in dictation_daemon.py: os.path.join(tempfile.gettempdir(), …).
# gettempdir() honours $TMPDIR, which on macOS is the per-user /var/folders/…/T
# directory — not /tmp. $TMPDIR carries a trailing slash that gettempdir() drops,
# so strip it here to name the same path.
LOCK="${TMPDIR:-/tmp}"
LOCK="${LOCK%/}/voice_dictation.lock"
LOGFILE="/tmp/voice-dictation.log"

# The lock holder is the python daemon itself; its `uv` parent exits once the
# child is gone, so the daemon PID is the only one worth signalling.
daemon_pids() { lsof -t "$LOCK" 2>/dev/null; }

PIDS="$(daemon_pids)"
if [[ -n "$PIDS" ]]; then
  kill -TERM $PIDS 2>/dev/null
  sleep 1
  PIDS="$(daemon_pids)"
  [[ -n "$PIDS" ]] && kill -KILL $PIDS 2>/dev/null
  # The daemon spawns `rec` as a child writing voice_dictation.wav; that child
  # holds no lock and outlives a SIGKILLed parent, so reap it explicitly —
  # otherwise it keeps holding the mic if the daemon is toggled off mid-recording.
  # Send SIGINT (not SIGTERM/KILL) first so sox closes the CoreAudio input device
  # cleanly and releases the mic — an abruptly killed recorder leaves the orange
  # mic indicator stuck on. SIGKILL only as a fallback for a straggler that
  # ignored SIGINT.
  pkill -INT -f "voice_dictation.wav" 2>/dev/null
  sleep 0.3
  pkill -KILL -f "voice_dictation.wav" 2>/dev/null
  echo "STOPPED"
else
  if [[ ! -f "$DAEMON" ]]; then
    echo "ERROR: daemon not found: $DAEMON" >&2
    exit 1
  fi
  nohup uv run "$DAEMON" </dev/null >"$LOGFILE" 2>&1 &
  disown 2>/dev/null
  echo "STARTED"
fi
