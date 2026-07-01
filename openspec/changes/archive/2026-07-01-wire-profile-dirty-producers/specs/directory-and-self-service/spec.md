## ADDED Requirements

### Requirement: API 自助与内部写操作标记 profile dirty
API 自助和 internal 写操作 SHALL 在成功改变 profile-relevant 源表数据后标记受影响用户 profile dirty。

#### Scenario: 自助绑定手机号标记 dirty
- **WHEN** 已认证用户成功绑定或更新手机号
- **THEN** 系统 SHALL 在同一事务内标记当前用户 profile dirty
- **AND** dirty reason SHALL include `UserUpdated`
- **AND** commit 后系统 SHALL best-effort enqueue 该用户的 rebuild job

#### Scenario: 内部供应商联系人复用已有用户并新增任职
- **WHEN** internal API 注册供应商联系人，手机号匹配已有用户，且系统成功为其新增供应商组织任职
- **THEN** 系统 SHALL 在同一事务内标记该已有用户 profile dirty
- **AND** dirty reason SHALL include `EmploymentUpdated`

#### Scenario: 内部供应商联系人创建新用户
- **WHEN** internal API 注册供应商联系人且系统成功创建新用户和任职
- **THEN** 系统 SHALL 在同一事务内标记新用户 profile dirty
- **AND** dirty reasons SHALL include `UserUpdated` and `EmploymentUpdated`
- **AND** commit 后系统 SHALL best-effort enqueue 该用户的 rebuild job

#### Scenario: 内部供应商联系人无 profile-relevant 变化
- **WHEN** internal API 注册供应商联系人但已有用户已经存在相同 active employment
- **THEN** 系统 SHALL NOT 要求创建新的 dirty 记录
- **AND** 系统 SHALL 保持现有成功响应语义

#### Scenario: 内部组织更新标记 descendant users dirty
- **WHEN** internal API 成功更新供应商组织或其它组织的 profile-relevant 字段
- **THEN** 系统 SHALL 在同一事务内解析该组织及 descendant 组织下 active employments 的用户
- **AND** 系统 SHALL 标记这些用户 profile dirty
- **AND** dirty reason SHALL include `OrganizationUpdated`

#### Scenario: 内部创建空供应商组织不要求 dirty
- **WHEN** internal API 成功创建尚无任职用户的供应商组织
- **THEN** 系统 SHALL NOT 要求为该组织创建 user profile dirty 记录
- **AND** 后续联系人注册 SHALL 由联系人/任职写路径标记用户 dirty
