# Replace OpenSpec with the Matt Skills Workflow

**Status:** approved

**Approved:** 2026-07-16

## Problem Statement

The repository currently carries two competing engineering workflows. OpenSpec still owns cumulative capability specs, change artifacts, CLI dependencies, validation scripts, pre-commit routing, agent skills, and documentation references, while the newly installed Matt skills expect a conversation-driven flow backed by a local Markdown issue tracker, domain glossary, and ADRs. Leaving both active makes it unclear which workflow an agent should follow, which artifact is authoritative, and which branch, review, and validation rules apply.

The maintainer wants all future work to use the Matt skills workflow without discarding the historical context captured by OpenSpec. The migration must therefore remove active OpenSpec entry points, preserve the legacy archive in place, establish one durable repository workflow, and prove that the tooling and application code still validate after the removal.

## Solution

Adopt the Matt skills flow as the repository's only active engineering workflow. Ideas are sharpened through `grill-with-docs`, multi-session work becomes a versioned local spec and tracer-bullet tickets, implementation uses TDD and two-axis review, and small clear changes enter `implement` directly without a separate quick-change skill.

Freeze the existing OpenSpec tree as read-only historical reference, remove its active CLI, scripts, tests, hooks, skills, and command surfaces, and stop treating its cumulative specs as current authority. Current behavior will instead be established by executable tests, code, and documents marked `Current`; the domain glossary and ADRs retain stable language and long-lived decisions.

## User Stories

1. As a maintainer, I want one documented engineering workflow, so that I never have to choose between Matt skills and OpenSpec for new work.
2. As a maintainer, I want an idea in an existing codebase to begin with `grill-with-docs`, so that requirements, terminology, and hard decisions are resolved before implementation.
3. As a maintainer, I want multi-session work converted into a spec and tracer-bullet tickets, so that each implementation session receives a bounded, durable contract.
4. As a maintainer, I want a clear low-risk change to enter `implement` directly, so that small work does not pay the overhead of a second quick-change workflow.
5. As an agent, I want the repository entry instructions to route me unambiguously to the Matt workflow, so that I do not create new OpenSpec artifacts accidentally.
6. As an agent, I want the same workflow policy to apply across all repository-provided agent integrations, so that Codex and CodeBuddy do not expose conflicting commands or skills.
7. As a maintainer, I want each feature spec and its tickets retained permanently in the local Markdown tracker, so that the intent and delivery history remain reviewable after completion.
8. As an implementer, I want tickets to move through `ready-for-agent`, `claimed`, and `resolved`, so that work ownership and completion are explicit.
9. As an implementer, I want a resolved ticket to record its commit and validation evidence, so that the delivered change can be traced back to its acceptance criteria.
10. As a maintainer, I want an approved spec to remain stable after tickets are published, so that implementation cannot silently redefine the requested behavior.
11. As a maintainer, I want scope-changing discoveries captured as approved amendments or a renewed design discussion, so that scope drift remains visible.
12. As a future investigator, I want the existing OpenSpec tree preserved at its current location, so that old links, requirements, and design rationale remain discoverable.
13. As a future investigator, I want frozen OpenSpec material clearly labelled as historical, so that I do not mistake unmaintained specs for current behavior.
14. As a maintainer, I want current behavior grounded in code, executable tests, and Current documentation, so that the source of truth evolves with the implementation.
15. As a maintainer, I want to avoid a bulk rewrite of all legacy capability specs, so that the migration does not manufacture a large set of unverified current documents.
16. As a maintainer, I want still-relevant legacy knowledge promoted only when an area is touched, so that glossary, ADR, and Current documentation stay selective and verified.
17. As a developer, I want the OpenSpec CLI and package metadata removed, so that a fresh dependency install no longer carries an unused workflow runtime.
18. As a developer, I want OpenSpec-only validation and hook code removed, so that commits no longer execute obsolete checks.
19. As a developer, I want no replacement pre-commit system introduced by this migration, so that workflow retirement and general commit automation remain independent changes.
20. As an agent, I want active OpenSpec skills and slash-command entry points removed, so that obsolete workflows cannot be selected by accident.
21. As an agent, I want the repository's core Matt skills to retain their upstream semantics, so that repository-specific lifecycle rules are centralized rather than copied across skills.
22. As a developer, I want all new branches to use the `codex/` prefix, so that branch ownership and purpose are predictable.
23. As an implementer, I want one feature branch and one reviewed commit per ticket by default, so that multi-ticket work remains simple and bisectable.
24. As an implementer, I want independent branches or worktrees only when tickets are explicitly implemented in parallel, so that sequential work avoids unnecessary integration machinery.
25. As a maintainer, I want ticket-level focused validation and feature-level repository validation, so that feedback is fast without sacrificing final confidence.
26. As a maintainer, I want every completed feature reviewed against both repository standards and its spec, so that good code cannot mask the wrong behavior and correct behavior cannot mask poor design.
27. As a maintainer, I want ticket commits to be created automatically after successful review, so that each ticket produces a stable checkpoint.
28. As a maintainer, I want merge, push, and remote branch deletion to require explicit approval, so that shared repository state remains under human control.
29. As a maintainer, I want normal features merged with a merge commit, so that ticket commits and the feature boundary are both preserved.
30. As a maintainer, I want merged local feature branches cleaned up automatically, so that the local branch list does not accumulate completed work.
31. As a new contributor, I want development and architecture documentation to stop presenting OpenSpec as current authority, so that onboarding reflects the workflow actually in use.
32. As an operator, I want existing release and feature documentation to remain useful after the migration, so that workflow retirement does not alter runtime or release behavior.
33. As a maintainer, I want the decision to replace OpenSpec captured in an ADR, so that the frozen legacy tree and the loss of cumulative capability specs have an explicit rationale.
34. As a maintainer, I want this migration itself represented by a Matt spec and tickets, so that the replacement workflow proves itself through real use.

## Implementation Decisions

- The Matt skills workflow becomes the repository's sole active workflow for new engineering work.
- Standard feature work follows conversation and domain clarification, specification, tracer-bullet ticketing, test-driven implementation, and two-axis review.
- Clear, low-risk, single-session changes use a direct implementation fast path on a short-lived `codex/quick-<slug>` branch. The separate quick-change skill is removed. If scope expands, work stops and returns to the standard design flow.
- The local Markdown tracker is version controlled. Feature directories, specs, tickets, status transitions, amendments, commit references, and validation evidence remain permanently at their original locations.
- Tickets use `ready-for-agent`, `claimed`, and `resolved` as lifecycle states. An implementation claims its ticket before editing and resolves it only after tests, review, and commit succeed.
- Once tickets are published, the spec is the approved baseline. Clarifications are appended as dated amendments; scope, behavior, or architectural changes require renewed design confirmation and corresponding ticket updates.
- Repository-specific workflow rules live in one agent workflow document referenced by the repository entry instructions. Core Matt skills are not duplicated or broadly customized.
- Existing OpenSpec content remains in place as frozen, read-only historical material. New artifacts and edits are prohibited unless the maintainer explicitly requests historical correction.
- Frozen OpenSpec specs are no longer current authority. They may be consulted as historical clues only after verification against code, tests, and Current documents.
- No bulk conversion of legacy capability specs is performed. Relevant knowledge is promoted incrementally when touched, using the domain glossary for stable language, ADRs for durable decisions, and Current documents or tests for maintained behavior.
- All active OpenSpec workflow integrations are removed from both repository-provided agent environments, including skills, command aliases, CLI dependencies, root commands, validation scripts, archive checks, tests, and staged-check routing.
- Historical OpenSpec configuration, archived changes, cumulative specs, and integrity metadata stay inside the frozen legacy tree for traceability.
- The existing OpenSpec-only pre-commit stack is removed because it has no remaining responsibility. This migration does not install a replacement hook system.
- Current architecture, development, feature, release, and onboarding documentation must no longer describe frozen OpenSpec specs as authoritative. Historical references may remain only when their legacy status is explicit.
- One accepted ADR records the workflow replacement, the preservation of legacy material, and the trade-off of abandoning cumulative capability-spec maintenance.
- Feature work uses one `codex/<feature-slug>` branch and one reviewed commit per ticket by default. Parallel ticket branches or worktrees are created only when parallel execution is explicitly chosen.
- A ticket runs focused tests and affected-package lint/typecheck before review and commit. The completed feature runs repository-wide lint, typecheck, tests, documentation checks when relevant, and a final review against the target branch.
- Ticket commits may be created automatically after successful validation and review. Merge, push, and remote branch deletion require explicit maintainer approval.
- Normal features merge with `--no-ff` to preserve ticket commits and the feature boundary. A merged local feature branch is removed after success; remote cleanup remains separately authorized.
- The current migration continues on the renamed Matt-workflow feature branch and targets the local main branch. Existing uncommitted Matt configuration and obsolete-workflow deletions are preserved and incorporated rather than recreated.

## Testing Decisions

- Good tests exercise the repository's externally visible workflow and command surface rather than asserting the internal implementation of deleted scripts.
- The primary acceptance seam is a fresh repository checkout: dependency installation succeeds with a frozen lockfile, active workflow navigation points only to Matt skills, and no non-legacy entry point invokes OpenSpec.
- A static completion scan covers root commands, package metadata, repository scripts, documentation, and both repository-provided agent environments. The frozen legacy tree is explicitly excluded from the prohibition because it intentionally retains historical OpenSpec text.
- The existing documentation guard validates the new workflow document, ADR, index entries, and all updated links.
- Repository-wide lint, typecheck, and tests demonstrate that removing workflow tooling does not change application behavior.
- A whitespace/error diff check remains part of final validation.
- The migration does not add a permanent workflow-policy test or pre-commit hook. The versioned spec, tickets, repository instructions, and one-time acceptance scan are sufficient for this change.
- This migration's own local spec and tickets serve as a manual end-to-end proof that the Matt workflow can carry a repository-wide change.

## Out of Scope

- Rewriting the legacy capability-spec corpus into Current documentation.
- Converting every archived OpenSpec design into an ADR or every requirement noun into the domain glossary.
- Deleting, relocating, or rewriting the frozen OpenSpec historical tree.
- Changing IAM runtime behavior, API contracts, database schema, deployment topology, or user-facing functionality.
- Introducing a new generic pre-commit, CI, formatting, lint-staged, or commit-policy system.
- Replacing the configured local Markdown tracker with GitHub, GitLab, Linear, or another remote tracker.
- Merging into the target branch, pushing commits, or deleting remote branches without later explicit approval.
- Broadly editing Matt core skills beyond removing obsolete OpenSpec and quick-change entry points.
- Backfilling additional domain glossary terms unrelated to the workflow migration.

## Further Notes

- The workflow replacement ADR is accepted before ticket implementation begins.
- The frozen legacy tree is allowed to retain OpenSpec names, schemas, and commands; the prohibition applies to active repository workflow surfaces outside that tree.
- Both Codex and CodeBuddy currently contain OpenSpec skills, while CodeBuddy also contains OpenSpec command aliases. Both surfaces are in scope for removal.
- The current working tree already contains the installed Matt skills configuration and deletion of the superseded repository workflow documents. Those changes are part of this feature and must not be overwritten or discarded.
- The completed feature spec and resolved tickets remain version controlled at this location as the first durable example of the new workflow.

## Amendments

### 2026-07-16 — Permit test-only baseline repairs required by final validation

Final repository validation exposed two failures already present at the `main` baseline: three compile-time assertion values violate the current unused-variable lint convention, and one OIDC HTTP logging integration test exceeds its 10-second local timeout only under full-suite parallel load while passing in 1.7 seconds when focused.

The maintainer approved two narrowly scoped repairs in ticket 05: prefix the three type-assertion constants with `_`, and raise only the affected integration test's local timeout to 30 seconds. These changes must preserve all existing assertions, add no production behavior, and introduce no new general lint, test, hook, or timeout policy.
