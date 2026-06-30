## 1. Workspace Package Setup

- [x] 1.1 Create `packages/jobs` with `package.json`, `src/index.ts`, scripts, exports, and ESLint/typecheck setup matching existing backend shared packages.
- [x] 1.2 Add BullMQ and required runtime dependencies to `@iam/jobs`.
- [x] 1.3 Ensure root workspace discovery includes `@iam/jobs` without changing unrelated package configuration.

## 2. Shared Job Queue Helpers

- [x] 2.1 Implement a Redis connection helper for BullMQ using app-provided Redis config and a dedicated queue connection.
- [x] 2.2 Implement thin `createJobQueue` and `createJobWorker` helpers with default attempts/backoff and optional concurrency.
- [x] 2.3 Implement deterministic jobId helpers for user-level jobs and scope/time-bucket jobs.
- [x] 2.4 Expose only generic queue mechanics from `@iam/jobs`, keeping business-specific user-profile concepts out of the package.

## 3. User Profile Job Contracts

- [x] 3.1 Add `zod` as a runtime dependency of `@iam/contracts` for job payload schemas.
- [x] 3.2 Add `packages/contracts/src/jobs/user-profile.ts` with queue name, job names, scope types, dirty reason values, payload schemas, and inferred types.
- [x] 3.3 Export the new job contracts from `packages/contracts/src/index.ts`.
- [x] 3.4 Ensure the contracts allow `apps/admin-api` and `apps/api` to share job payloads without importing app-private modules.

## 4. Tests and Validation

- [x] 4.1 Add focused tests for deterministic jobId generation and default queue options in `@iam/jobs`.
- [x] 4.2 Add focused tests for user-profile job payload schema validation in `@iam/contracts`.
- [x] 4.3 Run `pnpm --filter @iam/jobs typecheck` and `pnpm --filter @iam/jobs test`.
- [x] 4.4 Run `pnpm --filter @iam/contracts typecheck` and `pnpm --filter @iam/contracts test`.
- [x] 4.5 Run affected lint checks for `@iam/jobs` and `@iam/contracts`.
