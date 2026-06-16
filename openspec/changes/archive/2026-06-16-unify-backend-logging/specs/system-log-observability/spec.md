## ADDED Requirements

### Requirement: Backend Logger Policy
后端应用 SHALL 通过统一 logger factory 创建运行时 logger，并 SHALL 对 `api`、`admin-api` 和 `oidc-provider` 使用一致的日志级别、格式、脱敏和 `sourceApp` 规则。

#### Scenario: LOG_FORMAT auto resolves by NODE_ENV
- **WHEN** 后端应用未显式配置 `LOG_FORMAT` 或配置为 `auto`
- **THEN** `NODE_ENV = "development"` 时 logger SHALL 使用 pretty 输出
- **AND** 其他 `NODE_ENV` 值下 logger SHALL 输出 JSON 行日志

#### Scenario: LOG_FORMAT explicit override is honored
- **WHEN** 后端应用配置 `LOG_FORMAT = "json"` 或 `LOG_FORMAT = "pretty"`
- **THEN** logger SHALL 按显式 `LOG_FORMAT` 输出日志
- **AND** 该显式配置 SHALL 优先于 `NODE_ENV`

#### Scenario: LOG_FORMAT is validated
- **WHEN** `api`、`admin-api` 或 `oidc-provider` 解析环境变量
- **THEN** `LOG_FORMAT` SHALL 只接受 `auto`、`json` 或 `pretty`
- **AND** 缺省值 SHALL 为 `auto`

#### Scenario: JSON mode writes structured stdout
- **WHEN** logger 解析后的格式为 `json`
- **THEN** logger SHALL 输出结构化 JSON 行到 stdout
- **AND** logger MUST NOT 为 JSON 模式依赖 `pino/file` transport

#### Scenario: Pretty mode uses shared implementation detail
- **WHEN** logger 解析后的格式为 `pretty`
- **THEN** logger SHALL 通过共享 logger factory 使用 `pino-pretty`
- **AND** app package SHOULD NOT 直接拥有 `pino-pretty` 作为应用层依赖

### Requirement: Backend Logger Source App Discipline
后端系统日志 SHALL 使用受控 `sourceApp` 值标识输出日志的应用，并 SHALL 避免应用事件日志重复手写该字段。

#### Scenario: Source app values are controlled
- **WHEN** `api`、`admin-api` 或 `oidc-provider` 创建 logger
- **THEN** `sourceApp` SHALL 分别使用受控值 `iam-api`、`iam-admin-api` 和 `iam-oidc-provider`
- **AND** 这些值 SHALL 由共享常量或等价受控定义提供

#### Scenario: Application event logs use logger binding
- **WHEN** 后端应用输出启动、停止、业务事件或错误事件日志
- **THEN** `sourceApp` SHALL 由 logger binding 或共享日志 helper 注入
- **AND** 应用事件日志对象 MUST NOT 重复手写与当前 logger binding 相同的 `sourceApp`

#### Scenario: External origin uses distinct fields
- **WHEN** 日志需要表达外部系统、client 或 issuer 来源
- **THEN** 系统 SHALL 使用 `sourceSystem`、`clientCode`、`issuer` 或其他更具体字段
- **AND** 系统 MUST NOT 复用 `sourceApp` 表达外部来源

### Requirement: Backend Logger Redaction Extensions
后端 logger SHALL 在共享敏感字段脱敏基线之上支持 app 专属增量脱敏路径。

#### Scenario: OIDC redaction extends baseline
- **WHEN** `oidc-provider` 创建 logger
- **THEN** logger SHALL 同时应用 IAM 全局脱敏基线和 OIDC 专属脱敏路径
- **AND** OIDC access token、ID token、refresh token、authorization code、PKCE verifier、client secret、cookie 和 private key MUST NOT 明文输出

#### Scenario: Redaction paths are merged safely
- **WHEN** app 提供额外脱敏路径
- **THEN** 共享 logger factory SHALL 合并全局基线和 app 增量路径
- **AND** 重复路径 SHALL NOT 导致重复配置或脱敏失效

### Requirement: Shared Backend Request Log Helpers
系统 SHALL 使用共享 helper 构造后端 HTTP request/access log 字段和等级，框架 adapter 只负责采集上下文。

#### Scenario: Status code maps to log level
- **WHEN** 后端 HTTP 请求完成
- **THEN** `statusCode < 400` 的 request log SHALL 使用 `info`
- **AND** `400 <= statusCode < 500` 的 request log SHALL 使用 `warn`
- **AND** `statusCode >= 500` 的 request log SHALL 使用 `error`

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
- **AND** Hono 与 OIDC adapter MUST NOT 各自复制互相漂移的事件名、字段名或 status level 规则

### Requirement: OIDC Provider Access Logging
`oidc-provider` SHALL 为所有外层 HTTP server 请求输出统一 `http.request.completed` access log。

#### Scenario: Health request is logged
- **WHEN** 调用 `oidc-provider` 的 `/health`
- **THEN** 系统 SHALL 输出 `event = "http.request.completed"` 的 access log
- **AND** access log SHALL 包含 `route = "/health"`、最终 `statusCode` 和 `durationMs`

#### Scenario: Interaction and resume requests are logged
- **WHEN** 调用 `/oidc/interaction/:uid` 或 `/oidc/resume`
- **THEN** 系统 SHALL 输出 `http.request.completed` access log
- **AND** `route` SHALL 分别归类为 `/oidc/interaction/:uid` 或 `/oidc/resume`

#### Scenario: Provider callback requests are logged
- **WHEN** 请求进入 OIDC provider callback
- **THEN** 系统 SHALL 输出 `http.request.completed` access log
- **AND** `route` SHALL 使用低基数值 `/oidc/*`
- **AND** 系统 MAY 在可用时附加 `oidcRoute`

#### Scenario: Not found request is logged
- **WHEN** 请求路径不属于 `/health`、`/oidc` 或 `/oidc/*`
- **THEN** `oidc-provider` SHALL 返回 404
- **AND** access log SHALL 使用低基数 `route = "not_found"`

#### Scenario: Failed request keeps error and access logs
- **WHEN** OIDC HTTP 请求处理抛出异常
- **THEN** 系统 SHALL 输出 OIDC 错误事件日志
- **AND** 系统 SHALL 仍输出 `http.request.completed` access log 描述最终 HTTP 状态
- **AND** 两类日志 SHALL 共享同一 requestId

#### Scenario: Aborted request is marked
- **WHEN** OIDC HTTP response 在正常 finish 前关闭
- **THEN** access log SHALL 记录请求结束
- **AND** access log SHALL 包含 `aborted = true` 或等价字段

### Requirement: Backend Logger Instances Are Configuration Safe
共享 logger factory SHALL 避免单一全局 singleton 造成不同 app 或测试配置串味。

#### Scenario: Different source apps can create independent loggers
- **WHEN** 同一进程中先后创建 `iam-api`、`iam-admin-api` 或 `iam-oidc-provider` logger
- **THEN** 每个 logger SHALL 保留自身 `sourceApp`、`LOG_FORMAT`、`LOG_LEVEL` 和额外脱敏配置
- **AND** 后创建的 logger MUST NOT 复用第一个 logger 的固定全局实例

#### Scenario: App module still exposes app-local singleton
- **WHEN** 后端 app 需要复用 logger
- **THEN** app-local logger module MAY 通过顶层 `export const logger = createLogger(...)` 暴露单例
- **AND** 共享 logger factory MUST NOT 要求所有 app 共用同一个 global singleton key

## MODIFIED Requirements

### Requirement: IAM System Log JSON Contract
后端应用和 APISIX 网关 SHALL 输出符合 IAM 系统日志合同的 JSON 日志字段，以便 Grafana 统一检索、dashboard 展示和告警。

#### Scenario: Backend HTTP request log fields
- **WHEN** `api`、`admin-api` 或 `oidc-provider` 完成 HTTP 请求
- **THEN** 系统日志 SHALL 包含 `event`、`sourceApp`、`requestId`、`method`、`path`、`route`、`statusCode`、`durationMs` 和 `msg`
- **AND** 系统日志 SHALL 在可用时包含 `traceId`、`clientIp` 和 `userAgent`
- **AND** `event` SHALL 使用 `http.request.completed` 或等价稳定事件名

#### Scenario: OIDC provider protocol log fields
- **WHEN** `oidc-provider` 输出协议错误、server error 或生命周期日志
- **THEN** 系统日志 SHALL 包含 `event`、`sourceApp = "iam-oidc-provider"`、`requestId` 和稳定错误摘要字段
- **AND** OIDC access token、ID token、refresh token、authorization code、client secret 和 cookie MUST NOT 明文输出

#### Scenario: APISIX access log fields
- **WHEN** APISIX 完成网关请求
- **THEN** access log SHALL 是 JSON
- **AND** access log SHALL 包含 `event = "gateway.request.completed"`、`sourceApp = "apisix"`、`requestId`、`method`、`path`、`statusCode`、`durationMs`、`upstreamStatus` 和 `upstreamAddr`

#### Scenario: Event names are stable
- **WHEN** 代码输出系统日志
- **THEN** `event` SHALL 使用小写点分层命名
- **AND** requestId、traceId、用户标识、clientCode 或动态业务值 MUST NOT 拼入 `event`

#### Scenario: Pino numeric levels are normalized
- **WHEN** Alloy 处理 Pino JSON 日志
- **THEN** Pino numeric level SHALL 映射为 `trace`、`debug`、`info`、`warn`、`error` 或 `fatal`
- **AND** Loki `level` label SHALL 使用字符串级别
