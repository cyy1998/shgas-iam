## Why

Password and mobile verification-code login currently reject invalid credentials without escalating repeated failures. Adding an automatic suspension rule reduces brute-force and credential-stuffing risk for public IAM login endpoints.

## What Changes

- Track consecutive failed attempts for password login and mobile verification-code login in `apps/api`.
- If a user's consecutive failed attempts reach 5 within a rolling 30-minute window, update that user to `UserStatus.Pause`.
- Reset the tracked failure streak after a successful password or mobile verification-code login.
- Keep the rule scoped to global password and mobile login; third-party OA/WeChat login and non-login verification-code usages are out of scope.
- Return a normal login failure response for the triggering failed attempt while ensuring subsequent login attempts for the paused user fail through the existing inactive-user behavior.

## Capabilities

### New Capabilities
- `login-failure-suspension`: Defines the account suspension behavior for repeated password or mobile verification-code login failures.

### Modified Capabilities

## Impact

- `apps/api/src/routes/auth/auth.service.ts` login flows.
- `apps/api/src/services/user/*` user lookup/status update helpers.
- Redis-backed short-lived failure counters, or an equivalent existing persistence mechanism suitable for 30-minute rolling windows.
- `@iam/contracts` `UserStatus.Pause` is reused; no new enum value is expected.
- Validation should cover threshold behavior, reset on success, and both password and mobile login paths.
