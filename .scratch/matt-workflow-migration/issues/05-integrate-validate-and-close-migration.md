# 05 — Integrate, validate, and close the workflow migration

**What to build:** Prove from a clean repository-facing seam that OpenSpec has become inert history, the Matt workflow is usable end to end, and the application remains healthy before asking the maintainer for merge approval.

**Blocked by:** 02 — Remove obsolete agent workflow entry points; 03 — Retire the OpenSpec toolchain; 04 — Rebase current documentation on maintained sources of truth.

**Status:** resolved

## Approved amendment

The 2026-07-16 spec amendment adds two test-only baseline repairs to this ticket: prefix the three response-envelope compile-time assertion values with `_`, and increase only the affected OIDC HTTP logging integration test's local timeout from 10 to 30 seconds. Existing assertions and production behavior must remain unchanged.

- [x] A final static scan outside the frozen historical tree finds no active OpenSpec workflow, package command, script, hook, skill, or command alias.
- [x] Frozen dependency installation, documentation checks, repository lint, type checking, automated tests, and the diff whitespace check all pass.
- [x] A final two-axis review against the target branch reports no unresolved repository-standards or migration-spec findings.
- [x] Every resolved ticket records its reviewed commit and relevant validation evidence, and the retained spec and tickets demonstrate the complete Matt workflow lifecycle.
- [x] The final diff remains within workflow-migration scope and is ready for explicit maintainer approval before merge or push.

## Resolution

- Commit: `c4c02323e304d92639edde0f1fe565a60599e465`
- Validation:
  - Final scans of agent, tooling, hook, documentation, and frozen-history surfaces — passed with no active retired-workflow entry point.
  - `pnpm install --frozen-lockfile --ignore-scripts` — passed.
  - `pnpm check:docs` — passed with 26 indexed documents.
  - `pnpm lint` — passed; 13 of 13 package tasks succeeded.
  - `pnpm typecheck` — passed; 13 of 13 package tasks succeeded.
  - `pnpm test` — passed; 13 of 13 package tasks succeeded.
  - `pnpm exec turbo test --force` — passed at default concurrency with 13 of 13 uncached package tasks successful.
  - `TURBO_CONCURRENCY=1 pnpm test` — passed; the complete 13-package test graph succeeded.
  - Focused response-envelope, OIDC HTTP logging, and API architecture suites — passed.
  - `git diff --check` — passed.
- Review: Ticket-level and feature-level Standards and Spec reviews passed with no unresolved findings after the amendment-sync and trailing-whitespace findings were corrected.
