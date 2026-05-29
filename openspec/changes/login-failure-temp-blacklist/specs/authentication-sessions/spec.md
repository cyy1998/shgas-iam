## MODIFIED Requirements

### Requirement: 登录失败计数与账号暂停
系统 SHALL 对密码登录失败和登录用途手机验证码失败按用户共享失败计数，并在 30 分钟窗口内第 5 次失败时将该用户加入 30 分钟临时黑名单。

#### Scenario: 密码失败累计
- **WHEN** 用户提交错误密码且输入值不等于 `MAGIC_CODE`
- **THEN** 系统 SHALL 在 Redis 有序集合 `login-failures:user:<userId>` 中记录一次失败
- **AND** 失败响应 SHALL 包含当前失败次数与距离临时黑名单生效的剩余次数

#### Scenario: 手机验证码失败累计
- **WHEN** 登录用途手机验证码校验失败且验证码不等于 `MAGIC_CODE`，并且该手机号匹配一个 active user
- **THEN** 系统 SHALL 在同一个用户失败计数中记录一次失败
- **AND** 失败响应 SHALL 包含当前失败次数与距离临时黑名单生效的剩余次数

#### Scenario: 第五次失败进入临时黑名单
- **WHEN** 同一用户在 30 分钟窗口内累计到第 5 次密码或登录验证码失败
- **THEN** 系统 SHALL 在 Redis 中记录该用户 30 分钟临时黑名单
- **AND** 系统 SHALL NOT 将该用户状态更新为 `UserStatus.Pause`
- **AND** 失败响应 SHALL 说明账号已被临时限制 30 分钟

#### Scenario: 临时黑名单内拒绝继续登录
- **WHEN** 处于 30 分钟临时黑名单内的用户再次提交密码登录或登录用途手机验证码登录
- **THEN** 系统 SHALL 拒绝继续执行密码校验或手机验证码校验
- **AND** 响应 SHALL 说明账号仍处于临时限制期

#### Scenario: 临时黑名单过期后恢复尝试
- **WHEN** 30 分钟临时黑名单到期
- **THEN** 系统 SHALL 允许用户重新尝试密码登录和登录用途手机验证码登录

#### Scenario: 成功登录清理失败计数
- **WHEN** 用户通过密码或手机验证码成功登录
- **THEN** 系统 SHALL 删除该用户的 `login-failures:user:<userId>` 失败计数
- **AND** 系统 SHALL 删除该用户的临时黑名单标记
