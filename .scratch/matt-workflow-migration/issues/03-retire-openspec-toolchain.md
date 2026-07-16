# 03 — Retire the OpenSpec toolchain

**What to build:** Ensure a fresh checkout installs, validates, and commits without carrying or invoking the OpenSpec runtime or its dedicated hook and validation stack.

**Blocked by:** 01 — Establish the Matt workflow contract and freeze OpenSpec.

**Status:** resolved

- [x] Package metadata and workspace configuration contain no OpenSpec CLI dependency, OpenSpec commands, or OpenSpec-specific build allowance.
- [x] OpenSpec validation, archive-integrity, staged-check, hook-installation, and associated test code with no remaining responsibility are removed.
- [x] The OpenSpec-only pre-commit dependencies and configuration are removed without introducing a replacement hook system.
- [x] The dependency lockfile is consistent with the reduced manifest, and a frozen dependency installation with lifecycle scripts disabled succeeds.
- [x] Root commands and retained automated tests no longer reference deleted OpenSpec tooling.

## Resolution

- Commit: `5c16e46ce43bb6240519959838ce6ef24679630c`
- Validation:
  - `pnpm install --lockfile-only --ignore-scripts` — passed and removed the retired dependencies from the lockfile.
  - `pnpm install --frozen-lockfile --ignore-scripts` — passed without downloading packages.
  - Active package, script, runtime, Docker, Compose, and CI reference scans — passed with no retired-tooling references.
  - The generated local `.git/hooks/pre-commit` wrapper was identified as OpenSpec-only and removed.
  - `git diff --check` — passed.
- Review: Standards and Spec reviews both passed with no unresolved findings after removing six stale Dockerfile copies of the deleted hook installer.
