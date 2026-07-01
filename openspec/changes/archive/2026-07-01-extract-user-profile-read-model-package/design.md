## Context

`user_profile` 读模型已经承担 API 用户详情、用户搜索、DSL 搜索、dirty 持久化和 BullMQ rebuild 的职责，但实现分布在多个归属中：

```text
apps/api
  ├─ user-profile schema/query/repository/builder/worker service
  └─ user-profile worker entry

packages/domain
  └─ user-profile dirty/scope/marker

packages/jobs
  └─ user-profile producer
```

这种布局让 `apps/api` 成为 read model 业务实现的事实拥有者，也让后续 `apps/worker` 无法在不依赖 `@api/*` 的前提下复用 user-profile rebuild 逻辑。本 change 先解决代码归属和依赖方向；运行时迁移、compose worker service、health endpoint 和 BullMQ 面板留给后续 `add-worker-app-runtime`。

## Goals / Non-Goals

**Goals:**

- 新增 `@iam/user-profile-read-model`，集中拥有 user-profile read model 的 schema、repository、builder、query、dirty、producer 和 worker service。
- 让 `apps/api` 和 `apps/admin-api` 通过共享能力包生产 dirty/job、查询 profile，不再依赖 API 私有 user-profile 实现。
- 让过渡期 `apps/api` user-profile worker 入口只依赖共享能力包，为后续迁移到 `apps/worker` 铺平路径。
- 将 `@iam/jobs` 收窄为 BullMQ 基础设施包，不再拥有业务 producer。
- 保持现有 user-facing 行为、job payload、queue name、数据库 schema 和 stale-read 语义不变。

**Non-Goals:**

- 不新增 `apps/worker`。
- 不新增或修改 Docker Compose worker service。
- 不引入 BullMQ 面板、health endpoint、Basic Auth 或 dashboard-only 进程。
- 不修改 `user_profile` / `user_profile_dirty` 表结构、索引或迁移。
- 不改变 API 路由响应、旧搜索语义、DSL 校验规则或认证 live-check 边界。

## Decisions

### 1. 使用 `packages/user-profile-read-model` 作为能力包

新包名为 `@iam/user-profile-read-model`，目录为 `packages/user-profile-read-model`。它表达的是 `user_profile` 读模型能力，而不是通用用户域或通用 job 运行时。

备选方案：

- 放入 `packages/domain`：迁移路径短，但会继续把 domain 扩成共享后端实现桶。
- 使用 `@iam/user-profile`：名称过宽，容易和用户主数据/账号资料混淆。
- 放入 `apps/worker`：会让 API 查询与 worker 写入的 schema/DTO 分裂。

### 2. 新包提供分层公开入口

`@iam/user-profile-read-model` SHALL 暴露 producer/query/worker 三类入口：

```text
producer side
  - createUserProfileJobProducer
  - createUserProfileDirtyMarker
  - createUserProfileDirtyRepository
  - createUserProfileScopeRepository

query side
  - createUserProfileRepository
  - createUserProfileQueryService
  - detail/search/DSL schemas

worker side
  - createUserProfileBuildRepository
  - createUserProfileBuilder
  - createUserProfileWorkerService
```

`apps/api` 和 `apps/admin-api` SHALL NOT import worker-only composition/module APIs。过渡期 API worker 入口可以使用 worker side primitives，但后续 change 会删除该入口。

### 3. `@iam/contracts` 保留稳定协议

`@iam/contracts` 继续拥有 user-profile job queue name、job name、payload schema、scope type、dirty reason 和 dirty status。原因是 `packages/db` schema 也需要 dirty enum 类型；若把这些 contract 移入 read model 包，会产生 `@iam/db` 与 `@iam/user-profile-read-model` 的依赖环。

### 4. `@iam/jobs` 只保留 BullMQ 基础设施

`@iam/jobs` 保留 `createJobQueue`、`createJobWorker`、deterministic jobId helper、默认 retry/cleanup options。`createUserProfileJobProducer` 迁入 `@iam/user-profile-read-model`。

目标依赖方向：

```text
apps/api ───────────────┐
apps/admin-api ─────────┼──▶ @iam/user-profile-read-model ───▶ @iam/jobs
apps/api worker entry ──┘                │
                                         ├──▶ @iam/contracts
                                         └──▶ @iam/db

@iam/jobs ─X─▶ @iam/user-profile-read-model
@iam/user-profile-read-model ─X─▶ @api/*
@iam/user-profile-read-model ─X─▶ @admin-api/*
```

### 5. detail/search/DSL schema 归属 read model 包

`UserDetailDto`、`EmploymentDetailDto`、`UserProfileSearchDoc`、DSL schema 和 `CURRENT_USER_PROFILE_SCHEMA_VERSION` 迁入 `@iam/user-profile-read-model`，作为 `user_profile.detail` 存储格式和 API 响应格式的单一来源。

这会让 API route schema 从共享包导入，但不改变响应结构。

### 6. Change 1 保留过渡 worker 入口

本 change 允许 `apps/api` 的 `worker:user-profile` 脚本和 worker entry 暂时存在，但实现必须通过 `@iam/user-profile-read-model` 组合。该入口是过渡态，后续 `add-worker-app-runtime` MUST 删除它，并迁移到独立 `apps/worker`。

## Risks / Trade-offs

- [Risk] DTO/schema 迁移导致 API 类型导入大面积变更。  
  Mitigation: 先建立新包 exports，再逐步更新 API/admin-api imports，使用 typecheck 覆盖 `@iam/api`、`@iam/admin-api` 和新包。

- [Risk] `@iam/db`、`@iam/contracts`、`@iam/user-profile-read-model` 出现依赖环。  
  Mitigation: job/dirty enum 和 payload schema 留在 `@iam/contracts`；read model 包依赖 `@iam/db` 和 `@iam/contracts`，反向依赖禁止。

- [Risk] 迁移 producer 后 API/admin-api composition 仍错误地从 `@iam/jobs` 导入 user-profile producer。  
  Mitigation: 更新架构 guard 测试，禁止业务 app 从 `@iam/jobs/user-profile` 或旧 domain user-profile 路径获取 producer/marker。

- [Risk] 过渡期 API worker 入口被误认为长期方案。  
  Mitigation: proposal、spec 和 tasks 明确它只是 Change 1 过渡态；Change 2 删除。

## Migration Plan

1. 新增 `packages/user-profile-read-model` package、exports、tsconfig/eslint/package scripts。
2. 将 user-profile schema、query、repository、builder、worker service、dirty/scope/marker、producer 迁入新包，并修正内部 imports。
3. 更新 `apps/api` 和 `apps/admin-api` composition、services、routes、tests，从新包导入 user-profile read model 能力。
4. 收窄 `packages/domain` 和 `packages/jobs` exports，移除 user-profile 专属实现。
5. 让过渡期 `apps/api/src/workers/user-profile.ts` 通过共享包 worker service 运行。
6. 跑新包、API、admin-api、domain、jobs 的 focused test/typecheck。

Rollback 策略：如果抽包过程中发现无法保持响应 schema 或 worker 行为一致，应暂停在 change branch，不合并；该 change 不涉及数据库迁移，因此回滚只需要回退代码变更。

## Open Questions

- 无。`apps/worker` 运行时、BullMQ 面板、health endpoint 和 compose 启动模型已确认为后续 change 范围。
