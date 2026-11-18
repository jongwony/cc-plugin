# Notification — from a project coordinator

Read before a push to choi, and before reporting that work ended or stopped. `rules/notification.md` beside this directory holds the principle in full; its senders (`aiward-send`, the `ntfy-checkpoint` skill, the `aiward:report` skill) live on choi's Mac and are not installed in a coordinator session. This file says what a coordinator can reach instead.

## What reaches choi from here

- **A reply in the project chat** (`post_message`). The product delivers it to choi's Claude app; whether it raises a phone push, and when, is the product's and has not been verified.
- **A Mac session that has `aiward-send`.** A thread started with folder access or Remote Control on choi's Mac can run `aiward-send` there, as `ntfy-checkpoint` §Handoff gives it. The thread's link is the `--click` target.
- **The aiward spool under `/Users/choi/local/.aiward-spool/`.** A session with that folder approved can write there; it carries info events only, never a handoff. Its format is aiward's own: read aiward's documentation on the Mac before writing one.

## Which one, until choi decides

choi has not chosen the coordinator's notification channel (open: a direct push, a route through a Mac session to aiward, or the product's own notification alone). Until choi does:

- **A handoff** is a project-chat reply that opens with the act choi must take and names where it happens. Where the work cannot wait for choi to open the app, say in that reply that no push channel is set for the coordinator, and ask once whether to send it through a Mac session.
- **End-of-work reports to aiward** are not sent from a coordinator. The thread's own reply and the coordinator's summary are the record.
- **A check at a set minute** cannot be scheduled from here. Name the minute and the check in the reply, and say that no checkpoint was scheduled.

## Composing a push, wherever it goes

- Title: the act or the check, in a few words.
- Body: one line of what to do, then the owning thread's link. Nothing past that: ntfy stores the body in plaintext.
- A push that is superseded, moved or no longer needed is republished under its own sequence id, never deleted (`ntfy-checkpoint` §After scheduling, on the Mac).
- A fix aiward relayed and then verified goes below the default priority.
