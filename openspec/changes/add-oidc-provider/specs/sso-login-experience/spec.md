## ADDED Requirements

### Requirement: SSO 登录页支持 OIDC returnTo 回跳
SSO 前端 SHALL 支持 OIDC provider 发起的受控 `returnTo` 登录回跳，使未登录用户完成现有 IAM 登录后可以回到 OIDC authorize 流程。

#### Scenario: OIDC 登录页参数有效
- **WHEN** 用户访问 SSO 登录页且请求包含 OIDC 登录模式和有效 `returnTo`
- **THEN** 登录页 SHALL 展示正常登录表单
- **AND** 登录页 SHALL 将本次登录成功后的目标记录为该 `returnTo`
- **AND** 登录页 SHALL NOT 要求必须存在 custom SSO `client` 和 `redirectUrl`

#### Scenario: OIDC returnTo 校验失败
- **WHEN** 用户访问 SSO 登录页且请求包含 OIDC 登录模式但 `returnTo` 缺失、过期、签名无效或不属于允许的 OIDC provider origin
- **THEN** 登录页 SHALL 阻止继续登录回跳
- **AND** 页面 SHALL 展示登录地址校验未通过的安全提示

#### Scenario: OIDC 密码登录成功
- **WHEN** 用户在 OIDC 登录模式下通过密码登录成功且不需要补绑手机号
- **THEN** 登录页 SHALL 跳转到校验通过的 `returnTo`
- **AND** 登录页 SHALL NOT 强制跳转到 custom SSO `/sso/authorize`

#### Scenario: OIDC 手机验证码登录成功
- **WHEN** 用户在 OIDC 登录模式下通过手机验证码登录成功
- **THEN** 登录页 SHALL 跳转到校验通过的 `returnTo`
- **AND** 登录页 SHALL NOT 强制跳转到 custom SSO `/sso/authorize`

#### Scenario: OIDC 登录后需要补绑手机号
- **WHEN** 用户在 OIDC 登录模式下密码登录成功但后端返回需要补绑手机号
- **THEN** 登录页 SHALL 保持现有补绑手机号流程
- **AND** 补绑成功后 SHALL 跳转到校验通过的 `returnTo`

#### Scenario: 既有 custom SSO 登录回跳保持不变
- **WHEN** 用户访问 SSO 登录页且请求使用既有 `client` 和 `redirectUrl` 参数
- **THEN** 登录页 SHALL 保持现有 custom SSO 登录成功后跳转 `/sso/authorize` 的行为
