# 02 — Remove obsolete agent workflow entry points

**What to build:** Make every repository-provided agent integration expose the Matt workflow only, so an agent cannot accidentally start OpenSpec or invoke the retired quick-change workflow.

**Blocked by:** 01 — Establish the Matt workflow contract and freeze OpenSpec.

**Status:** claimed

- [ ] OpenSpec skills and command aliases are absent from every active repository-provided agent integration.
- [ ] The quick-change skill is absent from every active repository-provided agent integration, and the documented small-change path uses direct implementation instead.
- [ ] No active agent instruction or command points to a removed workflow entry point.
- [ ] A static scan of active agent surfaces finds no selectable OpenSpec or quick-change workflow while the frozen historical tree remains untouched.
