## Context

当前 `packages/db` 中 `audit_log` 和 legacy `login_log` 都定义在 `packages/db/src/schema/core`，其中 `audit_log` 已成为统一审计事实表，`login_log` 只剩历史迁移来源。现有 `openspec/specs/audit-logging/spec.md` 仍描述“提供一次性迁移脚本”，`docs/audit-logging.md` 也说明 `login_log` 等待后续独立变更移除。

这次变更要完成这个后续独立变更：退役 `login_log`，并把审计日志表定义移入新的日志域路径。约束是 `audit_log` 的数据库表名、列、索引和现有服务导入路径应保持稳定，避免把目录整理变成运行时审计契约变化。

## Goals / Non-Goals

**Goals:**

- 从 `packages/db` 的 schema、relations 和公共导出中移除 `loginLogs`、`selectLoginLogSchema`、`insertLoginLogSchema` 和 `updateLoginLogSchema`。
- 将 `audit-logs.ts` 从 `schema/core` 移到 `schema/log`，并通过 `packages/db/src/schema/index.ts` 继续导出 `auditLogs` 及相关 Zod schema。
- 为 relations 增加日志域入口，并从 `coreRelations` 中清理 `loginLogsRelations` 与 `users.loginLogs`。
- 删除仍直接写 `login_log` 的应用代码，确保登录审计只走统一 audit service。
- 生成 Drizzle migration 删除 `login_log` 表，并用类型检查/测试证明没有残留 `loginLogs` 引用。

**Non-Goals:**

- 不重命名 PostgreSQL 中的 `audit_log` 表。
- 不改变 `audit_log` 列结构、索引、审计 action 命名、查询 API 或管理端展示行为。
- 不重新实现历史 `login_log` 到 `audit_log` 的迁移脚本；本变更只要求删除前确认迁移已完成或通过验收步骤证明可安全退役。
- 不引入通用日志系统或运行时文件日志能力。

## Decisions

### 1. 使用 `schema/log` 作为日志域目录

将 `auditLogs` 放到 `packages/db/src/schema/log/audit-logs.ts`，新增 `packages/db/src/schema/log/index.ts`，再由 `packages/db/src/schema/index.ts` 同时导出 `./core` 和 `./log`。

选择这个方案是因为它让日志/审计表和核心业务表分开，但保留现有 `@iam/db/schema` 公共导入路径。替代方案是把 `audit_log` 放到 `_infra`，但当前用户明确要求新的 `log` 路径，且审计日志是可查询的业务安全事实表，不只是内部队列或运行时基础设施记录。

### 2. relations 也按域拆分，但 `audit_log` 暂不建立业务 relations

新增 `packages/db/src/relations/log/index.ts` 并在总 `relations/index.ts` 中展开。`audit_log` 的 actor/target 字段是多态审计信封，不适合建立单一物理关系；因此日志域 relations 可以先返回空配置，未来若有稳定单表关系再补充。

替代方案是完全不新增 relations/log，但 schema 与 relations 的域划分会不一致，后续添加日志关系时也更容易回流到 `core`。

### 3. 退役 `login_log` 时同步清理写入代码

删除 `packages/db/src/schema/core/login-logs.ts` 和 `packages/db/src/relations/core/login-logs.ts` 后，任何 `loginLogs` 导入都会在 typecheck 中暴露。`apps/api/src/services/session/session.repository.ts` 当前仍直接写 `login_log`，应移除或改为不再提供该 legacy 写入；登录审计保留现有 audit service 路径。

替代方案是保留一个 deprecated 空壳导出，但这会继续允许新代码引用旧模型，和退役目标冲突。

### 4. 通过迁移删除表，不手改既有 migration snapshot

实现阶段应修改 schema 后运行 `pnpm --filter @iam/db db:generate` 生成新的 Drizzle migration，用新迁移删除 `login_log`。既有已生成迁移和 `meta` 不应手改。

替代方案是手写 SQL migration；如果 Drizzle 生成结果不可用，可以在审查后调整新 migration，但仍不得改历史 migration。

## Risks / Trade-offs

- [Risk] 生产或测试环境仍有未迁移的 `login_log` 数据。→ 删除表前运行历史迁移验收或计数检查，确认 `audit_log.details` 中 legacy 映射已覆盖历史记录；在部署说明中明确这是 destructive migration。
- [Risk] 某些代码或测试仍依赖 `loginLogs` 导出。→ 使用 `rg`、`@iam/db typecheck` 和受影响 app typecheck 捕获残留引用。
- [Risk] 移动 `audit-logs.ts` 导致公共导入路径变化。→ 只改变内部目录，继续从 `@iam/db/schema` 导出同名符号。
- [Risk] Drizzle migration 误判 `audit_log` 为删除重建。→ 实现时检查生成 SQL，确认只删除 `login_log`，不触碰 `audit_log`。

## Migration Plan

1. 在代码中移动 `audit-logs.ts` 到 `schema/log`，更新 schema index 导出。
2. 新增 relations/log 入口并更新总 relations，删除 `loginLogsRelations` 和 `users.loginLogs`。
3. 删除 `login-logs.ts` schema 和 legacy 写入 repository/引用。
4. 运行 `rg` 确认应用代码中没有 `loginLogs` 运行时引用，只保留文档、历史迁移或本变更说明中的 `login_log` 文本。
5. 运行 `pnpm --filter @iam/db db:generate`，审查生成 SQL 仅删除 `login_log`。
6. 运行 `pnpm --filter @iam/db typecheck`，并对受影响 app 运行 focused typecheck/test。
7. 部署前执行 `login_log` 历史迁移验收；确认后应用删除表 migration。

回滚策略：代码回滚可恢复 `loginLogs` schema 定义；数据库回滚需要从备份或反向 migration 重建 `login_log`，但删除后的 legacy 数据恢复依赖备份。因此生产执行前必须完成迁移验收和备份确认。

## Open Questions

- 实施时是否需要保留一个只读验收脚本来报告 `login_log` 和 `audit_log` legacy 映射计数，还是直接复用现有迁移脚本的 dry-run/verify 输出。
