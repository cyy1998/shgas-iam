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
| [docs/adr/0003-adopt-layered-test-lanes-and-resource-budgets.md](adr/0003-adopt-layered-test-lanes-and-resource-budgets.md) | decision | Historical | 2026-08-05 | n/a | 旧普通/smoke/external 通道决策；已由 ADR-0009 取代。 |
| [docs/adr/0004-adopt-upstream-first-matt-skills.md](adr/0004-adopt-upstream-first-matt-skills.md) | decision | Current | 2026-07-24 | 2026-10-31 | 确立上游 Matt skills 的流程所有权，并以仓库薄适配取代可执行证据状态机。 |
| [docs/adr/0005-keep-live-login-state-in-redis.md](adr/0005-keep-live-login-state-in-redis.md) | decision | Current | 2026-07-28 | 2026-10-31 | 有效会话与临时登录限制只以 Redis 实时状态为事实来源，不建立 PostgreSQL 会话影子或历史快照。 |
| [docs/adr/0006-elevate-user-subject-identifier.md](adr/0006-elevate-user-subject-identifier.md) | decision | Current | 2026-07-30 | 2026-10-31 | 保留现有 UUID，并将 Subject Identifier 的命名与所有权从 OIDC 提升到 IAM 身份域。 |
| [docs/adr/0007-separate-versioned-custom-sso-client-configuration.md](adr/0007-separate-versioned-custom-sso-client-configuration.md) | decision | Current | 2026-08-07 | 2026-10-31 | Custom SSO 使用独立的严格配置、Secret Hash 和版本屏障；其中 Client Binding 要求已由 ADR-0010 取代。 |
| [docs/adr/0008-adopt-client-subject-projection.md](adr/0008-adopt-client-subject-projection.md) | decision | Current | 2026-07-30 | 2026-10-31 | 两个协议共享主体事实与 client 裁剪模块，但保持配置、Wire Contract 和生命周期独立。 |
| [docs/adr/0009-adopt-canonical-test-collections.md](adr/0009-adopt-canonical-test-collections.md) | decision | Current | 2026-08-06 | 2026-10-31 | 采用 Unit/Integration/E2E canonical collections、永久 Guard，并原子切换默认 `test` 与 `verify`。 |
| [docs/adr/0010-narrow-client-binding-to-oidc-lifecycle.md](adr/0010-narrow-client-binding-to-oidc-lifecycle.md) | decision | Current | 2026-08-07 | 2026-10-31 | Client Binding 只属于 OIDC；Custom SSO 使用可恢复 Credential 签发，OIDC 删除 full binding 派生副本。 |
| [docs/agents/code-investigation.md](agents/code-investigation.md) | agent-config | Current | 2026-08-03 | 2026-10-31 | 项目级 `code_researcher`/`deep_researcher` 的分层路由、只读调查、证据返回和外置记忆规则。 |
| [docs/agents/domain.md](agents/domain.md) | agent-config | Current | 2026-07-16 | 2026-10-31 | Engineering skills 的 single-context domain documentation 消费规则。 |
| [docs/agents/issue-tracker.md](agents/issue-tracker.md) | agent-config | Current | 2026-08-06 | 2026-10-31 | 本地 spec、ticket、轻量 feature journal 与批量实施 handoff 的文件约定。 |
| [docs/agents/triage-labels.md](agents/triage-labels.md) | agent-config | Current | 2026-07-16 | 2026-10-31 | Engineering skills 使用的默认 triage 标签映射。 |
| [docs/agents/workflow.md](agents/workflow.md) | agent-config | Current | 2026-08-06 | 2026-10-31 | Matt skills 的仓库薄适配：本地 tracker、批量实施子代理、分支、验证、授权、归档和本地合入。 |
| [docs/architecture/architecture-guard.md](architecture/architecture-guard.md) | architecture | Current | 2026-07-31 | 2026-10-31 | 架构守卫规范的验证层选择、允许观察模型、永久规则准入、封闭目录与复杂度边界。 |
| [docs/architecture/backend-architecture.md](architecture/backend-architecture.md) | architecture | Current | 2026-08-09 | 2026-10-31 | 后端 runtime ownership、依赖方向、composition/DI、UnitOfWork/afterCommit、请求与审计上下文、关键 deep modules、OIDC/Worker lifecycle 和分层验证。 |
| [docs/architecture/contracts-and-database.md](architecture/contracts-and-database.md) | architecture | Current | 2026-08-01 | 2026-10-31 | shared contracts、domain/db/jobs/role-assignment-resolution/read-model 边界、UnitOfWork/afterCommit 和 Drizzle schema/relations/migration 约定。 |
| [docs/architecture/frontend-architecture.md](architecture/frontend-architecture.md) | architecture | Current | 2026-08-07 | 2026-10-31 | admin/sso 前端边界、service wrapper、contract、测试与生成路径约定。 |
| [docs/architecture/repository-map.md](architecture/repository-map.md) | architecture | Current | 2026-08-06 | 2026-10-31 | monorepo apps/packages、root-owned E2E workspace、gateway/observability 基础设施、agent workflow roots，以及生成目录边界。 |
| [docs/architecture/testing-architecture.md](architecture/testing-architecture.md) | architecture | Current | 2026-08-07 | 2026-10-31 | 已实施的 Unit/Integration/E2E canonical collections、六个 Integration profiles、永久 Collection Guard、资源预算与默认验证契约。 |
| [docs/development/backend-implementation.md](development/backend-implementation.md) | development | Current | 2026-07-26 | 2026-10-31 | backend response envelope、OpenAPI status、logger、audit event 和 Architecture Guard 验证分层。 |
| [docs/development/coding-style.md](development/coding-style.md) | development | Current | 2026-08-07 | 2026-10-31 | TypeScript、formatter 边界、文件命名、React 命名和 import alias 风格约定。 |
| [docs/development/commands.md](development/commands.md) | development | Current | 2026-08-06 | 2026-10-31 | 聚焦实现、canonical Unit/Integration commands、默认 verify、显式资源 profiles、Architecture Guard、性能与 commit guard 的可执行入口。 |
| [docs/features/audit/audit-logging.md](features/audit/audit-logging.md) | feature | Current | 2026-07-16 | 2026-09-30 | 统一审计日志、安全字段和已完成 `login_log` 退役后的当前边界。 |
| [docs/features/oidc/oidc-integration.md](features/oidc/oidc-integration.md) | feature | Current | 2026-08-01 | 2026-09-30 | 内部 OIDC client 的端点、client 类型、scope/claim、CORS 和退出契约。 |
| [docs/features/oidc/oidc-session-migration.md](features/oidc/oidc-session-migration.md) | feature | Current | 2026-06-28 | 2026-09-30 | Session Kernel 会话迁移、旧 key cleanup 和回滚边界。 |
| [docs/features/sso/custom-sso-subject-projection-design.md](features/sso/custom-sso-subject-projection-design.md) | design | Current | 2026-08-09 | 2026-09-30 | 已接受并形成候选实现的目标设计；生产运行时只在完整维护窗口切换后采用，不单独代表某个环境已完成切换。 |
| [docs/features/sso/public-thirdparty-unified-login.md](features/sso/public-thirdparty-unified-login.md) | feature | Current | 2026-08-02 | 2026-09-30 | 第三方统一登录入口、目标系统会话所有权与 Custom SSO 职责边界说明。 |
| [docs/features/sso/third-party-sso-integration.md](features/sso/third-party-sso-integration.md) | feature | Current | 2026-08-02 | 2026-09-30 | 第三方业务系统 custom SSO 对接、受控主体投影、credential/session 所有权与 IAM 内部职责边界说明。 |
| [docs/releases/apisix-gateway-release.md](releases/apisix-gateway-release.md) | runbook | Current | 2026-07-16 | 2026-10-31 | APISIX manifest validate/diff/apply/prune、限流、观测和回滚手册。 |
| [docs/releases/audit-login-log-retirement-release.md](releases/audit-login-log-retirement-release.md) | runbook | Historical | 2026-07-16 | n/a | 已完成的 `login_log` 一次性退役记录；其迁移实现已不在当前仓库，不可作为当前 runbook。 |
| [docs/releases/custom-sso-subject-projection-rehearsal-2026-08-02.md](releases/custom-sso-subject-projection-rehearsal-2026-08-02.md) | release-record | Historical | 2026-08-02 | n/a | Ticket 12 的临时近似规模手动联合演练简洁记录；不包含机器 receipt/manifest/transcript。 |
| [docs/releases/custom-sso-subject-projection-release.md](releases/custom-sso-subject-projection-release.md) | runbook | Current | 2026-08-02 | 2026-10-31 | Custom SSO Subject Projection 硬切换的冻结、备份、backfill/verify、artifact cleanup、四类 smoke、性能门禁和回滚边界。 |
| [docs/releases/observability-system-logs.md](releases/observability-system-logs.md) | runbook | Current | 2026-07-03 | 2026-10-31 | Loki/Grafana/Alloy 系统日志观测运行手册；补充 APISIX trace、Alloy OTLP 和证据留存。 |
| [docs/releases/oidc-release-runbook.md](releases/oidc-release-runbook.md) | runbook | Current | 2026-07-03 | 2026-10-31 | OIDC Provider 发布、JWK/HMAC rotation、逐 client smoke 和回滚手册。 |
| [docs/releases/role-assignment-role-management-release.md](releases/role-assignment-role-management-release.md) | runbook | Current | 2026-07-25 | 2026-10-31 | 角色分配 resolver、admin `/roles`、OIDC/read-model 一致性验收和回滚手册。 |
| [docs/releases/session-kernel-release-smoke.md](releases/session-kernel-release-smoke.md) | release-record | Historical | 2026-07-03 | n/a | 2026-06-24 Session Kernel 发布 smoke 证据快照，并提供后续可复用 smoke 模板。 |
| [docs/releases/sm-encrypted-password-login-release.md](releases/sm-encrypted-password-login-release.md) | runbook | Current | 2026-07-16 | 2026-10-31 | SM2/SM4 加密密码登录、API/SSO 同步发布、Cap 重试、错误码和 rollback matrix。 |
| [docs/releases/user-profile-dirty-queue-release.md](releases/user-profile-dirty-queue-release.md) | runbook | Current | 2026-07-25 | 2026-10-31 | scope producer 停止、旧 job 五类排空、worker-last 发布门禁，以及现有 Bull Board/repair/backfill 操作语义。 |
| [docs/reviews/SOFTWARE_ENGINEERING_PRINCIPLES_REVIEW_2026-07-03.md](reviews/SOFTWARE_ENGINEERING_PRINCIPLES_REVIEW_2026-07-03.md) | review | Historical | 2026-07-03 | n/a | 2026-07-03 的软件工程原则审查快照；用于追溯风险，不替代当前代码检查。 |

## 维护方式

新增、删除或移动 `docs/**/*.md` 时，同步更新本索引并运行：

```bash
pnpm check:docs
```

若某篇文档包含已知旧架构或旧技术引用，但仍需保留，请在索引中标为 `Historical` 或 `Stale`。
