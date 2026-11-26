# 仓库地图

本仓库是 `pnpm` workspace + Turborepo monorepo。本页用于回答“代码或配置应该去哪里找”，不是逐文件清单。
当前行为仍以实现、可执行测试和 [Current 文档](../index.md) 为准。

请求流与恢复分工见[系统架构](system-architecture.md)，模块协作见[后端架构](backend-architecture.md)。

`pnpm` workspace 包含 `apps/*`、`packages/*` 和 root-owned `e2e/system`；`docker/` 中的 Compose、
APISIX 和可观测性配置属于仓库级运行和运维资产，不是 workspace package。

## 快速导航

```text
.
├── apps/             # 可部署的后端、前端和 worker
├── packages/         # 跨 app 复用的 workspace packages
├── e2e/system/       # root-owned Full-system E2E workspace
├── docker/           # dev/prod Compose、APISIX 与可观测性配置
├── scripts/          # 仓库级检查、canonical test collection/Integration 编排和辅助脚本
├── docs/             # 当前架构、功能、runbook、ADR 与历史记录
├── GLOSSARY.md       # 稳定领域语言
├── .sandcastle/      # AFK 编排核心、本仓装配、prompts、Dockerfile、环境模板与运维手册
├── .scratch/         # 已退役本地 tracker 的只读历史归档
└── openspec/         # 冻结的历史需求与设计记录
```

根目录的 `package.json`、`pnpm-workspace.yaml` 和 `turbo.json` 分别提供仓库命令、workspace 清单与任务编排。

## 运行时 Apps

| 路径                   | Runtime 与职责                                         | 主要入口                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/auth-api`        | Bun + Hono，身份认证、风控、扫码与账号自助             | `src/routes/`：登录、账号与第三方回调；`src/composition/`：认证资源与扫码续接；`src/env.ts`：环境校验                                                                                                                                        |
| `apps/sso-api`         | Bun + Hono，Custom SSO、OIDC 与网关用户鉴权            | `src/composition/custom-sso.ts` 和 `src/composition/oidc.ts` 分别装配协议；`src/routes/`：协议与投影入口                                                                                                                                     |
| `apps/integration-api` | Bun + Hono，内部应用认证、目录查询、应用委托与集成写入 | `src/routes/internal/`、`src/routes/delegations/`：M2M 与个人入口；`src/composition/`：查询池及写入资源                                                                                                                                      |
| `apps/admin-api`       | Bun + Hono admin backend（`@iam/admin-api`）           | `src/routes/admin/`：Admin REST；`src/routes/trpc/`：tRPC entry routes；`src/use-cases/`：跨领域 workflow；`src/services/`：domain-aligned application services；`src/composition/`：production wiring；`src/trpc/`：tRPC router composition |
| `apps/worker`          | Bun background job runtime（`@iam/worker`）            | `src/composition/`：runtime wiring；`src/modules/`：worker modules；`src/http/`：health 与 Bull Board；`src/maintenance/`：私有周期 repair 子进程；`src/env.ts`：环境校验                                                                    |
| `apps/ops`             | Bun 一次性人工维护 CLI（`@iam/ops`）                   | `src/index.ts`：统一命令分派与帮助；`src/commands/`：六组维护入口；`src/composition/`：窄资源装配；`src/env.ts`：独立按需配置。                                                                                                              |
| `apps/gateway`         | Bun + Hono Gateway 配置 API（`@iam/gateway-apisix`）   | `src/main.ts` / `runtime.ts`：独立进程与关闭；`src/http/`：请求与 envelope；`src/composition/`：只读认证与 APISIX 接线；`src/services/gateway/`：认证、规划、发布与补偿；`src/repositories/`：Client 窄读取。                                |
| `apps/admin`           | Vite + React 管理端                                    | `src/pages/`：页面；`src/components/`：可复用 UI；`src/lib/api-client.ts`：tRPC client；`src/services/`：page-side API wrappers                                                                                                              |
| `apps/sso`             | Vite + React SSO portal                                | `src/pages/`：页面；`src/assets/`：静态资源；`src/services/`：API wrappers；`src/lib/`、`src/utils/`：browser helpers                                                                                                                        |

### 后端分层速查

依赖方向、分层职责和装配写法见[后端架构与实现约定](backend-architecture.md#运行时分层与装配)。
三个公共后端分别在自己的 composition 中创建运行资源并接线路由。[Auth API](../../apps/auth-api/src/composition/) · [SSO API](../../apps/sso-api/src/composition/) · [Integration API](../../apps/integration-api/src/composition/)
Use case 由 root 的 `useCases` 交给路由。Admin API 的入口与审计实现见 [Admin API README](../../apps/admin-api/README.md)。
页面与请求边界见[前端架构](frontend-architecture.md)。

## 共享 Packages

| 路径                                     | 定位用途                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `packages/sms/src`                       | 短信网关协议签名与 HTTP 发送。验证码、冷却状态和业务文案由调用方持有。                                                |
| `packages/runtime/src`                   | 后端共享日志、观测上下文、Redis 配置与连接、环境解析、通用错误、维护生命周期和 Linux 进程树所有权。                   |
| `packages/test-support/src`              | 测试专用外部资源地址、连接、清理与进程 smoke harness。                                                                |
| `packages/api-core/src`                  | Hono、OpenAPI 和 tRPC 装配，HTTP 请求上下文、响应、错误映射、分页与 adapter。                                         |
| `packages/unit-of-work/src`              | 事务边界、提交后任务与回滚确认。                                                                                      |
| `packages/client-snapshot/src`           | Client 普通配置、敏感凭据认证、统一缓存失效与维护。                                                                   |
| `packages/login-restriction/src`         | 登录失败历史、临时限制、管理查询与解除，及 Redis 原子状态。                                                           |
| `packages/subject-access/src`            | 账号实时访问屏障、单次操作许可、代际、生命周期与恢复。                                                                |
| `packages/session-kernel/src`            | 协议中性的 UserSession / ClientSession 生命周期、Redis 原子状态与管理观察。                                           |
| `packages/custom-sso/src`                | Custom SSO 授权、Code / Token、续接与交付；`/wire` 提供浏览器可加载契约。                                             |
| `packages/oidc/src`                      | OIDC 授权、Code / Token、续接、退出、UserInfo 与密钥；在线操作由 SSO API 装配，Auth API 使用独立续接入口。            |
| `packages/client-subject-projection/src` | 中性主体裁剪、Catalog 与责任任职投影。                                                                                |
| `packages/delegation/src`                | Client 委托；`/wire` 提供浏览器契约。                                                                                 |
| `packages/contracts/src`                 | 跨端或跨 app/package 的稳定枚举、常量、schemas、类型与协议 helper。`http/` 提供常用 HTTP 状态码常量。                 |
| `packages/domain/src`                    | 后端 DTO、mapper、纯业务规则、audit helper 与业务错误。                                                               |
| `packages/db/src`                        | Drizzle schema、relations、migrations、client 与 query helpers；领域为 `core`、`log`，列 helper 在 `schema/_shard/`。 |
| `packages/jobs/src`                      | BullMQ connection、queue、worker、producer 资源与有界唤醒、job ID、默认选项及 Document 队列接线。                     |
| `packages/assignment-resolution/src`     | Effective Role 与 Organization Responsibility 的正反向解析，以及组织责任的父生命周期检查。                            |
| `packages/documents/src`                 | User Document、Organization Document 与包内共享更新核心，提供失效、构建、发布、查询与维护。                           |
| `packages/filter-engine/src`             | 共享 Filter 校验与 JSONB 查询编译。                                                                                   |

使用或新增共享代码前，按[共享契约与数据库](contracts-and-database.md)核对运行环境、公开出口、DTO 与事务边界；
跨模块规则见[后端架构](backend-architecture.md)。模块机制见
[Documents](../../packages/documents/README.md)、[Delegation](../../packages/delegation/README.md)、[Filter](../../packages/filter-engine/README.md)、
[Worker](../../apps/worker/README.md)和[Gateway](../../apps/gateway/README.md)。操作入口见[运维手册](../releases/README.md)。

## Root-owned Full-system E2E Workspace

`e2e/system` 拥有完整系统测试的 Compose、镜像、seed、旅程和恢复工具。生成产物位于 `test-results/`，不提交。
资源生命周期见[测试架构](testing.md#full-system-e2e)，命令见[开发命令](commands.md#full-system-e2e)。

## 基础设施与仓库工具

| 路径                         | 职责                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/gateway/`              | 独立 Gateway 配置 API 与应用镜像构建；常规配置发布经 HTTP。                                                                                                                                                                                                                                                                                                                                                                                            |
| `docker/`                    | 统一开发入口 `compose.dev.yaml`；生产按 data、apps、gateway、observability 与独立一次性 ops 编排，其中 apps 包含 Gateway API。                                                                                                                                                                                                                                                                                                                         |
| `tmp/gateway-config/apisix/` | APISIX dev/prod config template 与 `manifests/<env>/<app>.yaml`；manifest 是调用方持有的 HTTP 发布输入。                                                                                                                                                                                                                                                                                                                                               |
| `docker/observability/`      | Alloy 日志/OTLP pipeline、Loki 配置、Grafana datasource/dashboard/alert provisioning，以及版本化 dashboards。                                                                                                                                                                                                                                                                                                                                          |
| `scripts/`                   | 文档和架构守卫、测试编排、验证入口及 tooling performance helpers。                                                                                                                                                                                                                                                                                                                                                                                     |
| `.sandcastle/`               | AFK 流程编排与本仓装配（[`afk.ts`](../../.sandcastle/afk.ts)、[`github.ts`](../../.sandcastle/github.ts)、[`git.ts`](../../.sandcastle/git.ts)、[`session.ts`](../../.sandcastle/session.ts)、[`run.mts`](../../.sandcastle/run.mts)、[`smoke.mts`](../../.sandcastle/smoke.mts)、`prompts/`）、Dockerfile、环境模板和[运维手册](../../.sandcastle/README.md#启动与诊断)。本地 `worktrees/`、`cache/`、`logs/`、`resources/` 与 `runner.lock` 不入库。 |
| `.codex/agents/`             | 仓库 7 个角色契约定义（调查角色、手动与 AFK 共用的三档实施者、Standards/Spec 只读评审角色）；供 Codex 原生子代理、T3 跨引擎委派与 AFK runner 复用。                                                                                                                                                                                                                                                                                                    |
| `.husky/`                    | Git hooks 与安装脚本。                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Sandcastle 通过根脚本外层 `flock -n .sandcastle/runner.lock` 保证单实例互斥，在 `.sandcastle/resources/` 登记各执行器的测试资源并在确认容器停止回收后删除空的 `run-*` 目录。

## 文档与 Agent 工作流

- `AGENTS.md`：仓库级指引入口；详细规则通过它链接到 `docs/`。
- `docs/features/` 供开发者和 AI 按功能查业务规则。
- `docs/guides/` 供管理员和接入方查操作步骤、配置、调用示例与失败处理。
- `docs/engineering/` 保存系统与模块设计、工程约定和验证入口。`docs/releases/` 保存运维操作。
  其他工作流、ADR 和历史记录以及文档状态见[文档索引](../index.md)。
- `GLOSSARY.md`：IAM 的稳定领域语言；长期架构决策位于 `docs/adr/`。
- GitHub Issues：新建 spec、tickets 与跨会话状态的 tracker。仓库与操作约定见
  [GitHub 议题跟踪](../agents/issue-tracker.md)。
- `.scratch/`：已退役本地 tracker 的历史归档；保留原路径和 release 链接。
- `.agents/`、`.codex/`：`.agents/skills/` 存放上游与仓库自有 agent skills（Antigravity 与 Codex 共同发现），`.codex/` 存放角色契约与 Codex 环境配置，均不属于 runtime source。
- `openspec/`：冻结的只读历史需求与设计记录，不是当前事实来源；使用前先阅读
  [冻结说明](../../openspec/README.md)。

## 生成目录与 Vendored 资源

以下内容可由依赖安装、构建、测试或工具重新生成，不要手动编辑：

- dependency/cache output：`**/node_modules/`、`**/.turbo/`、`**/.cache/`、`**/.eslintcache`、`**/*.tsbuildinfo`；
- build/test output：`**/dist/`、`**/out/`、`**/coverage/`、`**/test-results/`；

`apps/admin-api/static/` 包含 vendored API documentation assets。它们不是普通业务源码；
除非任务明确针对这些 assets，否则不要修改。
