## Context

当前 PostgreSQL 里只有 `login_log`，字段固定为用户、客户端、登录类型和登录时间，只能表达登录成功类事件。系统已经存在更多需要追责和复盘的安全敏感动作：管理员 mutation、用户自助改密/绑手机、密码重置、验证码发送/校验、权限委派、供应商注册、SSO/OA/微信登录和 client secret 轮换。

`apps/admin` 已有用户、组织、岗位、任职和客户端管理页面，并在用户详情、任职详情中预留“操作日志” Tab。本变更需要补齐全局审计日志管理页面，同时把这两个已有 Tab 从占位接入真实查询。

审计日志和普通系统日志的目标不同：审计日志是业务和安全证据，必须可长期留存、可按 actor/target/action 查询；普通系统日志是运行时遥测，应继续输出结构化 JSON 到 stdout 并由日志平台采集。本变更只设计审计日志，不改变普通日志链路。

## Goals / Non-Goals

**Goals:**

- 建立统一 `audit_log` 表，替代临时 `login_log` 作为审计事件事实表。
- 使用结构化字段表达 `actor`、`target`、`action`、`outcome`、请求来源和时间，使用 `details jsonb` 保存事件差异化详情。
- 支持没有 `actor_user_id` 的系统 actor、client actor 和匿名 actor。
- 覆盖首批 P0/P1 安全敏感操作。
- 在 `apps/admin` 实现全局审计日志管理页面，并接入用户详情、任职详情的“操作日志” Tab。
- 提供一次性迁移脚本，把现有 `login_log` 历史数据迁入 `audit_log`。

**Non-Goals:**

- 不在本变更中建设 Loki/OpenSearch/ClickHouse 等普通日志平台。
- 不在本变更中实现审计日志归档、分区表或冷存储。
- 不在本变更中实现审计日志导出、图表分析、实时推送或告警中心。
- 不把 `password`、验证码、token、cookie、client secret 明文写入审计日志。

## Decisions

### 1. 使用结构化信封 + `details jsonb`

`audit_log` 采用结构化信封字段承载高频查询维度：

- `eventTime`
- `action`
- `outcome`
- `actorType`
- `actorUserId`
- `actorUsername`
- `actorClientCode`
- `actorSystemKey`
- `targetType`
- `targetId`
- `targetCode`
- `sourceApp`
- `requestId`
- `traceId`
- `ip`
- `userAgent`
- `route`
- `method`
- `details`

`details jsonb` 只保存差异化上下文，例如 `before`、`after`、`patch`、`reason`、`errorCode`、`loginType`、`migrationSource`。这样既能支持不同事件的扩展，又不会牺牲核心查询性能。

替代方案：纯 `jsonb` 表。放弃原因是 actor、target、action、时间范围查询会依赖 JSON 表达式索引，后续分页、权限过滤和前端详情页查询都更脆弱。

### 2. 审计表 append-only，不复用业务 `baseColumns`

审计记录只新增，不做业务软删除，不需要 `updateTime` 和 `isDelete`。表定义应显式声明 `id`、`eventTime` 等列，而不是直接复用当前包含 `updateTime/isDelete` 的 `baseColumns`。

替代方案：复用 `baseColumns`。放弃原因是审计表不应表达“更新”和“删除”语义，避免误导维护者做可变审计记录。

### 3. actor 字段允许按类型部分为空

系统 actor 没有 `actor_user_id` 是正常场景，但 actor 仍必须结构化：

- `actorType = "user" | "admin"`：`actorUserId` 或 `actorUsername` 至少有一个。
- `actorType = "client"`：`actorClientCode` 必填。
- `actorType = "system"`：`actorSystemKey` 必填。
- `actorType = "anonymous"`：允许 actor 标识为空，但应尽量有 `ip` 或 `requestId`。

这些规则优先由写入服务和 Zod schema 保证；如果 Drizzle 迁移表达稳定，再补充 PostgreSQL `check` 约束。

### 4. 事件命名使用稳定的点分层字符串

首批事件使用稳定 action 命名：

- `auth.login.password.success`
- `auth.login.password.failure`
- `auth.login.mobile.success`
- `auth.login.mobile.failure`
- `auth.login.oa.success`
- `auth.login.wechat.success`
- `auth.sms_code.send`
- `auth.sms_code.verify`
- `auth.password.reset`
- `self.password.change`
- `self.mobile.bind`
- `admin.user.create`
- `admin.user.update`
- `admin.user.status_update`
- `admin.user.delete`
- `admin.user.reset_password`
- `admin.client.create`
- `admin.client.update`
- `admin.client.status_update`
- `admin.client.delete`
- `admin.client.rotate_secret`
- `admin.organization.create`
- `admin.organization.update`
- `admin.organization.status_update`
- `admin.organization.delete`
- `admin.position.create`
- `admin.position.update`
- `admin.position.status_update`
- `admin.position.delete`
- `admin.employment.create`
- `admin.employment.update`
- `admin.employment.status_update`
- `admin.employment.delete`
- `admin.employment.transfer`
- `admin.employment.set_primary`
- `admin.employment.resign_user`
- `internal.delegation.create`
- `internal.delegation.update`
- `internal.purveyor.register`
- `internal.purveyor_contact.register`

事件是否成功用 `outcome = "success" | "failure"` 表达，不把成功/失败拆成完全不同的查询模型。登录成功的 action 可以保留 `.success` 后缀用于兼容既有语义，但新写入接口仍必须设置 `outcome`。

### 5. 写入服务按“业务成功后记录”为默认策略

管理员 mutation 和数据变更类事件默认在业务事务成功后记录 `success` 审计。对认证、验证码、密码重置等安全流程，失败本身也有安全价值，应记录 `failure` 事件，但不得在响应中泄露更多枚举信息。

在一个业务事务中需要强一致审计的动作，可以把 `tx` 传给审计 repository 一起提交。对跨 Redis、外部 SMS/Orcas/Wechat 的动作，审计记录允许在业务动作完成后单独写入，但调用方必须避免吞掉审计写入错误；如果审计写入失败，应打普通错误日志并按安全等级决定是否阻断响应。

### 6. 共享边界放在 `packages/db` 和 `packages/domain`

- `packages/db/src/schema/core/audit-logs.ts` 定义表、Zod insert/select/update schema 和索引。
- `packages/domain/src/audit` 定义跨 app 共享的审计 DTO、actor/target/action/outcome schema。
- `apps/api/src/services/audit` 和 `apps/admin-api/src/services/audit` 提供应用侧写入入口，负责从 Hono context/session/client 中提取 actor 和 request 信息。

不把审计写入服务放进 `packages/api-core`，因为 `api-core` 当前不依赖 `@iam/db`，让它依赖数据库会扩大基础设施包职责。

### 7. `login_log` 历史迁移使用可重复校验的一次性脚本

新增脚本从 `login_log` 读取历史记录，批量插入 `audit_log`：

- `action` 按 `loginType` 映射到登录成功事件，无法精确识别时使用 `auth.login.success`。
- `outcome = "success"`。
- `actorType = "user"`。
- `actorUserId/actorUsername/target*` 从原记录映射。
- `sourceApp = "iam"`。
- `details` 记录 `loginType`、`clientCode`、`migrationSource = "login_log"`、`legacyLoginLogId`。
- `eventTime = loginTime`。

迁移脚本必须支持 dry-run、批量大小配置和迁移后计数校验。为避免重复迁移，应通过 `details->>'legacyLoginLogId'` 或独立映射条件跳过已迁移记录。

### 8. 管理端页面以检索和追踪为核心

`apps/admin` 新增审计日志管理页，建议路由为 `/audit-logs`，菜单名称为“审计日志”。页面形态应延续当前管理端的列表页模式：

- 顶部筛选区：时间范围、action、outcome、actor 类型、actor 关键字、target 类型、target 关键字、requestId。
- 表格列：时间、action、结果、操作者、目标对象、来源应用、IP、requestId、操作。
- 详情 Drawer：展示结构化字段、脱敏 `details`、请求上下文和错误摘要。
- 用户详情 Drawer 的“操作日志” Tab：按 `targetType = "user"` 和目标用户标识查询。
- 任职详情 Drawer 的“操作日志” Tab：按 `targetType = "employment"` 和任职 id 查询。

列表页只展示脱敏后的摘要，不展示原始敏感字段。`details` 展示应做受控格式化，避免把 JSON 原文作为唯一阅读入口；可以提供折叠的 JSON 视图用于排障，但仍必须使用后端脱敏结果。

替代方案：只实现详情页 Tab，不做全局页面。放弃原因是审计日志的主要使用场景还包括跨模块排查、按 actor 追踪和按 requestId 串联事件，仅目标对象 Tab 覆盖不足。

## Risks / Trade-offs

- [Risk] 审计表增长较快，影响业务库体积。→ 初期只覆盖 P0/P1 事件；索引保持必要集合；后续根据数据量再设计分区和归档。
- [Risk] `details jsonb` 内容失控，写入敏感信息。→ 审计服务集中提供脱敏 helper，禁止调用方直接写原始请求 body。
- [Risk] 业务事务成功但审计写入失败，出现证据缺口。→ 强一致场景传入同一 `tx`；非事务场景记录错误日志并为高危事件配置失败阻断策略。
- [Risk] 管理端 REST 和 tRPC 共用 ops，容易重复记录。→ 审计应放在 service/ops 的单一写路径，避免 handler 层和 tRPC 层同时写入。
- [Risk] `login_log` 迁移重复执行导致重复审计记录。→ 迁移脚本必须先做存在性过滤并提供 dry-run 计数。
- [Risk] 管理端页面筛选维度过多导致界面臃肿。→ 首屏保留常用筛选，低频条件放入可展开高级筛选，表格列支持紧凑展示。

## Migration Plan

1. 新增 `audit_log` schema、导出和迁移 SQL，保留 `login_log` 表不立即删除。
2. 实现审计 DTO、写入 repository/service、脱敏 helper 和基础查询。
3. 将新登录事件写入从 `sessionRepository.loginLog` 切换到 `audit_log`；必要时短期双写以验证数据。
4. 接入管理员 mutation、自助变更、验证码、权限委派和供应商注册等首批事件。
5. 实现管理端审计日志查询接口、全局审计日志页面和用户/任职详情 Tab 接入。
6. 编写并运行 `login_log` 历史迁移脚本 dry-run，确认待迁移数量和样例映射。
7. 执行迁移脚本，校验 `login_log` 数量与 `audit_log` 中 `migrationSource = "login_log"` 数量一致。
8. 后续独立变更中移除旧 `login_log` 写入和旧表。

回滚策略：保留 `login_log`，新增审计写入可通过代码回滚；历史迁移可按 `details->>'migrationSource' = 'login_log'` 删除迁移生成记录，但不得删除新业务审计记录。

## Open Questions

- 审计日志保留周期是否有合规要求，是否需要在第一版就规划分区和归档。
- 审计日志管理页的菜单权限是否复用现有 admin 基础权限，还是需要新增 `iam:audit:read`。
- 高危事件审计写入失败时是否必须阻断业务响应，需要按事件等级确认。
