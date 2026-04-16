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
