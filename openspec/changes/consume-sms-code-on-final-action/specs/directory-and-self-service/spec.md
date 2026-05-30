## MODIFIED Requirements

### Requirement: 已登录用户自助查看与修改资料
系统 SHALL 允许通过 public tier 的已认证用户读取当前用户详情、修改密码和绑定手机号。

#### Scenario: 读取当前用户详情
- **WHEN** 已认证请求访问 `/public/user-info`
- **THEN** 系统 SHALL 返回 middleware 写入上下文的 userDetailDto
- **AND** userDetailDto 中的 employments SHALL 使用 Employment DTO 结构化 `user`、`position` 和 `organization` 上下文
- **AND** userDetailDto 中的 employments SHALL NOT 返回 username、name、mobile、wxId、posCode、posName、orgCode、orgName、orgType、compCode 和 compName deprecated 顶层扁平字段

#### Scenario: 修改密码
- **WHEN** 已认证用户提交 oldPassword 和 newPassword
- **THEN** 系统 SHALL 确认用户存在且启用
- **AND** 系统 SHALL 拒绝新旧密码相同、旧密码不匹配或新密码强度低于长度 8 且同时包含字母和数字的请求
- **AND** 系统 SHALL 使用配置的 bcrypt rounds 哈希保存新密码

#### Scenario: 绑定手机号
- **WHEN** 已认证用户提交 phoneNumber 和 bindPhone 用途验证码
- **THEN** 系统 SHALL 校验手机号格式、手机号未被已有用户使用、验证码匹配
- **AND** 系统 SHALL 原子消费该 `mobile-code:bindPhone:<phone>` 验证码
- **AND** 系统 SHALL 更新当前用户手机号
- **AND** 系统 SHALL 用新的用户详情刷新当前 global session 内容

#### Scenario: 绑定手机号重复提交被拒绝
- **WHEN** bindPhone 用途验证码已经被一次成功绑定手机号操作消费
- **THEN** 后续使用相同手机号和验证码绑定手机号 SHALL 视为验证码错误
- **AND** 系统 SHALL NOT 再次更新当前用户手机号

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
- **AND** 系统 SHALL NOT 消费该 `mobile-code:<usage>:<phone>` 验证码

#### Scenario: 找回密码解析手机号
- **WHEN** resetPassword 用途请求提供 username
- **THEN** 系统 SHALL 查询启用用户详情并取得绑定手机号
- **AND** 若请求提供 phoneNumber，系统 SHALL 允许真实手机号或脱敏手机号匹配

#### Scenario: 重置密码
- **WHEN** open API 提交 username、手机号、验证码和 newPassword
- **THEN** 系统 SHALL 校验用户存在、手机号匹配和 resetPassword 验证码匹配
- **AND** 系统 SHALL 原子消费该 `mobile-code:resetPassword:<phone>` 验证码
- **AND** 系统 SHALL 哈希保存新密码

#### Scenario: 重置密码重复提交被拒绝
- **WHEN** resetPassword 用途验证码已经被一次成功重置密码操作消费
- **THEN** 后续使用相同用户名、手机号和验证码重置密码 SHALL 视为验证码错误
- **AND** 系统 SHALL NOT 再次更新用户密码
