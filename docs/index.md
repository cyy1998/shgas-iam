# IAM 文档索引

本索引用作 Codex 和维护者进入 `docs/` 的稳定入口。需要当前行为时优先阅读 `Current` 文档和
`openspec/specs/`；需要理解历史决策时再进入 `Historical` 文档。`Stale` 文档只能作为历史线索，不应作为当前架构或实现依据。

## 状态约定

| Status | 含义 | 新鲜度规则 |
|---|---|---|
| Current | 当前可作为实现、排障或发布依据 | 必须有 `Last verified` 和未来的 `Next review` |
| Needs Review | 可能仍有用，但需要重新核对 | 允许通过检查，但不应作为唯一依据 |
| Historical | 已完成的发布记录、审查记录或决策快照 | 不要求周期性复查 |
| Stale | 已知不再反映当前代码或架构 | 必须在备注中说明 not current |

## 当前事实来源

- OpenSpec 当前能力规格：`openspec/specs/`
- OpenSpec 历史变更记录：`openspec/changes/archive/`
- 仓库级指令入口：`AGENTS.md`
- 运行和环境入口：`README.md`

## 文档清单

| Document | Type | Status | Last verified | Next review | Notes |
|---|---|---|---|---|---|
| [docs/architecture/backend-architecture.md](architecture/backend-architecture.md) | architecture | Current | 2026-07-05 | 2026-10-31 | 后端 app composition、factory/DI、route/middleware 和 backend tooling 结构约定。 |
| [docs/architecture/contracts-and-database.md](architecture/contracts-and-database.md) | architecture | Current | 2026-07-05 | 2026-10-31 | shared contracts、domain/db/jobs/read-model 边界、UnitOfWork 和 Drizzle schema/relations/migration 约定。 |
| [docs/architecture/frontend-architecture.md](architecture/frontend-architecture.md) | architecture | Current | 2026-07-05 | 2026-10-31 | admin/sso 前端 app 边界、Umi runtime、pages/components/hooks、service wrapper 和 contract 使用约定。 |
| [docs/architecture/repository-map.md](architecture/repository-map.md) | architecture | Current | 2026-07-05 | 2026-10-31 | monorepo apps/packages/gateway 地图，以及 generated/build/vendored path 编辑边界。 |
| [docs/development/backend-implementation.md](development/backend-implementation.md) | development | Current | 2026-07-05 | 2026-10-31 | backend response envelope、OpenAPI status、logger、audit event 和 architecture guard 实现惯例。 |
| [docs/development/coding-style.md](development/coding-style.md) | development | Current | 2026-07-05 | 2026-10-31 | TypeScript、formatter 边界、文件命名、React 命名和 import alias 风格约定。 |
| [docs/development/commands.md](development/commands.md) | development | Current | 2026-07-10 | 2026-10-31 | workspace、OpenSpec guard、pre-commit hook、backend、shared package、database、frontend 和 gateway 常用命令入口。 |
| [docs/features/audit/audit-logging.md](features/audit/audit-logging.md) | feature | Current | 2026-06-28 | 2026-09-30 | 统一审计日志能力说明；当前行为以 `openspec/specs/audit-logging/spec.md` 为准。 |
| [docs/features/oidc/oidc-integration.md](features/oidc/oidc-integration.md) | feature | Current | 2026-06-28 | 2026-09-30 | 内部 OIDC client 接入指南；与 OIDC specs 和 release runbook 共同使用。 |
| [docs/features/oidc/oidc-session-migration.md](features/oidc/oidc-session-migration.md) | feature | Current | 2026-06-28 | 2026-09-30 | Session Kernel 会话迁移、旧 key cleanup 和回滚边界。 |
| [docs/features/sso/public-thirdparty-unified-login.md](features/sso/public-thirdparty-unified-login.md) | feature | Current | 2026-06-28 | 2026-09-30 | 第三方统一登录入口说明。 |
| [docs/features/sso/third-party-sso-integration.md](features/sso/third-party-sso-integration.md) | feature | Current | 2026-06-28 | 2026-09-30 | 第三方业务系统 custom SSO 对接说明。 |
| [docs/releases/apisix-gateway-release.md](releases/apisix-gateway-release.md) | runbook | Current | 2026-07-03 | 2026-10-31 | APISIX gateway manifest validate、diff、apply、prune、真实 IP/限流、OpenTelemetry 和回滚手册。 |
| [docs/releases/audit-login-log-retirement-release.md](releases/audit-login-log-retirement-release.md) | runbook | Current | 2026-07-03 | 2026-10-31 | 统一审计日志与 legacy `login_log` 退役发布、迁移验收、敏感字段检查和回滚手册。 |
| [docs/releases/observability-system-logs.md](releases/observability-system-logs.md) | runbook | Current | 2026-07-03 | 2026-10-31 | Loki/Grafana/Alloy 系统日志观测运行手册；补充 APISIX trace、Alloy OTLP 和证据留存。 |
| [docs/releases/oidc-release-runbook.md](releases/oidc-release-runbook.md) | runbook | Current | 2026-07-03 | 2026-10-31 | OIDC Provider 发布、JWK/HMAC rotation、逐 client smoke 和回滚手册。 |
| [docs/releases/role-assignment-role-management-release.md](releases/role-assignment-role-management-release.md) | runbook | Current | 2026-07-03 | 2026-10-31 | 角色分配统一、admin `/roles`、user-profile dirty 验收和回滚手册。 |
| [docs/releases/session-kernel-release-smoke.md](releases/session-kernel-release-smoke.md) | release-record | Historical | 2026-07-03 | n/a | 2026-06-24 Session Kernel 发布 smoke 证据快照，并提供后续可复用 smoke 模板。 |
| [docs/releases/sm-encrypted-password-login-release.md](releases/sm-encrypted-password-login-release.md) | runbook | Current | 2026-07-03 | 2026-10-31 | SM2/SM4 加密密码登录、API/SSO 同步发布、Cap 重试、错误码和 rollback matrix。 |
| [docs/releases/user-profile-dirty-queue-release.md](releases/user-profile-dirty-queue-release.md) | runbook | Current | 2026-07-03 | 2026-10-31 | versioned user-profile dirty/rebuild 队列、worker health、Bull Board、repair/backfill 和回滚手册。 |
| [docs/reviews/SOFTWARE_ENGINEERING_PRINCIPLES_REVIEW_2026-07-03.md](reviews/SOFTWARE_ENGINEERING_PRINCIPLES_REVIEW_2026-07-03.md) | review | Historical | 2026-07-03 | n/a | 2026-07-03 的软件工程原则审查快照；用于追溯风险，不替代当前代码检查。 |
| [docs/workflows/archive.md](workflows/archive.md) | workflow | Current | 2026-07-10 | 2026-10-31 | 提交、合并、OpenSpec archive integrity、分支清理和阻塞条件。 |
| [docs/workflows/clarify.md](workflows/clarify.md) | workflow | Current | 2026-07-03 | 2026-10-31 | 需求边界、领域术语、关键取舍和正确性标准澄清方法。 |
| [docs/workflows/explore.md](workflows/explore.md) | workflow | Current | 2026-07-03 | 2026-10-31 | 问题空间、候选方案、未知项和影响面探索方法。 |
| [docs/workflows/implement.md](workflows/implement.md) | workflow | Current | 2026-07-03 | 2026-10-31 | 实现、分支策略、TDD、范围漂移和委派规则。 |
| [docs/workflows/index.md](workflows/index.md) | workflow | Current | 2026-07-03 | 2026-10-31 | workflow 子目录索引、需求分流、计划入口和生命周期状态规则。 |
| [docs/workflows/plan.md](workflows/plan.md) | workflow | Current | 2026-07-03 | 2026-10-31 | Quick Change、OpenSpec change 和大型 OpenSpec umbrella change 产物边界。 |
| [docs/workflows/verify.md](workflows/verify.md) | workflow | Current | 2026-07-10 | 2026-10-31 | 验证门禁、OpenSpec 聚合检查、测试覆盖复核、验证矩阵、Smoke 入口、失败处理和结果记录要求。 |

## 维护方式

新增、删除或移动 `docs/**/*.md` 时，同步更新本索引并运行：

```bash
pnpm check:docs
```

若某篇文档包含已知旧架构或旧技术引用，但仍需保留，请在索引中标为 `Historical` 或 `Stale`。
