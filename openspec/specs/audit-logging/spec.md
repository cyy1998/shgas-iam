# audit-logging Specification

## Purpose
描述 IAM 系统统一审计日志能力，包括审计事件模型、持久化、敏感信息脱敏、首批安全敏感事件接入、历史登录日志迁移和管理端审计查询展示。
## Requirements
### Requirement: Unified Audit Event Model
系统 SHALL 使用统一审计事件模型记录安全敏感操作，并 SHALL 将 `eventTime`、`action`、`outcome`、`actorType`、actor 标识、`targetType`、target 标识、`sourceApp`、`requestId` 和来源信息作为结构化字段保存；事件差异化上下文 SHALL 保存在 `details jsonb` 中。

#### Scenario: Record user actor event
- **WHEN** 已登录用户修改自己的密码
- **THEN** 系统 SHALL 写入一条 `action = "self.password.change"` 的审计记录
- **AND** 记录 SHALL 包含 `actorType = "user"` 和该用户的 `actorUserId` 或 `actorUsername`
- **AND** 记录 SHALL 包含目标用户的 `targetType = "user"` 和目标标识

#### Scenario: Record system actor event
- **WHEN** 系统任务产生需要审计的操作且没有用户上下文
- **THEN** 系统 SHALL 写入一条 `actorType = "system"` 的审计记录
- **AND** 记录 SHALL 包含 `actorSystemKey`
- **AND** `actorUserId` SHALL 允许为空

#### Scenario: Record client actor event
- **WHEN** internal 接口由业务 client 发起并产生权限委派或供应商注册变更
- **THEN** 系统 SHALL 写入一条 `actorType = "client"` 的审计记录
- **AND** 记录 SHALL 包含 `actorClientCode`

### Requirement: Audit Log Storage
系统 SHALL 在 PostgreSQL 中使用通用 `audit_log` 表持久化审计事件；表 SHALL 支持按事件时间、action、actor、target 和 requestId 查询；审计记录 SHALL append-only，不得通过软删除表达业务删除。

#### Scenario: Query by actor
- **WHEN** 管理端按用户 actor 查询审计日志
- **THEN** 系统 SHALL 能按 `actorType`、`actorUserId` 或 `actorUsername` 和时间范围筛选记录
- **AND** 查询结果 SHALL 按 `eventTime` 倒序分页返回

#### Scenario: Query by target
- **WHEN** 管理端打开用户或任职详情的操作日志
- **THEN** 系统 SHALL 能按 `targetType`、`targetId` 或 `targetCode` 和时间范围筛选记录
- **AND** 查询结果 SHALL 包含 action、outcome、actor 摘要、eventTime 和安全脱敏后的 details 摘要

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

### Requirement: Sensitive Data Redaction
系统 MUST NOT 将密码、验证码、token、cookie、client secret 明文或完整敏感个人信息写入审计日志；需要表达敏感字段变化时，系统 SHALL 只记录字段已变更、脱敏值、哈希摘要或安全摘要。

#### Scenario: Reset password audit
- **WHEN** 管理员重置用户密码
- **THEN** 系统 SHALL 写入 `action = "admin.user.reset_password"` 的审计记录
- **AND** 记录 MUST NOT 包含新密码明文或密码哈希
- **AND** `details` SHALL 只表达密码已被重置和相关目标用户信息

#### Scenario: Client secret rotation audit
- **WHEN** 管理员轮换 client secret
- **THEN** 系统 SHALL 写入 `action = "admin.client.rotate_secret"` 的审计记录
- **AND** 记录 MUST NOT 包含旧 secret、新 secret 或可直接认证的 secret 派生值

### Requirement: Business Audit Event Encapsulation
系统 SHALL 将业务审计事件的 action、target 和领域 details 拼装封装在 app 内的审计事件 helper 中；业务 service SHALL 调用这些 helper 写入审计日志，而不是在核心业务流程中重复内联完整审计 payload。底层 `audit.service.ts` SHALL 继续只负责 app 默认上下文、actor 规范化、request context、details 脱敏和持久化。

#### Scenario: API self-service audit event uses centralized helper
- **WHEN** public API 用户自助改密、找回密码或绑定手机号流程写入审计日志
- **THEN** 系统 SHALL 通过 `apps/api/src/services/audit/events` 下的 self-service audit helper 构造审计事件
- **AND** 生成的审计记录 SHALL 保持既有 action、outcome、actor、target 和 details 语义

#### Scenario: API auth and internal audit events use centralized helpers
- **WHEN** API 认证、短信验证码、SSO、internal 权限委派或供应商注册流程写入审计日志
- **THEN** 系统 SHALL 通过 `apps/api/src/services/audit/events` 下的业务 audit helper 构造审计事件
- **AND** 路由或业务 service SHALL NOT 重复实现相同手机号脱敏和基础 target/details 拼装逻辑

#### Scenario: Admin mutation audit events use centralized helpers
- **WHEN** admin-api 用户、客户端、组织、岗位或任职 mutation 写入审计日志
- **THEN** 系统 SHALL 通过 `apps/admin-api/src/services/audit/events` 下的业务 audit helper 构造审计事件
- **AND** 生成的审计记录 SHALL 保持既有 `admin.*` action、targetType 和 details 语义

### Requirement: Shared Audit Masking Helpers
系统 SHALL 为审计日志中重复使用的敏感字段摘要提供共享 helper；手机号审计脱敏 SHALL 使用统一函数输出，避免各 service 和 route 重复定义正则替换逻辑。

#### Scenario: Mobile number masking is reused by audit events
- **WHEN** 审计事件 details 或 targetCode 需要记录手机号摘要
- **THEN** 系统 SHALL 使用共享手机号审计脱敏 helper
- **AND** 完整手机号 MUST NOT 以明文写入审计日志

#### Scenario: Audit service still redacts sensitive details
- **WHEN** 业务 audit helper 传入 details
- **THEN** `audit.service.ts` SHALL 继续调用 `redactAuditDetails`
- **AND** 密码、验证码、token、cookie 和 client secret 等敏感字段 MUST NOT 以明文持久化

### Requirement: Admin Mutation Auditing
系统 SHALL 为管理端用户、组织、岗位、任职和客户端管理 mutation 写入审计日志；成功完成的 mutation SHALL 记录 `outcome = "success"`，失败且具有安全复盘价值的 mutation SHALL 记录 `outcome = "failure"` 和脱敏错误摘要。

#### Scenario: Audit admin user mutation
- **WHEN** 管理员创建、更新、状态切换、删除用户或重置用户密码成功
- **THEN** 系统 SHALL 写入对应 `admin.user.*` action 的审计记录
- **AND** 记录 SHALL 包含管理员 actor、目标用户和请求上下文

#### Scenario: Audit employment lifecycle mutation
- **WHEN** 管理员创建任职、更新任职、变更任职状态、删除任职、转岗、设置主岗或办理用户离职成功
- **THEN** 系统 SHALL 写入对应 `admin.employment.*` action 的审计记录
- **AND** 记录 SHALL 包含目标任职或目标用户标识

#### Scenario: Audit client mutation
- **WHEN** 管理员创建、更新、禁用、删除客户端或轮换 client secret 成功
- **THEN** 系统 SHALL 写入对应 `admin.client.*` action 的审计记录
- **AND** 记录 SHALL 包含目标 `clientCode`

### Requirement: Authentication And Self-Service Auditing
系统 SHALL 为登录、验证码、密码重置、自助改密和绑定手机号等认证相关安全事件写入审计日志；成功和失败事件 SHALL 使用结构化 `outcome` 区分，并 SHALL 避免通过审计详情泄露额外枚举信息。

#### Scenario: Audit password login success
- **WHEN** 用户通过密码登录成功
- **THEN** 系统 SHALL 写入 `action = "auth.login.password.success"` 且 `outcome = "success"` 的审计记录
- **AND** 记录 SHALL 包含登录用户 actor、目标用户和来源上下文

#### Scenario: Audit mobile login failure
- **WHEN** 手机验证码登录失败且系统能识别相关手机号或用户上下文
- **THEN** 系统 SHALL 写入 `action = "auth.login.mobile.failure"` 且 `outcome = "failure"` 的审计记录
- **AND** 记录 MUST NOT 包含验证码明文

#### Scenario: Audit SMS code send
- **WHEN** 系统发送登录、重置密码或绑定手机号验证码
- **THEN** 系统 SHALL 写入 `action = "auth.sms_code.send"` 的审计记录
- **AND** 记录 MUST NOT 包含验证码明文

### Requirement: Internal Delegation And Supplier Auditing
系统 SHALL 为 internal 权限委派创建/更新、供应商组织注册和供应商联系人注册写入审计日志，并 SHALL 使用 client actor 或系统 actor 表达调用来源。

#### Scenario: Audit privilege delegation create
- **WHEN** internal 接口创建权限委派成功
- **THEN** 系统 SHALL 写入 `action = "internal.delegation.create"` 的审计记录
- **AND** 记录 SHALL 包含委托人、受托人、组织范围和权限摘要

#### Scenario: Audit supplier registration
- **WHEN** internal 接口创建供应商组织或供应商联系人成功
- **THEN** 系统 SHALL 写入 `internal.purveyor.register` 或 `internal.purveyor_contact.register` 的审计记录
- **AND** 记录 SHALL 包含供应商组织或联系人目标标识

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

### Requirement: Audit Log Admin UI
管理端 SHALL 提供审计日志管理页面，并 SHALL 在用户详情与任职详情的“操作日志” Tab 中展示对应目标的审计记录；页面 SHALL 只展示脱敏后的审计摘要，不得直接暴露敏感原文。管理端 SHALL 为具备 requestId 的审计日志提供 Grafana 系统日志 deep link，用于跳转查看同一请求上下文的系统日志。

#### Scenario: Global audit log page
- **WHEN** 管理员打开审计日志管理页面
- **THEN** 页面 SHALL 允许按时间范围、action、outcome、actor、target 和 requestId 筛选审计记录
- **AND** 表格 SHALL 展示时间、action、结果、操作者、目标对象、来源应用和 requestId

#### Scenario: Audit log detail drawer
- **WHEN** 管理员查看某条审计记录详情
- **THEN** 页面 SHALL 展示结构化字段、脱敏后的 details 和错误摘要
- **AND** 页面 MUST NOT 展示密码、验证码、token、cookie 或 client secret 明文

#### Scenario: Audit log Grafana deep link
- **WHEN** 管理员查看一条包含 requestId 的审计日志详情
- **THEN** 页面 SHALL 提供跳转 Grafana 的系统日志 deep link
- **AND** deep link SHALL 使用该审计日志的 requestId 和围绕 eventTime 的时间范围
- **AND** deep link MUST NOT 携带 username、userId、mobile、clientSecret、token、审计 details 或完整业务 URL query

#### Scenario: User detail logs tab
- **WHEN** 管理员打开用户详情中的“操作日志” Tab
- **THEN** 页面 SHALL 以当前用户作为目标对象查询审计记录
- **AND** 页面 SHALL 按时间倒序显示与该用户相关的审计事件

#### Scenario: Employment detail logs tab
- **WHEN** 管理员打开任职详情中的“操作日志” Tab
- **THEN** 页面 SHALL 以当前任职作为目标对象查询审计记录
- **AND** 页面 SHALL 按时间倒序显示与该任职相关的审计事件
