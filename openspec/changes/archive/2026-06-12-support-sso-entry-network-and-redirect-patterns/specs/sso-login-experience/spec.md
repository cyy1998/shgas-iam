## ADDED Requirements

### Requirement: SSO endpoint discovery selects origin by entry network
系统 SHALL 根据可信网关注入的入口网络类型返回对应内网或外网 SSO endpoint URL。

#### Scenario: External entry returns external SSO endpoints
- **WHEN** 调用 `/sso/.well-known/authentication-configuration` 且请求包含 `X-IAM-Entry-Network: external`
- **THEN** 响应 SHALL 使用 `SSO_EXTERNAL_ORIGIN` 拼接 `authorizationEndpoint`、`logoutEndpoint` 和 `thirdPartyOAEndpoint`
- **AND** endpoint path SHALL 继续来自 `AUTHORIZATION_ENDPOINT`、`LOGOUT_ENDPOINT` 和 `THIRDPARTY_OA_ENDPOINT`

#### Scenario: Internal entry returns internal SSO endpoints
- **WHEN** 调用 `/sso/.well-known/authentication-configuration` 且请求包含 `X-IAM-Entry-Network: internal`
- **THEN** 响应 SHALL 使用 `SSO_INTERNAL_ORIGIN` 拼接 `authorizationEndpoint`、`logoutEndpoint` 和 `thirdPartyOAEndpoint`
- **AND** endpoint path SHALL 与外网响应保持一致

#### Scenario: Unknown entry network is rejected
- **WHEN** 调用 `/sso/.well-known/authentication-configuration` 且 `X-IAM-Entry-Network` 缺失或不是 `internal` / `external`
- **THEN** API SHALL 返回 HTTP 400
- **AND** 响应 SHALL 表示非法 SSO 入口

#### Scenario: Discovery response does not expose entry network
- **WHEN** `/sso/.well-known/authentication-configuration` 成功返回
- **THEN** 响应 SHALL NOT 包含 `entryNetwork` 字段
- **AND** 调用方 SHALL 只通过返回的 endpoint URL 使用对应入口

### Requirement: SSO public origins are required deployment configuration
API 服务 SHALL 在启动时校验内外网 SSO public origin 配置。

#### Scenario: Missing public origin fails startup
- **WHEN** API 服务启动且 `SSO_INTERNAL_ORIGIN` 或 `SSO_EXTERNAL_ORIGIN` 缺失或不是有效 URL
- **THEN** 环境变量校验 SHALL 失败
- **AND** 服务 SHALL NOT 继续启动

#### Scenario: Public origin is normalized before URL composition
- **WHEN** API 使用 `SSO_INTERNAL_ORIGIN` 或 `SSO_EXTERNAL_ORIGIN` 拼接 endpoint URL
- **THEN** 系统 SHALL 按 URL 语义规范化 origin
- **AND** 系统 SHALL 避免因 origin 尾斜杠和 endpoint path 前斜杠产生重复斜杠
