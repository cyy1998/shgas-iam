## ADDED Requirements

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
