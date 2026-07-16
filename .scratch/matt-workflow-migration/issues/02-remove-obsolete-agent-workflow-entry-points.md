# 02 — Remove obsolete agent workflow entry points

**What to build:** Make every repository-provided agent integration expose the Matt workflow only, so an agent cannot accidentally start OpenSpec or invoke the retired quick-change workflow.

**Blocked by:** 01 — Establish the Matt workflow contract and freeze OpenSpec.

**Status:** resolved

- [x] OpenSpec skills and command aliases are absent from every active repository-provided agent integration.
- [x] The quick-change skill is absent from every active repository-provided agent integration, and the documented small-change path uses direct implementation instead.
- [x] No active agent instruction or command points to a removed workflow entry point.
- [x] A static scan of active agent surfaces finds no selectable OpenSpec or quick-change workflow while the frozen historical tree remains untouched.

## Resolution

- Commit: `3620edaa7a2713c64ae383f0f197756b10461622`
- Validation:
  - Agent-surface path scan across Codex, CodeBuddy, Serena, `.agents`, `.superpowers`, and VS Code configuration — passed with no OpenSpec, OPSX, quick-change, or removed-workflow entry point.
  - `pnpm check:docs` — passed; expected `Needs Review` warnings remain assigned to ticket 04.
  - `git diff --check` — passed.
- Review: Standards and Spec reviews both passed with no unresolved findings after adding the missed Serena surface and removing duplicated commit-format policy from its memory.
