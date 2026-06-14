# sso-login-experience Specification

## Purpose
描述 SSO 前端登录交互中密码失败强提示与临时限制提示的当前目标行为。
## Requirements
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

### Requirement: SSO 密码错误强提示
SSO 前端 SHALL 在密码登录失败时展示需要用户手动确认的强提示，并明确告知剩余尝试次数。

#### Scenario: 密码登录返回失败次数信息
- **WHEN** SSO 前端收到密码登录失败响应且响应包含当前失败次数或剩余次数
- **THEN** 前端 SHALL 以强提示方式展示错误信息
- **AND** 前端 SHALL 明确告知剩余尝试次数或临时限制剩余时间
- **AND** 前端 SHALL 要求用户手动点击确认后才能关闭提示并继续操作

#### Scenario: 密码登录进入临时限制
- **WHEN** SSO 前端收到后端表示账号已被临时限制 30 分钟的密码登录响应
- **THEN** 前端 SHALL 以强提示方式展示临时限制状态
- **AND** 前端 SHALL 告知用户需要等待限制期结束后重新尝试
- **AND** 前端 SHALL 要求用户手动确认后才能返回登录表单

#### Scenario: 其他认证错误保持原有交互
- **WHEN** SSO 前端收到非密码失败类认证错误
- **THEN** 前端 SHALL 保持原有错误展示方式
- **AND** 前端 SHALL NOT 因此改变其他认证流程的提交逻辑

### Requirement: SSO 登录页支持 opaque OIDC login return handle
SSO 前端 SHALL 支持 provider 生成的一次性 opaque `oidcReturn` handle，使未登录用户完成现有 IAM 登录后回到固定 provider resume endpoint，并 SHALL NOT 接收任意 OIDC return URL。

#### Scenario: OIDC login return handle 有效
- **WHEN** 用户访问 SSO 登录页且请求包含非空 `oidcReturn` handle
- **THEN** 登录页 SHALL 展示正常登录表单
- **AND** SHALL 保存该 opaque handle
- **AND** SHALL NOT 要求 custom SSO `client` 或 `redirectUrl`
- **AND** SHALL NOT 在前端解析原始 OIDC authorize 参数或 client redirect URI

#### Scenario: OIDC handle 缺失或格式非法
- **WHEN** 页面进入 OIDC 登录模式但 handle 缺失或格式不符合约定
- **THEN** 登录页 SHALL 阻止 OIDC 回跳
- **AND** SHALL 展示登录请求无效的安全提示

#### Scenario: OIDC 密码登录成功
- **WHEN** 用户在 OIDC 模式下通过密码登录成功且不需要补绑手机号
- **THEN** 登录页 SHALL 跳转到固定 provider resume endpoint，并携带原始 handle
- **AND** SHALL NOT 跳转到 custom SSO `/sso/authorize`

#### Scenario: OIDC 手机验证码登录成功
- **WHEN** 用户在 OIDC 模式下通过手机验证码登录成功
- **THEN** 登录页 SHALL 跳转到固定 provider resume endpoint，并携带原始 handle

#### Scenario: OIDC 登录后需要补绑手机号
- **WHEN** OIDC 模式密码登录后需要补绑手机号
- **THEN** 页面 SHALL 保持现有补绑手机号流程
- **AND** 补绑成功后 SHALL 跳转到固定 provider resume endpoint，并携带原始 handle

#### Scenario: Provider 拒绝 handle
- **WHEN** resume endpoint 判定 handle 过期、已消费、版本不匹配或浏览器绑定不匹配
- **THEN** 页面 SHALL 展示安全失败结果
- **AND** SHALL NOT 重定向到任意业务系统 URL

#### Scenario: Custom SSO 登录保持不变
- **WHEN** 用户访问登录页且使用既有 `client` 和 `redirectUrl` 参数
- **THEN** 页面 SHALL 保持 custom SSO 登录成功后跳转 `/sso/authorize` 的行为
