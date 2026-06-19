# IAM 系统日志可观测性运行手册

## 范围

该栈通过 Docker stdout/stderr、Grafana Alloy、Loki 和 Grafana 收集 `api`、`admin-api`、`oidc-provider` 与 `apisix` 的运行时系统日志。它不替代 PostgreSQL 审计日志，也不会创建 `system_log` 表。

第一阶段有意排除前端 `admin` 和 `sso` 容器。

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
- 告警规则覆盖 service error spike、APISIX 5xx spike、OIDC provider server/protocol error，以及采集失败。

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

## 日志契约

系统日志使用如下 JSON 字段：

- `event`：稳定的小写点分事件名。
- `sourceApp`：`iam-api`、`iam-admin-api`、`iam-oidc-provider` 或 `apisix`。
- `requestId`：来自 `X-Request-Id` 的主要关联 ID。
- `traceId`：存在时记录可选 trace header 值。
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
