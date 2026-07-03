# IAM 系统日志可观测性运行手册

Type: runbook
Status: Current
Last verified: 2026-07-03
Next review: 2026-10-31

## 范围

该栈通过 Docker stdout/stderr、Grafana Alloy、Loki 和 Grafana 收集带有
`shgas-iam.logs.enabled=true` 标签的 IAM 容器运行时系统日志。当前 dev/prod compose 会采集 `api`、
`admin-api`、`oidc-provider`、`worker-user-profile`、`worker-dashboard` 与 `apisix`。它不替代
PostgreSQL 审计日志，也不会创建 `system_log` 表。

前端 `admin` 和 `sso` 容器当前未打日志采集标签，仍有意排除在系统日志栈之外。

## 开发环境

照常启动普通开发栈。Loki、Grafana 和 Alloy 位于同一个 compose 文件中，并通过 `observability` profile 按需启用：

```bash
docker compose -f docker/docker-compose-dev.yml up -d
docker compose -f docker/docker-compose-dev.yml --profile observability up -d loki grafana alloy
```

默认开发端口：

- Loki：`http://localhost:3100`
- Grafana：`http://localhost:30030`
- Alloy：`http://localhost:12345`

在不停止 IAM 的情况下停止可观测性栈：

```bash
docker compose -f docker/docker-compose-dev.yml stop loki grafana alloy
docker compose -f docker/docker-compose-dev.yml rm -f loki grafana alloy
```

## 生产环境

运行一组集中式 Loki 与 Grafana，并在每台运行 IAM 目标容器的主机上运行一个 Alloy agent：

```bash
docker compose -f docker/docker-compose-observability-prod.yml up -d loki grafana
docker compose -f docker/docker-compose-observability-prod.yml up -d alloy
```

重要环境变量：

- `LOKI_IMAGE`、`GRAFANA_IMAGE`、`GRAFANA_ALLOY_IMAGE`：为内部镜像仓库覆盖固定的默认镜像。
- `LOKI_PUSH_URL`：Alloy 推送端点，例如 `http://loki.internal:3100/loki/api/v1/push`。
- `GRAFANA_LOKI_URL`：Grafana 中 Loki 数据源的 URL。
- `IAM_LOG_ENV`：Loki `env` 标签，生产 compose 中默认为 `prod`。
- `IAM_LOG_HOST`：本地 Alloy agent 的稳定主机标签。
- `LOKI_DATA_PATH`、`GRAFANA_DATA_PATH`、`ALLOY_DATA_PATH`：持久化数据目录。

Loki 默认配置为保留 30 天（`720h`）。如果某个环境需要不同的保留窗口，可覆盖 `LOKI_RETENTION_PERIOD`。监控 Loki 数据目录，并在磁盘使用率达到危险水位前告警；随附的 Grafana 告警规则包含采集失败信号，但磁盘水位也应由宿主平台监控。

通过快照 `LOKI_DATA_PATH` 和 `GRAFANA_DATA_PATH` 备份 Loki 与 Grafana。回滚该栈时，停止可观测性 compose 服务即可；IAM 应用会继续写 stdout/stderr 日志。

## Trace 发布前置

APISIX 与后端 trace 关联依赖以下条件同时满足：

- APISIX manifest 保留 `opentelemetry` plugin metadata，且设置 `set_ngx_var: true`，使
  `$opentelemetry_trace_id`、`$opentelemetry_span_id` 和 `$opentelemetry_context_traceparent` 可进入 access log。
- APISIX 容器配置 `APISIX_OTEL_COLLECTOR_ENDPOINT`，开发 compose 默认指向 `alloy:4318`。
- Alloy 配置启用 `otelcol.receiver.otlp "apisix"`，并开放 OTLP HTTP receiver；开发 compose 默认发布
  `ALLOY_OTLP_HTTP_PUBLISHED_PORT=4318`。
- APISIX access log JSON 字段包含 `traceId`、`spanId` 和 `traceparent`；缺失 OpenTelemetry 变量时字段保持空字符串或等价缺失值。
- 后端按 `traceparent`、`x-b3-traceid`、`x-trace-id` 的优先级解析 `traceId`，并只记录
  `traceparent` 中的 32 位 trace-id，不记录完整 header 原文。

发布 APISIX 或 Alloy 变更前，先确认 `gateway` manifest 校验与可观测性 compose 配置都来自同一变更集。直接绕过
APISIX 访问后端且没有 trace header 的请求，应在后端系统日志和审计日志中保留 `traceId = null` 或等价缺失值，
不得由后端随机生成 traceId。

## Grafana OIDC

通过现有客户端注册表或管理端客户端管理流程，创建一个客户端编码为 `grafana` 的 confidential IAM OIDC client。

使用以下设置：

- 客户端类型：confidential。
- Redirect URI：`${GRAFANA_ROOT_URL}/login/generic_oauth`。
- Scopes：`openid profile`。
- 只保存一次生成的 client secret，并通过 `GRAFANA_OIDC_CLIENT_SECRET` 提供；不要提交到仓库。
- 从 IAM OIDC issuer 配置 `GRAFANA_OIDC_AUTH_URL`、`GRAFANA_OIDC_TOKEN_URL` 和 `GRAFANA_OIDC_USERINFO_URL`。
- 除非 IAM 开始签发 `email` claim，否则 Grafana 的 login/name/email attribute path 保持为 `preferred_username`、`name` 和 `preferred_username`。

本地调试时，可通过 `docker/.env` 启用 Grafana OIDC：

```dotenv
GRAFANA_AUTH_ANONYMOUS_ENABLED=false
GRAFANA_OIDC_ENABLED=true
GRAFANA_OIDC_CLIENT_SECRET=<secret>
```

然后从统一开发 compose 文件重新创建 Grafana：

```bash
docker compose -f docker/docker-compose-dev.yml --profile observability up -d --force-recreate grafana
```

面向浏览器的授权 URL 使用 `http://localhost:30080/oidc/auth`；Grafana 服务端 token 和 userinfo 调用使用 `http://host.docker.internal:30080`，这样容器内部可以访问 APISIX。

Grafana 自己负责最终的 dashboard 和 datasource 授权。管理端前端只链接到 Grafana，绝不通过 iframe 嵌入。`admin-api` 不代理 Loki 查询。

## Provisioning

Grafana provisioning 文件位于 `observability/grafana/provisioning/`。

- Datasource UID：`iam-loki`。
- Dashboard UID：`iam-overview`、`iam-request-drilldown`、`iam-error-center`。
- 告警规则覆盖核心 service error spike、APISIX 5xx spike、OIDC provider server/protocol error，以及采集失败。
  当前 service error spike 规则聚焦 `api`、`admin-api` 和 `oidc-provider`；worker 日志已进入 Loki 与 dashboard，
  但专门告警需按队列运行指标或 worker 事件另行补充。

开发环境告警默认使用 null webhook，以避免本地通知噪音。生产通知路由应通过环境管理的 Grafana provisioning 替换默认 contact point。

## Dashboard 工作流

使用已 provision 的 dashboard，按三步排查问题：

- `IAM Overview`：从这里开始判断当前时间窗口是否健康。第一行汇总总日志量、错误日志、HTTP 4xx/5xx、APISIX 5xx、请求耗时和活跃服务。趋势面板说明哪个服务或状态族发生变化。
- `IAM Error Center`：当 Overview 显示错误时使用。它按服务、事件和错误类型/代码聚合错误，然后展示带 request 和 trace 标识的近期样例，便于下钻。
- `IAM Request Drilldown`：用于指定 `requestId` 或 `traceId`。它展示关联详情、请求级汇总信号、结构化时间线、可读时间线，以及用于留证的原始 JSON 日志。

Dashboard 颜色使用稳定的运维语义：红色表示 `error`/`fatal` 或 5xx，黄色表示 `warn` 或延迟风险，绿色表示健康/2xx 信号，蓝色表示流量或总量。Dashboard 图例和表格列应使用可读名称，例如 service、event、status、request ID 和 duration，而不是原始 `{label="value"}` 表达式。

Grafana data link 和管理端深链只能携带技术关联字段：

- `env`
- `service`
- `requestId`
- `traceId`
- time range

不要把用户名、用户 ID、手机号、client secret、token、审计详情、业务查询字符串、堆栈、完整请求 URL、请求体或响应体放进 dashboard link。

当前没有把 dashboard 截图作为视觉基线提交到仓库。如果某次发布需要截图评审，请在 provisioning 加载后从开发可观测性栈生成截图，并将截图产物保留在仓库外，除非有专门评审流程要求纳入。

## Trace Smoke

发布或调整 APISIX OpenTelemetry、Alloy OTLP receiver、日志格式、dashboard 或审计 trace 查询时，至少执行以下 smoke：

1. 带合法 `traceparent` 访问一个经过 APISIX 的 IAM API endpoint，记录请求使用的 `X-Request-Id`。
2. 在 Loki 中查询 `service="apisix"` 的 gateway access log，确认同一请求包含 `event="gateway.request.completed"`、
   `traceId`、`spanId`、`traceparent`、`requestId`、`statusCode`、`durationMs` 和 upstream 字段。
3. 查询 backend 日志，确认同一 `requestId` 或 `traceId` 可以找到 `api`、`admin-api` 或 `oidc-provider`
   的 request log。
4. 触发一条会写审计的操作，确认 `audit_log.request_id` 与 `audit_log.trace_id` 可与 gateway/backend 日志关联。
5. 不带 `traceparent` 再访问一次 gateway，确认 APISIX OpenTelemetry 创建 trace context，并将 trace 字段传给上游。
6. 在 `IAM Request Drilldown` 使用 `requestId` 或 `traceId` 打开请求详情，确认时间线覆盖 gateway 和后端日志。

证据留存只记录 requestId、traceId、服务名、时间窗口、查询表达式摘要和截图或命令结果摘要。不得保存
Authorization header、Cookie、请求体、响应体、完整业务 URL query、token、client secret、验证码或审计 details 原文。

## 日志契约

系统日志使用如下 JSON 字段：

- `event`：稳定的小写点分事件名。
- `sourceApp`：`iam-api`、`iam-admin-api`、`iam-oidc-provider`、`iam-worker` 或 `apisix`。
- `requestId`：来自 `X-Request-Id` 的主要关联 ID。
- `traceId`：存在时记录标准 trace context 的 trace id。
- `spanId`：gateway access log 中记录 APISIX OpenTelemetry span id。
- `traceparent`：gateway access log 中记录 APISIX 传递给上游的 traceparent。
- `method`、`path`、`route`、`statusCode`、`durationMs`。
- `clientIp`、`userAgent`。
- `errorName`、`errorCode`、`errorMessage`、`source`。

不要把 requestId、traceId、route、userId、username、clientIp 或 userAgent 放入 Loki 标签。Alloy 标签仅限于 `env`、`service`、`component`、`level` 和 `host`。Loki `service_name` 自动发现已禁用，以保持标签集合显式可控。

事件名不得包含请求 ID、用户标识、client code、动态业务值或原始 URL。

## 敏感数据规则

系统日志不得采集请求体或响应体。

应用 logger 在输出到 stdout 前会脱敏常见敏感字段：

- `authorization`、`cookie`、`set-cookie`
- `password`、`token`、`accessToken`、`idToken`、`refreshToken`
- `secret`、`clientSecret`、`privateKey`
- 验证码和 OIDC authorization code

Alloy 会对常见敏感 key name 执行二次脱敏。APISIX 访问日志不包含 body、敏感 header 或原始查询字符串。

管理端 Grafana 深链只包含 requestId、traceId、service、env，以及围绕审计事件的时间范围。不得包含 username、userId、mobile、client secret、token、审计详情、业务查询字符串或堆栈。
