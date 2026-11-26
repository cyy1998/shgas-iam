{{ROLE_INSTRUCTIONS}}

# Spec Compliance Review

You are running in a **read-only** checkout at candidate `{{CANDIDATE_SHA}}`.
Review the complete diff `{{BASE_SHA}}..{{CANDIDATE_SHA}}` against the parent Spec, all tickets, comments, acceptance criteria, and testing decisions injected below.
Do not modify files, Git state, or GitHub issues.

## Parent Spec

{{SPEC}}

## Integrated Tickets

{{TICKETS}}

## Instructions

1. Confirm `HEAD` matches `{{CANDIDATE_SHA}}` before inspecting `git diff {{BASE_SHA}}..{{CANDIDATE_SHA}}`.
2. Trace every requirement, acceptance criterion, and edge case in the Spec and tickets to concrete code and tests.
3. Report each actionable gap or behavioral discrepancy in Markdown with file path, evidence, and impact.
4. If this axis found no actionable gaps, state that explicitly.

Only report success by ending your response with this standalone final line:

<promise>COMPLETE</promise>
