# Workflow migration verification

**Date:** 2026-07-16
**Target branch:** `main`
**Target commit:** `83ced68d6bf4c0f6e27af8567ec4c967e762fbd9`

## Static acceptance scan

- Repository-provided agent surfaces (`.codex`, `.codebuddy`, `.serena`, `.agents`, `.superpowers`, and `.vscode`) contain no active OpenSpec, OPSX, or `quick-change` entry point.
- Package manifests, the lockfile, workspace configuration, repository scripts, and Dockerfiles contain no OpenSpec or OPSX dependency or command outside the frozen `openspec/` tree.
- Current documentation contains no active OpenSpec spec link, command, hook, or OPSX alias. Historical references remain only where they are explicitly labelled as frozen or superseded.
- `.git/hooks/pre-commit` is absent, confirming that the retired OpenSpec-only hook was not replaced by this migration.
- `openspec/README.md` labels the retained tree as historical; no other file beneath `openspec/` differs from `main`.

## Validation evidence

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile --ignore-scripts` | Passed with the frozen lockfile. |
| `pnpm check:docs` | Passed; 26 documents are indexed. |
| `pnpm lint` | Passed; 13 of 13 package tasks succeeded. |
| `pnpm typecheck` | Passed; 13 of 13 package tasks succeeded. |
| `pnpm test` | Passed; 13 of 13 package tasks succeeded. |
| `pnpm exec turbo test --force` | Passed at default concurrency; 13 of 13 package tasks succeeded with no cached tasks. |
| `pnpm test` with `TURBO_CONCURRENCY=1` | Passed; the complete 13-package test graph succeeded. |
| Focused API response-envelope tests | Passed; 4 of 4 tests succeeded. |
| Focused OIDC HTTP-server logging tests | Passed; 3 of 3 tests succeeded. |
| Focused API architecture tests | Passed; 18 of 18 tests succeeded. |
| `git diff --check` | Passed. |

Initial fully parallel `pnpm test` attempts exposed resource-sensitive timeout failures in tests unchanged from the `main` baseline: first the OIDC HTTP logging integration test, and then an API architecture test after the OIDC timeout was repaired. Each affected suite passed when run alone. The maintainer-approved amendment raises only the OIDC test's local timeout from 10 to 30 seconds; no timeout change was made to the API architecture suite. A forced, uncached final run of the complete Turbo test graph at default concurrency then passed all 13 package tasks in 57.596 seconds. Serial package scheduling (`TURBO_CONCURRENCY=1`) independently passed the same complete graph while preserving each package's own test behavior.

## Review evidence

- Ticket-level Standards and Spec review of delivery commit `c4c02323e304d92639edde0f1fe565a60599e465` passed with no unresolved findings after correcting the amendment-sync and trailing-whitespace findings.
- Feature-level Standards and Spec review of `main...c4c02323e304d92639edde0f1fe565a60599e465` passed with no unresolved findings.
- Merge, push, and remote branch deletion remain subject to explicit maintainer approval.
