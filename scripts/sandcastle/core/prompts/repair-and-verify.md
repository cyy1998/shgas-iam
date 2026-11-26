{{ROLE_INSTRUCTIONS}}

# Repair and Final Verification

You are running the single centralized repair and final verification session on the Spec worktree at `{{CANDIDATE_SHA}}` (merge-base `{{BASE_SHA}}`).
The parent Spec, tickets, and dual-axis review report below were injected by the host — do not call the GitHub API or modify GitHub issues or remote branches.

## Parent Spec

{{SPEC}}

## Integrated Tickets

{{TICKETS}}

## Dual-Axis Review Report

{{REVIEW_REPORT}}

## Instructions

1. Confirm `HEAD` matches `{{CANDIDATE_SHA}}` and inspect ticket verification handoffs recorded in local merge commits via `git log --first-parent {{BASE_SHA}}..{{CANDIDATE_SHA}}`.
2. Address every valid finding from both review axes while preserving all integrated tickets. Record the disposition of each finding.
3. Commit focused fixes with commit hooks enabled and leave a clean working tree.
4. Run all required final verification checks at the final candidate SHA and record exact commands, scopes, and results.
5. Do not modify GitHub issues or push remote branches.
6. Only when all required checks pass and the working tree is clean, emit a concise Pull Request description wrapped in `<pr-body>...</pr-body>` (including summary, verification evidence, and merge risks), followed by the completion marker on the final line.
7. If verification is incomplete or blocked, explain the failure and safe recovery point and omit the completion marker.

Only report success by ending your response with this standalone final line:

<promise>COMPLETE</promise>
