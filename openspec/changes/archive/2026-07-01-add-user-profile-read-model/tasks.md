## 1. Database Schema and Migrations

- [x] 1.1 Add `packages/db/src/schema/core/user-profiles.ts` with `userProfiles`, JSONB typed fields, schema version metadata, visibility fields, timestamps, and indexes.
- [x] 1.2 Add `packages/db/src/schema/core/user-profile-dirty.ts` with one-row-per-user dirty state, reason codes, attempts, last error, job id, and processing timestamps.
- [x] 1.3 Export new schema modules from core and top-level schema indexes, and add relations only where useful.
- [x] 1.4 Generate and review a Drizzle migration for `user_profile` and `user_profile_dirty`, including BTREE identity indexes and GIN `search_doc` index.
- [x] 1.5 Add schema tests for key constraints, indexes, JSONB fields, and absence of a GIN index on `detail`.

## 2. API Env and Runtime Wiring

- [x] 2.1 Extend `apps/api/src/env.ts` with `IAM_API_USER_PROFILE_WORKER_CONCURRENCY`, `IAM_API_USER_PROFILE_REBUILD_BATCH_SIZE`, and `IAM_API_USER_PROFILE_BACKFILL_BATCH_SIZE` defaults.
- [x] 2.2 Expose grouped `env.userProfile` camelCase runtime config without leaking raw env keys outside env boundary.
- [x] 2.3 Update env tests and env naming guard expectations for the new `IAM_API_*` variables.
- [x] 2.4 Thread user-profile config through `apps/api` runtime/composition where worker and builder need it.

## 3. Profile Schemas, Repositories, and Query Service

- [x] 3.1 Add `apps/api/src/services/user-profile/` DTO/Zod schemas for `UserProfileSearchDoc`, filter DSL, dirty status, and current schema version.
- [x] 3.2 Add a profile repository for upserting profiles, reading current-version profiles by userId/username/mobile/wxId, and searching current-version visible profiles.
- [x] 3.3 Add a dirty repository for upserting dirty rows, claiming/marking processing rows, marking processed/failed rows, and scanning failed/stale rows.
- [x] 3.4 Implement `UserProfileQueryService` methods for identity lookup, legacy `UserQueryDto` search, and explicit nested DSL search without wiring existing routes.
- [x] 3.5 Add unit tests for current-version filtering, missing-profile no-fallback behavior, legacy nested employment compilation, and DSL validation failures.

## 4. Batch Profile Builder

- [x] 4.1 Implement a batch repository/helper that loads users, active employments, positions, organization closure paths, roles, and privileges for a set of userIds.
- [x] 4.2 Implement `buildOne(userId)` and `buildMany(userIds)` to produce `detail`, `search_doc`, `search_visible`, and schema version output.
- [x] 4.3 Preserve organization path behavior by excluding deleted organizations but not filtering by organization status.
- [x] 4.4 Add builder tests covering multiple employments, primary employment, organization ancestor keys, position roles, employment roles, organization roles, role privileges, disabled/deleted data, and fixed `orcasId: null`.

## 5. Worker and Job Processing

- [x] 5.1 Add `apps/api/src/workers/user-profile.ts` as an independent worker entry using `@iam/jobs`, app logger, app env, DB repositories, and user-profile services.
- [x] 5.2 Implement `rebuild-user-profile` processing that treats dirty rows as source of truth and no-ops when no pending/failed dirty row exists.
- [x] 5.3 Implement `expand-user-profile-scope` processing for `all-users`, `user-ids`, `organization-id`, `position-id`, `role-id`, `privilege-id`, and `employment-id`.
- [x] 5.4 Implement backfill/repair commands or job producers that scan users or failed/stale dirty rows in batches and enqueue user-level rebuild jobs.
- [x] 5.5 Add worker/service tests for successful rebuild, no-op stale job, failure recording, organization descendants expansion, role/privilege reverse expansion, and backfill batching.

## 6. Composition and Non-Cutover Integration

- [x] 6.1 Add profile repositories to `apps/api` repository composition without changing existing `UserService` read methods.
- [x] 6.2 Add profile builder/query/worker services to composition modules used by the worker entry.
- [x] 6.3 Ensure existing public/open/internal/sso routes and session resolution still use the old user read path in this change.
- [x] 6.4 Document worker startup scripts in `apps/api/package.json` without modifying Docker services in this change.

## 7. Validation

- [x] 7.1 Run `pnpm --filter @iam/db db:generate` or the repository-approved migration command and inspect the generated SQL.
- [x] 7.2 Run `pnpm --filter @iam/db db:check` when available for migration/schema validation.
- [x] 7.3 Run `pnpm --filter @iam/api test` for user-profile and affected API service tests.
- [x] 7.4 Run `pnpm --filter @iam/api typecheck`.
- [x] 7.5 Run `pnpm --filter @iam/db typecheck` and affected shared package type checks.
- [x] 7.6 Run affected lint checks for `@iam/api` and `@iam/db`.
