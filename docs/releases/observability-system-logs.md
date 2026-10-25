# 日志与排障

Type: runbook
Status: Current
Last verified: 2026-10-25
Next review: 2026-11-25

系统日志经 Docker stdout/stderr → Alloy → Loki → Grafana，采集带 `shgas-iam.logs.enabled=true` 的容器。
当前包括 API、Admin API、两个 Worker、Worker dashboard 与 APISIX；Admin/SSO 前端未启用采集。
PostgreSQL 业务审计独立保留。应用字段与脱敏规则见[Logging](../development/backend-implementation.md#logging)。

## 日志栈部署

从对应 `.env.dev.example` 或 `.env.prod.example` 准备私有 `docker/.env`，补齐所选 Compose 的必填项。
生产部署一组集中 Loki/Grafana，每台运行目标容器的主机部署 Alloy。

| 配置                                                     | 核对内容                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `LOKI_IMAGE`、`GRAFANA_IMAGE`、`GRAFANA_ALLOY_IMAGE`     | 固定的兼容镜像版本                                                         |
| `LOKI_PUSH_URL`、`GRAFANA_LOKI_URL`                      | Alloy 推送地址、Grafana 数据源地址可达；跨主机检查 DNS、路由及管理网络限制 |
| `LOKI_HTTP_PUBLISHED_HOST`                               | 默认 loopback 不能供远端 Alloy 使用，需受控可达地址或代理                  |
| `IAM_LOG_ENV`、`IAM_LOG_HOST`                            | 环境和每台 Alloy 的稳定主机标签                                            |
| `LOKI_DATA_PATH`、`GRAFANA_DATA_PATH`、`ALLOY_DATA_PATH` | 实际持久化目录、权限与容量                                                 |
| Grafana root URL、管理员凭据与 OIDC                      | 与实际访问地址及下节登录设置一致                                           |

开发环境启动：

```bash
docker compose --env-file docker/.env -f docker/compose.dev.yaml --profile observability up -d loki grafana alloy
```

开发默认 Loki `http://localhost:3100`、Grafana `http://localhost:30030`、Alloy `http://localhost:12345`。
生产分别在中心主机和各采集主机启动：

```bash
docker compose --env-file docker/.env -f docker/compose.prod.observability.yaml up -d loki grafana
docker compose --env-file docker/.env -f docker/compose.prod.observability.yaml up -d alloy
```

Loki 默认保留期 30 天（`720h`）；当前 Compose 未透传 `LOKI_RETENTION_PERIOD`，只改宿主 `.env` 不会生效。
需覆盖时先落实配置接线并检查容器实际生效值，见[问题 #262](https://github.com/cyy1998/shgas-iam/issues/262)。
宿主另行监控磁盘容量，采集失败告警不能代替容量告警。

**完成检查：** 用同一 Compose 的 `ps` 检查服务稳定运行；Grafana 的 `iam-loki` 数据源和三个 dashboard 加载成功；
按实际环境、主机和 service 查询新日志，例如 `{env="prod", host="prod-host-01"} | json`，用一条已知请求确认采集到达。
启用 OIDC 时验证真实登录与 dashboard 权限，生产还要验证通知路由。失败按下文排障，修复后重验。

## Grafana 登录与告警

通过现有 Client 管理流程创建 `grafana` confidential OIDC Client：

- Redirect URI 为 `${GRAFANA_ROOT_URL}/login/generic_oauth`，scope 为 `openid profile`。
- 经[授权读取](../features/admin/client-sso-configuration.md)取得 SSO Secret，注入 `GRAFANA_OIDC_CLIENT_SECRET`。
- 设置 `GRAFANA_OIDC_ENABLED=true`、`GRAFANA_AUTH_ANONYMOUS_ENABLED=false`。
- `GRAFANA_OIDC_AUTH_URL`、`GRAFANA_OIDC_TOKEN_URL`、`GRAFANA_OIDC_USERINFO_URL` 分别指向同一 issuer 的 `/auth`、`/token`、`/me`。
  浏览器与 Grafana 容器都须可达该入口，可使用不同 DNS 解析，但请求 authority 必须命中同一 Gateway issuer。
- 当前 login/name/email attribute path 保持 `preferred_username`、`name`、`preferred_username`，不要假设 IAM 已签发 email claim。

开发默认 localhost 与 host.docker.internal 的 URL 组合不保证双入口 issuer 一致；按实际部署覆盖三项 URL 并配置容器解析。
更新后重建 Grafana，例如开发环境：

```bash
docker compose --env-file docker/.env -f docker/compose.dev.yaml --profile observability up -d --force-recreate grafana
```

完成一次登录和 UserInfo 获取，确认实际授权；失败时按[OIDC 双入口](authentication-and-session.md#oidc-双入口配置)检查 URI、issuer、Secret 和网络。
Grafana 自己负责 dashboard/datasource 授权，Admin 只提供链接，不通过 iframe 或 Admin API 代理查询。

Provisioning 位于 [grafana/provisioning](../../docker/observability/grafana/provisioning/)。
随附告警覆盖 API/Admin API service error spike、APISIX 5xx、API OIDC server error 和采集失败；Worker 积压需按[数据维护](data-maintenance.md#周期任务与监控)补充。
开发默认 null webhook；生产用环境管理的 provisioning 替换 contact point，并实际测试通知。

## 查询错误与关联请求

| Dashboard                                         | 使用方式                                                  |
| ------------------------------------------------- | --------------------------------------------------------- |
| `IAM Overview` / `iam-overview`                   | 选时间窗口，从错误率、4xx/5xx、耗时和活跃服务判断异常范围 |
| `IAM Error Center` / `iam-error-center`           | 按服务、事件、错误类型/代码聚合，找到相关请求             |
| `IAM Request Drilldown` / `iam-request-drilldown` | 使用 requestId 或 traceId 查询关联详情与网关/后端时间线   |

OIDC 日志位于 `service=api`：`oidc_server_error` 为依赖/服务失败，`oidc_protocol_error` 为已知协议拒绝。
Alloy 标签仅用 `env`、`service`、`component`、`level`、`host`，不把请求 ID 或业务标识作为标签；Loki 自动 `service_name` 发现已禁用。
Grafana deep link 仅携带 env、service、requestId、traceId 和时间范围，不放业务查询参数、用户资料、Token 或请求原文。

## Trace 关联检查

修改 APISIX OpenTelemetry、Alloy、日志格式、dashboard 或审计 trace 查询时执行。
当前 Alloy 使用 debug exporter，没有持久化 trace backend；这里检查日志关联。

执行前确认 manifest 的 `opentelemetry` metadata 设置 `set_ngx_var: true`，APISIX 使用正确的
`APISIX_OTEL_COLLECTOR_ENDPOINT`，Alloy 开启 `otelcol.receiver.otlp "apisix"` 和 OTLP HTTP receiver。
开发通常指向 `alloy:4318`，宿主映射由 `ALLOY_OTLP_HTTP_PUBLISHED_PORT` 控制。
APISIX access log 应包含 traceId、spanId、traceparent；配置与 Gateway 发布使用配对版本。

1. 带合法 `traceparent` 经 APISIX 访问受控 IAM API，在 Loki 用 requestId/traceId 找到 `gateway.request.completed`。
2. 确认其 traceId、spanId、traceparent、requestId、statusCode、durationMs、upstream，并找到同请求的 API/Admin API 日志。
3. 若涉及审计关联，执行受控审计动作，检查 `audit_log.request_id`、`audit_log.trace_id` 与请求一致。
4. 不带 traceparent 再请求 Gateway，确认 APISIX 创建上下文并传给上游；在 Request Drilldown 查看完整网关/后端时间线。

缺失时检查 plugin metadata、日志格式、OTLP 网络与 Alloy receiver，再重验。
直接绕过 APISIX 且无 trace header 的后端请求可以没有 traceId，后端不应随机补造；上下文规则见[后端架构](../architecture/backend-architecture.md#请求审计与可观测上下文)。

## 采集故障与恢复

| 现象                    | 排查与恢复                                                                    |
| ----------------------- | ----------------------------------------------------------------------------- |
| 某主机/service 无新日志 | 核对容器采集标签、Docker 日志、Alloy 状态、env/host 筛选和 Loki 推送连通性    |
| Grafana 查不到日志      | 检查时间范围、`iam-loki` 地址、实际 Loki 状态；不要把旧日志或空图视为采集正常 |
| OIDC 登录失败           | 检查同 issuer 三个 URL、容器解析、redirect URI 与 Secret，修正后重建 Grafana  |
| 无通知或容量告警        | 核对 production contact point 和实际发送；磁盘及 Worker 积压告警另行配置      |

停止日志组件只停止相应处理。开发环境示例：

```bash
docker compose --env-file docker/.env -f docker/compose.dev.yaml stop loki grafana alloy
docker compose --env-file docker/.env -f docker/compose.dev.yaml rm -f loki grafana alloy
```

生产使用对应 Compose，按本机服务选择目标。IAM 继续写 stdout/stderr，停采期间能否补齐取决于 Docker 日志保留及采集位置。
更新镜像/配置前准备已知兼容版本和 Loki/Grafana 一致备份。发布失败时停止受影响组件，恢复兼容版本并重建，保留数据卷，不用删卷或 `down -v` 回退。
若新版已改写数据格式，先确认兼容性；确需恢复数据时停止相关写入，按匹配存储/版本的恢复流程恢复目录并核对数据缺口。
缩短保留期已删除的日志不能通过调大参数找回。
恢复后重做新日志查询、适用 Trace 检查、登录和通知检查；失败时保留现场与备份继续修复。
