## ADDED Requirements

### Requirement: Audit Log Schema Organization
系统 SHALL 在 `packages/db` 中将统一审计日志表定义归入日志域 schema 路径；`audit_log` 的 Drizzle 表定义 SHALL 位于 `packages/db/src/schema/log`，并 SHALL 继续通过 `@iam/db/schema` 导出给应用代码使用。

#### Scenario: Audit log schema is exported from log domain
- **WHEN** 后端代码从 `@iam/db/schema` 导入 `auditLogs`
- **THEN** 导入 SHALL 继续成功
- **AND** `auditLogs` SHALL 映射到 PostgreSQL 表 `audit_log`
- **AND** 源文件 SHALL 位于 `packages/db/src/schema/log/audit-logs.ts`

#### Scenario: Audit log stays data-compatible
- **WHEN** 数据库迁移应用本变更
- **THEN** `audit_log` 表名、列名和既有索引 SHALL 保持不变
- **AND** 已有审计记录 SHALL 保留

## MODIFIED Requirements

### Requirement: Login Log Migration
系统 SHALL 完成 legacy `login_log` 退役；在删除表定义和数据库表前，系统 MUST 确认历史登录记录已经迁移到通用 `audit_log`，或通过迁移验收流程证明 `login_log` 可安全删除。退役后，应用代码 MUST NOT 继续写入或导入 `loginLogs`，新的登录安全事件 SHALL 只通过统一审计日志能力写入 `audit_log`。

#### Scenario: Verify legacy migration before retirement
- **WHEN** 运维准备应用删除 `login_log` 的数据库迁移
- **THEN** 运维 SHALL 先完成历史登录日志迁移验收
- **AND** 验收 SHALL 确认 legacy 登录记录已由 `audit_log` 中包含 `details.migrationSource = "login_log"` 和 `details.legacyLoginLogId` 的记录承载，或确认环境中没有需要保留的 legacy 登录记录

#### Scenario: Retire database schema exports
- **WHEN** 开发者从 `@iam/db/schema` 导入 `loginLogs`
- **THEN** TypeScript 编译 SHALL 失败
- **AND** `packages/db` SHALL 不再导出 `selectLoginLogSchema`、`insertLoginLogSchema` 或 `updateLoginLogSchema`

#### Scenario: Login events use audit log only
- **WHEN** 用户通过密码、手机、SSO、OA 或微信登录流程产生登录安全事件
- **THEN** 系统 SHALL 写入统一 `audit_log` 审计记录
- **AND** 系统 MUST NOT 写入 legacy `login_log`

#### Scenario: Drop legacy table by migration
- **WHEN** 执行本变更生成的 Drizzle migration
- **THEN** PostgreSQL 中的 legacy `login_log` 表 SHALL 被删除
- **AND** `audit_log` 表 SHALL 不被删除或重建
