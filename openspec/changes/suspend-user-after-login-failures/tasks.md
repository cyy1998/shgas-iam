## 1. Failure Tracking

- [x] 1.1 Add a login failure tracking helper in `apps/api` that records user-scoped failed login timestamps in Redis, prunes entries older than 30 minutes, returns the current streak count, and clears the streak on success.
- [x] 1.2 Use Redis operations that keep each user failure key short-lived and safe under concurrent failed attempts.

## 2. User Status Update

- [x] 2.1 Add or expose an `apps/api` user repository/service helper that can set an enabled user's status to `UserStatus.Pause` by user id.
- [x] 2.2 Ensure suspension updates preserve existing deleted-user and inactive-user protections.

## 3. Login Flow Integration

- [x] 3.1 Update password login to record an enabled user's failed password attempt when password validation fails, suspend at the threshold, and clear the streak after successful login.
- [x] 3.2 Update mobile verification-code login to resolve the enabled user by mobile number, record wrong login-code attempts, suspend at the threshold, and clear the streak after successful login.
- [x] 3.3 Preserve existing `MAGIC_CODE` behavior without recording a failed attempt.
- [x] 3.4 Keep OA login, WeChat login, password reset, mobile binding, and other verification-code usages outside the failure tracking flow.

## 4. Validation

- [x] 4.1 Add focused tests for password login threshold suspension, success reset, and failures outside the 30-minute window.
- [x] 4.2 Add focused tests for mobile login wrong-code suspension and shared streak counting across password and mobile login.
- [x] 4.3 Run the relevant `@iam/api` typecheck/lint commands and document any commands that cannot run locally.
