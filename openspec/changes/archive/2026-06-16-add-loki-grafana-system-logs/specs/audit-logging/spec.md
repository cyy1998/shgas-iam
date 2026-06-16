## MODIFIED Requirements

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
