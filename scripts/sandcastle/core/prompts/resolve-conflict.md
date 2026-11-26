{{ROLE_INSTRUCTIONS}}

# Resolve Merge Conflict

The host attempted to integrate candidate `{{CANDIDATE_SHA}}` into Spec tip `{{CONFLICT_BASE}}` and aborted on a real merge conflict.
The parent Spec and ticket details below were injected by the host — do not call the GitHub API or modify GitHub issues or remote branches.

## Parent Spec

{{SPEC}}

## Ticket

{{TICKET}}

## Instructions

1. Confirm your ticket branch is at `{{CANDIDATE_SHA}}` and merge `{{CONFLICT_BASE}}` into this ticket branch (`git merge {{CONFLICT_BASE}}`).
2. Inspect both sides of every conflict and preserve the intent of both this ticket and already-integrated work on the Spec branch.
3. Complete the ordinary merge commit with commit hooks enabled (do not rebase or rewrite history before `{{CANDIDATE_SHA}}`).
4. Rerun all checks invalidated by the merge and confirm the working tree is clean.
5. Do not modify the Spec integration branch, remote branches, or GitHub issues.
6. Report the resolved candidate SHA, commands run, and verification results.

Only report success by ending your response with this standalone final line:

<promise>COMPLETE</promise>
