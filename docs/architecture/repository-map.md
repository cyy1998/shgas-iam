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
├── e2e/system/       # root-owned Full-system E2E workspace
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
| `apps/worker` | Bun background job runtime（`@iam/worker`） | `src/composition/`：runtime wiring；`src/modules/`：worker modules；`src/http/`：health 与 Bull Board；`src/commands/`：backfill/repair 命令；`src/env.ts`：环境校验 |
| `apps/admin` | Umi Max + React 管理端 | `src/pages/`：页面；`src/components/`：可复用 UI；`src/lib/api-client.ts`：tRPC client；`src/services/`：page-side API wrappers |
| `apps/sso` | Umi Max + React SSO portal | `src/pages/`：页面；`src/assets/`：静态资源；`src/services/`：API wrappers；`src/lib/`、`src/utils/`：browser helpers |

### 后端分层速查

Apps 表用于定位入口；依赖方向、分层职责、命名和 wiring 统一见[后端架构](backend-architecture.md#核心依赖方向)，
页面与请求边界见[前端架构](frontend-architecture.md)。

## 共享 Packages

| 路径 | 定位用途 |
|---|---|
| `packages/api-core/src` | 后端基础设施、UnitOfWork、LoginRestriction、Subject Access 与 `client-snapshot/`；`testing/` 通过独立出口提供 process harness。 |
| `packages/session-kernel/src` | 协议中性的 UserSession / ClientSession 生命周期、Redis 原子状态与管理观察。 |
| `packages/custom-sso/src` | Custom SSO 授权、Code / Token、续接与交付；`/wire` 提供浏览器可加载契约。 |
| `packages/oidc/src` | OIDC 授权、Code / Token、续接、退出、UserInfo 与密钥；由 API HTTP adapter 消费。 |
| `packages/client-subject-projection/src` | 中性主体裁剪、Catalog 与责任任职投影。 |
| `packages/contracts/src` | 跨端或跨 app/package 的稳定枚举、常量、schemas、类型与协议 helper。 |
| `packages/domain/src` | 后端 DTO、mapper、纯业务规则、audit helper 与业务错误。 |
| `packages/db/src` | Drizzle schema、relations、migrations、client 与 query helpers；领域为 `core`、`log`，列 helper 在 `schema/_shard/`。 |
| `packages/eslint-config` | 全仓 ESLint 配置 owner，提供 root/backend/frontend presets。 |
| `packages/jobs/src` | BullMQ connection、queue、worker、job ID 与默认选项。 |
| `packages/organization-responsibility-resolution/src` | Organization Responsibility 的正向有效解析与跨树 holder 反向解析。 |
| `packages/role-assignment-resolution/src` | Effective Role 正向解析与受影响用户反向解析。 |
| `packages/user-profile-read-model/src` | User Profile、Search / Subject Facts 的失效、构建、发布、查询与维护。 |

使用或新增共享代码前，按[共享契约与数据库](contracts-and-database.md)核对运行环境、公开出口、DTO 与事务边界；
模块语义见[后端所有权](backend-architecture.md#关键模块所有权)。当前维护见
[统一维护手册](../releases/unified-session-maintenance.md)；旧数据操作见[历史命令入口](../development/commands.md#历史数据维护工具)。

### 密集模块的内部目录

定位内部实现时沿公开入口进入对应目录；跨 package 消费仍使用公开 exports。

| 模块 | 内部职责目录 |
|---|---|
| `packages/user-profile-read-model/src` | `invalidation/`、`build/`、`publication/`：失效与发布；`query/`、`schema/`、`subject-facts/`：查询与事实；`subject-access/`：authority / transition；`worker/`、`readiness/`、`employment/`：重建、就绪与全库 verifier。 |
| `packages/client-subject-projection/src` | `internal/`：当前 Catalog、contract 与 projection。 |
| `packages/session-kernel/src` | `unified/`：当前两类会话；`state/`、`storage/` 和 `testing/` 中旧四对象布局仅供离线维护；`state/model.ts` 还提供中性 SessionOrigin。 |
| `packages/api-core/src/subject-access` | `storage/`：store / Redis adapter；`adapters/`：HTTP 映射；`recovery/`：bootstrap、repair 与 transition recovery。 |
| `packages/custom-sso/src` | `unified/`：当前协议流程与状态；`internal/`：校验和交付 helper；`grant/`：旧 Grant 离线 decoder、cleanup 与 fixture。 |
| `apps/api/src/services/sso` | `subject-delivery/`：请求 capability；`transport/`：Cookie、请求/schema、安全与 OpenAPI。门户续接入口在 `routes/sso/unified-authorization.handlers.ts`。 |
| `apps/api/src/use-cases/authentication` | 密码、手机、OA、微信统一认证；装配在 `composition/use-cases/authentication.ts` 与 `composition/root-authentication.ts`。OA/微信 HTTP 入口仍在 SSO route。 |
| `apps/worker/src/commands` | `user-profile/`、`client-sso/`、`online-state/`、`client-snapshot/` 命令族；Employment verifier 留在根层。 |

## Root-owned Full-system E2E Workspace

`e2e/system`（`@iam/e2e-system`）拥有根 `pnpm test:e2e` 的完整系统测试，包括 Compose、migration / Gateway
镜像、seed、旅程、诊断与精确恢复。workspace-local journey 命令用于聚焦调试。

生命周期、资源与旅程契约见[测试编排](testing-architecture.md#root-与-package-commands)，双 hostname 阶段见
[双入口验收](testing-architecture.md#双入口验收与产物隔离)，可执行入口见[命令页](../development/commands.md#full-system-e2e)，
证明范围见[验证归属](architecture-verification.md#行为资源与系统验证)。

Run descriptor、receipts、diagnostics 与 Playwright 产物写入 `e2e/system/test-results/`，可重新生成，不提交。
平台验收状态见[默认验证与交付](testing-architecture.md#默认验证与交付)。

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
