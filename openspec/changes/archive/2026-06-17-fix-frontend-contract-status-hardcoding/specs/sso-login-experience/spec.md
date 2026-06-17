## ADDED Requirements

### Requirement: SSO 维护页按当前 client 刷新重试

SSO 前端维护页 SHALL 使用当前 custom SSO 登录请求携带的目标 client 检查维护状态，并 SHALL 以共享 `ClientStatus.Maintance` 作为维护状态判断依据。

#### Scenario: 当前 client 已恢复服务

- **WHEN** 用户位于 `/systemMaintenance` 页面且 URL 查询参数包含 `client` 与 `redirectUrl`
- **AND** 用户点击刷新重试
- **AND** `/open/client/status?clientCode=<client>` 返回的 status 不是 `ClientStatus.Maintance`
- **THEN** 前端 SHALL 跳转到解码后的 `redirectUrl`
- **AND** 前端 SHALL NOT 查询固定的 `tender` client

#### Scenario: 当前 client 仍在维护

- **WHEN** 用户位于 `/systemMaintenance` 页面且 URL 查询参数包含 `client`
- **AND** 用户点击刷新重试
- **AND** `/open/client/status?clientCode=<client>` 返回的 status 是 `ClientStatus.Maintance`
- **THEN** 前端 SHALL 继续停留在维护页
- **AND** 前端 SHALL NOT 跳转到业务系统

#### Scenario: 缺少 client 上下文

- **WHEN** 用户位于 `/systemMaintenance` 页面且 URL 查询参数不包含 `client`
- **AND** 用户点击刷新重试
- **THEN** 前端 SHALL NOT fallback 到任何默认 client
- **AND** 前端 SHALL NOT 从 `redirectUrl` 推断 client
- **AND** 前端 SHALL 留在维护页并提示缺少应用上下文
