## ADDED Requirements

### Requirement: Audit Action Catalog And Legacy Alias Compatibility
系统 SHALL 维护一份可被后端写入、管理端查询和管理端展示复用的审计动作目录；目录 SHALL 区分规范 action 与历史 alias，并 SHALL 支持将规范登录 action 展开为兼容历史登录 action 的查询集合。

#### Scenario: Canonical action catalog is reused
- **WHEN** 后端登录审计 helper、admin-api 审计查询兼容逻辑或管理端审计日志 action 选项需要引用审计动作
- **THEN** 系统 SHALL 从共享审计动作目录引用规范 action 或元数据
- **AND** 系统 SHALL NOT 在这些路径中重复维护互相独立的登录 action 枚举或标签映射

#### Scenario: Login action alias expansion
- **WHEN** 管理端按 `auth.login.password`、`auth.login.mobile`、`auth.login.local`、`auth.login.oa`、`auth.login.wechat` 或 `auth.login` 这类规范登录 action 查询审计日志
- **THEN** admin-api SHALL 将查询条件扩展为包含对应历史 alias 的 action 集合
- **AND** 查询结果 SHALL 同时包含新写入的规范 action 记录和既有历史 action 记录

#### Scenario: Legacy login action display
- **WHEN** 管理端展示 `auth.login.password.success`、`auth.login.password.failure`、`auth.login.mobile.success`、`auth.login.mobile.failure`、`auth.login.local.success`、`auth.login.oa.success`、`auth.login.wechat.success` 或 `auth.login.success` 历史记录
- **THEN** 页面 SHALL 使用对应规范登录动作标签展示 action 摘要
- **AND** 页面 SHALL 继续使用记录自身 `outcome` 展示成功或失败结果
- **AND** 明细视图 SHALL 继续展示原始 action 字符串

## MODIFIED Requirements

### Requirement: Unified Audit Event Model
系统 SHALL 使用统一审计事件模型记录安全敏感操作，并 SHALL 将 `eventTime`、`action`、`outcome`、`actorType`、actor 标识、`targetType`、target 标识、`sourceApp`、`requestId` 和来源信息作为结构化字段保存；`action` SHALL 表达业务动作本身，`outcome` SHALL 表达该动作的执行结果，事件差异化上下文 SHALL 保存在 `details jsonb` 中。

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

#### Scenario: Action does not encode outcome
- **WHEN** 同一业务动作可能产生成功或失败两种结果
- **THEN** 系统 SHALL 使用同一个规范 action 表达该业务动作
- **AND** 系统 SHALL 使用 `outcome = "success"` 或 `outcome = "failure"` 表达执行结果
- **AND** 新写入的 action MUST NOT 通过 `.success` 或 `.failure` 后缀表达结果

### Requirement: Authentication And Self-Service Auditing
系统 SHALL 为登录、验证码、密码重置、自助改密和绑定手机号等认证相关安全事件写入审计日志；成功和失败事件 SHALL 使用结构化 `outcome` 区分，并 SHALL 避免通过审计详情泄露额外枚举信息。

#### Scenario: Audit password login success
- **WHEN** 用户通过密码登录成功
- **THEN** 系统 SHALL 写入 `action = "auth.login.password"` 且 `outcome = "success"` 的审计记录
- **AND** 记录 SHALL 包含登录用户 actor、目标用户和来源上下文
- **AND** 记录 SHALL 在 `details.loginType` 或等价字段中保留密码登录上下文

#### Scenario: Audit password login failure
- **WHEN** 密码登录失败且系统能识别相关用户名或用户上下文
- **THEN** 系统 SHALL 写入 `action = "auth.login.password"` 且 `outcome = "failure"` 的审计记录
- **AND** 记录 SHALL 在 `details.reason` 中保存脱敏失败原因
- **AND** 记录 MUST NOT 包含密码明文或密码哈希

#### Scenario: Audit mobile login success
- **WHEN** 用户通过手机验证码登录成功
- **THEN** 系统 SHALL 写入 `action = "auth.login.mobile"` 且 `outcome = "success"` 的审计记录
- **AND** 记录 SHALL 包含登录用户 actor、目标用户和来源上下文

#### Scenario: Audit mobile login failure
- **WHEN** 手机验证码登录失败且系统能识别相关手机号或用户上下文
- **THEN** 系统 SHALL 写入 `action = "auth.login.mobile"` 且 `outcome = "failure"` 的审计记录
- **AND** 记录 MUST NOT 包含验证码明文

#### Scenario: Audit SSO local login success
- **WHEN** 系统为已认证用户创建业务 client 本地会话
- **THEN** 系统 SHALL 写入 `action = "auth.login.local"` 且 `outcome = "success"` 的审计记录
- **AND** 记录 SHALL 包含 clientCode、managementLevel 或等价登录上下文

#### Scenario: Audit third-party login success
- **WHEN** 用户通过 OA 或微信登录成功
- **THEN** 系统 SHALL 分别写入 `action = "auth.login.oa"` 或 `action = "auth.login.wechat"` 且 `outcome = "success"` 的审计记录
- **AND** 记录 SHALL 包含登录用户 actor、目标用户和可安全记录的来源上下文

#### Scenario: Audit SMS code send
- **WHEN** 系统发送登录、重置密码或绑定手机号验证码
- **THEN** 系统 SHALL 写入 `action = "auth.sms_code.send"` 的审计记录
- **AND** 记录 MUST NOT 包含验证码明文

### Requirement: Audit Log Admin UI
管理端 SHALL 提供审计日志管理页面，并 SHALL 在用户详情与任职详情的“操作日志” Tab 中展示对应目标的审计记录；页面 SHALL 只展示脱敏后的审计摘要，不得直接暴露敏感原文。管理端 SHALL 为具备 requestId 的审计日志提供 Grafana 系统日志 deep link，用于跳转查看同一请求上下文的系统日志。

#### Scenario: Global audit log page
- **WHEN** 管理员打开审计日志管理页面
- **THEN** 页面 SHALL 允许按时间范围、规范 action、outcome、actor、target 和 requestId 筛选审计记录
- **AND** 表格 SHALL 展示时间、action、结果、操作者、目标对象、来源应用和 requestId
- **AND** action 筛选项 SHALL 使用共享审计动作目录中的规范 action

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
