# 05 — Integrate, validate, and close the workflow migration

**What to build:** Prove from a clean repository-facing seam that OpenSpec has become inert history, the Matt workflow is usable end to end, and the application remains healthy before asking the maintainer for merge approval.

**Blocked by:** 02 — Remove obsolete agent workflow entry points; 03 — Retire the OpenSpec toolchain; 04 — Rebase current documentation on maintained sources of truth.

**Status:** ready-for-agent

- [ ] A final static scan outside the frozen historical tree finds no active OpenSpec workflow, package command, script, hook, skill, or command alias.
- [ ] Frozen dependency installation, documentation checks, repository lint, type checking, automated tests, and the diff whitespace check all pass.
- [ ] A final two-axis review against the target branch reports no unresolved repository-standards or migration-spec findings.
- [ ] Every resolved ticket records its reviewed commit and relevant validation evidence, and the retained spec and tickets demonstrate the complete Matt workflow lifecycle.
- [ ] The final diff remains within workflow-migration scope and is ready for explicit maintainer approval before merge or push.
