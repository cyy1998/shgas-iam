## Why

`login_log` 已由统一 `audit_log` 替代，继续在 `packages/db` 中保留 legacy 表定义会让新开发误用旧日志模型。与此同时，`audit_log` 是日志/审计基础设施表，放在 `schema/core` 会模糊核心业务表与日志表边界，因此需要调整目录归属并完成旧登录日志退役。

## What Changes

- **BREAKING**: 从 `@iam/db/schema` 中移除 `loginLogs` 及其 Zod schema 导出，删除 `login_log` Drizzle 表定义和 relations。
- 将 `auditLogs`、`selectAuditLogSchema`、`insertAuditLogSchema` 和 `auditLogDetailsSchema` 从 `packages/db/src/schema/core/audit-logs.ts` 移到新的 `packages/db/src/schema/log/audit-logs.ts`。
- 新增 `packages/db/src/schema/log/index.ts`，并通过 `packages/db/src/schema/index.ts` 继续导出 `auditLogs`，保持现有审计读写代码的公共导入路径稳定。
- 新增日志域 relations 入口（如 `packages/db/src/relations/log/index.ts`），并在总 relations 中注册；`audit_log` 当前没有业务外键关系时保持空关系配置。
- 清理 `apps/api` 中仍直接写入 `login_log` 的 repository/引用，确保登录相关记录只通过统一 audit service 写入 `audit_log`。
- 生成数据库迁移，删除 legacy `login_log` 表；保留已有 `audit_log` 表名、列名、索引名和数据。
- 更新审计日志文档与 OpenSpec，说明 `login_log` 已退役，历史登录事件应已迁移或由 `audit_log` 承载。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `audit-logging`: 将 `login_log` 历史迁移要求更新为退役要求，并明确统一审计日志表在 DB 包中归属 `schema/log`，公共导出路径保持稳定。

## Impact

- 影响 `packages/db/src/schema`、`packages/db/src/relations`、Drizzle migrations 和 `@iam/db/schema` 导出面。
- 影响仍引用 `loginLogs` 或 `login_log` 的 API 代码、测试、迁移/文档。
- 运行时数据库将删除 `login_log` 表；实施前需要确认历史数据已迁移到 `audit_log`，或由迁移/验收流程保证可安全删除。
- 不改变 `audit_log` 的数据库表名、列结构、索引和现有审计查询 API。
