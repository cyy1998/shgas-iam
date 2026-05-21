## MODIFIED Requirements

### Requirement: 公开短信验证码与找回密码
系统 SHALL 通过 open tier 支持发送/校验短信验证码和重置密码，并在发送短信验证码前强制要求有效 Cap token。

#### Scenario: 发送验证码
- **WHEN** open API 请求发送验证码并携带有效 Cap token
- **THEN** 系统 SHALL 消费该 Cap token
- **AND** 系统 SHALL 校验目标手机号格式
- **AND** 除 bindPhone 用途外，系统 SHALL 要求手机号已存在
- **AND** 系统 SHALL 调用短信客户端发送验证码并把验证码保存到 `mobile-code:<usage>:<phone>`，TTL 为 180 秒

#### Scenario: 发送验证码缺少 Cap token
- **WHEN** open API 请求发送验证码但未携带有效 Cap token
- **THEN** 系统 SHALL 拒绝调用短信客户端
- **AND** 响应 SHALL 使用可被前端稳定识别的业务码表示需要人机校验

#### Scenario: 校验验证码
- **WHEN** open API 请求校验验证码
- **THEN** 系统 SHALL 按 usage 和 phone 读取 Redis 中保存的验证码
- **AND** 响应 SHALL 返回 `{ result: boolean }`

#### Scenario: 找回密码解析手机号
- **WHEN** resetPassword 用途请求提供 username
- **THEN** 系统 SHALL 查询启用用户详情并取得绑定手机号
- **AND** 若请求提供 phoneNumber，系统 SHALL 允许真实手机号或脱敏手机号匹配

#### Scenario: 重置密码
- **WHEN** open API 提交 username、手机号、验证码和 newPassword
- **THEN** 系统 SHALL 校验用户存在、手机号匹配和 resetPassword 验证码匹配
- **AND** 系统 SHALL 哈希保存新密码

### Requirement: 公开脱敏用户信息
系统 SHALL 通过 open tier 按 username 返回用户的脱敏基本信息，并在异常查询条件下要求有效 Cap token。

#### Scenario: 查询脱敏用户信息
- **WHEN** 调用 `/open/users/userInfo` 并提供 username，且请求未命中 `openUserInfoLookup` 异常触发策略
- **THEN** 系统 SHALL 查询启用且未软删除用户详情
- **AND** 响应 SHALL 返回 username、name 和脱敏 mobile

#### Scenario: 异常查询缺少 Cap token
- **WHEN** 调用 `/open/users/userInfo` 并提供 username，且请求命中 `openUserInfoLookup` 异常触发策略但未携带有效 Cap token
- **THEN** 系统 SHALL 拒绝执行用户详情查询
- **AND** 响应 SHALL 使用可被前端稳定识别的业务码表示需要人机校验

#### Scenario: 异常查询携带有效 Cap token
- **WHEN** 调用 `/open/users/userInfo` 并提供 username，且请求命中 `openUserInfoLookup` 异常触发策略并携带有效 Cap token
- **THEN** 系统 SHALL 消费该 Cap token
- **AND** 系统 SHALL 查询启用且未软删除用户详情
- **AND** 响应 SHALL 返回 username、name 和脱敏 mobile

#### Scenario: 手机号脱敏
- **WHEN** 用户手机号长度大于 7
- **THEN** 系统 SHALL 保留前 3 位和后 4 位，中间替换为 `****`

#### Scenario: 脱敏用户查询更新 Cap 异常状态
- **WHEN** `/open/users/userInfo` 被调用
- **THEN** 系统 SHALL 更新 `openUserInfoLookup` action 在 IP 维度的短窗口查询状态
