## 1. 配置与 DSL 契约

- [x] 1.1 在 `apps/api/src/env.ts` 中解析 `IAM_API_USER_PROFILE_DSL_MAX_LIMIT`，导出 `env.userProfile.dslMaxLimit` 并补充 env 单元测试。
- [x] 1.2 为 internal user profile DSL 搜索定义请求/响应 schema，包含 `filter` 和可选 `limit`，并在 schema 层限制 `limit <= env.userProfile.dslMaxLimit`。
- [x] 1.3 扩展 `UserProfileQueryService.searchDsl` 支持服务端默认 limit 和显式 limit，并确保 employment 字段非 nested 时校验失败。

## 2. UserService 读写边界切换

- [x] 2.1 调整 `UserServiceDeps` 和 composition wiring，将 `UserProfileQueryService` 注入 `UserService` facade。
- [x] 2.2 将 `getUserDetailById`、`getUserDetailByUsername`、`getUserDetailByMobile`、`getUserDetailByWxId` 委托给 profile query service，保留未找到异常语义且不 fallback 源表。
- [x] 2.3 将 `searchUsers` 委托给 profile legacy search，保持旧 `UserQueryDto` 响应 DTO 和 nested employment 语义。
- [x] 2.4 为 auth/reset password 增加 live user lookup 或 availability check 方法，确保敏感校验不依赖 profile。
- [x] 2.5 将 `setMobile` 成功结果改为布尔值，不再读取刷新后的用户详情。
- [x] 2.6 调整 `openService.resolveResetPasswordMobile` 使用 live user lookup 获取当前手机号，不使用 profile 手机号。
- [x] 2.7 调整 `searchUsersWithPrivilegeDelegation` 聚合逻辑，使用户列表来自 profile search，权限委托仍来自 live delegation repository。
- [x] 2.8 精简 `apps/api` user live repository/port 依赖，移除 profile 已替代的 `searchUsers` 源表读取依赖，并同步清理 composition wiring 与测试 fake。

## 3. Auth 与 custom SSO 会话

- [x] 3.1 调整 password/mobile/OA/WeChat 登录路径，先完成 live eligibility 校验，再使用 profile detail 创建 PrincipalSession 和审计 payload。
- [x] 3.2 拆分 custom SSO adapter 的 live user availability check 与 profile detail lookup，只有 live user 不可用时撤销用户 session。
- [x] 3.3 将 `resolvePrincipalSessionUser`、`resolveLocalSessionUser` 和 `authorizeLocalSession` 改为在 session/client/live user 校验通过后读取 profile detail。
- [x] 3.4 保留 local session payload 的 credential/binding/principal/client 一致性校验，但不再把 payload 用户快照作为 authz/user-info 权威来源。
- [x] 3.5 处理 profile 缺失或 schema version 不匹配路径：请求失败、不 fallback 源表、不仅因此撤销用户全部 session。

## 4. API 路由接入

- [x] 4.1 确认 `/public/user-info` 从认证 middleware context 返回 profile detail，且 profile 元数据不出现在响应中。
- [x] 4.2 确认 `/open/users/userInfo` 使用 profile detail 做脱敏响应，Cap 风控流程保持不变。
- [x] 4.3 确认 public/internal 旧用户搜索使用 profile legacy search。
- [x] 4.4 新增 internal-only `/internal/users/search-dsl` route、handler、OpenAPI 定义和 composition wiring。
- [x] 4.5 确认 `/internal/users/search-with-delegation` 返回 profile 用户列表和 live delegation 列表。

## 5. 测试与验证

- [x] 5.1 更新 `UserProfileQueryService` 和 repository 单元测试，覆盖 DSL limit、nested employment 校验、旧查询编译和无 fallback 行为。
- [x] 5.2 更新 `UserService`、`openService` 和权限委托 helper 单元测试，覆盖 profile delegation、setMobile 布尔返回、reset password live 手机号解析。
- [x] 5.3 更新 custom SSO session adapter 和 auth service 单元测试，覆盖 live user disabled revoke、profile missing no user-wide revoke、authz 摘要来自 profile。
- [x] 5.4 更新 public/open/internal route handler 测试，覆盖旧搜索、DSL 搜索和 profile 元数据不外泄。
- [x] 5.5 运行 `pnpm --filter @iam/api test`、`pnpm --filter @iam/api typecheck` 和 `pnpm check:env-names`。
- [x] 5.6 运行 `openspec validate switch-api-user-profile-reads --strict`。
