## MODIFIED Requirements

### Requirement: Profile builder preserves identity detail and active search visibility
系统 SHALL 在 `@iam/user-profile-read-model` 提供用户画像 builder，批量从规范化写模型构建当前 schema version 的用户画像；builder SHALL 为 IAM 用户档案保留可读取的 detail，并通过 `searchVisible` 控制搜索可见性。

#### Scenario: Build profile detail
- **WHEN** builder 为用户构建 profile
- **THEN** `detail` SHALL 符合 `UserDetailDto` 契约，并包含 active employments、每个任职的 organization context、position summary、role codes 和 privilege codes
- **AND** `detail` SHALL NOT 包含 ORCAS 会话身份字段

#### Scenario: Build profile search document
- **WHEN** builder 为用户构建 profile
- **THEN** `search_doc` SHALL 使用独立 schema 保存 user 字段和 employments 检索文档
- **AND** 每个 employment search document SHALL 包含 organization ancestor codes、ancestor depths、ancestor keys、position code、role codes、privilege codes 和 primary 标记

#### Scenario: Active-only relationship filtering
- **WHEN** 任职、岗位、角色或权限处于删除或禁用状态
- **THEN** builder SHALL 仅把符合当前 `apps/api` active 视角的关系数据写入 `detail` 和 `search_doc`

#### Scenario: Inactive user detail remains hidden from search
- **WHEN** 用户处于删除或禁用状态
- **THEN** builder MAY 保留该用户当前 schema version 的 `detail`，以支持按身份读取的一致返回
- **AND** builder SHALL 将该 profile 标记为不可搜索
- **AND** 搜索查询 SHALL NOT 返回不可搜索的 profile

#### Scenario: Organization status does not filter path
- **WHEN** 任职组织路径中的组织未删除但 status 不是启用
- **THEN** builder SHALL 保留该组织路径节点
- **AND** builder MUST 排除 `is_delete=true` 的组织路径节点
