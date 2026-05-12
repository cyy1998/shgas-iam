# UserDetailDto 异步搜索投影实施计划

> For agentic workers: implement task-by-task. Keep changes focused, run the validation command listed at the end of each task, and do not switch non-admin read paths to the projection until the projection table, worker, enqueue triggers, and backfill command are all in place.

## Overview

Implement the design in `docs/superpowers/specs/2026-05-12-user-detail-projection-async-design.md`.

The feature adds a PostgreSQL-backed `UserDetailDto` read model refreshed asynchronously through BullMQ. Relation tables remain the source of truth. The projection stores public `detail` JSONB and private `searchIndex` JSONB. Non-admin user reads will switch to the projection after a backfill path exists.

Key choices:

- BullMQ queue name: `iam:async-jobs`
- Worker deployment: embedded in the API process
- Job envelope: generic `AsyncJobEnvelope`
- First job: `projection.refresh` with `projection: "user-detail"`
- User projection jobId: `projection:user-detail:user:${userId}`
- Projection miss behavior: search omits the user; detail returns 404
- No source fallback on read
- No Redis session refresh in this feature
- No field-level patching; rebuild the full projection by `userId`
- Employment search condition: only require active employment when at least one employment condition is present

## Task 1: Add BullMQ Dependency And Runtime Config

- Add `bullmq` to `apps/api/package.json`.
- Add API env config for worker behavior:
  - `ASYNC_JOBS_ENABLED`: boolean-like value defaulting to enabled outside tests.
  - `ASYNC_JOBS_WORKER_CONCURRENCY`: numeric default, recommended `2`.
- Keep Redis connection settings based on the existing `@api/lib/clients/redis` config values.
- Do not introduce a new Redis deployment or connection source.

Validation:

```bash
pnpm install
pnpm --filter @iam/api typecheck
```

## Task 2: Create User Detail Projection Schema

- Add a Drizzle schema file for `user_detail_projection` under `apps/api/src/db/schema/core/`.
- Use `snakeCase.table`.
- Define columns:
  - `id`
  - `userId`
  - `username`
  - `mobile`
  - `wxId`
  - `status`
  - `detail` as JSONB typed to `UserDetailDto`
  - `searchIndex` as JSONB typed to `UserDetailSearchIndex`
  - `refreshedAt`
  - timestamp columns consistent with local schema helpers
- Add indexes:
  - unique `userId`
  - unique `username`
  - btree `mobile`
  - btree `wxId`
  - btree `status`
  - GIN `searchIndex`
- Export the schema from `apps/api/src/db/schema/core/index.ts`.
- Add Zod schemas derived with `drizzle-orm/zod` where useful.

Validation:

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api db:generate
```

## Task 3: Define Projection Types And Search Index Schema

- Add service-level types and schemas for:
  - `UserDetailSearchIndex`
  - `UserDetailProjection`
- Keep `UserDetailDto` unchanged.
- Validate `searchIndex` with Zod before writing it.
- Include employment index fields:
  - `employmentId`
  - `status`
  - `isDelete`
  - `orgCode`
  - `compCode`
  - `posCode`
  - `roleCodes`
  - `privilegeCodes`
  - `ancestorOrgs: { orgCode, depth }[]`

Validation:

```bash
pnpm --filter @iam/api typecheck
```

## Task 4: Implement Generic Async Job Infrastructure

- Create `apps/api/src/lib/async-jobs/`.
- Define `AsyncJobEnvelope<TName, TPayload>` and Zod schemas for the supported job union.
- Create a BullMQ queue singleton named `iam:async-jobs`.
- Add a generic enqueue helper that:
  - fills `meta.requestedAt`
  - applies default attempts/backoff/remove options
  - accepts a deterministic `jobId`
  - logs enqueue failures and does not throw by default for business write paths
- Add an embedded worker initializer that:
  - is singleton-safe
  - checks `ASYNC_JOBS_ENABLED`
  - uses configured concurrency
  - parses job data with Zod before dispatching
  - logs completed and failed jobs
- Wire worker initialization from API startup without changing route behavior.

Validation:

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api lint
```

## Task 5: Add Projection Refresh Job Handler

- Add `projection.refresh` job schema:

```ts
{
  name: "projection.refresh",
  version: 1,
  payload: {
    projection: "user-detail",
    target: { entityType: "user", entityId: number }
  },
  meta: { reason, source, requestId?, requestedAt }
}
```

- Implement handler dispatch:
  - `projection.refresh`
  - `projection: "user-detail"`
- Add public helper:

```ts
enqueueUserDetailProjectionRefresh(userIds, meta)
```

- Deduplicate input userIds before enqueue.
- Use `jobId = projection:user-detail:user:${userId}`.

Validation:

```bash
pnpm --filter @iam/api typecheck
```

## Task 6: Build Projection From Source Tables

- Add a source-only builder that does not read from `user_detail_projection` and does not enqueue jobs:

```ts
buildUserDetailProjectionFromSource(userId: number)
```

- Reuse existing DTO schemas and converters where possible.
- Rebuild:
  - `UserDetailDto.detail`
  - `UserDetailSearchIndex.searchIndex`
- Build `ancestorOrgs` from `organization_closure + organization`.
- Keep role and privilege aggregation behavior compatible with existing `UserDetailDto`.
- If the user is missing, disabled, or soft-deleted, return a delete signal rather than a projection payload.

Validation:

```bash
pnpm --filter @iam/api typecheck
```

## Task 7: Add Projection Repository

- Implement repository functions:

```ts
upsertUserDetailProjection(projection)
deleteUserDetailProjectionByUserId(userId)
getUserDetailProjectionByUsername(username)
getUserDetailProjectionByUserId(userId)
searchUserDetailProjections(query)
```

- `upsert` must update `username/mobile/wxId/status/detail/searchIndex/refreshedAt`.
- `delete` is used when the source user is disabled, deleted, or missing.
- Keep repository SQL helpers isolated; do not scatter JSONB SQL in service files.

Validation:

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api lint
```

## Task 8: Implement Projection Search Semantics

- Implement `searchUserDetailProjections(query: UserQueryDto)` with unchanged input and output semantics except for the new employment rule.
- User-level filters:
  - `usernames`
  - `phones`
  - `wxIds`
  - enabled status
  - non-deleted projection records
- Employment-level filters:
  - `ancestorOrgCodes`
  - `ancestorOrgDepths`
  - `positionCodes`
  - `roleCodes`
- Only add the active employment JSONB condition when at least one employment-level filter is provided.
- When employment filters are present, require one same active employment to satisfy all provided employment filters.
- Use a repository helper such as:

```ts
userDetailProjectionEmploymentMatches(query)
```

- Prefer `jsonb_path_exists` or equivalent JSONB logic wrapped in one helper.

Validation scenarios:

- Search by username only returns an enabled user even if they have no active employment.
- Search by `ancestorOrgCodes` requires active employment.
- Search by `ancestorOrgCodes + positionCodes + roleCodes` requires the same active employment to satisfy all conditions.

Validation:

```bash
pnpm --filter @iam/api typecheck
```

## Task 9: Implement Refresh Handler

- Implement:

```ts
refreshUserDetailProjection(userId: number): Promise<void>
```

- Handler flow:
  - call source builder
  - delete projection for missing/disabled/deleted users
  - validate DTO and search index
  - upsert projection
- Ensure the handler is idempotent and safe to retry.
- Log enough context on failure:
  - `userId`
  - job name
  - job id
  - reason/source from meta

Validation:

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api lint
```

## Task 10: Add Affected User Resolver Functions

- Add resolver repository functions:

```ts
findUserIdsByOrganizationScope(orgId: number, includeSubtree: boolean)
findUserIdsByPosition(posId: number)
findUserIdsByRole(roleId: number)
findUserIdsByPrivilege(privilegeId: number)
```

- `findUserIdsByOrganizationScope` must support:
  - direct organization only
  - organization subtree through `organization_closure`
- `findUserIdsByRole` must include users affected through:
  - `employment_role`
  - `position_role`
  - `organization_role`
  - `organization_role.is_all_sub`
- Return distinct userIds.

Validation:

```bash
pnpm --filter @iam/api typecheck
```

## Task 11: Enqueue Refresh Jobs From Write Paths

Add enqueue calls after successful business transactions. Do not enqueue before the transaction commits.

User write paths:

- create user
- update user
- update user status
- delete user
- set mobile
- resign user

Employment write paths:

- create employment
- update employment
- update employment status
- delete employment
- transfer employment
- set primary employment

Organization write paths:

- update organization
- update organization status
- delete organization

Position write paths:

- update position
- update position status
- delete position

Role and privilege binding paths:

- role assigned to employment
- role removed from employment
- role assigned to position
- role assigned to organization
- role privilege assigned
- any future role privilege removal path

Each enqueue call must set useful metadata:

```ts
reason: "employment.changed"
source: "employment.update"
```

Validation:

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api lint
```

## Task 12: Add Backfill Command

- Add API package script:

```bash
projection:rebuild:user-detail
```

- Implement a Bun script that:
  - scans all effective users that should have projections
  - batches userIds
  - enqueues `projection.refresh/user-detail`
  - logs total count, enqueue success count, and failures
- The script must not build projection JSON directly; it should enqueue jobs so production and backfill use the same builder.

Validation:

```bash
pnpm --filter @iam/api projection:rebuild:user-detail
```

## Task 13: Switch Non-Admin User Reads To Projection

- Update non-admin `searchUsers(query)` to read from `user_detail_projection`.
- Update non-admin user detail reads to use projection:
  - by id
  - by username
  - by mobile
  - by wxId
- Keep password check and any password-sensitive path on the source `users` table.
- Do not change admin search/detail paths in this task unless they explicitly consume the same non-admin service.
- Preserve response DTOs.
- Projection miss behavior:
  - search omits missing records
  - detail throws `UserNotFoundError` or existing equivalent 404

Validation:

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api lint
```

Manual smoke:

- `POST /users/search` by username only.
- `POST /users/search` with `ancestorOrgCodes`.
- `GET /internal/users/:username` for projected and non-projected users.
- Public current-user detail route after login, verifying it does not use password fields from projection.

## Task 14: Migration And Rollout Validation

- Generate and review Drizzle migration SQL.
- Start local dependencies.
- Apply migration.
- Start API with embedded worker enabled.
- Run backfill command.
- Compare sample source detail vs projection detail for:
  - user base fields
  - employments
  - roles
  - privileges
  - ancestor search index
- Verify write-trigger refresh:
  - update user name
  - transfer employment
  - update organization name
  - update position name
  - change role privilege binding

Final validation:

```bash
pnpm --filter @iam/api typecheck
pnpm --filter @iam/api lint
pnpm --filter @iam/api db:generate
```

## Rollback Notes

- If projection reads misbehave, revert only the non-admin read-path switch to the original source-table services.
- Keep the projection table, worker, and enqueue triggers in place if they are not causing operational issues; they can continue warming data while queries are fixed.
- If worker processing causes pressure, disable it with `ASYNC_JOBS_ENABLED=false`.
- No data migration back to source tables is required because projection data is derived.
