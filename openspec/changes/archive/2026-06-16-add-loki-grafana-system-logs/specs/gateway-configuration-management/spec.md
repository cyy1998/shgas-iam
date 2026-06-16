## ADDED Requirements

### Requirement: IAM gateway routes SHALL propagate request IDs
仓库管理的 IAM APISIX routes SHALL 启用入口 requestId 生成与透传，使网关日志、后端系统日志和审计日志能够按 `X-Request-Id` 关联。

#### Scenario: Gateway generates request ID
- **WHEN** 请求进入仓库管理的 IAM APISIX route 且没有合法 `X-Request-Id`
- **THEN** APISIX SHALL 生成 requestId
- **AND** APISIX SHALL 将该值传给上游服务
- **AND** APISIX SHALL 在响应头中返回 `X-Request-Id`

#### Scenario: Gateway preserves request ID
- **WHEN** 请求进入仓库管理的 IAM APISIX route 且携带合法 `X-Request-Id`
- **THEN** APISIX SHALL 复用该 requestId
- **AND** APISIX SHALL 将该值传给上游服务并在响应头中返回

### Requirement: APISIX access logs SHALL be JSON stdout logs
APISIX 网关配置 SHALL 将 HTTP access log 输出为 JSON 到 stdout，供 Alloy 统一采集；仓库管理配置 MUST NOT 使用 APISIX Loki/http/file logger 插件作为一期日志写入路径。

#### Scenario: Access log uses JSON format
- **WHEN** APISIX 处理仓库管理的 IAM HTTP 请求
- **THEN** access log SHALL 输出 JSON
- **AND** JSON SHALL 至少包含 `event`、`sourceApp`、`requestId`、`method`、`path`、`statusCode`、`durationMs`、`upstreamStatus` 和 `upstreamAddr`

#### Scenario: Access log avoids sensitive data
- **WHEN** APISIX 输出 access log
- **THEN** access log MUST NOT 包含 request body、response body、authorization header、cookie header、set-cookie header 或完整敏感 query 原文

#### Scenario: Logger plugins are not used for Loki
- **WHEN** 开发者查看 IAM APISIX manifest 和 gateway config
- **THEN** 配置 MUST NOT 启用 `loki-logger`、`http-logger` 或 `file-logger` 作为系统日志到 Loki 的写入方式
- **AND** 系统日志采集 SHALL 通过容器 stdout/stderr 与 Alloy 完成

#### Scenario: Gateway validation covers logging config
- **WHEN** 开发者运行 APISIX gateway manifest 或配置验证
- **THEN** 验证 SHALL 覆盖 request-id 插件引用和 JSON access log 关键字段
- **AND** 验证 SHALL 防止敏感日志插件配置进入仓库管理的 IAM gateway manifest
