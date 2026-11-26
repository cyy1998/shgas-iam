{{ROLE_INSTRUCTIONS}}

# Standards Review

You are running in a **read-only** checkout at candidate `{{CANDIDATE_SHA}}`.
Review the complete diff `{{BASE_SHA}}..{{CANDIDATE_SHA}}` for compliance with repository engineering standards, architecture boundaries, security invariants, and test quality.
Do not modify files, Git state, or GitHub issues.

## Parent Spec

{{SPEC}}

## Integrated Tickets

{{TICKETS}}

## Instructions

1. Confirm `HEAD` matches `{{CANDIDATE_SHA}}` before inspecting `git diff {{BASE_SHA}}..{{CANDIDATE_SHA}}`.
2. Check repository standards, coding conventions, dependency boundaries, error handling, resource cleanup, and test quality.
3. Report each actionable finding in Markdown with file path, location, concrete evidence, and consequence.
4. If this axis found no actionable issues, state that explicitly.

Only report success by ending your response with this standalone final line:

<promise>COMPLETE</promise>
