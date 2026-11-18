# Notification — from a project coordinator

Read before a push to choi, and before reporting that work ended or stopped. `rules/notification.md` beside this directory holds the principle in full. Its senders on choi's Mac (`aiward-send`, the `ntfy-checkpoint` skill, the `aiward:report` skill) are not installed in a coordinator session; a coordinator sends through MCP servers registered for it instead.

## Senders

- **A handoff** → the aiward MCP server's send tool, as a `blocked` event aiward pushes as written, with the owning thread's link as the click target. Where the aiward server is not connected, the ntfy MCP server, published at once.
- **A check choi must make at a set minute** → the ntfy MCP server, scheduled for that minute.
- **Work that is done or stopped short of a handoff** → a report to aiward through its MCP server, before the reply that says so. Where the aiward server is not connected, no report goes out.
- The tools' argument shapes are each server's own: read the server's tool descriptions before the first call, and map them onto `ntfy-checkpoint` §Handoff and §Message (in cc-plugin) for what a push carries.

## Where neither server is connected

- **A handoff** is a project-chat reply that opens with the act choi must take and names where it happens, and says that no push went out because no notification server is connected.
- **A check at a set minute**: name the minute and the check in the reply, and say that no checkpoint was scheduled.

## Composing a push

- Title: the act or the check, in a few words.
- Body: one line of what to do, then the owning thread's link. Nothing past that: ntfy stores the body in plaintext.
- A push that is superseded, moved or no longer needed is republished under its own sequence id, never deleted.
- A fix aiward relayed and then verified goes below the default priority.
