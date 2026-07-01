# directory-and-self-service Specification

## Purpose
描述当前 public、open 和 internal API 中已实现的用户自助、短信验证码、公开脱敏查询、组织/用户目录查询，以及供应商组织和联系人注册行为。该 baseline 不替代认证/SSO spec，也不新增用户枚举治理策略。
## Requirements
### Requirement: 已登录用户自助查看与修改资料
系统 SHALL 允许通过 public tier 的已认证用户读取当前用户详情、修改密码和绑定手机号。

#### Scenario: 读取当前用户详情
- **WHEN** 已认证请求访问 `/public/user-info`
- **THEN** 系统 SHALL 在认证中完成 live session、client 和用户可用性校验
- **AND** 系统 SHALL 返回从当前 schema version profile 读取并写入 middleware 上下文的 userDetailDto
- **AND** userDetailDto 中的 employments SHALL 使用 Employment DTO 结构化 `user`、`position` 和 `organization` 上下文
- **AND** userDetailDto 中的 employments SHALL NOT 返回 username、name、mobile、wxId、posCode、posName、orgCode、orgName、orgType、compCode 和 compName deprecated 顶层扁平字段
- **AND** 如果 profile 缺失或 schema version 不匹配，系统 SHALL 拒绝请求而不是 fallback 到源表聚合

#### Scenario: 修改密码
- **WHEN** 已认证用户提交 oldPassword 和 newPassword
- **THEN** 系统 SHALL 确认用户存在且启用
- **AND** 系统 SHALL 拒绝新旧密码相同、旧密码不匹配或新密码强度低于长度 8 且同时包含字母和数字的请求
- **AND** 系统 SHALL 使用配置的 bcrypt rounds 哈希保存新密码

#### Scenario: 绑定手机号
- **WHEN** 已认证用户提交 phoneNumber 和 bindPhone 用途验证码
- **THEN** 系统 SHALL 使用源表校验手机号格式、手机号未被已有用户使用、当前用户仍启用且未删除、验证码匹配
- **AND** 系统 SHALL 原子消费该 `mobile-code:bindPhone:<phone>` 验证码
- **AND** 系统 SHALL 更新当前用户手机号
- **AND** 系统 SHALL 返回成功布尔结果
- **AND** 系统 SHALL 允许后续 profile 读取在重建前返回旧手机号

#### Scenario: 绑定手机号重复提交被拒绝
- **WHEN** bindPhone 用途验证码已经被一次成功绑定手机号操作消费
- **THEN** 后续使用相同手机号和验证码绑定手机号 SHALL 视为验证码错误
- **AND** 系统 SHALL NOT 再次更新当前用户手机号

### Requirement: Public User Service Responsibility Boundaries
系统 SHALL 保持现有 public API 用户服务导出函数和业务行为，同时将用户详情读取、用户搜索、密码规则、手机号绑定校验和权限委托查询聚合拆分为独立 helper 或 profile query service。`user.service.ts` SHALL 作为 use-case facade 保留事务边界和对外编排职责。

#### Scenario: 用户详情读取委托给 profile query service
- **WHEN** `getUserDetailById`、`getUserDetailByUsername`、`getUserDetailByMobile` 或 `getUserDetailByWxId` 被调用用于 API 资料读取
- **THEN** 系统 SHALL 从 `UserProfileQueryService` 返回包含 employments、roles 和 privileges 的用户详情 DTO
- **AND** 对外函数签名和未找到异常语义 SHALL 保持不变
- **AND** 系统 SHALL NOT fallback 到源表详情聚合

#### Scenario: API live user repository 依赖面被精简
- **WHEN** API 用户详情与用户搜索读取已经切换到 profile
- **THEN** `apps/api` 的 user live repository/port 依赖 SHALL 只保留认证边界、敏感校验和写操作需要的方法
- **AND** profile 已承接的用户详情聚合和用户目录搜索 SHALL NOT 继续依赖源表 repository
- **AND** `searchUsers` SHALL NOT 作为 `UserService`、权限委托搜索 helper 或 API route composition 的 live repository 依赖

#### Scenario: 密码 helper 保持现有规则
- **WHEN** `setPassword` 被调用
- **THEN** 系统 SHALL 继续拒绝用户不存在、新旧密码相同、旧密码不匹配或新密码强度不足的请求
- **AND** 系统 SHALL 使用密码 helper 完成强度校验、密码验证和 hash
- **AND** 系统 SHALL 使用配置的 bcrypt rounds 保存新密码 hash

#### Scenario: 找回密码保持现有强度行为
- **WHEN** `resetPassword` 被调用且用户、手机号和验证码校验通过
- **THEN** 系统 SHALL 继续 hash 并保存 newPassword
- **AND** 系统 SHALL NOT 在本变更中新增自助改密密码强度校验要求

#### Scenario: 手机号绑定校验委托给 helper
- **WHEN** `setMobile` 被调用
- **THEN** 系统 SHALL 继续按手机号格式、重复手机号、bindPhone 验证码、写入手机号的顺序执行
- **AND** 手机号绑定前置校验 SHALL 位于独立 helper 中
- **AND** 验证成功后系统 SHALL 返回成功布尔结果而不是依赖 profile 刷新后的用户详情

#### Scenario: 权限委托查询委托给 helper
- **WHEN** `searchUsersWithPrivilegeDelegation` 被调用
- **THEN** 系统 SHALL 继续要求 `ancestorOrgCodes` 仅包含一个元素
- **AND** 系统 SHALL 使用 profile 搜索返回用户 DTO 列表，并使用 live 权限委托数据返回权限委托 DTO 列表
- **AND** 用户搜索与权限委托查询聚合 SHALL 位于独立 helper 中

### Requirement: 公开短信验证码与找回密码
系统 SHALL 通过 open tier 支持发送/校验短信验证码和重置密码，并在发送短信验证码前强制要求有效 Cap token。

#### Scenario: 发送验证码
- **WHEN** open API 请求发送验证码并携带有效 Cap token
- **THEN** 系统 SHALL 消费该 Cap token
- **AND** 系统 SHALL 校验目标手机号格式
- **AND** 除 bindPhone 用途外，系统 SHALL 要求手机号已存在
- **AND** 系统 SHALL 调用短信客户端发送验证码并把验证码保存到 `mobile-code:<usage>:<phone>`，TTL 为 180 秒

#### Scenario: 发送验证码缺少 Cap token
- **WHEN** open API 请求发送验证码但未携带有效 Cap token
- **THEN** 系统 SHALL 拒绝调用短信客户端
- **AND** 响应 SHALL 使用可被前端稳定识别的业务码表示需要人机校验

#### Scenario: 校验验证码
- **WHEN** open API 请求校验验证码
- **THEN** 系统 SHALL 按 usage 和 phone 读取 Redis 中保存的验证码
- **AND** 响应 SHALL 返回 `{ result: boolean }`
- **AND** 系统 SHALL NOT 消费该 `mobile-code:<usage>:<phone>` 验证码

#### Scenario: 找回密码解析手机号
- **WHEN** resetPassword 用途请求提供 username
- **THEN** 系统 SHALL 查询源表中当前启用且未软删除用户并取得绑定手机号
- **AND** 若请求提供 phoneNumber，系统 SHALL 允许真实手机号或脱敏手机号匹配
- **AND** 系统 SHALL NOT 使用可能过期的 profile 手机号作为找回密码校验依据

#### Scenario: 重置密码
- **WHEN** open API 提交 username、手机号、验证码和 newPassword
- **THEN** 系统 SHALL 校验用户存在、手机号匹配和 resetPassword 验证码匹配
- **AND** 系统 SHALL 原子消费该 `mobile-code:resetPassword:<phone>` 验证码
- **AND** 系统 SHALL 哈希保存新密码

#### Scenario: 重置密码重复提交被拒绝
- **WHEN** resetPassword 用途验证码已经被一次成功重置密码操作消费
- **THEN** 后续使用相同用户名、手机号和验证码重置密码 SHALL 视为验证码错误
- **AND** 系统 SHALL NOT 再次更新用户密码

### Requirement: 公开脱敏用户信息
系统 SHALL 通过 open tier 按 username 返回用户的脱敏基本信息，并在异常查询条件下要求有效 Cap token。

#### Scenario: 查询脱敏用户信息
- **WHEN** 调用 `/open/users/userInfo` 并提供 username，且请求未命中 `openUserInfoLookup` 异常触发策略
- **THEN** 系统 SHALL 查询当前 schema version profile 中启用且未软删除用户详情
- **AND** 响应 SHALL 返回 username、name 和脱敏 mobile
- **AND** 响应 SHALL NOT 暴露 profile version 或 rebuiltAt

#### Scenario: 异常查询缺少 Cap token
- **WHEN** 调用 `/open/users/userInfo` 并提供 username，且请求命中 `openUserInfoLookup` 异常触发策略但未携带有效 Cap token
- **THEN** 系统 SHALL 拒绝执行用户详情查询
- **AND** 响应 SHALL 使用可被前端稳定识别的业务码表示需要人机校验

#### Scenario: 异常查询携带有效 Cap token
- **WHEN** 调用 `/open/users/userInfo` 并提供 username，且请求命中 `openUserInfoLookup` 异常触发策略并携带有效 Cap token
- **THEN** 系统 SHALL 消费该 Cap token
- **AND** 系统 SHALL 查询当前 schema version profile 中启用且未软删除用户详情
- **AND** 响应 SHALL 返回 username、name 和脱敏 mobile

#### Scenario: 手机号脱敏
- **WHEN** 用户手机号长度大于 7
- **THEN** 系统 SHALL 保留前 3 位和后 4 位，中间替换为 `****`

#### Scenario: 脱敏用户查询更新 Cap 异常状态
- **WHEN** `/open/users/userInfo` 被调用
- **THEN** 系统 SHALL 更新 `openUserInfoLookup` action 在 IP 维度的短窗口查询状态

### Requirement: public/internal 目录查询
系统 SHALL 通过 public 和 internal API 查询启用且未软删除的组织与用户目录。

#### Scenario: 查询组织目录
- **WHEN** public 或 internal API 提交组织查询条件
- **THEN** 系统 SHALL 只返回 status 为 Enable 且未软删除的组织
- **AND** 系统 SHALL 支持按祖先、后代、层级、类型和组织编码条件过滤

#### Scenario: 查询用户目录
- **WHEN** public 或 internal API 提交用户查询条件
- **THEN** 系统 SHALL 只返回当前 schema version profile 中 `search_visible=true` 的用户
- **AND** 系统 SHALL 支持按 username、phone、wxId、组织祖先、组织深度、岗位编码和角色编码过滤
- **AND** 用户目录查询 SHALL 使用 profile search document 并保持旧 `UserQueryDto` 的同一 employment nested 过滤语义

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
- **THEN** 单元测试 SHALL 验证服务使用 configured password hash rounds 调用 `hash(newPassword, rounds)`
- **AND** 单元测试 SHALL 验证服务调用 `userRepository.setPassword(user.id, hashedPassword, tx)`
- **AND** 单元测试 SHALL 验证成功响应为 true

#### Scenario: 找回密码校验用户手机号和验证码
- **WHEN** `resetPassword` 被调用且用户不存在
- **THEN** 单元测试 SHALL 验证服务抛出“用户不存在”
- **AND** 单元测试 SHALL 验证用户手机号与输入手机号不匹配时抛出“用户名与手机号不匹配”
- **AND** 单元测试 SHALL 验证 resetPassword 验证码错误时抛出“验证码错误”

#### Scenario: 找回密码成功保存新密码
- **WHEN** `resetPassword` 被调用且用户、手机号和验证码校验通过
- **THEN** 单元测试 SHALL 验证服务使用 configured password hash rounds 调用 `hash(newPassword, rounds)`
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
- **AND** 单元测试 SHALL 验证成功后返回 true 且不会依赖 profile 刷新后的用户详情

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

## Open Questions
- open 找回密码当前会区分用户名不存在、未绑定手机号、手机号不匹配等错误；安全审计建议治理用户枚举，本 baseline 只记录现状。
- resetPassword 保存新密码时没有调用自助改密的密码强度校验；是否允许弱密码需要确认。
- public/internal 目录查询 schema 中多个数组字段是 optional；空数组和 undefined 的过滤差异由 `inArrayIf` 决定，未在 baseline 中细化。
- 供应商联系人注册用手机号判断已有用户，而新建用户使用请求 username；username 冲突但 mobile 不冲突时的行为依赖数据库约束，需要确认。
- 供应商注册依赖请求中的父组织编码和固定岗位 `P001`，这些基础数据缺失时会报错。

## Evidence Review
- 已登录用户自助查看与修改资料: 证据 `apps/api/src/routes/public/public.routes.ts`, `public.handlers.ts`, `apps/api/src/middlewares/authentication.handler.ts`, `apps/api/src/services/user/user.service.ts`, `apps/api/src/services/mobile/mobile.service.ts`, `apps/api/src/services/session/custom-sso-session-kernel.adapter.ts`。状态: 有代码证据。
- 公开短信验证码与找回密码: 证据 `apps/api/src/routes/open/open.routes.ts`, `open.handlers.ts`, `open.service.ts`, `apps/api/src/services/mobile/mobile.service.ts`, `apps/api/src/services/user/user.service.ts`。状态: 有代码证据；存在用户枚举与密码强度问题。
- 公开脱敏用户信息: 证据 `apps/api/src/routes/open/open.handlers.ts`, `apps/api/src/routes/open/open.service.ts`, `apps/api/src/services/user/user.service.ts`。状态: 有代码证据。
- public/internal 目录查询: 证据 `apps/api/src/routes/public/public.routes.ts`, `public.handlers.ts`, `apps/api/src/routes/internal/user/user.routes.ts`, `user.handlers.ts`, `apps/api/src/routes/internal/organization/organization.handlers.ts`, `apps/api/src/services/user-profile/user-profile-query.service.ts`, `apps/api/src/services/user-profile/user-profile.repository.ts`, `apps/api/src/services/organization/organization.repository.ts`。状态: 有代码证据。
- 内部供应商注册: 证据 `apps/api/src/routes/internal/organization/organization.handlers.ts`, `apps/api/src/routes/internal/user/user.handlers.ts`, `apps/api/src/services/employment/employment.repository.ts`, `packages/contracts/src/enums/user.type.ts`, `packages/contracts/src/enums/organization.type.ts`。状态: 有代码证据；基础数据依赖需人工确认。
