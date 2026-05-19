## Context

`apps/api` exposes global password login at `/auth/login/password` and mobile verification-code login at `/auth/login/mobile`. Both flows currently reject invalid credentials, create sessions on success, and rely on active-user repository lookups that only return `UserStatus.Enable` users. The contracts package already defines `UserStatus.Pause`, and Redis is already used for sessions and verification codes.

The new behavior must suspend an enabled user after repeated consecutive credential failures without changing third-party login behavior or introducing a new user status.

## Goals / Non-Goals

**Goals:**
- Count failed password and login verification-code attempts per user across both supported global login methods.
- Suspend the user when the consecutive failure count reaches 5 within a rolling 30-minute window.
- Clear the failure streak after a successful password or mobile verification-code login.
- Keep storage short-lived and operationally simple by reusing Redis.
- Keep user status updates in the user service/repository boundary.

**Non-Goals:**
- No changes to OA, WeChat, authorization, password reset, mobile binding, or other verification-code usages.
- No new database table or migration unless implementation reveals Redis is unavailable for this behavior.
- No new user status enum value or admin UI workflow.
- No account auto-resume behavior.

## Decisions

1. Use a single per-user failure streak for both password and mobile login.

   Rationale: the requirement is account protection, not method-specific throttling. A user who fails password login three times and mobile-code login twice inside the window has still produced five consecutive failed login attempts.

   Alternative considered: maintain separate counters per login method. That is simpler to reason about per endpoint, but it weakens the protection and lets attackers rotate methods to avoid suspension.

2. Store failure timestamps in Redis using a user-scoped key.

   Rationale: Redis is already present in `apps/api`, and the 30-minute window is short-lived operational state. A timestamp set/list allows the implementation to remove entries older than `now - 30 minutes` before counting, matching a rolling window more accurately than a fixed TTL counter.

   Alternative considered: persist attempts in PostgreSQL. That improves auditability, but introduces schema and migration work for a short-lived enforcement rule. Existing `login_log` records successful logins only and should not be repurposed for failed attempts without a broader audit design.

3. Resolve the user before recording a failure, but only record failures for existing enabled users.

   Rationale: the system needs a stable user id to suspend the account. Unknown usernames, unknown mobile numbers, deleted users, and already paused/disabled users should continue through existing not-found or inactive-user behavior without creating failure records.

   Alternative considered: record by raw username/mobile input. That could support unknown-user throttling, but it adds privacy and enumeration considerations outside this change.

4. Treat the magic code as a successful credential bypass and do not record it as a failure.

   Rationale: current login logic accepts `config.MAGIC_CODE`. This change should preserve that behavior unless a separate policy change removes or restricts it.

5. Return the existing credential error for the triggering attempt after applying suspension.

   Rationale: this avoids adding a new public error contract for this proposal. After suspension, subsequent login attempts fail because enabled-user lookup no longer returns the paused user.

## Risks / Trade-offs

- [Risk] Redis state loss clears failure streaks before 30 minutes elapse -> Mitigation: acceptable for soft security enforcement; user status remains durable once suspended.
- [Risk] Concurrent failures could race around the threshold -> Mitigation: use Redis atomic operations or a transaction/pipeline so pruning, adding, counting, and expiry are consistent enough for threshold enforcement.
- [Risk] Mobile login currently checks the code before loading the user -> Mitigation: adjust the flow to resolve the enabled user by mobile before or alongside code validation so wrong-code attempts can be attributed.
- [Risk] Paused users might receive a generic not-found message due to active-only lookups -> Mitigation: preserve existing external behavior in this change and handle explicit paused-account messaging separately if needed.
