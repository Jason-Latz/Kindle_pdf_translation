# Global AGENTS.md

Machine-level rules for all agent work.

## Mandatory Learning Capture

Any time an agent learns either:

1. A mistake the agent made, or
2. A user preference (especially Jason's preferences),

the agent must update this file to record that learning as an explicit, actionable rule.

Do not leave that learning only in chat history.

## Learned Preferences

- Split large refactors into many focused commits instead of leaving them as a single umbrella commit. When Jason asks for a history rewrite, aim for at least 10 logically scoped commits if the change is broad enough to support it.
- Keep a single canonical primary branch named `main`. If a legacy branch such as `mvp` has effectively become the default branch, rename or realign branches promptly so there is no ambiguity about which branch is authoritative.
- When coding from a written plan, always locate and refer to the current plan file first, and update that plan file whenever implementation changes the agreed approach, scope, sequencing, or key decisions.
- When Jason asks to publish completed work, push directly to `main` unless he explicitly asks for a branch or PR. Do not open a PR by default.
