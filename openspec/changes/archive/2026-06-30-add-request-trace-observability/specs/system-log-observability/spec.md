## ADDED Requirements

### Requirement: Request Path System Logs Carry Observability Context
请求路径内的业务系统日志、安全事件日志、afterCommit 失败日志和 OIDC provider 事件日志 SHALL 携带可用的观测上下文字段，用于与 HTTP request log、gateway access log 和审计日志关联。

#### Scenario: Business log includes request and trace identifiers
- **WHEN** `api`、`admin-api` 或 `oidc-provider` 在处理请求期间输出业务系统日志
- **THEN** 日志 SHALL 在可用时包含 `requestId` 和 `traceId`
- **AND** 缺少请求上下文时日志 SHALL 使用 `requestId = null` 和 `traceId = null`
- **AND** 日志 MUST NOT 为无请求因果的后台任务伪造 traceId

#### Scenario: Security event logs remain queryable by identifiers
- **WHEN** 后端输出认证、人机校验、SSO 或会话撤销相关安全事件日志
- **THEN** 日志 SHALL 保留稳定 `event` 字段
- **AND** 日志 SHALL 包含可用的 `requestId` 和 `traceId`
- **AND** requestId、traceId、subject、clientCode 或动态业务值 MUST NOT 拼入 `event`

#### Scenario: afterCommit failure logs inherit transaction observability
- **WHEN** UnitOfWork afterCommit task 在请求发起的 transaction 提交后失败
- **THEN** afterCommit 失败日志 SHALL 包含 task name、mode、err、requestId 和 traceId
- **AND** requestId 和 traceId SHALL 来自该 transaction 的观测上下文

### Requirement: Gateway Access Logs Expose Trace Context
APISIX gateway access log SHALL 输出 trace 关联字段，使 gateway 请求日志可以与后端日志、审计日志和 Alloy 接收的 span 关联。

#### Scenario: APISIX access log includes trace fields
- **WHEN** APISIX 完成 IAM gateway 请求
- **THEN** access log SHALL 包含 `traceId`、`spanId` 和 `traceparent`
- **AND** `traceId` SHALL 来自 APISIX OpenTelemetry trace id 变量
- **AND** access log MUST NOT 输出 baggage、authorization header、cookie header、request body 或 response body

#### Scenario: Missing gateway trace variables are visible
- **WHEN** APISIX 未能为请求设置 OpenTelemetry trace variables
- **THEN** access log SHALL 仍保持合法 JSON
- **AND** trace 字段 SHALL 保持为空字符串或其他可被日志查询层识别为缺失的安全值

## MODIFIED Requirements

### Requirement: Request Correlation
系统 SHALL 使用 `X-Request-Id` 作为网关、后端系统日志和审计日志之间的主要人工排障字段，并 SHALL 使用标准 trace context 的 traceId 作为跨 gateway、后端日志、审计日志和 tracing backend 的链路关联字段。

#### Scenario: APISIX generates missing requestId
- **WHEN** 进入 APISIX 的 IAM 请求没有合法 `X-Request-Id`
- **THEN** APISIX SHALL 生成 requestId
- **AND** APISIX SHALL 将该 requestId 传给上游服务并写入响应头

#### Scenario: APISIX preserves incoming requestId
- **WHEN** 进入 APISIX 的 IAM 请求携带合法 `X-Request-Id`
- **THEN** APISIX SHALL 复用该 requestId
- **AND** 后端系统日志和审计日志 SHALL 使用同一 requestId

#### Scenario: Backend direct access falls back
- **WHEN** 请求绕过 APISIX 直接访问 `api`、`admin-api` 或 `oidc-provider`
- **THEN** 后端 SHALL 生成 requestId 兜底
- **AND** 后端 SHALL 将 requestId 写入响应头

#### Scenario: APISIX generates or preserves trace context
- **WHEN** 进入 APISIX 的 IAM 请求携带合法 `traceparent`
- **THEN** APISIX SHALL 延续该 trace context 并传给上游服务
- **AND** gateway access log、后端系统日志和审计日志 SHALL 使用同一 traceId

#### Scenario: APISIX creates trace context when absent
- **WHEN** 进入 APISIX 的 IAM 请求没有合法 `traceparent`
- **THEN** APISIX SHALL 通过 OpenTelemetry 插件创建 trace context
- **AND** APISIX SHALL 将创建的 trace context 传给上游服务
- **AND** gateway access log SHALL 记录创建后的 traceId

#### Scenario: Backend parses trace id consistently
- **WHEN** 后端收到 `traceparent`、`x-b3-traceid` 或 `x-trace-id`
- **THEN** 后端 SHALL 按 `traceparent`、`x-b3-traceid`、`x-trace-id` 的优先级解析 traceId
- **AND** `traceparent` SHALL 被解析为其中的 32 位 trace-id，而不是记录完整 header 原文

#### Scenario: Backend direct access without trace remains explicit
- **WHEN** 请求绕过 APISIX 直接访问后端且没有任何支持的 trace header
- **THEN** 后端系统日志和审计日志 SHALL 将 traceId 记录为 null 或省略为等价缺失值
- **AND** 后端 MUST NOT 为本能力随机生成 traceId
