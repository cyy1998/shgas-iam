# 03 — Retire the OpenSpec toolchain

**What to build:** Ensure a fresh checkout installs, validates, and commits without carrying or invoking the OpenSpec runtime or its dedicated hook and validation stack.

**Blocked by:** 01 — Establish the Matt workflow contract and freeze OpenSpec.

**Status:** ready-for-agent

- [ ] Package metadata and workspace configuration contain no OpenSpec CLI dependency, OpenSpec commands, or OpenSpec-specific build allowance.
- [ ] OpenSpec validation, archive-integrity, staged-check, hook-installation, and associated test code with no remaining responsibility are removed.
- [ ] The OpenSpec-only pre-commit dependencies and configuration are removed without introducing a replacement hook system.
- [ ] The dependency lockfile is consistent with the reduced manifest, and a frozen dependency installation with lifecycle scripts disabled succeeds.
- [ ] Root commands and retained automated tests no longer reference deleted OpenSpec tooling.
