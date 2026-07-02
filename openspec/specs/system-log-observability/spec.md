# system-log-observability Specification

## Purpose
描述 IAM 系统日志观测能力，包括基于 Grafana Alloy、Loki 和 Grafana 的采集、存储、查询、dashboard、告警、OIDC 登录和 admin deep link 集成。
## Requirements
### Requirement: System Log Observability Stack
系统 SHALL 提供基于 Grafana Alloy、Loki 和 Grafana 的系统日志观测栈，用于集中采集、存储、查询和告警 IAM 运行时系统日志；该能力 SHALL 独立于 PostgreSQL `audit_log` 审计事实表。

#### Scenario: Dev observability stack is opt-in
- **WHEN** 开发者启动默认开发环境
- **THEN** Loki、Grafana 和 Alloy SHALL NOT 默认启动
- **AND** 开发者 SHALL 能通过独立 observability compose 或 profile 按需启动日志观测栈

#### Scenario: Production uses centralized Loki and Grafana
- **WHEN** 生产环境部署系统日志观测能力
- **THEN** 系统 SHALL 使用集中 Loki 和 Grafana 实例
- **AND** 每台运行 IAM 目标容器的业务机 SHALL 部署 Alloy agent 将本机日志推送到集中 Loki

#### Scenario: Loki retention is separate from audit retention
- **WHEN** Loki 存储系统日志
- **THEN** 默认 retention SHALL 为 30 天
- **AND** retention SHALL 可通过部署配置调整
- **AND** PostgreSQL `audit_log` 的长期保存策略 SHALL 不受 Loki retention 影响

#### Scenario: Runtime system logs are not persisted in PostgreSQL
- **WHEN** 系统日志观测能力启用
- **THEN** 系统 MUST NOT 创建 PostgreSQL `system_log` 表
- **AND** 系统 MUST NOT 将运行时系统日志写入 PostgreSQL 作为事实存储

### Requirement: Alloy Docker Log Collection Scope
系统 SHALL 通过 Docker labels 标识 Alloy 采集目标，并 SHALL 仅采集带有 IAM 日志采集标签的 backend、worker 和 APISIX 容器 stdout/stderr。

#### Scenario: Target containers are selected by labels
- **WHEN** Alloy 发现 Docker 容器
- **THEN** Alloy SHALL 仅采集带有 `shgas-iam.logs.enabled=true` 的容器
- **AND** `api`、`admin-api`、`oidc-provider`、`worker-user-profile`、`worker-dashboard` 和 `apisix` SHALL 声明稳定的 service、component 和 env labels

#### Scenario: Frontend containers are excluded in phase one
- **WHEN** `admin` 或 `sso` 前端容器运行
- **THEN** Alloy SHALL NOT 默认采集这些前端容器日志

#### Scenario: Stdout and stderr are both collected
- **WHEN** 目标容器向 stdout 或 stderr 输出日志
- **THEN** Alloy SHALL 将 stdout 和 stderr 都发送到 Loki
- **AND** 无法解析为 IAM JSON 的 stderr 日志 SHALL 使用 `event = "runtime.stderr"` 兜底

### Requirement: Loki Label Discipline
系统 SHALL 只将低基数、稳定、常用于第一层过滤的字段作为 Loki labels。

#### Scenario: Allowed labels
- **WHEN** Alloy 向 Loki 写入 IAM 系统日志
- **THEN** Loki labels SHALL 仅包含 `env`、`service`、`component`、`level` 和 `host`
- **AND** 可选容器标识 MUST NOT 替代稳定的 `service` label

#### Scenario: High-cardinality fields are not labels
- **WHEN** 系统日志包含 requestId、traceId、route、userId、username、clientIp 或 userAgent
- **THEN** 这些字段 MUST NOT 作为 Loki labels
- **AND** 这些字段 SHALL 保留在日志正文或 structured metadata 中供 LogQL pipeline 过滤

#### Scenario: Query by requestId uses JSON filtering
- **WHEN** 用户在 Grafana 中按 requestId 查询系统日志
- **THEN** 查询 SHALL 先用低基数 labels 缩小范围
- **AND** 再通过 JSON 字段过滤 `requestId`

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

### Requirement: Sensitive Data Protection In System Logs
系统日志 MUST 在应用输出前执行敏感字段脱敏，并在 Alloy 处理阶段提供二次兜底；系统日志一期 MUST NOT 采集 request body 或 response body。

#### Scenario: Application logger redacts sensitive fields
- **WHEN** 后端代码输出包含 password、token、cookie、authorization、secret、clientSecret、验证码或 private key 等字段的日志对象
- **THEN** 应用 logger SHALL 在输出前将这些字段替换为安全占位值

#### Scenario: Request headers are whitelisted
- **WHEN** 后端 HTTP 请求日志输出请求上下文
- **THEN** 系统 SHALL 仅输出白名单 header 或派生字段
- **AND** `authorization`、`cookie` 和 `set-cookie` MUST NOT 明文输出

#### Scenario: APISIX does not log bodies or sensitive headers
- **WHEN** APISIX 输出 access log
- **THEN** access log MUST NOT 包含 request body、response body、authorization header、cookie header 或完整 query 中的敏感凭据

#### Scenario: Alloy provides secondary redaction
- **WHEN** Alloy 处理目标容器日志
- **THEN** Alloy SHALL 对仍可能出现的敏感字段执行二次 drop 或 redact
- **AND** 端到端验证 SHALL 证明 Loki 中查询不到测试用 Authorization、Cookie、password 或 token 原文

### Requirement: Grafana Integration And Deep Links
系统 SHALL 使用 Grafana 作为系统日志查询、dashboard 和告警入口；admin SHALL 只提供 Grafana 入口和安全 deep link，不代理 Loki 查询。

#### Scenario: Grafana uses IAM OIDC login
- **WHEN** 用户访问生产 Grafana
- **THEN** Grafana SHALL 使用 IAM OIDC provider 进行登录
- **AND** Grafana 对日志 datasource 和 dashboard 的最终访问授权 SHALL 由 Grafana 自身管理

#### Scenario: Admin only exposes links
- **WHEN** 管理员在 admin 中打开系统日志入口
- **THEN** admin SHALL 跳转到 Grafana dashboard 或 Explore
- **AND** admin MUST NOT iframe 嵌入 Grafana
- **AND** admin-api MUST NOT 代理 Loki 查询

#### Scenario: Deep links avoid business identifiers
- **WHEN** admin 生成 Grafana deep link
- **THEN** deep link SHALL 只携带 requestId、traceId、service、env 和时间范围等技术关联字段
- **AND** deep link MUST NOT 携带 username、userId、mobile、clientSecret、token、审计 details、完整业务 URL query 或错误堆栈原文

#### Scenario: Grafana and Loki exposure
- **WHEN** 系统部署到生产环境
- **THEN** Grafana SHALL 通过独立域名或受控入口对用户开放
- **AND** Loki SHALL 仅允许 Grafana 和 Alloy 通过内网访问

### Requirement: Grafana Provisioning
系统 SHALL 将 Grafana datasource、dashboard 和 alert rules 通过仓库文件 provision，而不是依赖 Grafana UI 手工配置。

#### Scenario: Datasource is provisioned
- **WHEN** Grafana 启动
- **THEN** Loki datasource SHALL 通过 provisioning 自动创建
- **AND** datasource 配置 MUST NOT 将 secret 明文提交到仓库

#### Scenario: Dashboards are provisioned
- **WHEN** Grafana 启动
- **THEN** 系统 SHALL provision `IAM Overview`、`IAM Request Drilldown` 和 `IAM Error Center` 三个 dashboard
- **AND** dashboard UID SHALL 稳定以支持 admin deep link

#### Scenario: Strong-signal alerts are provisioned
- **WHEN** Grafana alerting provisioning 加载 IAM 日志规则
- **THEN** 系统 SHALL 提供服务 error 突增、APISIX 5xx 突增、OIDC provider server error 和 Loki/Alloy 采集异常告警
- **AND** 开发环境 MAY 静默通知渠道但 SHALL 保留规则定义

### Requirement: Grafana Dashboard Usability
系统 SHALL 将预置 Grafana 系统日志 dashboard 设计为面向 IAM 排障任务的结构化操作界面，而不是仅展示原始 LogQL 结果。

#### Scenario: Overview presents health summary first
- **WHEN** 用户打开 `IAM Overview` dashboard
- **THEN** dashboard SHALL 在首屏展示关键摘要指标，至少覆盖总日志量、错误日志数或错误率、HTTP 4xx/5xx、APISIX upstream 异常和请求耗时信号
- **AND** dashboard SHALL 保留按服务或等级分组的趋势图用于解释异常变化

#### Scenario: Overview avoids raw label noise
- **WHEN** `IAM Overview` dashboard 展示图例、字段标题或表格列
- **THEN** dashboard SHALL 使用可读名称展示服务、等级、状态码、事件和错误字段
- **AND** dashboard SHOULD NOT 在主要图例或列名中暴露 `{service="..."}` 这类原始 label 表达

#### Scenario: Error Center groups actionable errors
- **WHEN** 用户打开 `IAM Error Center` dashboard
- **THEN** dashboard SHALL 按 `service`、`event`、`errorName` 或 `errorCode` 聚合错误
- **AND** dashboard SHALL 展示错误次数、最近出现时间和至少一个可用于继续排查的示例字段，例如 `requestId`、`traceId` 或错误摘要

#### Scenario: Error examples link to request drilldown
- **WHEN** Error Center 中的错误示例包含 `requestId` 或 `traceId`
- **THEN** dashboard SHALL 提供跳转到 `IAM Request Drilldown` 的 data link 或等价导航
- **AND** 跳转参数 MUST 仅包含 `requestId`、`traceId`、`service`、`env` 和时间范围等技术关联字段

#### Scenario: Request Drilldown shows request summary and timeline
- **WHEN** 用户通过 `requestId` 或 `traceId` 打开 `IAM Request Drilldown`
- **THEN** dashboard SHALL 展示请求摘要，至少包括关联 ID、服务范围、时间范围、最高状态码、最大耗时或错误数量中的关键字段
- **AND** dashboard SHALL 展示跨 APISIX 和后端服务的结构化时间线

#### Scenario: Request Drilldown preserves raw evidence
- **WHEN** Request Drilldown 对日志进行格式化展示
- **THEN** dashboard SHALL 保留查看原始 JSON 日志的能力
- **AND** 格式化展示 MUST NOT 删除 Loki 中已采集的原始日志内容

#### Scenario: Dashboard colors have stable semantics
- **WHEN** dashboard 使用颜色区分状态、等级或趋势
- **THEN** error/fatal SHALL 使用红色语义，warn SHALL 使用黄色语义，正常或 2xx SHALL 使用绿色语义，流量或总量 SHALL 使用蓝色语义
- **AND** 同一 dashboard 内相同语义的颜色 SHALL 保持一致

#### Scenario: Dashboard keeps stable provisioning identities
- **WHEN** dashboard UX 被改进并通过 provisioning 发布
- **THEN** `IAM Overview`、`IAM Request Drilldown` 和 `IAM Error Center` 的 dashboard UID SHALL 保持稳定
- **AND** datasource UID、dashboard folder provisioning 和现有 admin deep link 入口 SHALL 继续可用

#### Scenario: Dashboard queries preserve Loki label discipline
- **WHEN** dashboard 查询 requestId、traceId、route、clientIp、userAgent 或用户标识
- **THEN** 查询 MUST 通过 LogQL pipeline 或日志字段过滤完成
- **AND** dashboard 变更 MUST NOT 要求这些字段成为 Loki labels

### Requirement: Observability Runtime Configuration
系统 SHALL 使用版本化配置管理 observability 组件，并 SHALL 支持生产环境替换内网镜像和地址。

#### Scenario: Images use fixed default versions
- **WHEN** 开发者查看 observability compose
- **THEN** Grafana、Loki 和 Alloy 镜像 MUST NOT 使用 `latest`
- **AND** 镜像 SHALL 使用固定默认版本并允许通过环境变量覆盖

#### Scenario: URLs are configurable
- **WHEN** admin 生成 Grafana deep link 或 Alloy 写入 Loki
- **THEN** Grafana URL 和 Loki push URL SHALL 来自环境配置
- **AND** 这些 URL MUST NOT 在应用代码中硬编码为生产地址

### Requirement: System Log Smoke Verification
系统 SHALL 提供端到端 smoke 验证，证明系统日志采集、查询、脱敏、dashboard 和 deep link 能工作。

#### Scenario: Request appears in Loki by requestId
- **WHEN** 开发者启动 dev observability stack 并通过 APISIX 调用 IAM 后端
- **THEN** Grafana/Loki SHALL 能用 requestId 查询到 APISIX 与对应后端日志

#### Scenario: Sensitive test values are absent
- **WHEN** 测试请求携带 Authorization、Cookie、password 或 token 测试值
- **THEN** Loki 查询结果 MUST NOT 包含这些测试原文

#### Scenario: Admin deep link opens Grafana context
- **WHEN** 管理员从审计日志详情点击 Grafana deep link
- **THEN** Grafana SHALL 打开围绕该 requestId 和时间范围的日志查询上下文

### Requirement: Backend Logger Policy
后端应用 SHALL 通过统一 logger factory 创建运行时 logger，并 SHALL 对 `api`、`admin-api`、`oidc-provider` 和 `worker` 使用一致的日志级别、格式、脱敏和 `sourceApp` 规则。

#### Scenario: App log format auto resolves by NODE_ENV
- **WHEN** 后端应用未显式配置 app-specific `*_LOG_FORMAT` 或配置为 `auto`
- **THEN** `NODE_ENV = "development"` 时 logger SHALL 使用 pretty 输出
- **AND** 其他 `NODE_ENV` 值下 logger SHALL 输出 JSON 行日志

#### Scenario: App log format explicit override is honored
- **WHEN** 后端应用配置 app-specific `*_LOG_FORMAT = "json"` 或 `*_LOG_FORMAT = "pretty"`
- **THEN** logger SHALL 按显式 app log format 输出日志
- **AND** 该显式配置 SHALL 优先于 `NODE_ENV`

#### Scenario: App log format is validated
- **WHEN** `api`、`admin-api`、`oidc-provider` 或 `worker` 解析环境变量
- **THEN** app-specific `*_LOG_FORMAT` SHALL 只接受 `auto`、`json` 或 `pretty`
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
- **WHEN** `api`、`admin-api`、`oidc-provider` 或 `worker` 创建 logger
- **THEN** `sourceApp` SHALL 分别使用受控值 `iam-api`、`iam-admin-api`、`iam-oidc-provider` 和 `iam-worker`
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
- **WHEN** 同一进程中先后创建 `iam-api`、`iam-admin-api`、`iam-oidc-provider` 或 `iam-worker` logger
- **THEN** 每个 logger SHALL 保留自身 `sourceApp`、app-specific log format、app-specific log level 和额外脱敏配置
- **AND** 后创建的 logger MUST NOT 复用第一个 logger 的固定全局实例

#### Scenario: App module still exposes app-local singleton
- **WHEN** 后端 app 需要复用 logger
- **THEN** app-local logger module MAY 通过顶层 `export const logger = createLogger(...)` 暴露单例
- **AND** 共享 logger factory MUST NOT 要求所有 app 共用同一个 global singleton key

### Requirement: 管理端会话撤销输出结构化系统日志
系统 SHALL 为 admin-api 触发的 Session Kernel 主动撤销输出结构化系统日志，使 revoke summary、cleanup failure 和 afterCommit best-effort failure 可被 Loki/Grafana 检索。

#### Scenario: 用户会话撤销记录 summary
- **WHEN** admin-api 用户状态、删除或重置密码 afterCommit 撤销任务完成
- **THEN** 系统 SHALL 输出 `event="admin.session_revoke.user"` 的 JSON system log
- **AND** 日志 SHALL 包含 `sourceApp="iam-admin-api"`、requestId、traceId、actorUserId、targetUserId、reason 和 RevokeSummary counters
- **AND** 日志 SHALL NOT 包含 password、password hash、cookie、Authorization 或 external token

#### Scenario: client protocol 撤销记录 summary
- **WHEN** admin-api client 或 OIDC 配置变更 afterCommit 撤销任务完成
- **THEN** 系统 SHALL 输出 `event="admin.session_revoke.client_protocol"` 或 `event="admin.session_revoke.client_all_protocols"` 的 JSON system log
- **AND** 日志 SHALL 包含 clientCode、protocol、reason、revoke counters 和 cleanup counters
- **AND** 日志 SHALL NOT 包含 clientSecret、OIDC secret hash、local session token、access token 或完整 cleanup payload

#### Scenario: cleanup failure 单独可检索
- **WHEN** RevokeSummary cleanup failed 计数大于 0
- **THEN** 系统 SHALL 输出 `event="admin.session_revoke.cleanup_failed"` 的 warning system log
- **AND** 日志 SHALL 包含 protocol、kind、ref 计数、failure message 摘要、requestId 和 clientCode 或 targetUserId
- **AND** 日志 MUST NOT 把 cleanup payload、token、secret 或 cookie 写入日志

#### Scenario: afterCommit revoke 失败可观测
- **WHEN** best-effort afterCommit revoke task 抛出未被 RevokeSummary 捕获的异常
- **THEN** 系统 SHALL 保留现有 afterCommit warning log
- **AND** 系统 SHALL 输出或关联稳定 afterCommit task name，例如 `admin.session_revoke.user` 或 `admin.session_revoke.client_protocol`
- **AND** 管理端业务响应 SHALL 不因该 best-effort failure 改为失败

#### Scenario: 系统日志测试覆盖敏感字段
- **WHEN** 执行 admin-api session revocation logger 单元测试
- **THEN** 测试 SHALL 验证 summary 日志包含 counters、actor、target、reason 和 protocol 字段
- **AND** 测试 SHALL 验证日志不会包含 password、clientSecret、Authorization、Cookie、external token 或 secret hash

### Requirement: Session Kernel release hardening logs must be structured
系统 SHALL 为 Session Kernel 发布硬化输出稳定 JSON system log，使 legacy cleanup、schema corruption、tombstone replay 和 cleanup failure 可被 Loki/Grafana 检索。

#### Scenario: legacy key cleanup 完成
- **WHEN** 旧 Redis session key cleanup dry-run 或 apply 完成
- **THEN** 系统 SHALL 输出 `event="session_kernel.cleanup_legacy_keys.completed"` 的 JSON system log
- **AND** 日志 SHALL 包含 sourceApp、mode、patternCounts、deletedCounts、durationMs 和 result
- **AND** 日志 MUST NOT 包含完整 Redis key、session token、authorization code、access token、cookie 或 secret

#### Scenario: legacy key cleanup 失败
- **WHEN** 旧 Redis session key cleanup dry-run 或 apply 失败
- **THEN** 系统 SHALL 输出 `event="session_kernel.cleanup_legacy_keys.failed"` 的 warning 或 error system log
- **AND** 日志 SHALL 包含 sourceApp、mode、failedPattern、errorName、errorMessage 和已完成的 pattern summary
- **AND** 日志 MUST NOT 包含 Redis password、完整 Redis URL、完整 key、token 或 secret

#### Scenario: Kernel schema corrupted
- **WHEN** Session Kernel resolve、consume、renew 或 revoke 读取到不符合 Zod schema 的 lifecycle payload
- **THEN** 系统 SHALL 输出 `event="session_kernel.schema_corrupted"` 的 warning system log
- **AND** 日志 SHALL 包含 sourceApp、objectType、protocol、clientCode、reason、requestId 或 traceId 中可用字段
- **AND** 日志 MUST NOT 包含 corrupted payload 原文、external bearer token 或完整 Redis key

#### Scenario: tombstone replay detected
- **WHEN** Session Kernel 检测到已消费 artifact 或已撤销 credential/principal/binding 的 replay
- **THEN** 系统 SHALL 输出 `event="session_kernel.tombstone_replay.detected"` 的 info 或 warning system log
- **AND** 日志 SHALL 包含 sourceApp、objectType、protocol、credentialType 或 artifactType、clientCode、reason 和 requestId 中可用字段
- **AND** 日志 MUST NOT 包含被重放的 token、code、sid、Authorization header 或 Cookie

#### Scenario: runtime cleanup failure 可检索
- **WHEN** Session Kernel revoke summary 包含 cleanup failed 计数
- **THEN** 系统 SHALL 输出稳定 cleanup failure system log
- **AND** 日志 SHALL 包含 sourceApp、protocol、kind、refType、failure count、reason、clientCode 或 targetUserId 中可用字段
- **AND** 日志 MUST NOT 包含 cleanup payload、adapter 私有 payload、external token、clientSecret 或 cookie

### Requirement: Session Kernel 日志敏感字段必须有测试覆盖
系统 SHALL 为 Session Kernel 发布硬化日志提供敏感字段测试，证明系统日志不会泄露 bearer token、secret、cookie 或私有 payload。

#### Scenario: cleanup 日志不泄露 key 明文
- **WHEN** 执行 cleanup logging 测试
- **THEN** 测试 SHALL 构造包含 token-like Redis key 的 dry-run/apply 结果
- **AND** 输出日志 SHALL 包含 pattern summary 和 count
- **AND** 输出日志 MUST NOT 包含 token-like key 明文

#### Scenario: runtime 日志不泄露 bearer
- **WHEN** 执行 Session Kernel runtime logging 测试
- **THEN** 测试 SHALL 覆盖 schema corrupted、tombstone replay 和 cleanup failure 日志
- **AND** 输出日志 MUST NOT 包含 PrincipalSession token、custom SSO auth code、local session sid、OIDC authorization code、access token、Authorization header 或 Cookie

#### Scenario: admin revoke 日志保留 summary
- **WHEN** 执行 admin-api session revoke logger 测试
- **THEN** 输出日志 SHALL 包含 revoke counters、cleanup counters、actor、target、clientCode、protocol 和 reason 中适用字段
- **AND** 输出日志 MUST NOT 包含 password、clientSecret、secret hash、external token 或 cleanup payload

### Requirement: Session Kernel release smoke logs must be queryable
系统 SHALL 在发布 smoke 期间产生可用于验收记录的系统日志证据，并 SHALL 保持 event name 稳定。

#### Scenario: custom SSO smoke 日志可查询
- **WHEN** custom SSO smoke 使用 legacy bearer source、auth code replay 或 logout cleanup failure 路径
- **THEN** Loki/Grafana SHALL 能通过稳定 event name、sourceApp、clientCode、requestId 和时间范围查询到对应系统日志
- **AND** 查询结果 MUST NOT 暴露 bearer token、auth code、sid 或 cookie

#### Scenario: OIDC smoke 日志可查询
- **WHEN** OIDC smoke 使用 authorization code replay、UserInfo tombstone 或 logout cleanup failure 路径
- **THEN** Loki/Grafana SHALL 能通过稳定 event name、sourceApp、clientCode、requestId 和时间范围查询到对应系统日志
- **AND** 查询结果 MUST NOT 暴露 authorization code、access token、ID Token、PKCE verifier、clientSecret 或 cookie

#### Scenario: admin revoke smoke 日志可查询
- **WHEN** admin 用户或 client 变更触发 Session Kernel revoke
- **THEN** Loki/Grafana SHALL 能通过 `admin.session_revoke.*` event、sourceApp、targetUserId 或 clientCode、reason 和时间范围查询到 revoke summary
- **AND** 查询结果 SHALL 包含 cleanup counters
- **AND** 查询结果 MUST NOT 暴露 external token、secret 或 cleanup payload
