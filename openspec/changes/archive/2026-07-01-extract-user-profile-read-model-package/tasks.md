## 1. Package Setup

- [x] 1.1 新增 `packages/user-profile-read-model` workspace package，包含 `package.json`、`tsconfig.json`、`eslint.config.js`、`src/index.ts` 和基础 `test` / `lint` / `typecheck` scripts。
- [x] 1.2 在 workspace 依赖中为 `@iam/user-profile-read-model` 配置 `@iam/contracts`、`@iam/db`、`@iam/jobs` 以及实现所需运行时依赖。
- [x] 1.3 在 `apps/api` 和 `apps/admin-api` 的 `package.json` 中新增 `@iam/user-profile-read-model` 依赖。

## 2. Move User Profile Contracts And Schemas

- [x] 2.1 将 user-profile detail/search/DSL/schema version 相关 schema 和类型从 `apps/api/src/services/user-profile` 迁入 `packages/user-profile-read-model/src`。
- [x] 2.2 将 `UserDetailDto`、`UserDto`、`EmploymentDetailDto`、`toEmploymentDto` 等 profile detail 所需 DTO schema 从 API 私有模块迁入 `@iam/user-profile-read-model`。
- [x] 2.3 更新 API routes、handlers、services 和 tests 的 imports，使 API 响应与查询仍使用同一 DTO/schema 来源。
- [x] 2.4 确认 `@iam/contracts` 继续拥有 user-profile job payload、queue name、scope type、dirty reason 和 dirty status，不移动这些稳定 contract。

## 3. Move Read Model Implementation

- [x] 3.1 将 `user-profile.repository.ts`、`user-profile-query.service.ts`、`user-profile-build.repository.ts`、`user-profile-builder.service.ts` 和 `user-profile-worker.service.ts` 迁入 `@iam/user-profile-read-model`。
- [x] 3.2 将 `packages/domain/src/user-profile` 中的 dirty repository、scope repository 和 dirty marker 迁入 `@iam/user-profile-read-model`。
- [x] 3.3 将 `packages/jobs/src/user-profile.ts` 的 user-profile producer 迁入 `@iam/user-profile-read-model`，并继续复用 `@iam/jobs` 的 queue/jobId helper。
- [x] 3.4 为 `@iam/user-profile-read-model` 建立分层 exports，使 producer/query/worker side API 可被调用方明确导入。
- [x] 3.5 迁移并更新 user-profile read model 相关单元测试到新包，保持现有 builder、query、worker、dirty 和 producer 行为不变。

## 4. Update App Composition

- [x] 4.1 更新 `apps/api` composition，使 profile repository、query service、dirty marker、scope repository、producer 和过渡 worker composition 从 `@iam/user-profile-read-model` 获取。
- [x] 4.2 更新 `apps/admin-api` composition 和业务服务，使其从 `@iam/user-profile-read-model` 使用 dirty marker、scope repository、dirty repository 和 producer。
- [x] 4.3 保留 `apps/api` 的 `worker:user-profile` 入口作为过渡态，但使其仅通过 `@iam/user-profile-read-model` 的 worker-side API 构建 worker service。
- [x] 4.4 确认本 change 不新增 `apps/worker`、Dockerfile、compose worker service、health endpoint 或 BullMQ 面板。

## 5. Clean Up Old Ownership

- [x] 5.1 移除 `apps/api/src/services/user-profile` 中已迁入共享包的私有实现，保留或调整必要的 app-local adapter/import 入口。
- [x] 5.2 从 `packages/domain` 移除 user-profile dirty/scope/marker exports，并更新所有调用方 imports。
- [x] 5.3 从 `packages/jobs` 移除 user-profile producer exports，使该包只保留通用 BullMQ 基础设施。
- [x] 5.4 更新 API/admin-api 架构 guard 测试，禁止 `apps/worker` 目标路径依赖 `@api/*` 的前置问题，并禁止 app 从旧 user-profile 私有路径获取 producer/marker。

## 6. Verification

- [x] 6.1 运行 `pnpm --filter @iam/user-profile-read-model test` 和 `pnpm --filter @iam/user-profile-read-model typecheck`。
- [x] 6.2 运行 `pnpm --filter @iam/jobs test` 和 `pnpm --filter @iam/jobs typecheck`，确认 jobs 包收窄后仍可用。
- [x] 6.3 运行 `pnpm --filter @iam/domain test` 和 `pnpm --filter @iam/domain typecheck`，确认移除 user-profile 专属实现后无残留引用。
- [x] 6.4 运行 `pnpm --filter @iam/api test -- src/services/user-profile src/routes/internal/user src/workers` 和 `pnpm --filter @iam/api typecheck`。
- [x] 6.5 运行 `pnpm --filter @iam/admin-api test` 和 `pnpm --filter @iam/admin-api typecheck`。
- [x] 6.6 运行 `openspec status --change "extract-user-profile-read-model-package"`，确认 artifacts 和 task 状态可被 OpenSpec 识别。
