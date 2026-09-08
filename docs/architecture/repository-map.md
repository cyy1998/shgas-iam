# 仓库地图

本仓库是 `pnpm` workspace + Turborepo monorepo。本页用于回答“代码或配置应该去哪里找”，不是逐文件清单。
当前行为仍以实现、可执行测试和 [Current 文档](../index.md) 为准。

跨 runtime 的请求流、数据权威来源与恢复责任见[系统架构视图](system-architecture.md)，关键约束的证据入口见
[架构验证归属](architecture-verification.md)。

`pnpm` workspace 包含 `apps/*`、`packages/*`、`gateway` 和 root-owned `e2e/system`；`docker/`、
`observability/` 等目录属于仓库级运行和运维资产，不是 workspace package。

## 快速导航

```text
.
├── apps/             # 可部署的后端、前端和 worker
├── packages/         # 跨 app 复用的 workspace packages
├── gateway/          # APISIX manifests 与发布工具
├── e2e/system/       # root-owned Full-system E2E workspace；当前交付 runtime、三条 production journey 与精确恢复入口
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

Client Runtime Snapshot 的当前 namespace 清单位于 `packages/api-core/src/client-runtime-snapshot/maintenance-inventory.ts`，
由 Worker repair/verify 消费；七类旧 Runtime key 已退出该 owner，当前恢复入口见
[恢复手册](../releases/client-runtime-snapshot-restore.md)。

| 路径 | 职责与边界 |
|---|---|
| `packages/api-core/src` | 共享后端基础设施：`createApp`、route/OpenAPI/response helpers、errors、middleware、Redis、logging、observability、LoginRestriction、Subject Access Barrier、UnitOfWork 和 tRPC utilities。共享 process-smoke harness 位于 `src/testing/`，只通过独立 testing export 暴露；它不实现 Redis 协议或 persistence seed。 |
| `packages/session-kernel/src` | 协议中性的 Principal Session、Client Binding、Credential 与 Protocol Artifact 生命周期；配置、日志事件、Redis/Lua、同步 cleanup 与测试支持由包内拥有。根入口、`/maintenance`、`/testing` 按能力分离，API Core 的 Subject Access 与 Custom SSO Grant 单向消费该包。 |
| `packages/custom-sso/src` | 完整 Custom SSO 应用与 Grant 状态的唯一 owner；root、cleanup、maintenance、testing 按能力分离，`/wire` 独占支持浏览器的 V2 schema、mapper 与 preview。连接及具体 provider 由 app 注入。 |
| `packages/client-subject-projection/src` | 协议中性的 Client Subject Projection deep Module；默认入口只公开 active V2 `resolve` Interface、Catalog 与 canonical responsibility Employment Profile；Custom SSO wire 由独立协议包拥有。V1 投影与演练源码已移除。 |
| `packages/contracts/src` | 跨端或跨 app/package 的稳定枚举、常量、runtime schemas、派生类型与相关协议 helper（包括 SSO 导航和登录 credential）；具体运行环境约束见共享契约文档。 |
| `packages/domain/src` | 后端复用的 DTO schemas/types/mappers、pure domain rules、audit helpers 和业务错误；DTO 可依赖数据库 schema，纯规则文件保持独立，不将整个包视为浏览器运行时依赖。 |
| `packages/db/src` | Drizzle schemas、relations、migrations、singleton client 和 query helpers。Schema/relations domain 为 `core` 与 `log`；共享 column helpers 位于 `schema/_shard/`。 |
| `packages/eslint-config` | 全仓唯一 ESLint 配置所有者，公开 root/backend/frontend preset factories。 |
| `packages/jobs/src` | 共享 BullMQ connection、queue、worker、job ID 和 default option helpers。 |
| `packages/organization-responsibility-resolution/src` | 通过 `createOrganizationResponsibilityResolver(db)` 暴露 Organization Responsibility 的批量 Effective 正向解析与跨树 holder 反向解析；完整性、时间、cardinality、去重和排序规则留在 package 内。 |
| `packages/role-assignment-resolution/src` | 通过 `createRoleAssignmentResolver(db)` 暴露正向 Effective Role 与反向受影响用户解析的唯一 public seam；assignment 来源、组织闭包、有效性、去重和排序规则留在 package 内。 |
| `packages/user-profile-read-model/src` | API/admin-api/worker 消费的 strict v3 User Profile Read Model，包括 transaction-bound `UserProfileInvalidation`、dirty/rebuild workflow、带 responsibility 的 Detail/Search/Subject Facts builder、PostgreSQL atomic publication、提交后的 Redis monotonic publisher、strict v3 read-through/freshness reader、canonical Filter query、repositories 和 worker module。默认入口、`subject-facts`、`query` 与 `worker` 子路径共享同一 v3 version gate；版本无关 maintenance/readiness 复用现有 dirty/job/publication。 |

更详细的 package ownership、公开 exports、数据库和 transaction 规则见
[共享契约与数据库](contracts-and-database.md)。

### 密集模块的内部目录

下列目录按已有职责归组，公开 package exports 与命令名称保持稳定；定位内部实现时沿入口进入对应目录，
不跨 package 直接引用内部文件。

| 模块 | 内部职责目录 |
|---|---|
| `packages/user-profile-read-model/src` | `invalidation/`：影响分析与 dirty/job；`build/`：加载与文档构建；`publication/`：行转换与原子发布；`query/`：查询与 Filter；`schema/`：文档契约；`subject-facts/`：缓存、读写与观测；`subject-access/`：authority 与 transition repositories；`worker/`：重建与维护装配；`readiness/`：版本无关 gate 与 Profile inventory 校验规则；`employment/`：全库只读 Employment verifier/repository。根层保留六个公开入口文件。 |
| `packages/client-subject-projection/src` | `internal/`：当前 V2 Catalog、contract 与 projection。公开入口与共享错误留在根层；测试 fixture 由测试文件本地持有。 |
| `packages/session-kernel/src` | `state/`：模型、结果与时间；`storage/`：存储、key、Lua 与状态变更；`security/`：HMAC/token；`cleanup/`：清理。facade、配置和公开入口留在根层。 |
| `packages/api-core/src/subject-access` | `storage/`：store 与 Redis adapter；`adapters/`：HTTP、Session validator 和结果转换；`recovery/`：bootstrap、repair 与 transition recovery。在线 barrier/lifecycle、模型、错误与公开入口留在根层。 |
| `packages/custom-sso/src` | 单一 factory、出站 ports 与协议错误；`internal/` 拥有完整授权/兑换、访问/退出、续接校验、Subject 交付、Secret/redirect 与流量 gate。`grant/` 拥有 Grant 状态机与存储；cleanup/maintenance 直接进入窄模块，wire 不加载服务端流程。 |
| `apps/api/src/services/sso` | `subject-delivery/`：请求 capability 桥接；`transport/`：Cookie、请求/schema、安全和 OpenAPI helper。门户 decision 映射在 `use-cases/sso/check-login-continuation/`。 |
| `apps/api/src/use-cases/authentication` | 密码、手机、OA、微信统一认证用例；由 `composition/use-cases/authentication.ts` 装配，通过 `services/authentication/principal-session.adapter.ts` 使用 Kernel 创建根会话。OA/微信 HTTP 路径仍在 SSO route。 |
| `apps/oidc-provider/src/provider` | `claims/`：claims port、snapshot 与 contract；`client/`：Client auth、runtime metadata 与 Traffic Gate。`claims.ts` 和 provider 装配、生命周期文件留在根层。 |
| `apps/worker/src/commands` | `user-profile/`、`client-runtime/`、`client-protocol/`：对应命令族与其 helper/repository。Employment verifier 留在根层。 |

## Root-owned Full-system E2E Workspace

| 路径 | 当前职责与边界 |
|---|---|
| `e2e/system` | `@iam/e2e-system` 拥有 root `pnpm test:e2e` 的完整 owner task：preflight 在任何 descriptor/resource 前验证 Docker、browser 与固定配置，再以动态 Gateway host port 启动 PostgreSQL、Redis、etcd、APISIX、API、Admin API、OIDC Provider、Worker、Admin 与 SSO，在空 volumes 执行真实 Drizzle migrations、User Profile v2 cutover fixture、production-owner strict v3 backfill 与 Client Protocol V2 readiness，并在同一 exact-project lifecycle 中固定按 Admin → HR Admin → OIDC 运行三条零 retry journey。Gateway Profile routes 在 backfill 期间保持未发布；Seed 驱动真实 Worker 等待 Enable/Pause/Disable User 的 v3 Profile/Facts 收敛并 bootstrap 对应 Barrier，随后实际运行 production `user-profile:verify-postgres` 与 `user-profile:verify-redis`，两道 v3 全量 gate 均通过后才统一发布 routes。三条 journey 共同覆盖 schema-driven Filter 的代表行为、Organization Responsibility、Employment invalidation、Custom SSO/Gateway 裁剪、普通 `iam:hr-admin` 的 PostgreSQL 请求时双端责任范围、完整责任 UI 生命周期与 scope 撤销，以及 OIDC authorization-time snapshot/ID Token 排除。HR journey 后置 production Drizzle verifier 与有界 Admin API log capture 证明范围内 lifecycle/audit/invalidation 收敛、隐藏 blocker 保持、范围外无写入且 denial log 不泄露 Assignment、holder、Organization path 或 scope/root 集合。失败时保存有界 raw diagnostics、Playwright evidence 与安全 receipt，再尝试本 project 的 best-effort cleanup；cleanup failure 非零。`admin:journey`、`hr-admin:journey`、`oidc:journey` 保留为 workspace-local 调试入口，`runtime:cleanup` 只接受明确 descriptor 或 exact project。Windows 本地已验收，Linux/CI 尚未验收。 |

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
