## ADDED Requirements

### Requirement: public 用户凭据与手机号服务规则具备单元测试覆盖
系统 SHALL 为 public API 用户服务中的密码修改、找回密码和手机号绑定规则提供 Bun 单元测试覆盖，且测试不得依赖真实数据库、Redis、短信服务、bcrypt 计算或网络。

#### Scenario: 修改密码拒绝无效请求
- **WHEN** `setPassword` 被调用且用户不存在
- **THEN** 单元测试 SHALL 验证服务抛出“用户名不存在”
- **AND** 单元测试 SHALL 验证旧密码与新密码相同时抛出“旧密码与新密码相同”
- **AND** 单元测试 SHALL 验证旧密码校验失败时抛出“旧密码错误”
- **AND** 单元测试 SHALL 验证新密码长度小于 8、缺少字母或缺少数字时抛出“新密码强度过低”

#### Scenario: 修改密码成功保存哈希密码
- **WHEN** `setPassword` 被调用且用户存在、旧密码匹配、新密码满足强度要求
- **THEN** 单元测试 SHALL 验证服务调用 `hash(newPassword, PASSWORD_HASH_ROUNDS)`
- **AND** 单元测试 SHALL 验证服务调用 `userRepository.setPassword(user.id, hashedPassword, tx)`
- **AND** 单元测试 SHALL 验证成功响应为 true

#### Scenario: 找回密码校验用户手机号和验证码
- **WHEN** `resetPassword` 被调用且用户不存在
- **THEN** 单元测试 SHALL 验证服务抛出“用户不存在”
- **AND** 单元测试 SHALL 验证用户手机号与输入手机号不匹配时抛出“用户名与手机号不匹配”
- **AND** 单元测试 SHALL 验证 resetPassword 验证码错误时抛出“验证码错误”

#### Scenario: 找回密码成功保存新密码
- **WHEN** `resetPassword` 被调用且用户、手机号和验证码校验通过
- **THEN** 单元测试 SHALL 验证服务调用 `hash(newPassword, PASSWORD_HASH_ROUNDS)`
- **AND** 单元测试 SHALL 验证服务调用 `userRepository.setPassword(user.id, hashedPassword, tx)`
- **AND** 单元测试 SHALL 验证成功响应为 true
- **AND** 单元测试 SHALL 记录当前实现不会复用 `setPassword` 的密码强度校验作为待确认风险

#### Scenario: 绑定手机号按顺序校验并写入
- **WHEN** `setMobile` 被调用
- **THEN** 单元测试 SHALL 验证服务按手机号格式校验、重复手机号检查、验证码检查、写入手机号的顺序执行
- **AND** 单元测试 SHALL 验证手机号格式无效时抛出“无效手机号”
- **AND** 单元测试 SHALL 验证手机号已存在时抛出“手机号已存在”
- **AND** 单元测试 SHALL 验证 bindPhone 验证码错误时抛出“验证码错误”
- **AND** 单元测试 SHALL 验证验证码正确时调用 `userRepository.setMobile(userId, phoneNumber, tx)`
- **AND** 单元测试 SHALL 验证成功后返回 `getUserDetailById(userId)` 的结果
