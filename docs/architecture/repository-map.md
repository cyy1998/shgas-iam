# 仓库地图

本仓库是 `pnpm` workspace + Turborepo monorepo。Runtime apps 位于 `apps/`，共享 workspace packages 位于
`packages/`，gateway tooling 位于 `gateway/`。

## 运行时 Apps

- `apps/api`: Bun + Hono public IAM backend (`@iam/api`)。主代码在 `src/`，public/open/internal/sso/auth routes
  位于 `src/routes/`，app-side domain logic 位于 `src/services/`，app-specific utility 位于 `src/lib/`，
  app composition wiring 位于 `src/composition/`，env validation 位于 `src/env.ts`。
- `apps/admin-api`: Bun + Hono admin backend (`@iam/admin-api`)。Admin REST routes 位于 `src/routes/admin/`，
  tRPC entry routes 位于 `src/routes/trpc/`，admin domain logic 位于 `src/services/`，app composition wiring 位于
  `src/composition/`，tRPC router composition 位于 `src/trpc/`。
- `apps/oidc-provider`: Node.js 24 + `oidc-provider` app (`@iam/oidc-provider`)。Composition 位于
  `src/composition/`，OIDC provider wiring 位于 `src/provider/`，Session Kernel adapters 位于 `src/session/`，
  persistence 位于 `src/storage` 和 `src/stores/`，env validation 位于 `src/env.ts`。
- `apps/worker`: Bun background job runtime (`@iam/worker`)。Runtime composition 位于 `src/composition/`，
  worker module selection 位于 `src/modules/`，health/Bull Board HTTP support 位于 `src/http/`，command-only
  backfill/repair entrypoints 位于 `src/commands/`，env validation 位于 `src/env.ts`。
- `apps/admin`: Umi Max + React management frontend。Pages 位于 `src/pages/`，可复用 UI 位于 `src/components/`，
  tRPC client setup 位于 `src/lib/api-client.ts`，page-side API wrapper 位于 `src/services/`。
- `apps/sso`: Umi Max + React SSO portal。Pages 位于 `src/pages/`，assets 位于 `src/assets/`，API wrapper 位于
  `src/services/`，共享 browser helper 位于 `src/lib/` 和 `src/utils/`。

## 共享 Packages 与工具

- `packages/api-core/src`: 共享后端基础设施，例如 `createApp`、route factory、OpenAPI helper、response helper、
  error、middleware、Redis、logging、observability、Session Kernel、UnitOfWork 和 tRPC utility；仅供测试消费的共享
  process-smoke harness 位于 `src/testing/`，通过独立 testing export 暴露。
- `packages/contracts/src`: 跨 app 和 package 消费的共享 enum 与稳定 contract。
- `packages/domain/src`: 后端 app 消费的共享 domain DTO schema、DTO type、audit helper 和可复用 domain/business
  error。
- `packages/db/src`: Drizzle schema、relations、migrations、singleton client 和 query helper。Schema 和 relation
  domain 当前包含 `core` 和 `log`，共享 column helper 位于 `schema/_shard/`。
- `packages/eslint-config`: 全仓唯一的 ESLint 配置所有者。公开入口只包含 root、backend、frontend preset 工厂；
  Antfu 与其运行时插件依赖由该 package 统一解析。`benchmark/` 中的 lean/curated profile 仅用于测量和选型，
  不是 workspace 可消费的生产 preset，也不得绕过公开 exports。
- `packages/jobs/src`: 共享 BullMQ connection、queue、worker、job ID 和 default option helper。
- `packages/role-assignment-resolution/src`: 通过 `createRoleAssignmentResolver(db)` 暴露正向 Effective Role 与反向
  受影响用户解析的唯一公开 seam；assignment 来源、组织闭包、有效性、去重和排序规则只存在于 package 内部。
- `packages/user-profile-read-model/src`: API/admin-api/worker 消费的 versioned user-profile read model、transaction-bound
  `UserProfileInvalidation`、dirty workflow、producer/query API、repository 和 worker module。角色与角色分配变化由
  invalidation 内部的 affected-user repository 通过注入的反向 resolver 推导受影响用户；旧 scope-expansion 协议与
  scope repository 已退役。`PrivilegeUpdated` 只作为历史 dirty reason 保留，不对应公开 privilege source change。
- `gateway`: APISIX gateway manifest package (`@iam/gateway-apisix`)，包含 dev/prod manifests、config template 和
  sync/validate/diff/apply scripts。
- `docker/`: local dependency stacks 以及 dev/prod compose files。
- `docs/`: agent workflow、Current architecture/feature/runbook、ADR 和历史审查记录；状态与事实来源以
  [文档索引](../index.md) 为准。
- `openspec/`: 冻结的只读历史需求与设计记录，不是当前事实来源；使用前先阅读
  [冻结说明](../../openspec/README.md)。
- `scripts/`: repo-level utility scripts。

## 生成目录与 Vendored 资源

不要手动编辑 generated frontend directory，例如 `apps/admin/src/.umi/`、`apps/admin/src/.umi-production/`、
`apps/sso/src/.umi/` 或 `apps/sso/src/.umi-production/`。

避免编辑 `apps/admin/dist/` 和 `apps/sso/dist/` 下的 frontend build output。

除非任务明确针对这些 assets，否则避免编辑 `apps/api/static/` 或 `apps/admin-api/static/` 中的 vendored API
documentation assets。
