## 1. Shared Audit Utilities

- [x] 1.1 Add a shared mobile audit masking helper under `packages/domain/src/audit/` and export it from `@iam/domain/audit`.
- [x] 1.2 Add unit tests for mobile audit masking, including nullish values, normal 11-digit mobile numbers, and non-matching input.
- [x] 1.3 Replace duplicated `maskMobileForAudit` usages in touched audit event paths with the shared helper.

## 2. API User Service Helpers

- [x] 2.1 Create `apps/api/src/services/user/user-password.helper.ts` for password strength, password hash, and password verification rules.
- [x] 2.2 Update `apps/api/src/services/user/user.service.ts` to use the password helper while preserving `setPassword`, `resetPassword`, and `checkPassword` external behavior.
- [x] 2.3 Create `apps/api/src/services/user/user-detail.helper.ts` for user detail employment, roles, and privileges aggregation.
- [x] 2.4 Update `getUserDetailById`, `getUserDetailByUsername`, `getUserDetailByMobile`, and `getUserDetailByWxId` to delegate aggregation to the user detail helper.
- [x] 2.5 Create `apps/api/src/services/user/user-mobile-binding.helper.ts` for mobile binding validation and verification failure handling.
- [x] 2.6 Update `setMobile` to keep the transaction and write orchestration in `user.service.ts` while delegating validation to the mobile binding helper.
- [x] 2.7 Create `apps/api/src/services/user/user-delegation-query.helper.ts` for `searchUsersWithPrivilegeDelegation` aggregation.
- [x] 2.8 Update `searchUsersWithPrivilegeDelegation` to delegate the query aggregation while preserving input validation and returned shape.

## 3. API Audit Event Helpers

- [x] 3.1 Create `apps/api/src/services/audit/events/self-user.audit.ts` for self password change, password reset, and mobile bind audit events.
- [x] 3.2 Update `apps/api/src/services/user/user.service.ts` and mobile binding helper to call self-user audit event helpers.
- [x] 3.3 Create `apps/api/src/services/audit/events/auth.audit.ts` for password login, mobile login, local login, SSO login, and SMS code audit events currently emitted from auth/open/session/SSO flows.
- [x] 3.4 Update API auth/open/session/SSO call sites to use auth audit event helpers without changing action names or details semantics.
- [x] 3.5 Create `apps/api/src/services/audit/events/internal.audit.ts` for internal delegation and supplier registration audit events.
- [x] 3.6 Update internal route handlers to use internal audit event helpers without changing actor resolution or request context behavior.

## 4. Admin API Audit Event Helpers

- [x] 4.1 Create `apps/admin-api/src/services/audit/admin-resource-audit.ts` for shared admin actor/context resolution, target mapping, and success event writing.
- [x] 4.2 Create `apps/admin-api/src/services/audit/events/user.audit.ts` and migrate admin user audit payload construction from `user.service.ts`.
- [x] 4.3 Create `apps/admin-api/src/services/audit/events/client.audit.ts` and migrate admin client audit payload construction from `client.service.ts`.
- [x] 4.4 Create `apps/admin-api/src/services/audit/events/organization.audit.ts` and migrate organization audit payload construction from `organization.service.ts`.
- [x] 4.5 Create `apps/admin-api/src/services/audit/events/position.audit.ts` and migrate position audit payload construction from `position.service.ts`.
- [x] 4.6 Create `apps/admin-api/src/services/audit/events/employment.audit.ts` and migrate employment audit payload construction from `employment.service.ts`.

## 5. Tests And Verification

- [x] 5.1 Add or update API user helper tests for password helper, user detail aggregation, mobile binding validation, and privilege delegation query behavior.
- [x] 5.2 Add or update API audit event helper tests to verify action, outcome, actor, target, details, and mobile masking for migrated events.
- [x] 5.3 Add or update admin-api audit event helper tests for user, client, organization, position, and employment mutation audit events.
- [x] 5.4 Run `pnpm --filter @iam/domain test` and `pnpm --filter @iam/domain typecheck`.
- [x] 5.5 Run `pnpm --filter @iam/api test` and `pnpm --filter @iam/api typecheck`.
- [x] 5.6 Run `pnpm --filter @iam/admin-api test` and `pnpm --filter @iam/admin-api typecheck`.
- [x] 5.7 Run `openspec status --change refactor-user-audit-modules` and confirm the implementation tasks are tracked.
