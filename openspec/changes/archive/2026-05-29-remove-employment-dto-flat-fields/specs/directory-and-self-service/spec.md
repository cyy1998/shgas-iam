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
- **AND** 系统 SHALL 更新当前用户手机号
- **AND** 系统 SHALL 用新的用户详情刷新当前 global session 内容

### Requirement: 内部供应商注册
系统 SHALL 通过 internal API 支持供应商组织注册和供应商联系人注册。

#### Scenario: 注册供应商组织已存在
- **WHEN** internal API 注册供应商组织且 orgCode 已匹配启用未软删除组织
- **THEN** 系统 SHALL 返回 true 且不创建新组织

#### Scenario: 注册供应商组织不存在
- **WHEN** internal API 注册供应商组织且 orgCode 不存在
- **THEN** 系统 SHALL 以 `OrganizationType.External`、`isVirtual=true` 和请求 parentOrg 创建组织
- **AND** 响应 SHALL 返回 true

#### Scenario: 注册供应商联系人已有用户
- **WHEN** internal API 注册联系人且 mobile 匹配启用用户
- **THEN** 系统 SHALL 若该用户在供应商组织和默认岗位下没有 active employment，则创建该 employment
- **AND** 新 employment SHALL 只写入供应商组织作为实际任职组织
- **AND** 系统 SHALL NOT 将供应商父组织作为 `employment.compId` 写入

#### Scenario: 注册供应商联系人新用户
- **WHEN** internal API 注册联系人且 mobile 未匹配启用用户
- **THEN** 系统 SHALL 创建 `UserType.External`、password 为 null 的用户
- **AND** 系统 SHALL 为该用户创建供应商组织和默认岗位下的 employment
- **AND** 新 employment SHALL 只写入供应商组织作为实际任职组织
- **AND** 系统 SHALL NOT 将供应商父组织作为 `employment.compId` 写入

#### Scenario: 供应商 employment 返回结构化上下文
- **WHEN** public 或 internal API 返回供应商联系人 employment
- **THEN** 系统 SHALL 返回结构化 `user`、`position` 和 `organization` 上下文
- **AND** 系统 SHALL NOT 返回 username、name、mobile、wxId、posCode、posName、orgCode、orgName、orgType、compCode 和 compName deprecated 顶层扁平字段
- **AND** 当供应商组织链中没有 Company 节点时 `organization.companyNodes` SHALL 为空数组
