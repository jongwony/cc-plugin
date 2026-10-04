# Codex Review Options

Load only when selecting a curated reviewer. Inspect the
installed recipe and CLI before using it; availability is a local capability.
Keep the `codex` source and pass the same captured scope and design intent.

## Curated plugin recipe

Look for Superpowers' `requesting-code-review` in the installed catalog. OpenAI's
[plugin distribution](https://github.com/openai/plugins/tree/main/plugins/superpowers)
provides its [skill](https://github.com/openai/plugins/blob/main/plugins/superpowers/skills/requesting-code-review/SKILL.md)
and [reviewer template](https://github.com/openai/plugins/blob/main/plugins/superpowers/skills/requesting-code-review/code-reviewer.md).
Check the manifest for author/provenance; distribution by OpenAI is distinct from
OpenAI authorship. The separate [curated skills catalog](https://github.com/openai/skills/tree/main/skills/.curated)
is another discovery surface, not proof of installation.

When requested and available, use the installed reviewer template as the fresh
codex child's review brief. Fill its requirements and base/head with this
loop's harvested intent and captured pointer. For working-tree scope, supply the
captured-base diff and untracked paths instead of a committed-head range. The child
performs review and returns; the surrounding skill's scheduling and repair workflow
do not replace this loop's verification and disposition phases. Say which recipe
ran; use the ordinary adapter if the user elects it when the recipe is unavailable.

Normalize the template's findings by actual consequence and its explicit assessment
(`Yes`, `No`, `With fixes`) into the source interface, retaining findings even beside
an affirmative assessment. Request reach separately where possible; a template
without reach fields supplies no reach evidence on its own.
