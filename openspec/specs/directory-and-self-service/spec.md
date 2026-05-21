# directory-and-self-service Specification

## Purpose
描述当前 public、open 和 internal API 中已实现的用户自助、短信验证码、公开脱敏查询、组织/用户目录查询，以及供应商组织和联系人注册行为。该 baseline 不替代认证/SSO spec，也不新增用户枚举治理策略。

## Requirements
### Requirement: 已登录用户自助查看与修改资料
系统 SHALL 允许通过 public tier 的已认证用户读取当前用户详情、修改密码和绑定手机号。

#### Scenario: 读取当前用户详情
- **WHEN** 已认证请求访问 `/public/user-info`
- **THEN** 系统 SHALL 返回 middleware 写入上下文的 userDetailDto

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

#### Scenario: 找回密码解析手机号
- **WHEN** resetPassword 用途请求提供 username
- **THEN** 系统 SHALL 查询启用用户详情并取得绑定手机号
- **AND** 若请求提供 phoneNumber，系统 SHALL 允许真实手机号或脱敏手机号匹配

#### Scenario: 重置密码
- **WHEN** open API 提交 username、手机号、验证码和 newPassword
- **THEN** 系统 SHALL 校验用户存在、手机号匹配和 resetPassword 验证码匹配
- **AND** 系统 SHALL 哈希保存新密码

### Requirement: 公开脱敏用户信息
系统 SHALL 通过 open tier 按 username 返回用户的脱敏基本信息，并在异常查询条件下要求有效 Cap token。

#### Scenario: 查询脱敏用户信息
- **WHEN** 调用 `/open/users/userInfo` 并提供 username，且请求未命中 `openUserInfoLookup` 异常触发策略
- **THEN** 系统 SHALL 查询启用且未软删除用户详情
- **AND** 响应 SHALL 返回 username、name 和脱敏 mobile

#### Scenario: 异常查询缺少 Cap token
- **WHEN** 调用 `/open/users/userInfo` 并提供 username，且请求命中 `openUserInfoLookup` 异常触发策略但未携带有效 Cap token
- **THEN** 系统 SHALL 拒绝执行用户详情查询
- **AND** 响应 SHALL 使用可被前端稳定识别的业务码表示需要人机校验

#### Scenario: 异常查询携带有效 Cap token
- **WHEN** 调用 `/open/users/userInfo` 并提供 username，且请求命中 `openUserInfoLookup` 异常触发策略并携带有效 Cap token
- **THEN** 系统 SHALL 消费该 Cap token
- **AND** 系统 SHALL 查询启用且未软删除用户详情
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
- **THEN** 系统 SHALL 只返回 status 为 Enable 且未软删除的用户
- **AND** 系统 SHALL 支持按 username、phone、wxId、组织祖先、组织深度、岗位编码和角色编码过滤

#### Scenario: 按组织查询直属用户
- **WHEN** public API 调用 `/public/users/by-org` 并提供 orgCode
- **THEN** 系统 SHALL 查询 ancestorOrgCodes 为该 orgCode 且 ancestorOrgDepths 为 `[0]` 的用户

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

#### Scenario: 注册供应商联系人新用户
- **WHEN** internal API 注册联系人且 mobile 未匹配启用用户
- **THEN** 系统 SHALL 创建 `UserType.External`、password 为 null 的用户
- **AND** 系统 SHALL 为该用户创建供应商组织和默认岗位下的 employment

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

## Open Questions
- open 找回密码当前会区分用户名不存在、未绑定手机号、手机号不匹配等错误；安全审计建议治理用户枚举，本 baseline 只记录现状。
- resetPassword 保存新密码时没有调用自助改密的密码强度校验；是否允许弱密码需要确认。
- public/internal 目录查询 schema 中多个数组字段是 optional；空数组和 undefined 的过滤差异由 `inArrayIf` 决定，未在 baseline 中细化。
- 供应商联系人注册用手机号判断已有用户，而新建用户使用请求 username；username 冲突但 mobile 不冲突时的行为依赖数据库约束，需要确认。
- 供应商注册依赖配置 `PURVEYOR_PARENT_ORG` 和固定岗位 `P001`，这些基础数据缺失时会报错。

## Evidence Review
- 已登录用户自助查看与修改资料: 证据 `apps/api/src/routes/public/public.routes.ts`, `public.handlers.ts`, `apps/api/src/services/user/user.service.ts`, `apps/api/src/services/mobile/mobile.service.ts`, `apps/api/src/services/session/session.service.ts`。状态: 有代码证据。
- 公开短信验证码与找回密码: 证据 `apps/api/src/routes/open/open.routes.ts`, `open.handlers.ts`, `open.service.ts`, `apps/api/src/services/mobile/mobile.service.ts`, `apps/api/src/services/user/user.service.ts`。状态: 有代码证据；存在用户枚举与密码强度问题。
- 公开脱敏用户信息: 证据 `apps/api/src/routes/open/open.handlers.ts`, `apps/api/src/routes/open/open.service.ts`, `apps/api/src/services/user/user.service.ts`。状态: 有代码证据。
- public/internal 目录查询: 证据 `apps/api/src/routes/public/public.routes.ts`, `public.handlers.ts`, `apps/api/src/routes/internal/user/user.routes.ts`, `user.handlers.ts`, `apps/api/src/routes/internal/organization/organization.handlers.ts`, `apps/api/src/services/user/user.repository.ts`, `apps/api/src/services/organization/organization.repository.ts`。状态: 有代码证据。
- 内部供应商注册: 证据 `apps/api/src/routes/internal/organization/organization.handlers.ts`, `apps/api/src/routes/internal/user/user.handlers.ts`, `apps/api/src/services/employment/employment.repository.ts`, `packages/contracts/src/enums/user.type.ts`, `packages/contracts/src/enums/organization.type.ts`。状态: 有代码证据；基础数据依赖需人工确认。
