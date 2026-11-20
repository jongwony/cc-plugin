---
name: daily
description: Runs the morning brief on each working day from a recurring task in a resident session — a working-day check, one background brief session the user can join by Remote Control, a "brief ready" push, and the task's renewal. Use when that recurring task fires, when the session holding it starts or resumes, or when the user asks for the morning brief to run every working day.
---

# Morning brief, daily

The session that holds the recurring task — the host, a resident session such as aiward where one is installed — runs this skill. The brief itself is made by the `morning-brief` skill in a background session of its own, the brief Stint, never in the host.

```lean
/-!
How to read this block. It is core Lean 4 and elaborates as written, and you are the model it is
written for: you read it, and by inference over the context you settle each element it leaves
open. Every `axiom` is one of those judgments — a black box to the contract, yours to make from
the material in front of you; its doc comment says what you judge there, and nothing in this
block decides it for you. Every `def`, `inductive`, and `structure` is fixed by the contract.
The block fixes which acts each moment takes and in what order; how each act is carried out is
the prose below.
-/

namespace MorningBriefDaily

/-! ── TYPES ── -/

noncomputable section

/-- The host's context at the moment: the user's calendars, the fleet, the conversation. -/
axiom Context : Type

/-- What the host observes now, each by a read: `briefSaved` — `<dir>/<YYYY-MM-DD>.md` exists for
    today; `stintAlive` — today's `brief::<YYYY-MM-DD>` Stint is running; `respawned` — a brief
    Stint was already spawned a second time today; `pushed` — today's ready push went out;
    `beforeCutoff` — the local time is before 14:00; `taskPresent` — `CronList` shows the
    recurring task. -/
structure Observed where
  briefSaved   : Bool
  stintAlive   : Bool
  respawned    : Bool
  pushed       : Bool
  beforeCutoff : Bool
  taskPresent  : Bool

inductive DayKind | weekend | holiday | wholeDayLeave | halfDayLeave | working
  deriving DecidableEq -- elab:

/-- **Your judgment**: how today stands for the user, read from the calendar tool's listing — a
    public-holiday calendar the user keeps, a shared team-leave calendar the user is listed on,
    and out-of-office events on the user's own calendar. Leave that covers part of the day is
    `halfDayLeave`. -/
axiom dayKind : Context → DayKind

/-- **Your judgment**: the user is using yesterday's brief Stint — its state is not idle, or the
    user wrote in it since its brief was saved. -/
axiom previousInUse : Context → Bool

def isWorking : DayKind → Bool
  | .halfDayLeave | .working => true
  | _                        => false

/-- The recurring task's prompt, the same text on creation and on every renewal. -/
def taskPrompt : String :=
  "Invoke the morning-brief:daily skill through the Skill tool and follow it."

/-- The one-shot deadline's prompt. -/
def deadlinePrompt : String :=
  "Settle today's brief Stint by the morning-brief:daily skill."

inductive Act
  /-- create the recurring task again with this prompt, delete the task that fired, list -/
  | renew (prompt : String)
  /-- create the recurring task with this prompt; it was absent -/
  | recreate (prompt : String)
  | retirePrevious
  /-- leave yesterday's Stint running and name it in the report -/
  | keepPrevious
  | spawn
  /-- a one-shot task 40 minutes on, with this prompt -/
  | scheduleDeadline (prompt : String)
  | pushReady
  | reportFailure
  /-- name the half-day leave in the report -/
  | noteHalfDay

/-! ── PHASE TRANSITIONS ── -/

def startBrief (c : Context) : List Act :=
  [if previousInUse c then .keepPrevious else .retirePrevious, .spawn,
   .scheduleDeadline deadlinePrompt]

/-- The recurring task fires. -/
def fire (c : Context) (o : Observed) : List Act :=
  .renew taskPrompt ::
    (if isWorking (dayKind c) && !o.briefSaved then
      (if dayKind c = .halfDayLeave then [.noteHalfDay] else []) ++ startBrief c
    else [])

/-- The brief Stint replies with its completion line, dies, or the deadline fires. -/
def settle (o : Observed) : List Act :=
  if o.briefSaved then (if o.pushed then [] else [.pushReady])
  else .reportFailure :: (if o.respawned then [] else [.spawn, .scheduleDeadline deadlinePrompt])

/-- The host starts or resumes. -/
def hostStart (c : Context) (o : Observed) : List Act :=
  (if o.taskPresent then [] else [.recreate taskPrompt]) ++
    (if isWorking (dayKind c) && o.beforeCutoff && !o.briefSaved && !o.stintAlive then
      startBrief c
    else [])

end

end MorningBriefDaily
```

## Settings

- `<dir>`: `${user_config.output_dir}` where the host substituted a non-empty value for it; otherwise `${CLAUDE_PLUGIN_DATA}` — the directory the `morning-brief` skill saves to.

## The recurring task

- Created when the user asks for the daily brief: weekdays, at the time the user named. A daily recurring task can start up to 30 minutes after its cron minute; choose the minute so the next-run time `CronCreate` prints falls near that time, and report the printed time.
- Its prompt is `taskPrompt`, exactly.
- It lives only in the host. The renewal on every fire keeps it clear of the 7-day expiry of recurring tasks; `hostStart` restores it where the host lost it.

## Acts

- `renew` — `CronCreate` the same cron with the prompt, then `CronDelete` the task that fired, then `CronList`.
- `recreate` — `CronCreate` it as under The recurring task, then `CronList`.
- `retirePrevious` / `keepPrevious` — yesterday's `brief::<date>` row in `claude agents --json --all`: audit and retire it as `/stint` lays out, or leave it running.
- `spawn` — a Stint as `/stint` lays out (load it first), from the host's working directory: `-n` and `--remote-control` both `brief::<YYYY-MM-DD>`, `--model opus --effort medium`, the host's own permission mode, the brief below as its whole initial prompt. `bridgeSessionId` in its `sessions/<pid>.json` is non-null, so the user can open it from the app.
- `scheduleDeadline` — a one-shot `CronCreate` 40 minutes after the spawn.
- `pushReady` — one push through the host's notification route (the `ntfy-checkpoint` skill where installed): "brief ready" in the brief's language with the date, its tap opening the brief Stint's session in the Claude app; no brief content.
- `reportFailure` — a report to the user with what the brief Stint's transcript shows.

## The brief Stint's initial prompt

The host fills its own address from `ListAgents` (`This session is <name> [<ref>]`) and today's `<dir>/<YYYY-MM-DD>.md` path:

> You were spawned by `<host's name [ref]>`. On start, call ListAgents, read the exact `name [ref]` string for that peer, and send it one ACK with that string as `to` in SendMessage. GOAL: make today's morning brief. Invoke the skill through the Skill tool (`morning-brief:morning-brief`, no arguments) and follow it fully. COMPLETION: the skill's saved brief file for today exists at `<path>`; send the spawning peer one line with that file's path, the page link, and how long the run took. Then stay open: the user will join this session by Remote Control to talk through today's to-dos; until the user writes, do nothing further. The skill's own boundaries govern the run.
