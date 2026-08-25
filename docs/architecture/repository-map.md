# 仓库地图

本仓库是 `pnpm` workspace + Turborepo monorepo。本页用于回答“代码或配置应该去哪里找”，不是逐文件清单。
当前行为仍以实现、可执行测试和 [Current 文档](../index.md) 为准。

`pnpm` workspace 包含 `apps/*`、`packages/*`、`gateway` 和 root-owned `e2e/system`；`docker/`、
`observability/` 等目录属于仓库级运行和运维资产，不是 workspace package。

## 快速导航

```text
.
├── apps/             # 可部署的后端、前端和 worker
├── packages/         # 跨 app 复用的 workspace packages
├── gateway/          # APISIX manifests 与发布工具
├── e2e/system/       # root-owned Full-system E2E workspace；当前交付 runtime、两条 V2 journey 与精确恢复入口
├── docker/           # 本地依赖栈及 dev/prod Compose
├── observability/    # Alloy、Loki 与 Grafana 配置
├── scripts/          # 仓库级检查、canonical test collection/Integration 编排和辅助脚本
├── docs/             # 当前架构、功能、runbook、ADR 与历史记录
├── CONTEXT.md        # 稳定领域语言
├── .scratch/         # 已退役本地 tracker 的只读历史归档
└── openspec/         # 冻结的历史需求与设计记录
```

根目录的 `package.json`、`pnpm-workspace.yaml` 和 `turbo.json` 分别提供仓库命令、workspace 清单与任务编排。

## 运行时 Apps

| 路径 | Runtime 与职责 | 主要入口 |
|---|---|---|
| `apps/api` | Bun + Hono public IAM backend（`@iam/api`） | `src/routes/`：public/open/internal/sso/auth 协议入口；`src/use-cases/`：跨领域 workflow；`src/services/`：domain-aligned application services；`src/composition/`：production wiring；`src/env.ts`：环境校验 |
| `apps/admin-api` | Bun + Hono admin backend（`@iam/admin-api`） | `src/routes/admin/`：Admin REST；`src/routes/trpc/`：tRPC entry routes；`src/use-cases/`：跨领域 workflow；`src/services/`：domain-aligned application services；`src/composition/`：production wiring；`src/trpc/`：tRPC router composition |
| `apps/oidc-provider` | Node.js 24 + `oidc-provider`（`@iam/oidc-provider`） | `src/composition/`：production wiring；`src/provider/`：OIDC provider；`src/session/`：Session Kernel adapters；`src/storage/`、`src/stores/`：persistence；`src/env.ts`：环境校验 |
| `apps/worker` | Bun background job runtime（`@iam/worker`） | `src/composition/`：runtime wiring；`src/modules/`：worker modules；`src/http/`：health 与 Bull Board；`src/commands/`：backfill/repair 命令；`src/env.ts`：环境校验 |
| `apps/admin` | Umi Max + React 管理端 | `src/pages/`：页面；`src/components/`：可复用 UI；`src/lib/api-client.ts`：tRPC client；`src/services/`：page-side API wrappers |
| `apps/sso` | Umi Max + React SSO portal | `src/pages/`：页面；`src/assets/`：静态资源；`src/services/`：API wrappers；`src/lib/`、`src/utils/`：browser helpers |

### 后端分层速查

`apps/api` 与 `apps/admin-api` 使用以下边界：

| 层 | 位置 | 职责 |
|---|---|---|
| Protocol entry | `src/routes/` | 解析 HTTP/tRPC 输入、调用 use case 或 service、映射响应 |
| Application use case | `src/use-cases/` | 表达调用方目标和跨领域 workflow；实例在 `src/composition/use-cases/` 创建 |
| Application service | `src/services/` | 提供 domain-aligned、app-local command/query facade |
| Pure domain logic | `packages/domain/src/` | 保存不依赖 repository、network、Hono 或 composition 的业务规则 |
| Composition | `src/composition/` | 连接 routes、use cases、services、repositories 和 runtime dependencies |

完整的依赖方向、命名和 wiring 规则见 [后端架构](backend-architecture.md)。前端边界见
[前端架构](frontend-architecture.md)。

## 共享 Packages

| 路径 | 职责与边界 |
|---|---|
| `packages/api-core/src` | 共享后端基础设施：`createApp`、route/OpenAPI/response helpers、errors、middleware、Redis、logging、observability、Session Kernel、LoginRestriction、Subject Access Barrier、UnitOfWork 和 tRPC utilities。共享 process-smoke harness 位于 `src/testing/`，只通过独立 testing export 暴露；它不实现 Redis 协议或 persistence seed。 |
| `packages/client-subject-projection/src` | 协议中性的 Client Subject Projection deep Module；默认入口只公开 active V2 `resolve` Interface、Catalog 与 canonical responsibility Employment Profile，`/custom-sso` 独占 Custom SSO V2 strict wire。V1 历史源码不由 package exports、应用 composition 或命令入口公开。 |
| `packages/contracts/src` | 跨 app/package 消费的稳定 contracts 与 enums。 |
| `packages/domain/src` | 共享 domain schemas/types、pure domain rules、audit helpers 和可复用 domain/business errors。 |
| `packages/db/src` | Drizzle schemas、relations、migrations、singleton client 和 query helpers。Schema/relations domain 为 `core` 与 `log`；共享 column helpers 位于 `schema/_shard/`。 |
| `packages/eslint-config` | 全仓唯一 ESLint 配置所有者，公开 root/backend/frontend preset factories。 |
| `packages/jobs/src` | 共享 BullMQ connection、queue、worker、job ID 和 default option helpers。 |
| `packages/organization-responsibility-resolution/src` | 通过 `createOrganizationResponsibilityResolver(db)` 暴露 Organization Responsibility 的批量 Effective 正向解析与跨树 holder 反向解析；完整性、时间、cardinality、去重和排序规则留在 package 内。 |
| `packages/role-assignment-resolution/src` | 通过 `createRoleAssignmentResolver(db)` 暴露正向 Effective Role 与反向受影响用户解析的唯一 public seam；assignment 来源、组织闭包、有效性、去重和排序规则留在 package 内。 |
| `packages/user-profile-read-model/src` | API/admin-api/worker 消费的 strict v3 User Profile Read Model，包括 transaction-bound `UserProfileInvalidation`、dirty/rebuild workflow、带 responsibility 的 Detail/Search/Subject Facts builder、PostgreSQL atomic publication、提交后的 Redis monotonic publisher、strict v3 read-through/freshness reader、canonical Filter query、repositories 和 worker module。默认入口、`subject-facts`、`query` 与 `worker` 子路径共享同一 v3 version gate；版本无关 maintenance/readiness 复用现有 dirty/job/publication。 |

更详细的 package ownership、公开 exports、数据库和 transaction 规则见
[共享契约与数据库](contracts-and-database.md)。

## Root-owned Full-system E2E Workspace

| 路径 | 当前职责与边界 |
|---|---|
| `e2e/system` | `@iam/e2e-system` 拥有 root `pnpm test:e2e` 的完整 owner task：preflight 在任何 descriptor/resource 前验证 Docker、browser 与固定配置，再以动态 Gateway host port 启动 PostgreSQL、Redis、etcd、APISIX、API、Admin API、OIDC Provider、Worker、Admin 与 SSO，在空 volumes 执行真实 Drizzle migrations、User Profile v2 cutover fixture、production-owner strict v3 backfill 与 Client Protocol V2 readiness，并在同一 exact-project lifecycle 中固定按 Admin → HR Admin → OIDC 运行三条零 retry journey。Gateway Profile routes 在 backfill 期间保持未发布；Seed 驱动真实 Worker 等待 Enable/Pause/Disable User 的 v3 Profile/Facts 收敛并 bootstrap 对应 Barrier，随后实际运行 production `user-profile:verify-postgres` 与 `user-profile:verify-redis`，两道 v3 全量 gate 均通过后才统一发布 routes。三条 journey 共同覆盖 schema-driven Filter 的代表行为、Organization Responsibility、Employment invalidation、Custom SSO/Gateway 裁剪、普通 `iam:hr-admin` 的 PostgreSQL 请求时范围与四模块 UI，以及 OIDC authorization-time snapshot/ID Token 排除。HR journey 后置 production Drizzle verifier 与有界 Admin API log capture 证明范围内业务/audit/invalidation 收敛和范围外无写入、不泄露 scope 的 denial log。失败时保存有界 raw diagnostics、Playwright evidence 与安全 receipt，再尝试本 project 的 best-effort cleanup；cleanup failure 非零。`admin:journey`、`hr-admin:journey`、`oidc:journey` 保留为 workspace-local 调试入口，`runtime:cleanup` 只接受明确 descriptor 或 exact project。Windows 本地已验收，Linux/CI 尚未验收。 |

该 workspace 的 Compose、one-shot migration/Gateway sync images、lifecycle/recovery commands 与 contract tests 都保留在
`e2e/system/`；生成的 run descriptor、migration/seed receipts、Compose/Gateway diagnostics 与后续 Playwright artifacts 位于其
`test-results/`，属于可再生成的测试 artifact，不提交到仓库。

## 基础设施与仓库工具

| 路径 | 职责 |
|---|---|
| `gateway/` | APISIX manifest package（`@iam/gateway-apisix`），包含 dev/prod manifests、config template，以及 sync/validate/diff/apply scripts。 |
| `docker/` | 本地依赖栈，以及 dev/prod application、gateway、observability Compose files。 |
| `observability/` | Alloy 日志/OTLP pipeline、Loki 配置、Grafana datasource/dashboard/alert provisioning，以及版本化 dashboards。 |
| `scripts/` | 文档和架构守卫、测试编排、验证入口及 tooling performance helpers。 |
| `.husky/` | Git hooks 与安装脚本。 |

## 文档与 Agent 工作流

- `AGENTS.md`：仓库级指引入口；详细规则通过它链接到 `docs/`。
- `docs/`：Current architecture/feature/runbook、agent workflow、ADR 和历史审查记录。文档状态与事实来源以
  [文档索引](../index.md) 为准。
- `CONTEXT.md`：IAM 的稳定领域语言；长期架构决策位于 `docs/adr/`。
- GitHub Issues：新建 spec、tickets 与跨会话状态的 tracker。仓库与操作约定见
  [GitHub 议题跟踪](../agents/issue-tracker.md)。
- `.scratch/`：已退役本地 tracker 的历史归档；保留原路径和 release 链接。
- `.agents/`、`.codex/`：仓库随附的 agent skills 与 Codex 配置，不属于 runtime source。
- `openspec/`：冻结的只读历史需求与设计记录，不是当前事实来源；使用前先阅读
  [冻结说明](../../openspec/README.md)。

## 生成目录与 Vendored 资源

以下内容可由依赖安装、构建、测试或工具重新生成，不要手动编辑：

- dependency/cache output：`**/node_modules/`、`**/.turbo/`、`**/.cache/`、`**/.eslintcache`、`**/*.tsbuildinfo`；
- build/test output：`**/dist/`、`**/out/`、`**/coverage/`、`**/test-results/`；
- Umi generated source：`apps/admin/src/.umi/`、`apps/admin/src/.umi-production/`、`apps/sso/src/.umi/`、
  `apps/sso/src/.umi-production/`。

`apps/api/static/` 与 `apps/admin-api/static/` 包含 vendored API documentation assets。它们不是普通业务源码；
除非任务明确针对这些 assets，否则不要修改。
