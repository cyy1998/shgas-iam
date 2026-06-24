## ADDED Requirements

### Requirement: SSO 登录页保持登录模式入口行为
SSO 前端 SHALL 在登录页结构拆分后保持密码登录、手机验证码登录和手机号补绑的现有入口行为。

#### Scenario: URL 初始化登录模式
- **WHEN** 用户访问 SSO 登录页且 URL query 包含 `loginType=SMS`
- **THEN** 登录页 SHALL 初始展示手机验证码登录表单
- **AND** 用户切换登录 tab 时 SHALL NOT 将新的登录模式写回 URL query

#### Scenario: 默认密码登录模式
- **WHEN** 用户访问 SSO 登录页且 URL query 不包含有效的 `loginType=SMS` 或 `loginType=PWD`
- **THEN** 登录页 SHALL 初始展示密码登录表单

#### Scenario: 密码登录后进入手机号补绑
- **WHEN** 用户通过密码登录成功且响应表示账号尚未绑定手机号
- **THEN** 登录页 SHALL 切换到手机号补绑流程
- **AND** 补绑流程 SHALL 使用手机号和短信验证码完成绑定
- **AND** 用户 SHALL 仍可选择跳过补绑并继续原有登录后跳转

### Requirement: SSO 登录页保持安全入口提示
SSO 前端 SHALL 在缺少 custom SSO client 且缺少 OIDC return handle 时阻止展示正常登录表单，并展示安全提示页。

#### Scenario: 缺少登录上下文
- **WHEN** 用户访问 SSO 登录页且 URL query 不包含 `client`
- **AND** URL query 不包含 `oidcReturn`
- **THEN** 登录页 SHALL 展示登录地址安全提示
- **AND** 登录页 SHALL NOT 展示密码登录或手机验证码登录表单

#### Scenario: 存在 custom SSO client
- **WHEN** 用户访问 SSO 登录页且 URL query 包含 `client`
- **THEN** 登录页 SHALL 展示正常登录表单
- **AND** 登录成功后 SHALL 保持 custom SSO `/sso/authorize` 跳转行为

#### Scenario: 存在 OIDC return handle
- **WHEN** 用户访问 SSO 登录页且 URL query 包含 `oidcReturn`
- **THEN** 登录页 SHALL 展示正常登录表单
- **AND** 登录成功后 SHALL 保持 OIDC provider resume endpoint 跳转行为

### Requirement: SSO 短信验证码倒计时体验一致
SSO 前端 SHALL 在登录、重置密码和个人信息页面使用一致的短信验证码倒计时生命周期，同时保留各页面原有短信发送业务规则。

#### Scenario: 发送成功后开始倒计时
- **WHEN** 用户在登录页、重置密码页或个人信息页成功发送短信验证码
- **THEN** 对应页面 SHALL 启动短信验证码倒计时
- **AND** 倒计时结束前 SHALL 阻止重复发送同一验证码

#### Scenario: 发送业务规则保持页面私有
- **WHEN** 用户在任一页面请求发送短信验证码
- **THEN** 页面 SHALL 继续执行该页面原有的手机号校验、发送前置条件、人机校验和短信发送接口
- **AND** 共享倒计时逻辑 SHALL NOT 改变短信发送请求体、`SmsUsage` 或 `HumanVerificationAction`

#### Scenario: 重置密码返回上一步清理倒计时
- **WHEN** 用户在重置密码流程中从设置密码步骤返回安全验证步骤
- **THEN** 重置密码页 SHALL 清理当前短信验证码倒计时
- **AND** 页面 SHALL 允许用户重新发送验证码
