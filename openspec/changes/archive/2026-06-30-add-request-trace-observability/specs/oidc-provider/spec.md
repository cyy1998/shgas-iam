## ADDED Requirements

### Requirement: OIDC Provider Logs Carry Trace Context
OIDC provider SHALL 在请求路径日志和 provider 事件日志中记录可用 traceId，使协议错误、server error 和 HTTP request failed 事件可与 gateway 和后端 request log 关联。

#### Scenario: HTTP request failed log includes trace id
- **WHEN** OIDC HTTP wrapper 捕获请求处理异常并输出 `oidc.provider.http_request.failed`
- **THEN** 日志 SHALL 包含 requestId、traceId、sourceApp、errorName 和 errorMessage
- **AND** traceId SHALL 使用与后端公共日志相同的 header 解析规则

#### Scenario: Provider server error includes trace id
- **WHEN** oidc-provider 触发 `server_error`
- **THEN** 系统 SHALL 输出 `oidc.provider.server_error` 日志
- **AND** 日志 SHALL 包含 requestId 和 traceId
- **AND** 日志 MUST NOT 明文包含 access token、ID token、refresh token、authorization code、client secret 或 cookie

#### Scenario: Provider protocol errors include trace id
- **WHEN** oidc-provider 触发 authorization、grant、userinfo 或 end_session protocol error
- **THEN** 系统 SHALL 输出 `oidc.provider.protocol_error` 日志
- **AND** 日志 SHALL 包含 requestId、traceId、oidcEvent、errorCode、errorName 和 statusCode 中可用字段

#### Scenario: Provider middleware stores trace id in request state
- **WHEN** OIDC provider middleware 处理请求
- **THEN** middleware SHALL 将解析后的 traceId 写入 request state
- **AND** provider event handlers SHALL 从 request state 读取 traceId
- **AND** middleware MUST NOT 在缺少 trace header 时随机生成 traceId
