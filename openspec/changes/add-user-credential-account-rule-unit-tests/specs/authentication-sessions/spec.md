## ADDED Requirements

### Requirement: public 用户密码校验与账号暂停服务规则具备单元测试覆盖
系统 SHALL 为 public API 用户服务中的密码校验和账号暂停规则提供 Bun 单元测试覆盖，且测试不得依赖真实数据库、Redis、bcrypt 计算或网络。

#### Scenario: 密码校验处理用户不存在和无密码用户
- **WHEN** `checkPassword` 被调用且用户不存在
- **THEN** 单元测试 SHALL 验证服务抛出“用户不存在”
- **AND** 单元测试 SHALL 验证用户没有密码且 `NODE_ENV=production` 时返回 false
- **AND** 单元测试 SHALL 验证用户没有密码且非 production 时，输入 `DEFAULT_USER_PASSWORD` 返回 true
- **AND** 单元测试 SHALL 验证用户没有密码且输入非默认密码返回 false

#### Scenario: 密码校验透传 bcrypt compare 结果
- **WHEN** `checkPassword` 被调用且用户有密码
- **THEN** 单元测试 SHALL 验证服务调用 `compare(inputPassword, user.password)`
- **AND** 单元测试 SHALL 验证 `compare` 返回 true 时服务返回 true
- **AND** 单元测试 SHALL 验证 `compare` 返回 false 时服务返回 false

#### Scenario: 暂停启用账号透传 repository 结果
- **WHEN** `pauseEnabledUser` 被调用
- **THEN** 单元测试 SHALL 验证服务调用 `userRepository.updateEnabledUserStatus(userId, UserStatus.Pause)`
- **AND** 单元测试 SHALL 验证 repository 返回暂停后的用户时服务透传该用户
- **AND** 单元测试 SHALL 验证 repository 返回 null 时服务透传 null
