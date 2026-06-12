## ADDED Requirements

### Requirement: Client redirect URL patterns are validated on write
系统 SHALL 在管理端创建或更新 client 时校验 `validRedirectUrls` 中每一条 redirect URL pattern。

#### Scenario: Valid redirect URL patterns are accepted
- **WHEN** 管理端创建或更新 client 且 `validRedirectUrls` 包含合法 pattern
- **THEN** Admin API SHALL 接受该 client 输入
- **AND** 系统 SHALL 保持 `validRedirectUrls` 的存储结构为 `string[]`

#### Scenario: Invalid redirect URL pattern is rejected
- **WHEN** 管理端创建或更新 client 且 `validRedirectUrls` 包含非法 pattern
- **THEN** Admin API SHALL 拒绝该请求
- **AND** 错误信息 SHALL 指明存在非法 redirect URL pattern

#### Scenario: Admin UI explains supported redirect patterns
- **WHEN** 管理员编辑 client 的 `validRedirectUrls`
- **THEN** 管理端页面 SHALL 提示支持 origin、一级子域 wildcard 和 path 末尾 `/*`
- **AND** 管理端页面 SHALL NOT 复制完整运行时 matcher 作为权威校验

### Requirement: Redirect URL pattern syntax is constrained
系统 SHALL 仅支持受限 URL pattern，以避免任意正则或过宽通配导致 redirectUrl 误放行。

#### Scenario: Exact origin and path pattern
- **WHEN** pattern 为 `http` 或 `https` URL 且不包含 wildcard
- **THEN** pattern SHALL 要求 redirectUrl 的 protocol、hostname 和 port 与 pattern 一致
- **AND** pattern path SHALL 按 path segment 边界匹配该 path 节点及其子树

#### Scenario: Host wildcard pattern
- **WHEN** pattern hostname 使用 `*.example.com`
- **THEN** pattern SHALL 只匹配 `example.com` 下一级子域
- **AND** pattern MUST NOT 匹配根域 `example.com`
- **AND** pattern MUST NOT 匹配多级子域

#### Scenario: Path wildcard pattern
- **WHEN** pattern pathname 以 `/*` 结尾
- **THEN** pattern SHALL 匹配该 path 下的子路径
- **AND** pattern SHALL NOT 匹配不带尾斜杠的基路径

#### Scenario: Unsupported wildcard syntax is invalid
- **WHEN** pattern 使用协议通配、端口通配、host 中间通配、path 中间通配、裸 `*` 或过宽 host wildcard
- **THEN** pattern SHALL 被判定为非法

#### Scenario: Query and hash are not allowed in patterns
- **WHEN** pattern 包含 query 或 hash
- **THEN** pattern SHALL 被判定为非法
- **AND** redirectUrl 自身的 query 或 hash SHALL NOT 参与白名单匹配

#### Scenario: HTTP redirect URLs are allowed
- **WHEN** pattern 和 redirectUrl 均使用 `http`
- **THEN** 系统 SHALL 允许该协议参与匹配
- **AND** 系统 SHALL NOT 因 redirectUrl 使用 `http` 而拒绝

## MODIFIED Requirements

### Requirement: 客户端配置影响 SSO 和鉴权行为
系统 SHALL 根据 client extAttributes 和 status 影响 SSO callback、authorize、logout 和网关鉴权。

#### Scenario: SSO redirect pattern 校验
- **WHEN** SSO authorize 或 callback 校验 redirectUrl
- **THEN** 系统 SHALL 要求 redirectUrl 命中 client.extAttributes.validRedirectUrls 中任一合法 redirect URL pattern
- **AND** 系统 SHALL 使用结构化 URL 语义匹配 protocol、hostname、port 和 pathname
- **AND** 系统 SHALL NOT 使用纯字符串 `startsWith` 作为 redirectUrl 校验语义

#### Scenario: 历史非法 pattern 按不匹配处理
- **WHEN** SSO authorize 或 callback 运行时读取到非法 redirect URL pattern
- **THEN** 系统 SHALL 跳过该 pattern 并记录结构化 warn 日志
- **AND** 若没有其他合法 pattern 匹配 redirectUrl，系统 SHALL 返回非法重定向地址错误

#### Scenario: Gateway 和 Independent 模式
- **WHEN** SSO authorize 生成 callback 重定向地址
- **THEN** Gateway 模式 SHALL 使用 redirectUrl 的协议和主机拼接 `/sso/callback`
- **AND** Independent 模式 SHALL 使用 client.extAttributes.callbackEndpoint

#### Scenario: ORCAS 集成
- **WHEN** client.extAttributes.requireOrcas 为 true 且执行 Gateway callback
- **THEN** 系统 SHALL 调用 ORCAS 登录并把 orcas session 写入 cookie 与重定向 URL 参数

#### Scenario: 维护状态鉴权
- **WHEN** client.status 为 `ClientStatus.Maintance` 且当前用户不在 userExcluding 列表中
- **THEN** 网关鉴权 SHALL 拒绝请求并报告系统维护中
