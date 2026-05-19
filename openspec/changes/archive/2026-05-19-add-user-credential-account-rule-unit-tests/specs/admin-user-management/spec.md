## ADDED Requirements

### Requirement: 管理端用户写操作服务规则具备单元测试覆盖
系统 SHALL 为管理端用户创建、更新、状态变更、删除和密码重置规则提供 Bun 单元测试覆盖，且测试不得依赖真实数据库、Redis、bcrypt 计算或网络。

#### Scenario: 创建用户处理重复用户名和密码来源
- **WHEN** `setUserForAdmin` 被调用且 username 已匹配未软删除用户
- **THEN** 单元测试 SHALL 验证服务抛出“用户名已存在”
- **AND** 单元测试 SHALL 验证 `dto.password` 存在时使用该密码 hash，并返回 `generatedPassword=null`
- **AND** 单元测试 SHALL 验证 `dto.password` 不存在时调用 `generateRandomPassword(8)`、hash 生成密码，并返回 generatedPassword

#### Scenario: 创建用户写入默认值和请求字段
- **WHEN** `setUserForAdmin` 被调用且 username 不存在
- **THEN** 单元测试 SHALL 验证创建用户时设置 username、name、userType、password、mobile、wxId、status、orderNum
- **AND** 单元测试 SHALL 验证 status 缺省时为 `UserStatus.Enable`
- **AND** 单元测试 SHALL 验证 orderNum 缺省时为 0
- **AND** 单元测试 SHALL 验证 mobile 和 wxId 缺省时为 null
- **AND** 单元测试 SHALL 验证成功响应为 `{ username, generatedPassword }`

#### Scenario: 更新用户和状态前确认用户存在
- **WHEN** `updateUser` 或 `updateUserStatus` 被调用且目标用户不存在
- **THEN** 单元测试 SHALL 验证服务抛出“用户不存在”
- **AND** 单元测试 SHALL 验证用户存在时调用 `updateUserByUsername(username, data, tx)`
- **AND** 单元测试 SHALL 验证 `updateUserStatus` 调用 `updateUser(username, { status })`
- **AND** 单元测试 SHALL 验证成功响应为 true

#### Scenario: 删除用户受有效任职约束
- **WHEN** `deleteUser` 被调用且目标用户不存在
- **THEN** 单元测试 SHALL 验证服务抛出“用户不存在”
- **AND** 单元测试 SHALL 验证用户存在但有有效任职时抛出 `UserHasActiveEmploymentError`
- **AND** 单元测试 SHALL 验证没有有效任职时调用 `softDeleteUserByUsername(username, tx)`
- **AND** 单元测试 SHALL 验证成功响应为 true

#### Scenario: 管理端重置用户密码返回新明文密码
- **WHEN** `resetPasswordByUsername` 被调用且目标用户不存在
- **THEN** 单元测试 SHALL 验证服务抛出“用户不存在”
- **AND** 单元测试 SHALL 验证用户存在时调用 `generateRandomPassword(8)`
- **AND** 单元测试 SHALL 验证服务调用 `hash(newPassword, PASSWORD_HASH_ROUNDS)`
- **AND** 单元测试 SHALL 验证服务调用 `userRepository.setPassword(user.id, newPasswordHash, tx)`
- **AND** 单元测试 SHALL 验证成功响应为新的明文密码

### Requirement: 管理端用户查询聚合服务规则具备单元测试覆盖
系统 SHALL 为管理端用户分页搜索和详情聚合规则提供 Bun 单元测试覆盖，且测试不得依赖真实数据库、Redis 或网络。

#### Scenario: 管理端模糊搜索映射分页结果
- **WHEN** `searchUsersFuzzyForAdmin` 被调用
- **THEN** 单元测试 SHALL 验证 rows 通过 `UserDtoSchema` 映射
- **AND** 单元测试 SHALL 验证 total 为 0 时 pages 为 0
- **AND** 单元测试 SHALL 验证 total 大于 0 时 pages 为 `Math.ceil(total / pageSize)`
- **AND** 单元测试 SHALL 验证返回 pageNum、pageSize、total、pages 和 result

#### Scenario: 管理端用户详情聚合任职角色权限
- **WHEN** `getUserDetailByUsernameForAdmin` 被调用且目标用户不存在
- **THEN** 单元测试 SHALL 验证服务抛出“用户不存在”
- **AND** 单元测试 SHALL 验证用户存在时聚合 employments、roles 和 privileges
- **AND** 单元测试 SHALL 验证 roles 和 privileges 去重
- **AND** 单元测试 SHALL 验证 employment detail 中包含岗位、组织、公司、角色和权限信息
