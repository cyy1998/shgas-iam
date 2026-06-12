## ADDED Requirements

### Requirement: IAM SSO routes classify entry network by host
仓库管理的 IAM SSO APISIX routes SHALL 通过内外网双域名区分入口网络，并向 API 注入可信入口网络 header。

#### Scenario: External SSO host injects external entry network
- **WHEN** 请求以外网 IAM SSO host 访问 `/sso/*`
- **THEN** APISIX SHALL 匹配外网 SSO route
- **AND** APISIX SHALL 覆盖注入 `X-IAM-Entry-Network: external`

#### Scenario: Internal SSO host injects internal entry network
- **WHEN** 请求以内网 IAM SSO host 访问 `/sso/*`
- **THEN** APISIX SHALL 匹配内网 SSO route
- **AND** APISIX SHALL 覆盖注入 `X-IAM-Entry-Network: internal`

#### Scenario: Unknown host does not match SSO route
- **WHEN** 请求使用未配置为内网或外网 IAM SSO host 的 Host 访问 `/sso/*`
- **THEN** 仓库管理的 APISIX SSO routes SHALL NOT 匹配该请求
- **AND** manifest SHALL NOT 保留无 host 限制的 `/sso/*` 兜底 route

#### Scenario: SSO entry hosts are configured by environment
- **WHEN** 渲染 dev 或 prod IAM APISIX manifest
- **THEN** 内外网 SSO host SHALL 由环境变量或 manifest 环境配置提供
- **AND** route 注入的 entry network 值 SHALL 只允许 `internal` 或 `external`

## MODIFIED Requirements

### Requirement: SSO API policy SHALL combine CORS and rate limiting
系统 SHALL 为 IAM SSO API routes 使用合并后的专用 `plugin_config`，同时保留 CORS 策略并启用 API IP 限流。

#### Scenario: SSO routes have combined plugin config
- **WHEN** 开发者查看 dev 或 prod 的仓库管理 IAM SSO API route manifest
- **THEN** 每一条 SSO API route SHALL 引用一个 SSO 专用 `plugin_config_id`
- **AND** 该 `plugin_config` SHALL 同时包含原有 `cors` 策略、`real-ip` 策略和普通 API `limit-req` 策略

#### Scenario: SSO CORS behavior is preserved
- **WHEN** SSO 浏览器端点需要跨域访问
- **THEN** 合并后的 SSO `plugin_config` SHALL 保留原 manifest 中的 CORS allow origins、headers、methods、credentials 和 max age 语义

#### Scenario: SSO route splitting preserves upstream
- **WHEN** IAM SSO route 按内外网 host 拆分
- **THEN** 拆分后的 SSO routes SHALL 继续转发到 IAM API service
- **AND** 拆分 SHALL NOT 改变 SSO upstream 选择
