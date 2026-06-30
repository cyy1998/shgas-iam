## ADDED Requirements

### Requirement: IAM Gateway Routes Enable OpenTelemetry
仓库管理的 IAM APISIX gateway routes SHALL 通过 APISIX OpenTelemetry 插件生成或延续 W3C trace context，并 SHALL 将 trace context 传给上游 IAM 服务。

#### Scenario: IAM plugin configs include OpenTelemetry
- **WHEN** 开发者查看 `gateway/manifests/dev/iam.yaml` 或 `gateway/manifests/prod/iam.yaml` 中的 IAM API/OIDC plugin_config
- **THEN** 每个用于 IAM 请求路径的 plugin_config SHALL 启用 `opentelemetry`
- **AND** plugin_config SHALL 保留既有 `request-id`、`real-ip`、`limit-req`、`cors` 或其他插件语义

#### Scenario: Existing trace context is preserved
- **WHEN** 进入 APISIX 的 IAM 请求携带合法 `traceparent`
- **THEN** APISIX OpenTelemetry 插件 SHALL 延续该 trace context
- **AND** 上游 `api`、`admin-api` 或 `oidc-provider` SHALL 能从请求 headers 中解析同一 traceId

#### Scenario: Missing trace context is created
- **WHEN** 进入 APISIX 的 IAM 请求未携带合法 `traceparent`
- **THEN** APISIX OpenTelemetry 插件 SHALL 创建新的 trace context
- **AND** APISIX SHALL 将该 trace context 透传给上游 IAM 服务

### Requirement: Gateway Config Exposes OpenTelemetry Trace Variables
APISIX 运行配置 SHALL 启用 OpenTelemetry trace 变量，使 access log 可以输出 traceId、spanId 和 traceparent。

#### Scenario: Access log format includes trace variables
- **WHEN** 开发者查看 dev 或 prod APISIX config 模板
- **THEN** `access_log_format` SHALL 输出 JSON 字段 `traceId`、`spanId` 和 `traceparent`
- **AND** 这些字段 SHALL 使用 APISIX OpenTelemetry 插件暴露的 nginx variables
- **AND** access log format MUST NOT 输出 authorization、cookie、set-cookie、request body 或 response body

#### Scenario: OpenTelemetry metadata enables nginx variables
- **WHEN** APISIX 启动 gateway 配置
- **THEN** OpenTelemetry plugin metadata SHALL 启用可用于 access log 的 nginx variables
- **AND** 配置 SHALL 支持通过环境变量设置 APISIX collector endpoint，且本仓库开发/生产编排 SHALL 使用既有 Alloy 作为该 endpoint

### Requirement: Gateway Validation Enforces IAM Trace Plugin
APISIX manifest validator SHALL 防止 IAM 请求路径遗漏 tracing 插件。

#### Scenario: IAM route without tracing fails validation
- **WHEN** `iam` manifest 中的请求路径 route 或其 plugin_config 未启用 `opentelemetry`
- **THEN** `pnpm gateway:apisix:validate -- --env <env>:iam` SHALL fail
- **AND** 错误信息 SHALL 指向缺少 `opentelemetry` 的 route 或 plugin_config

#### Scenario: Non-IAM manifests are not blocked in phase one
- **WHEN** 开发者校验 `tender` 或 `gds` manifest
- **THEN** validator SHALL NOT 在本阶段强制要求这些 manifest 启用 `opentelemetry`
- **AND** 已有 request-id、限流、real-ip 和敏感配置校验 SHALL 保持不变

### Requirement: Alloy Receives Gateway OTLP Traces
生产和开发 gateway 部署 SHALL 使用既有 Alloy 作为 APISIX trace span 接收端，不得为本能力新增独立 OTel Collector 组件。

#### Scenario: Production gateway declares Alloy OTLP endpoint
- **WHEN** 运维部署生产 APISIX gateway
- **THEN** 生产配置 SHALL 要求提供 APISIX collector endpoint
- **AND** 示例配置 SHALL 指向 Alloy OTLP HTTP endpoint 或说明需按部署网络填写可达地址
- **AND** 配置 MUST NOT 将真实 collector 密钥或敏感地址硬编码到仓库

#### Scenario: Development compose can run Alloy OTLP receiver
- **WHEN** 开发者需要本地验证 APISIX trace context 和 access log trace 字段
- **THEN** docker compose SHALL 通过既有 Alloy 服务提供 OTLP HTTP receiver
- **AND** APISIX SHALL 能通过开发配置向 Alloy 导出 span
