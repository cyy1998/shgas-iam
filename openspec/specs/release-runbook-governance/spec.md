# release-runbook-governance Specification

## Purpose
管理 `docs/releases/` 发布手册的语言、索引、新鲜度、可复用结构、历史记录边界和验证要求。

## Requirements
### Requirement: Release 手册必须使用中文并被索引
所有 `docs/releases/` 下的发布手册和 release 记录 SHALL 面向中文运维/研发读者维护，并进入文档索引。

#### Scenario: Release 手册正文使用简体中文
- **WHEN** 新增或更新 `docs/releases/*.md`
- **THEN** 正文叙述、检查项、回滚步骤、证据模板、风险说明 MUST 使用简体中文
- **AND** 技术标识、命令、URL、环境变量、表名、字段名、错误码 MAY 保持原文

#### Scenario: Release 手册进入 docs/index.md
- **WHEN** 新增、删除或重命名 `docs/releases/*.md`
- **THEN** `docs/index.md` MUST 同步包含对应条目
- **AND** 条目 MUST 填写标题、路径、分类、状态、Last verified、Next review、Owner、摘要

#### Scenario: Release 手册维护新鲜度
- **WHEN** release 手册描述当前可复用发布流程
- **THEN** `Last verified` MUST 反映最近一次文档验证日期
- **AND** `Next review` MUST 设置为不晚于 `Last verified` 后 4 个月的日期
- **AND** 历史记录类文档 MAY 将 `Next review` 设置为 `n/a`，但 MUST 明确其不是当前发布流程

### Requirement: 可复用 release runbook 必须覆盖发布闭环
当前有效的 release runbook SHALL 提供足够步骤，使发布、验证、回滚和证据留存可以重复执行。

#### Scenario: Runbook 声明发布前置条件和顺序
- **WHEN** runbook 面向当前或未来发布
- **THEN** it MUST list prerequisite configuration, dependency services, migration or rollout ordering, and operator roles
- **AND** it MUST identify branch/tag or artifact expectations when applicable

#### Scenario: Runbook 覆盖发布后冒烟和证据
- **WHEN** runbook 面向当前或未来发布
- **THEN** it MUST provide smoke-test commands or UI/API verification steps
- **AND** it MUST define evidence to retain, such as command output, screenshots, trace IDs, log queries, audit records, or queue metrics

#### Scenario: Runbook 覆盖回滚、恢复和清理对象
- **WHEN** runbook 面向当前或未来发布
- **THEN** it MUST document rollback or recovery decision points
- **AND** it MUST list data, queues, cache keys, keys/secrets, gateway config, or legacy objects that need cleanup or preservation

### Requirement: Historical release record 必须区别于当前流程
历史 release 记录 SHALL 保留上下文，但 MUST NOT 让读者误以为其仍是当前发布步骤。

#### Scenario: 历史记录不再作为当前 runbook
- **WHEN** a release document records an already-completed release
- **THEN** it MUST label itself as historical or completed
- **AND** it MUST point to current reusable smoke or runbook material when future releases still need guidance

#### Scenario: Session Kernel smoke 文档保留可复用模板
- **WHEN** `docs/releases/session-kernel-release-smoke.md` is maintained
- **THEN** it MUST keep historical release facts separate from reusable smoke-test steps
- **AND** it MUST include reusable Session Kernel smoke coverage for health, login, logout, refresh, revoke, Redis TTL/session keys, audit logs, and rollback checks

### Requirement: 现有 release 手册必须按能力风险补强
既有 release 手册 SHALL 覆盖各自能力的关键发布风险、冒烟、回滚和证据。

#### Scenario: User Profile Dirty Queue runbook 覆盖版本化 dirty 队列
- **WHEN** `docs/releases/user-profile-dirty-queue-release.md` is maintained
- **THEN** it MUST include worker stop/start ordering, dirty version migration or backfill, stale unversioned job cleanup, repair/backfill commands, health and Bull Board checks, dirtyVersion log evidence, and rollback/recovery paths

#### Scenario: SM 加密密码登录 runbook 覆盖密钥和兼容性
- **WHEN** `docs/releases/sm-encrypted-password-login-release.md` is maintained
- **THEN** it MUST include API and SSO synchronized rollout order, SM2/SM4 key material and `kid` checks, nonce TTL and replay protection, Cap retry behavior, plaintext legacy rejection checks, `LOGIN.INVALID_CREDENTIAL` expectations, sensitive log checks, and rollback matrix

#### Scenario: System log observability runbook 覆盖链路追踪
- **WHEN** `docs/releases/observability-system-logs.md` is maintained
- **THEN** it MUST include APISIX OpenTelemetry and Alloy OTLP receiver expectations, trace fields (`traceId`, `spanId`, `traceparent`), gateway-to-backend-to-audit trace smoke checks, and evidence retention

#### Scenario: OIDC runbook 覆盖密钥轮换和客户端启用
- **WHEN** `docs/releases/oidc-release-runbook.md` is maintained
- **THEN** it MUST include JWK rotation windows, Session Kernel HMAC lookup rotation, per-client enablement matrix, discovery/JWKS/token/UserInfo smoke checks, and evidence templates for client authorization

### Requirement: 缺失的高风险 release 手册必须新增
缺少可复用 runbook 的高风险发布面 SHALL 补齐独立 release 手册。

#### Scenario: Role assignment and role management runbook exists
- **WHEN** role assignment or role management changes are released
- **THEN** `docs/releases/role-assignment-role-management-release.md` MUST cover schema/permission prerequisites, admin-api/admin UI smoke, role assignment audit evidence, rollback and data recovery

#### Scenario: APISIX gateway runbook exists
- **WHEN** gateway manifests or APISIX routing changes are released
- **THEN** `docs/releases/apisix-gateway-release.md` MUST cover manifest validation/diff/apply commands, route/plugin smoke, upstream health, rollback to previous manifests, and gateway log/trace evidence

#### Scenario: Audit/login_log retirement runbook exists
- **WHEN** audit table or `login_log` retirement changes are released
- **THEN** `docs/releases/audit-login-log-retirement-release.md` MUST cover dependency inventory, retention/export checks, migration or compatibility order, API/admin smoke, rollback/recovery, and evidence proving legacy reads are no longer required

### Requirement: Release 文档变更必须通过文档检查
Release 手册治理变更 SHALL 在归档前通过仓库文档守卫和基础链接/命令检查。

#### Scenario: 文档索引守卫通过
- **WHEN** release 文档或 `docs/index.md` 发生变更
- **THEN** `pnpm check:docs` MUST pass before the change is considered complete

#### Scenario: 手册内相对链接和命令可验证
- **WHEN** release runbook references local documentation, scripts, or package commands
- **THEN** referenced local paths SHOULD exist
- **AND** commands SHOULD match package scripts or documented root shortcuts
