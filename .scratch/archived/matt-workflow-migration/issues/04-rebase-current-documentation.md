# 04 — Rebase current documentation on maintained sources of truth

**What to build:** Let contributors and operators navigate all active repository documentation without treating frozen OpenSpec artifacts as maintained requirements, while preserving useful operating guidance and explicit historical context.

**Blocked by:** 01 — Establish the Matt workflow contract and freeze OpenSpec.

**Status:** resolved

- [x] Active architecture, development, onboarding, and repository-map documentation identifies code, executable tests, and documents marked Current as the maintained sources of truth.
- [x] Active documentation no longer instructs contributors to run OpenSpec commands or create, validate, synchronize, or archive OpenSpec artifacts.
- [x] Release and feature documentation retains applicable operational guidance and either replaces OpenSpec authority references or labels unavoidable references as historical evidence.
- [x] Documentation indexes, status metadata, and cross-links remain consistent after the workflow documents are replaced.
- [x] Documentation validation passes without changing IAM runtime behavior or rewriting the frozen legacy corpus.

## Resolution

- Commit: `8816f9c70864ec2dce597b22805707daf57660e6`
- Validation:
  - `pnpm check:docs` — passed with 26 indexed documents and no `Needs Review` entries.
  - Active-document scan — passed with no OpenSpec spec, command, hook, or removed-workflow reference outside explicit historical boundaries.
  - `pnpm --filter @iam/api typecheck` — passed after removing a manifest script whose target implementation did not exist.
  - MySQL migration entry scan across README, Current docs, API manifest, and agent-maintained technical notes — passed with no dangling command or capability claim.
  - `git diff --check` — passed.
- Review: Standards and Spec reviews both passed with no unresolved findings after correcting onboarding navigation, Bun/Node and app-local script rules, historical audit status, and dangling migration references.
