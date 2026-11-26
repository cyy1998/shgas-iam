{{ROLE_INSTRUCTIONS}}

# Implement Ticket

You are implementing a single ticket in an isolated ticket worktree branched from baseline `{{BASE_SHA}}`.
The parent Spec and ticket details below were injected by the host — do not call the GitHub API or modify GitHub issues or remote branches.

## Parent Spec

{{SPEC}}

## Ticket

{{TICKET}}

## Instructions

1. Read applicable repository instructions and inspect existing code around the affected seams before editing.
2. Confirm your current branch, clean worktree, and baseline `{{BASE_SHA}}`.
3. Follow TDD where applicable: write a failing behavior test at the agreed seam, then implement the minimal change to pass it before expanding coverage.
4. Run all affected verification checks (tests, typecheck, lint/format) for your changes.
5. Make focused commits referencing the ticket number with commit hooks enabled, and leave a clean working tree.
6. Do not modify the Spec integration branch, remote branches, or GitHub issues.
7. Summarize the exact commands run, results, any unverified items, and your final clean candidate SHA.

Only report success by ending your response with this standalone final line:

<promise>COMPLETE</promise>
