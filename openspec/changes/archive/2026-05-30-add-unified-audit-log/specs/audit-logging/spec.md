## ADDED Requirements

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
系统 SHALL 提供一次性迁移脚本，将现有 `login_log` 历史记录迁移为通用 `audit_log` 记录；迁移脚本 SHALL 支持 dry-run、批量执行、重复执行保护和迁移后计数校验。

#### Scenario: Dry-run migration
- **WHEN** 运维以 dry-run 模式执行迁移脚本
- **THEN** 脚本 SHALL 输出待迁移 `login_log` 数量、已迁移数量和样例映射
- **AND** 脚本 MUST NOT 写入或删除任何数据库记录

#### Scenario: Execute migration
- **WHEN** 运维执行 `login_log` 到 `audit_log` 的迁移脚本
- **THEN** 每条 legacy 登录记录 SHALL 生成一条 `outcome = "success"` 的审计记录
- **AND** 生成记录 SHALL 在 `details` 中包含 `migrationSource = "login_log"` 和 `legacyLoginLogId`
- **AND** 生成记录的 `eventTime` SHALL 等于 legacy 记录的 `loginTime`

#### Scenario: Re-run migration
- **WHEN** 运维重复执行迁移脚本
- **THEN** 脚本 SHALL 跳过已迁移的 legacy 登录记录
- **AND** 系统 MUST NOT 为同一 `legacyLoginLogId` 生成重复审计记录

### Requirement: Audit Log Admin UI
管理端 SHALL 提供审计日志管理页面，并 SHALL 在用户详情与任职详情的“操作日志” Tab 中展示对应目标的审计记录；页面 SHALL 只展示脱敏后的审计摘要，不得直接暴露敏感原文。

#### Scenario: Global audit log page
- **WHEN** 管理员打开审计日志管理页面
- **THEN** 页面 SHALL 允许按时间范围、action、outcome、actor、target 和 requestId 筛选审计记录
- **AND** 表格 SHALL 展示时间、action、结果、操作者、目标对象、来源应用和 requestId

#### Scenario: Audit log detail drawer
- **WHEN** 管理员查看某条审计记录详情
- **THEN** 页面 SHALL 展示结构化字段、脱敏后的 details 和错误摘要
- **AND** 页面 MUST NOT 展示密码、验证码、token、cookie 或 client secret 明文

#### Scenario: User detail logs tab
- **WHEN** 管理员打开用户详情中的“操作日志” Tab
- **THEN** 页面 SHALL 以当前用户作为目标对象查询审计记录
- **AND** 页面 SHALL 按时间倒序显示与该用户相关的审计事件

#### Scenario: Employment detail logs tab
- **WHEN** 管理员打开任职详情中的“操作日志” Tab
- **THEN** 页面 SHALL 以当前任职作为目标对象查询审计记录
- **AND** 页面 SHALL 按时间倒序显示与该任职相关的审计事件
