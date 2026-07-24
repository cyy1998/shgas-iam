# 01 — Establish the Matt workflow contract and freeze OpenSpec

**What to build:** Give maintainers and agents one complete, repository-specific Matt workflow to follow while preserving the existing OpenSpec material as clearly labelled, read-only history. The migration itself must become the first permanent example of the versioned local tracker.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Repository entry instructions route standard features, small low-risk changes, architectural decisions, ticketed implementation, and review through the Matt skills workflow and a single repository workflow policy.
- [x] The workflow policy records the tracked local issue lifecycle, spec amendment rules, branch and commit conventions, validation levels, review requirements, and operations that still require explicit maintainer approval.
- [x] The accepted workflow ADR and a prominent frozen-legacy notice explain why OpenSpec was replaced, what historical material remains, and which sources now establish current behavior.
- [x] The migration spec and all approved ticket files are retained as version-controlled records, while superseded repository workflow documents are removed.
- [x] The documentation index exposes the new workflow, tracker, domain, triage, and ADR documents, and documentation validation passes.

## Resolution

- Commit: `2e2197b8dcc9fc9c3299e951e2725994af0bfd1b`
- Validation:
  - `pnpm check:docs` — passed; expected `Needs Review` warnings identify documents assigned to ticket 04.
  - `git diff --check` — passed.
  - Existing pre-commit workflow, including staged OpenSpec validation, passed while creating the delivery commit.
- Review: Standards and Spec reviews both passed with no unresolved findings after the broken-link and document-status findings were corrected.
