## ADDED Requirements

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
