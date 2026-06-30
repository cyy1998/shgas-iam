## ADDED Requirements

### Requirement: API Security Audit Records Carry Request Context
`apps/api` 的认证、SSO、自助用户和公开认证相关审计记录 SHALL 在请求路径内携带统一请求上下文，使审计事实表可以与系统日志和 gateway access log 关联。

#### Scenario: Authentication audit records include request context
- **WHEN** 用户通过密码、手机验证码、SSO local session、OA 或微信登录产生成功或失败审计记录
- **THEN** 审计记录 SHALL 包含可用的 `requestId` 和 `traceId`
- **AND** 审计记录 SHALL 在可用时包含 ip、userAgent、route 和 method
- **AND** 审计记录 MUST NOT 包含密码、验证码、token、cookie 或 client secret 明文

#### Scenario: Self-service audit records include request context
- **WHEN** 用户自助改密、找回密码或绑定手机号产生成功或失败审计记录
- **THEN** 审计记录 SHALL 包含可用的 `requestId` 和 `traceId`
- **AND** 审计记录 SHALL 保持既有 action、outcome、actor、target 和 details 语义

#### Scenario: Handler-created SMS audit records use the same context contract
- **WHEN** open route 发送或校验短信验证码并写入审计记录
- **THEN** 审计记录 SHALL 使用与下游 service 相同的请求上下文字段
- **AND** handler 或 service SHALL NOT 直接依赖 Hono context 之外的隐式全局状态获取 requestId 或 traceId

## MODIFIED Requirements

### Requirement: Audit Log Storage
系统 SHALL 在 PostgreSQL 中使用通用 `audit_log` 表持久化审计事件；表 SHALL 支持按事件时间、action、actor、target、requestId 和 traceId 查询；审计记录 SHALL append-only，不得通过软删除表达业务删除。

#### Scenario: Query by actor
- **WHEN** 管理端按用户 actor 查询审计日志
- **THEN** 系统 SHALL 能按 `actorType`、`actorUserId` 或 `actorUsername` 和时间范围筛选记录
- **AND** 查询结果 SHALL 按 `eventTime` 倒序分页返回

#### Scenario: Query by target
- **WHEN** 管理端打开用户或任职详情的操作日志
- **THEN** 系统 SHALL 能按 `targetType`、`targetId` 或 `targetCode` 和时间范围筛选记录
- **AND** 查询结果 SHALL 包含 action、outcome、actor 摘要、eventTime 和安全脱敏后的 details 摘要

#### Scenario: Query by trace id
- **WHEN** 管理端或 admin-api 审计查询传入 `traceId`
- **THEN** 系统 SHALL 按 `audit_log.trace_id` 精确筛选记录
- **AND** 查询结果 SHALL 仍按 `eventTime` 倒序分页返回

### Requirement: Audit Log Admin UI
管理端 SHALL 提供审计日志管理页面，并 SHALL 在用户详情与任职详情的“操作日志” Tab 中展示对应目标的审计记录；页面 SHALL 只展示脱敏后的审计摘要，不得直接暴露敏感原文。管理端 SHALL 为具备 requestId 的审计日志提供 Grafana 系统日志 deep link，用于跳转查看同一请求上下文的系统日志，并 SHALL 在可用时使用 traceId 缩小查询范围。

#### Scenario: Global audit log page
- **WHEN** 管理员打开审计日志管理页面
- **THEN** 页面 SHALL 允许按时间范围、规范 action、outcome、actor、target、requestId 和 traceId 筛选审计记录
- **AND** 表格 SHALL 展示时间、action、结果、操作者、目标对象、来源应用、requestId 和可用的 traceId 摘要
- **AND** action 筛选项 SHALL 使用共享审计动作目录中的规范 action

#### Scenario: Audit log detail drawer
- **WHEN** 管理员查看某条审计记录详情
- **THEN** 页面 SHALL 展示结构化字段、脱敏后的 details、requestId、traceId 和错误摘要
- **AND** 页面 MUST NOT 展示密码、验证码、token、cookie 或 client secret 明文

#### Scenario: Audit log Grafana deep link
- **WHEN** 管理员查看一条包含 requestId 的审计日志详情
- **THEN** 页面 SHALL 提供跳转 Grafana 的系统日志 deep link
- **AND** deep link SHALL 使用该审计日志的 requestId、可用 traceId 和围绕 eventTime 的时间范围
- **AND** deep link MUST NOT 携带 username、userId、mobile、clientSecret、token、审计 details 或完整业务 URL query

#### Scenario: User detail logs tab
- **WHEN** 管理员打开用户详情中的“操作日志” Tab
- **THEN** 页面 SHALL 以当前用户作为目标对象查询审计记录
- **AND** 页面 SHALL 按时间倒序显示与该用户相关的审计事件

#### Scenario: Employment detail logs tab
- **WHEN** 管理员打开任职详情中的“操作日志” Tab
- **THEN** 页面 SHALL 以当前任职作为目标对象查询审计记录
- **AND** 页面 SHALL 按时间倒序显示与该任职相关的审计事件
