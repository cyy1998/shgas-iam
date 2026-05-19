# admin-user-management Specification

## Purpose
描述当前管理端用户主数据能力，包括管理员鉴权后的用户搜索、详情聚合、创建、更新、状态变更、软删除、密码重置和候选密码生成。该 baseline 只记录当前代码行为，不新增用户生命周期策略。

## Requirements
### Requirement: 管理端暴露用户管理操作
系统 SHALL 通过管理端 REST 和 tRPC 暴露用户搜索、详情、创建、更新、状态变更、删除、重置密码和候选密码生成操作。

#### Scenario: REST 用户接口可用
- **WHEN** 调用 `/admin/users` 下的搜索、详情、创建、更新、状态变更、删除、重置密码或候选密码生成路由
- **THEN** 系统 SHALL 校验请求输入并调用对应 user operation

#### Scenario: tRPC 用户接口可用
- **WHEN** 管理后台通过 `admin.user` tRPC router 调用用户操作
- **THEN** 系统 SHALL 复用与 REST 路由一致的 user operation

### Requirement: 管理端搜索用户
系统 SHALL 在未软删除用户中按分页条件搜索用户，并返回分页结果。

#### Scenario: 模糊和精确条件搜索
- **WHEN** 管理端提交用户分页查询条件
- **THEN** 系统 SHALL 在 `username`、`name`、`mobile`、`wxId` 中对 text 做模糊匹配
- **AND** 系统 SHALL 按 userTypes、usernames、phones、wxIds 和 statuses 精确过滤
- **AND** 系统 SHALL 只返回 `isDelete=false` 的用户

#### Scenario: 搜索结果分页
- **WHEN** 用户搜索返回结果
- **THEN** 系统 SHALL 按 `orderNum` 和 `id` 排序
- **AND** 系统 SHALL 返回 result、total、pageNum、pageSize 和 pages

### Requirement: 管理端查询用户详情聚合权限
系统 SHALL 查询未软删除用户详情，并聚合该用户当前启用雇佣关联的角色和权限。

#### Scenario: 用户不存在
- **WHEN** 管理端按 username 查询不到未软删除用户
- **THEN** 系统 SHALL 拒绝请求并报告用户不存在

#### Scenario: 用户详情包含雇佣角色权限
- **WHEN** 管理端按 username 查询到用户
- **THEN** 系统 SHALL 查询该用户 status 为 Enable 且未软删除的 employments
- **AND** 系统 SHALL 为每个 employment 查询通过岗位、组织或任职直接关联得到的 active roles
- **AND** 系统 SHALL 通过 role-privilege 关系查询 privileges
- **AND** 用户详情 SHALL 包含 employments、去重后的 roles 和去重后的 privileges

### Requirement: 管理端创建用户
系统 SHALL 在事务内创建未软删除 username 不重复的用户，并对明文密码进行哈希保存。

#### Scenario: 创建重复 username
- **WHEN** 创建用户请求的 username 已匹配未软删除用户
- **THEN** 系统 SHALL 拒绝创建并报告用户名已存在

#### Scenario: 创建时提供密码
- **WHEN** 创建用户请求提供 password
- **THEN** 系统 SHALL 使用配置的 bcrypt rounds 哈希该 password
- **AND** 系统 SHALL 创建用户记录
- **AND** 响应 SHALL 返回 username 与 `generatedPassword=null`

#### Scenario: 创建时未提供密码
- **WHEN** 创建用户请求未提供 password
- **THEN** 系统 SHALL 生成 8 位随机明文密码
- **AND** 系统 SHALL 哈希后保存
- **AND** 响应 SHALL 返回 username 与生成的明文密码

### Requirement: 管理端更新用户与状态
系统 SHALL 在更新用户或用户状态前确认目标用户未软删除。

#### Scenario: 更新不存在用户
- **WHEN** 管理端更新或变更状态的 username 无法匹配未软删除用户
- **THEN** 系统 SHALL 拒绝请求并报告用户不存在

#### Scenario: 更新用户字段
- **WHEN** 管理端更新用户请求通过输入校验且目标用户存在
- **THEN** 系统 SHALL 更新 name、mobile、wxId、userType、status 或 orderNum 中请求包含的字段

#### Scenario: 更新用户状态
- **WHEN** 管理端状态变更请求通过输入校验且目标用户存在
- **THEN** 系统 SHALL 将请求中的 `UserStatus` 写入该用户记录

### Requirement: 管理端删除用户受活跃雇佣约束
系统 SHALL 仅在用户不存在 active employment 时软删除用户。

#### Scenario: 用户存在活跃雇佣时拒绝删除
- **WHEN** 待删除用户存在 status 为 Enable 且未软删除的 employment
- **THEN** 系统 SHALL 拒绝删除并报告用户仍存在活跃雇佣

#### Scenario: 满足删除约束时软删除
- **WHEN** 待删除用户存在且不存在 active employment
- **THEN** 系统 SHALL 将该用户 `isDelete` 更新为 `true`

### Requirement: 管理端重置和生成密码
系统 SHALL 支持管理员重置用户密码和生成候选密码。

#### Scenario: 重置不存在用户密码
- **WHEN** 管理端为不存在或已软删除 username 重置密码
- **THEN** 系统 SHALL 拒绝请求并报告用户不存在

#### Scenario: 重置用户密码
- **WHEN** 管理端为存在用户重置密码
- **THEN** 系统 SHALL 生成 8 位随机明文密码
- **AND** 系统 SHALL 使用配置的 bcrypt rounds 哈希并保存新密码
- **AND** 响应 SHALL 返回新的明文密码

#### Scenario: 生成候选密码
- **WHEN** 管理端调用候选密码生成操作
- **THEN** 系统 SHALL 返回一个 8 位随机密码
- **AND** 系统 SHALL NOT 修改任何用户记录

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

## Open Questions
- 创建用户时只校验 username 重复，没有显式校验 mobile 或 wxId 唯一性；是否需要作为业务约束需要人工确认。
- 管理端重置密码不会清理已有 Redis session；用户重置后旧 session 是否继续有效需后续单独确认。
- `generatedPassword` 和 reset password 都返回明文密码，这是当前行为；交付渠道、展示次数和审计要求未在代码中体现。
- 更新用户 repository 的 where 只按 username 更新，service 已先校验未软删除；并发软删除下的语义需要人工确认。
- 管理端权限由 tier middleware 校验 admin client 和 admin role，本 spec 不声明字段级或操作级权限。

## Evidence Review
- 管理端暴露用户管理操作: 证据 `apps/admin-api/src/routes/admin/user/user.routes.ts`, `apps/admin-api/src/routes/admin/user/user.handlers.ts`, `apps/admin-api/src/routes/admin/user/user.ops.ts`, `apps/admin-api/src/routes/admin/user/user.trpc.ts`。状态: 有代码证据。
- 管理端搜索用户: 证据 `apps/admin-api/src/services/user/user.schema.ts`, `apps/admin-api/src/services/user/user.repository.ts`, `apps/admin-api/src/services/user/user.service.ts`。状态: 有代码证据；无专门测试。
- 管理端查询用户详情聚合权限: 证据 `apps/admin-api/src/services/user/user.service.ts`, `apps/admin-api/src/services/employment/employment.repository.ts`, `apps/admin-api/src/services/role/role.repository.ts`, `apps/admin-api/src/services/privilege/privilege.repository.ts`, `packages/domain/src/user/schema.ts`。状态: 有代码证据；角色来源语义由 authorization-model spec 进一步描述。
- 管理端创建用户: 证据 `apps/admin-api/src/services/user/user.service.ts`, `apps/admin-api/src/services/user/user.repository.ts`, `apps/admin-api/src/services/user/user.schema.ts`, `packages/db/src/schema/core/users.ts`。状态: 有代码证据。
- 管理端更新用户与状态: 证据 `apps/admin-api/src/services/user/user.service.ts`, `apps/admin-api/src/services/user/user.repository.ts`, `packages/contracts/src/enums/user.status.ts`。状态: 有代码证据。
- 管理端删除用户受活跃雇佣约束: 证据 `apps/admin-api/src/services/user/user.service.ts`, `apps/admin-api/src/services/user/user.repository.ts`, `packages/db/src/schema/core/employments.ts`。状态: 有代码证据。
- 管理端重置和生成密码: 证据 `apps/admin-api/src/services/user/user.service.ts`, `apps/admin-api/src/routes/admin/user/user.ops.ts`, `@iam/api-core/utils` 中的 `generateRandomPassword` 调用点。状态: 有代码证据；密码展示流程需人工确认。
