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
| [docs/features/audit/audit-logging.md](features/audit/audit-logging.md) | feature | Current | 2026-06-28 | 2026-09-30 | 统一审计日志能力说明；当前行为以 `openspec/specs/audit-logging/spec.md` 为准。 |
| [docs/features/oidc/oidc-integration.md](features/oidc/oidc-integration.md) | feature | Current | 2026-06-28 | 2026-09-30 | 内部 OIDC client 接入指南；与 OIDC specs 和 release runbook 共同使用。 |
| [docs/features/oidc/oidc-session-migration.md](features/oidc/oidc-session-migration.md) | feature | Current | 2026-06-28 | 2026-09-30 | Session Kernel 会话迁移、旧 key cleanup 和回滚边界。 |
| [docs/features/sso/public-thirdparty-unified-login.md](features/sso/public-thirdparty-unified-login.md) | feature | Current | 2026-06-28 | 2026-09-30 | 第三方统一登录入口说明。 |
| [docs/features/sso/third-party-sso-integration.md](features/sso/third-party-sso-integration.md) | feature | Current | 2026-06-28 | 2026-09-30 | 第三方业务系统 custom SSO 对接说明。 |
| [docs/releases/observability-system-logs.md](releases/observability-system-logs.md) | runbook | Current | 2026-06-28 | 2026-09-30 | Loki/Grafana/Alloy 系统日志观测运行手册。 |
| [docs/releases/oidc-release-runbook.md](releases/oidc-release-runbook.md) | runbook | Current | 2026-06-28 | 2026-09-30 | OIDC Provider 发布、smoke 和回滚手册。 |
| [docs/releases/session-kernel-release-smoke.md](releases/session-kernel-release-smoke.md) | release-record | Historical | 2026-06-24 | n/a | Session Kernel 发布 smoke 证据快照；不代表后续当前状态。 |
| [docs/releases/sm-encrypted-password-login-release.md](releases/sm-encrypted-password-login-release.md) | release-record | Historical | 2026-06-28 | n/a | SM 加密密码登录发布检查清单和历史验收记录。 |
| [docs/releases/user-profile-dirty-queue-release.md](releases/user-profile-dirty-queue-release.md) | runbook | Current | 2026-07-02 | 2026-09-30 | versioned user-profile dirty/rebuild 队列发布顺序和回滚注意事项。 |
| [docs/reviews/ARCHITECTURE_REVIEW.md](reviews/ARCHITECTURE_REVIEW.md) | review | Stale | 2026-06-28 | n/a | not current: 仍引用 Prisma、旧路径和旧架构判断，只能作为历史线索。 |
| [docs/reviews/SOLID_DRY_KISS_REVIEW_2026-06-15.md](reviews/SOLID_DRY_KISS_REVIEW_2026-06-15.md) | review | Historical | 2026-06-15 | n/a | 2026-06-15 的代码审查快照；用于追溯风险，不替代当前代码检查。 |
| [docs/reviews/TYPESCRIPT_BEST_PRACTICES_REVIEW_2026-06-15.md](reviews/TYPESCRIPT_BEST_PRACTICES_REVIEW_2026-06-15.md) | review | Historical | 2026-06-15 | n/a | 2026-06-15 的 TypeScript 审查快照；用于追溯风险，不替代当前 lint/typecheck。 |

## 维护方式

新增、删除或移动 `docs/**/*.md` 时，同步更新本索引并运行：

```bash
pnpm check:docs
```

若某篇文档包含已知旧架构或旧技术引用，但仍需保留，请在索引中标为 `Historical` 或 `Stale`。
