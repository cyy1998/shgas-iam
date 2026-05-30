## MODIFIED Requirements

### Requirement: 全局登录创建会话
系统 SHALL 在加密凭证密码登录、手机验证码登录或受支持的第三方登录成功后创建 Redis 全局会话，并向调用方返回会话 token 与 `isMobileSet`。

#### Scenario: 密码登录成功
- **WHEN** `/auth/login/password` 请求提供有效 `credential`，该凭证解密出的用户名对应用户详情存在，并且解密出的密码匹配用户密码或输入值等于配置的 `MAGIC_CODE`
- **THEN** 系统 SHALL 创建 `global_session:<token>` Redis 记录
- **AND** 系统 SHALL 返回 `{ token, isMobileSet }`
- **AND** HTTP handler SHALL 写入名为 `global_session` 的 HttpOnly、SameSite=Lax cookie

#### Scenario: 手机验证码登录成功
- **WHEN** 手机号对应的用户详情存在，并且登录用途验证码匹配 Redis 中保存的验证码或输入值等于配置的 `MAGIC_CODE`
- **THEN** 系统 SHALL 创建 `global_session:<token>` Redis 记录
- **AND** 系统 SHALL 返回 `{ token, isMobileSet }`
- **AND** HTTP handler SHALL 写入名为 `global_session` 的 HttpOnly、SameSite=Lax cookie
- **AND** 当使用 Redis 中保存的登录用途验证码时，系统 SHALL 原子消费该 `mobile-code:login:<phone>` 验证码

#### Scenario: 手机验证码重复登录被拒绝
- **WHEN** 同一登录用途验证码已经被一次成功手机验证码登录消费
- **THEN** 后续使用相同手机号和验证码登录 SHALL 视为验证码错误
- **AND** 系统 SHALL NOT 创建新的 `global_session:<token>` Redis 记录

#### Scenario: 第三方登录成功
- **WHEN** OA 或 WeChat 登录校验通过并解析到用户详情
- **THEN** 系统 SHALL 创建全局会话并记录对应的全局第三方登录日志
