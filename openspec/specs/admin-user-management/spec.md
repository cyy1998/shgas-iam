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
系统 SHALL 查询未软删除用户详情，展示该用户所有未软删除任职，并仅从当前正常任职聚合用户级角色和权限。

#### Scenario: 用户不存在
- **WHEN** 管理端按 username 查询不到未软删除用户
- **THEN** 系统 SHALL 拒绝请求并报告用户不存在

#### Scenario: 用户详情包含全部未软删除任职
- **WHEN** 管理端按 username 查询到用户
- **THEN** 系统 SHALL 查询该用户 status 为 Enable、Pause 或 Disable 且未软删除的 employments
- **AND** 用户详情 SHALL 在 employments 中返回这些任职的岗位、实际任职组织、完整组织链、公司节点、状态、起止时间、角色和权限信息
- **AND** 用户详情 SHALL 在每条 employment 中使用结构化 `user`、`position` 和 `organization` 字段表达用户、岗位和组织上下文
- **AND** 用户详情 SHALL NOT 在每条 employment 顶层返回 username、name、mobile、wxId、posCode、posName、orgCode、orgName、orgType、compCode 和 compName deprecated 扁平字段

#### Scenario: 用户级角色权限只统计正常任职
- **WHEN** 管理端按 username 查询到用户且该用户存在多个状态的任职
- **THEN** 系统 SHALL 仅为 status 为 Enable 且未软删除的 employments 查询通过岗位、组织或任职直接关联得到的 active roles
- **AND** 系统 SHALL 仅通过这些正常任职关联的 role-privilege 关系查询 privileges
- **AND** 用户详情 SHALL 包含从正常任职聚合并去重后的 roles 和 privileges
- **AND** 用户详情 SHALL NOT 将 Pause 或 Disable 任职关联的 roles 或 privileges 计入用户级 roles 和 privileges

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

### Requirement: Admin User Audit Event Encapsulation
管理端用户 mutation SHALL 继续写入既有 `admin.user.*` 审计事件，并 SHALL 将用户审计事件 payload 拼装从 `user.service.ts` 主体中移入 admin-api 审计事件 helper。

#### Scenario: Admin user create audit remains unchanged
- **WHEN** 管理员成功创建用户
- **THEN** 系统 SHALL 继续写入 `action = "admin.user.create"` 的审计记录
- **AND** 记录 SHALL 包含管理员 actor、目标用户、请求上下文和脱敏后的用户 details
- **AND** 审计 payload SHALL 由 admin user audit helper 构造

#### Scenario: Admin user update and status audit remain unchanged
- **WHEN** 管理员成功更新用户或变更用户状态
- **THEN** 系统 SHALL 继续写入 `admin.user.update` 或 `admin.user.status_update` 审计记录
- **AND** patch 中的手机号 SHALL 使用统一审计脱敏 helper
- **AND** 审计 payload SHALL 由 admin user audit helper 构造

#### Scenario: Admin user delete and reset password audit remain unchanged
- **WHEN** 管理员成功删除用户或重置用户密码
- **THEN** 系统 SHALL 继续写入 `admin.user.delete` 或 `admin.user.reset_password` 审计记录
- **AND** 密码明文和密码 hash MUST NOT 出现在审计 details 中
- **AND** 审计 payload SHALL 由 admin user audit helper 构造

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
- **AND** 单元测试 SHALL 验证服务使用 configured password hash rounds 调用 `hash(newPassword, rounds)`
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
- **AND** 单元测试 SHALL 验证用户存在时返回正常、暂停和结束状态的未软删除 employments
- **AND** 单元测试 SHALL 验证用户级 roles 和 privileges 只从正常任职聚合并去重
- **AND** 单元测试 SHALL 验证暂停或结束任职的 roles 和 privileges 不计入用户级 roles 和 privileges
- **AND** 单元测试 SHALL 验证 employment detail 中包含结构化 user、position、organization 上下文、状态、起止时间、角色和权限信息，且不包含 deprecated 顶层扁平字段

### Requirement: 管理端用户生命周期变更撤销 Session Kernel 会话
系统 SHALL 在管理端用户状态、删除和密码重置操作成功提交后，通过 Session Kernel 主动撤销目标用户相关 PrincipalSession 及其派生 custom SSO/OIDC 对象。

#### Scenario: 用户状态变为非启用后撤销会话
- **WHEN** 管理员将未软删除用户的 status 从 `Enable` 变更为 `Disable` 或其他非启用状态
- **THEN** 系统 SHALL 在用户状态事务成功提交后注册 best-effort afterCommit 撤销任务
- **AND** 撤销任务 SHALL 调用 admin-api Session Revocation port，以 `principalType=user` 和 `subjectId=String(user.id)` 撤销该用户 sessions
- **AND** revocation reason SHALL 为 `user_disabled`
- **AND** 撤销任务 SHALL 覆盖该用户 PrincipalSession 下的 custom SSO 与 OIDC 派生对象

#### Scenario: 用户删除后撤销会话
- **WHEN** 管理员删除不存在 active employment 的用户且软删除事务成功提交
- **THEN** 系统 SHALL 注册 best-effort afterCommit 撤销任务
- **AND** 撤销任务 SHALL 调用 admin-api Session Revocation port 撤销该用户 sessions
- **AND** revocation reason SHALL 为 `user_deleted`
- **AND** 撤销任务 SHALL 在 Session Kernel RevokeSummary 中记录 revoked、alreadyRevoked、missing 和 cleanup 计数

#### Scenario: 用户删除被业务约束拒绝时不撤销会话
- **WHEN** 管理员尝试删除仍存在 active employment 的用户
- **THEN** 系统 SHALL 拒绝删除并保持原有错误语义
- **AND** 系统 SHALL NOT 注册 Session Kernel 撤销任务

#### Scenario: 管理员重置密码后撤销旧会话
- **WHEN** 管理员为存在用户重置密码且新密码 hash 已保存
- **THEN** 系统 SHALL 在事务成功提交后注册 best-effort afterCommit 撤销任务
- **AND** 撤销任务 SHALL 调用 admin-api Session Revocation port 撤销该用户 sessions
- **AND** revocation reason SHALL 为 `admin_revoke`
- **AND** 如果当前请求携带可识别的 PrincipalSession 且目标用户就是当前管理员，port MAY 保留当前 PrincipalSession 本体
- **AND** port SHALL 仍撤销被保留 PrincipalSession 下的 custom SSO/OIDC 派生对象，除非调用方显式要求保留派生对象

#### Scenario: 会话撤销失败不改变用户操作结果
- **WHEN** 用户状态变更、删除或重置密码操作已经提交
- **AND** afterCommit Session Kernel revoke 或 adapter cleanup 失败
- **THEN** 管理端操作 SHALL 仍按业务成功返回
- **AND** 系统 SHALL 记录 revoke summary 或 failure system log
- **AND** 失败日志 MUST NOT 包含 password、password hash、external session token、cookie、Authorization 或 client secret

#### Scenario: 用户服务测试覆盖撤销触发
- **WHEN** 执行 admin-api 用户服务单元测试
- **THEN** 测试 SHALL 覆盖非启用状态、删除、重置密码触发 Session Revocation port
- **AND** 测试 SHALL 覆盖删除业务约束失败时不触发撤销
- **AND** 测试 SHALL 覆盖 revoke failure 走 best-effort 且业务操作保持成功

### Requirement: 管理端用户写操作标记 profile dirty
管理端用户写操作 SHALL 在成功提交后触发对应用户的 API profile 重建。

#### Scenario: 创建用户标记 dirty
- **WHEN** 管理端成功创建用户
- **THEN** 系统 SHALL 在同一事务内标记新用户 profile dirty
- **AND** dirty reason SHALL include `UserUpdated`
- **AND** commit 后系统 SHALL best-effort enqueue 该用户的 rebuild job

#### Scenario: 更新用户资料标记 dirty
- **WHEN** 管理端成功更新用户 username、name、mobile、wxId、userType、status、orderNum 或删除状态
- **THEN** 系统 SHALL 在同一事务内标记该用户 profile dirty
- **AND** commit 后系统 SHALL best-effort enqueue 该用户的 rebuild job

#### Scenario: 禁用或删除用户同时保留 session revoke
- **WHEN** 管理端禁用或删除用户
- **THEN** 系统 SHALL 保持现有 Session Kernel 撤销行为
- **AND** 系统 SHALL 同时标记该用户 profile dirty
- **AND** profile dirty enqueue failure SHALL NOT 阻止 session revoke afterCommit task 注册

#### Scenario: 重置密码不标记 profile dirty
- **WHEN** 管理端仅重置用户密码且没有修改 profile 文档字段
- **THEN** 系统 SHALL NOT 因密码 hash 变化标记 profile dirty
- **AND** 系统 SHALL 保持现有 session revoke 行为

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
