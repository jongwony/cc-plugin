# Notification — pushes to choi's phone

- **A push exists to take load off choi's attention: it goes out where the work needs his attention and he would not otherwise turn to it when it matters.** Each push is judged on that need in the situation, so every push that arrives is worth reading. The `ntfy-checkpoint` skill composes it.
- **A handoff to choi pushes at once.** When the work stops on something only choi can do — a command to run (a `!` line), a permission grant, an act the classifier denied, an approval it waits on — the push goes out with no delay in the turn that writes the handoff, naming the act.
- **A push that is superseded, moved or no longer needed is republished under its own sequence id, never cleared or deleted.** The `ntfy-checkpoint` skill carries each case.
- **A tap lands where that attention goes**: the page the act reads, and otherwise the owning session in the Claude app. Whenever a page takes the tap, the owning session stays one tap away as a `view` action.
