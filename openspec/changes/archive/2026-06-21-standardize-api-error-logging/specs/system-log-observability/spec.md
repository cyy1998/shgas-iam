## ADDED Requirements

### Requirement: API Error Event Log Contract
后端 REST 和 tRPC 错误事件日志 SHALL 使用稳定的 IAM 系统日志字段合同，以便 Grafana/Loki 聚合错误原因并与 request log 关联。

#### Scenario: API error event fields are emitted
- **WHEN** `api` 或 `admin-api` 输出 `api.error.handled` 或 `api.error.unhandled`
- **THEN** 日志 SHALL 包含 `event`、`surface`、`sourceApp`、`requestId`、`statusCode`、`errorName`、`errorMessage` 和 `msg`
- **AND** 日志 SHALL 在可用时包含 `traceId`、`method`、`path`、`route` 和 `errorCode`
- **AND** tRPC 错误事件 SHALL 在可用时包含 `procedurePath`
- **AND** `surface` SHALL 使用 `rest` 或 `trpc`

#### Scenario: API error event level is actionable
- **WHEN** 后端输出 API 错误事件
- **THEN** 未知异常 SHALL 使用 `error` level
- **AND** 已知 `statusCode >= 500` 错误 SHALL 使用 `error` level
- **AND** 403 和 `/internal` 入口认证失败 SHALL 使用 `warn` level
- **AND** 普通 400、401、404、409 和 422 错误 SHALL 使用 `info` level

#### Scenario: Error object is included only for diagnostic failures
- **WHEN** 后端输出 API 错误事件
- **THEN** 未知异常和已知 5xx 错误 SHALL 包含原始 `err`
- **AND** 普通已知 4xx 错误 SHALL NOT 包含原始 `err`
- **AND** 扁平摘要字段 `errorName` 和 `errorMessage` SHALL 保留用于 dashboard 展示和聚合

#### Scenario: API error logs avoid sensitive request payloads
- **WHEN** 后端输出 API 错误事件
- **THEN** 日志 MUST NOT 包含 request body、response body、完整 request headers、authorization header、cookie header 或 set-cookie header
- **AND** 日志 MUST NOT 明文包含 token、password、secret、clientSecret、privateKey 或 verificationCode 值
- **AND** 需要排查请求输入时 SHALL 通过 requestId 关联受控证据，而不是把原始输入写入系统日志

### Requirement: OIDC Provider Error Events Remain Domain Specific
`oidc-provider` SHALL 保留现有领域化错误事件名，同时遵守 IAM 系统日志公共字段和敏感数据保护要求。

#### Scenario: OIDC provider error event names are retained
- **WHEN** `oidc-provider` 输出 protocol error、server error 或 HTTP request failed 事件
- **THEN** 日志 MAY 使用 `oidc.provider.*` 事件名
- **AND** 系统 SHALL NOT 要求这些 OIDC 事件重命名为 `api.error.handled` 或 `api.error.unhandled`

#### Scenario: OIDC provider error event fields are stable
- **WHEN** `oidc-provider` 输出 protocol error、server error 或 HTTP request failed 事件
- **THEN** 日志 SHALL 包含 `event`、`sourceApp = "iam-oidc-provider"`、`requestId` 和稳定错误摘要字段
- **AND** 日志 SHALL 在可用时包含 `statusCode`、`errorName`、`errorMessage` 和 `err`
- **AND** OIDC access token、ID token、refresh token、authorization code、PKCE verifier、client secret、cookie 和 private key MUST NOT 明文输出

## MODIFIED Requirements

### Requirement: Shared Backend Request Log Helpers
系统 SHALL 使用共享 helper 构造后端 HTTP request/access log 字段和等级，框架 adapter 只负责采集上下文。

#### Scenario: Request log level is stable
- **WHEN** 后端 HTTP 请求完成
- **THEN** `http.request.completed` request log SHALL 使用 `info` level
- **AND** request log SHALL 保留最终 `statusCode` 字段用于查询、dashboard 和告警聚合
- **AND** 系统 SHALL NOT 仅因为 `statusCode >= 400` 将 `http.request.completed` 提升为 `warn` 或 `error`

#### Scenario: Trace id extraction is consistent
- **WHEN** 请求包含 `traceparent`、`x-b3-traceid` 或 `x-trace-id`
- **THEN** 后端 request log SHALL 按 `traceparent`、`x-b3-traceid`、`x-trace-id` 的优先级提取 `traceId`
- **AND** 后端 MUST NOT 为本能力强制生成新的 `traceId`

#### Scenario: Request id fallback is consistent
- **WHEN** 请求绕过 APISIX 直接访问 `api`、`admin-api` 或 `oidc-provider` 且未携带 `X-Request-Id`
- **THEN** 后端 SHALL 生成 requestId 兜底
- **AND** 后端 SHALL 将 requestId 写入响应头

#### Scenario: Request log fields are built from shared contract
- **WHEN** Hono 后端或 OIDC provider 输出 `http.request.completed`
- **THEN** request log 字段 SHALL 由共享 helper 或等价共享合同构造
- **AND** Hono 与 OIDC adapter MUST NOT 各自复制互相漂移的事件名、字段名或 request log level 规则
