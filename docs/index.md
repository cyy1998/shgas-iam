# IAM 文档索引

本索引用作 Codex 和维护者进入 `docs/` 的稳定入口。需要当前行为时，对照代码、可执行测试和标记为 `Current` 的文档；需要理解历史决策时再进入 `Historical` 文档。`Stale` 文档和冻结的 OpenSpec 产物只能作为历史线索，不应作为当前架构或实现依据。

## 状态约定

| Status | 含义 | 新鲜度规则 |
|---|---|---|
| Current | 当前可作为实现、排障或发布依据 | 必须有 `Last verified` 和未来的 `Next review` |
| Needs Review | 可能仍有用，但需要重新核对 | 允许通过检查，但不应作为唯一依据 |
| Historical | 已完成的发布记录、审查记录或决策快照 | 不要求周期性复查 |
| Stale | 已知不再反映当前代码或架构 | 必须在备注中说明 not current |

## 当前事实来源

- 实现及可执行契约：应用代码与自动化测试
- 维护中的说明：本索引标记为 `Current` 的文档
- 仓库级指令入口：`AGENTS.md`
- 运行和环境入口：`README.md`
- 冻结的历史线索（非当前事实）：`openspec/`，先阅读其中的 `README.md`

## 文档清单

| Document | Type | Status | Last verified | Next review | Notes |
|---|---|---|---|---|---|
| [docs/adr/0001-replace-openspec-workflow.md](adr/0001-replace-openspec-workflow.md) | decision | Current | 2026-07-16 | 2026-10-31 | 采用 Matt skills 工作流并冻结 OpenSpec 的架构决策。 |
| [docs/adr/0002-centralize-role-assignment-resolution.md](adr/0002-centralize-role-assignment-resolution.md) | decision | Current | 2026-07-18 | 2026-10-31 | 以独立 workspace package 统一有效角色与受影响用户解析。 |
| [docs/agents/domain.md](agents/domain.md) | agent-config | Current | 2026-07-16 | 2026-10-31 | Engineering skills 的 single-context domain documentation 消费规则。 |
| [docs/agents/issue-tracker.md](agents/issue-tracker.md) | agent-config | Current | 2026-07-16 | 2026-10-31 | 本地 Markdown issue tracker 的路径与操作约定。 |
| [docs/agents/serena-mcp.md](agents/serena-mcp.md) | agent-config | Current | 2026-07-16 | 2026-10-31 | Linux/bash 与 Windows/PowerShell 下的项目级 Serena MCP 启动和故障处理约定。 |
| [docs/agents/triage-labels.md](agents/triage-labels.md) | agent-config | Current | 2026-07-16 | 2026-10-31 | Engineering skills 使用的默认 triage 标签映射。 |
| [docs/agents/workflow.md](agents/workflow.md) | agent-config | Current | 2026-07-16 | 2026-10-31 | Matt skills 的标准流程、快速路径、ticket 生命周期、分支、验证和授权规则。 |
| [docs/architecture/backend-architecture.md](architecture/backend-architecture.md) | architecture | Current | 2026-07-16 | 2026-10-31 | 后端 app composition、factory/DI、ports、route/middleware 和 architecture test 约定。 |
| [docs/architecture/contracts-and-database.md](architecture/contracts-and-database.md) | architecture | Current | 2026-07-18 | 2026-10-31 | shared contracts、domain/db/jobs/role-assignment-resolution/read-model 边界、UnitOfWork 和 Drizzle schema/relations/migration 约定。 |
| [docs/architecture/frontend-architecture.md](architecture/frontend-architecture.md) | architecture | Current | 2026-07-16 | 2026-10-31 | admin/sso 前端边界、service wrapper、contract、测试与生成路径约定。 |
| [docs/architecture/repository-map.md](architecture/repository-map.md) | architecture | Current | 2026-07-18 | 2026-10-31 | monorepo apps/packages/gateway 地图，以及 Current docs、冻结历史和生成目录边界。 |
| [docs/development/backend-implementation.md](development/backend-implementation.md) | development | Current | 2026-07-05 | 2026-10-31 | backend response envelope、OpenAPI status、logger、audit event 和 architecture guard 实现惯例。 |
| [docs/development/coding-style.md](development/coding-style.md) | development | Current | 2026-07-18 | 2026-10-31 | TypeScript、formatter 边界、文件命名、React 命名和 import alias 风格约定。 |
| [docs/development/commands.md](development/commands.md) | development | Current | 2026-07-18 | 2026-10-31 | workspace、显式提交前检查、backend、shared package、显式 PostgreSQL 测试、database、frontend 和 gateway 命令入口。 |
| [docs/features/audit/audit-logging.md](features/audit/audit-logging.md) | feature | Current | 2026-07-16 | 2026-09-30 | 统一审计日志、安全字段和已完成 `login_log` 退役后的当前边界。 |
| [docs/features/oidc/oidc-integration.md](features/oidc/oidc-integration.md) | feature | Current | 2026-07-16 | 2026-09-30 | 内部 OIDC client 的端点、client 类型、scope/claim、CORS 和退出契约。 |
| [docs/features/oidc/oidc-session-migration.md](features/oidc/oidc-session-migration.md) | feature | Current | 2026-06-28 | 2026-09-30 | Session Kernel 会话迁移、旧 key cleanup 和回滚边界。 |
| [docs/features/sso/public-thirdparty-unified-login.md](features/sso/public-thirdparty-unified-login.md) | feature | Current | 2026-06-28 | 2026-09-30 | 第三方统一登录入口说明。 |
| [docs/features/sso/third-party-sso-integration.md](features/sso/third-party-sso-integration.md) | feature | Current | 2026-06-28 | 2026-09-30 | 第三方业务系统 custom SSO 对接说明。 |
| [docs/releases/apisix-gateway-release.md](releases/apisix-gateway-release.md) | runbook | Current | 2026-07-16 | 2026-10-31 | APISIX manifest validate/diff/apply/prune、限流、观测和回滚手册。 |
| [docs/releases/audit-login-log-retirement-release.md](releases/audit-login-log-retirement-release.md) | runbook | Historical | 2026-07-16 | n/a | 已完成的 `login_log` 一次性退役记录；其迁移实现已不在当前仓库，不可作为当前 runbook。 |
| [docs/releases/observability-system-logs.md](releases/observability-system-logs.md) | runbook | Current | 2026-07-03 | 2026-10-31 | Loki/Grafana/Alloy 系统日志观测运行手册；补充 APISIX trace、Alloy OTLP 和证据留存。 |
| [docs/releases/oidc-release-runbook.md](releases/oidc-release-runbook.md) | runbook | Current | 2026-07-03 | 2026-10-31 | OIDC Provider 发布、JWK/HMAC rotation、逐 client smoke 和回滚手册。 |
| [docs/releases/role-assignment-role-management-release.md](releases/role-assignment-role-management-release.md) | runbook | Current | 2026-07-16 | 2026-10-31 | 角色分配统一、admin `/roles`、OIDC/read-model 一致性验收和回滚手册。 |
| [docs/releases/session-kernel-release-smoke.md](releases/session-kernel-release-smoke.md) | release-record | Historical | 2026-07-03 | n/a | 2026-06-24 Session Kernel 发布 smoke 证据快照，并提供后续可复用 smoke 模板。 |
| [docs/releases/sm-encrypted-password-login-release.md](releases/sm-encrypted-password-login-release.md) | runbook | Current | 2026-07-16 | 2026-10-31 | SM2/SM4 加密密码登录、API/SSO 同步发布、Cap 重试、错误码和 rollback matrix。 |
| [docs/releases/user-profile-dirty-queue-release.md](releases/user-profile-dirty-queue-release.md) | runbook | Current | 2026-07-16 | 2026-10-31 | versioned dirty/rebuild 队列、worker health、Bull Board、repair/backfill 和回滚手册。 |
| [docs/reviews/SOFTWARE_ENGINEERING_PRINCIPLES_REVIEW_2026-07-03.md](reviews/SOFTWARE_ENGINEERING_PRINCIPLES_REVIEW_2026-07-03.md) | review | Historical | 2026-07-03 | n/a | 2026-07-03 的软件工程原则审查快照；用于追溯风险，不替代当前代码检查。 |

## 维护方式

新增、删除或移动 `docs/**/*.md` 时，同步更新本索引并运行：

```bash
pnpm check:docs
```

若某篇文档包含已知旧架构或旧技术引用，但仍需保留，请在索引中标为 `Historical` 或 `Stale`。
