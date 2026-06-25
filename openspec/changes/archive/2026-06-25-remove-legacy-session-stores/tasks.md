## 1. Scope Confirmation

- [x] 1.1 用 `rg` 确认生产代码中所有 `createSessionService`、legacy `@iam/api-core/session` helper、OIDC 旧 store 和 admin legacy fallback 引用点。
- [x] 1.2 决定 `@iam/api-core` 的 `./session` export 策略：移除该 export、收窄为 Kernel-only 兼容入口，或保留会让 legacy helper import 在 typecheck 中失败的最小入口。
- [x] 1.3 确认本变更不移除 `/sso/authorize` 的 Session Kernel PrincipalSession `Authorization` header / query `token` 兼容输入。

## 2. API Legacy SessionService Cleanup

- [x] 2.1 从 `apps/api/src/composition/services/index.ts` 删除旧 `createSessionService` 创建、返回值、`revokeOidcAccessTokensForGlobalSession` 注入和相关 imports。
- [x] 2.2 删除 `apps/api/src/services/session/session.service.ts`、`session.port.ts`、`session.schema.ts`、`session.type.ts`，并确保 `custom-sso-session-kernel.adapter.ts` 保持为唯一 custom SSO 会话 adapter。
- [x] 2.3 更新 `apps/api` 相关测试 fixture，移除旧 `SessionService` 专用测试和旧 local session authority key 断言中不再适用的部分。
- [x] 2.4 更新 `apps/api` 架构测试，确保 custom SSO 主路径不 import legacy `@iam/api-core/session` helper，也不写旧 authority key。

## 3. Admin API Authentication Cleanup

- [x] 3.1 从 `apps/admin-api/src/middlewares/authentication.handler.ts` 删除 `createAdminAuthenticationHandler` import、`legacyAdminAuthenticationHandler` 创建和 fallback 分支。
- [x] 3.2 调整 admin authentication 行为：缺少 token、Kernel 解析失败、用户失效或角色不足时按现有错误语义 fail closed，并在未登录类失败中清理 `global_session` 与 `orcas_sso_sessionid` cookie。
- [x] 3.3 更新 `apps/admin-api/src/middlewares/__tests__/authentication.handler.test.ts`，覆盖缺少 token、无效 Kernel token 不回退 legacy、有效 admin token 成功、非 admin role 禁止访问。

## 4. OIDC Provider Legacy Store Cleanup

- [x] 4.1 从 `apps/oidc-provider/src/composition/stores/index.ts` 删除旧 `globalSessions`、`providerSessions`、`returnHandles` store 构造和 `OidcProviderStores` 类型暴露。
- [x] 4.2 删除 `apps/oidc-provider/src/stores/global-session.store.ts`、`provider-session-binding.store.ts`、`return-handle.store.ts`，并迁移或删除只覆盖这些旧 stores 的测试。
- [x] 4.3 检查 `apps/oidc-provider/src/composition/services/index.ts`、`composition/provider/index.ts`、`storage/redis-adapter.ts`、`interaction/handler.ts` 和 `provider/claims.ts`，确认 global session、provider session binding、return handle 均注入 `deps.session.oidcSession`。
- [x] 4.4 收窄 `apps/oidc-provider/src/interaction/interaction.port.ts` 中 return handle 的兼容可选方法，只保留生产使用的 `create` 与 `consume` 端口形态。
- [x] 4.5 增加或调整 OIDC architecture/provider wiring 测试，确保生产代码不 import 三个旧 store 模块且不生成 `legacy:*` provider bindingId。

## 5. api-core Legacy Helper Cleanup

- [x] 5.1 按 1.2 的策略更新 `packages/api-core/src/session/index.ts` 和 `packages/api-core/package.json` exports，移除 legacy `global_session:*` / `local_*_session:*` helper 生产导出。
- [x] 5.2 更新 `packages/api-core/src/middlewares/auth.ts` 和 `packages/api-core/src/middlewares/index.ts`，保留 `verifyInternalClient` 与 `createInternalAuthenticationHandler`，移除 public/admin legacy session middleware 导出。
- [x] 5.3 删除或改写 `packages/api-core/src/session/__tests__/session.test.ts`、`session-kernel.test.ts` 中只验证 legacy helper 可用性的用例。
- [x] 5.4 保留 Session Kernel cleanup refs 与旧 Redis key cleanup 工具；如 cleanup 工具依赖被删除 helper，则改为自包含 key pattern 实现。

## 6. Verification

- [x] 6.1 运行 `pnpm --filter @iam/api typecheck` 和与 custom SSO session 相关的 focused tests。
- [x] 6.2 运行 `pnpm --filter @iam/admin-api typecheck` 和 admin authentication middleware tests。
- [x] 6.3 运行 `pnpm --filter @iam/oidc-provider typecheck` 和 OIDC interaction、redis adapter、claims、provider wiring 相关 tests。
- [x] 6.4 运行 `pnpm --filter @iam/api-core typecheck` 和 session kernel / middleware focused tests。
- [x] 6.5 运行 `openspec status --change remove-legacy-session-stores`，确认 artifacts 与任务状态可追踪。
