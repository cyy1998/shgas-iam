## 1. Adapter 与 Composition

- [x] 1.1 新增 custom SSO Session Kernel adapter port 与 factory，封装 PrincipalSession、auth code artifact、ClientBinding、IssuedCredential、payload cleanup 和 lazy revoke 操作。
- [x] 1.2 在 `apps/api` composition 中创建 Session Kernel 实例和 custom SSO adapter，接入 app-local Redis、logger、clock、user/client service、audit writer 和 cleanup 端口。
- [x] 1.3 更新 `createAuthService`、`createSsoService` 和相关 port 类型，使 custom SSO 路径依赖 adapter port，而不是直接依赖 legacy `SessionService` 权威方法。
- [x] 1.4 保留 legacy `SessionService` helper 导出和非本 change 调用方兼容，不在本 change 删除 `@iam/api-core/session` legacy helper。

## 2. 登录态迁移

- [x] 2.1 将密码登录成功后的 `setGlobalSession` 调用替换为 adapter 创建 Kernel PrincipalSession，并保持 `{ token, isMobileSet }` 响应和 `global_session` cookie。
- [x] 2.2 将手机验证码登录成功后的 `setGlobalSession` 调用替换为 adapter 创建 Kernel PrincipalSession，并保留验证码原子消费、失败计数和登录黑名单语义。
- [x] 2.3 将 OA 登录成功后的全局登录态创建替换为 Kernel PrincipalSession，并保留 OA token 校验、用户类型校验和审计日志。
- [x] 2.4 将 WeChat 登录和 `wxRetry` 成功后的全局登录态创建替换为 Kernel PrincipalSession，并保留 `wx-code:*` 处理和审计日志。
- [x] 2.5 确保 PrincipalSession 只保存最小 PrincipalSnapshot，不保存完整 `UserDetailDto`、roles、privileges、employments、ORCAS 或 custom payload。

## 3. SSO 授权与兑换

- [x] 3.1 将 `/sso/authorize` 迁移为 PrincipalSession token resolve + 前台 renew + custom SSO auth code ProtocolArtifact 创建。
- [x] 3.2 保留 `/sso/authorize` 的 cookie、`Authorization` header 和 query `token` 三种 token 来源，并为 header/query 来源记录脱敏 legacy bearer source system log。
- [x] 3.3 确保 auth code artifact 只保存 PrincipalSession、client、redirectUrl 和 custom SSO exchange metadata 引用，不保存完整 `UserDetailDto`。
- [x] 3.4 将 `/sso/callback` 迁移为 Kernel artifact consume + PrincipalSession 校验 + Gateway ClientBinding/IssuedCredential 创建。
- [x] 3.5 在 Gateway callback 中保留 ORCAS 登录处理，并确保 ORCAS 或 payload 写入失败时不返回可用 local session token。
- [x] 3.6 将 `/sso/token` 迁移为 Kernel artifact consume + client secret 校验 + Independent ClientBinding/IssuedCredential 创建，并保持 `sid`、`ttl`、`userInfo` 响应契约。
- [x] 3.7 将 custom SSO `UserDetailDto` local session payload 移到 adapter 私有 Redis key，TTL 不超过 credential TTL，并登记 cleanupRefs。
- [x] 3.8 确保 auth code replay 命中 consumed tombstone，且不会创建新的 binding、credential 或 payload。

## 4. Authz、Logout 与 Cleanup

- [x] 4.1 将 `/auth/authz` 迁移为 custom SSO local session token HMAC lookup，并按 tombstone-first 校验 credential。
- [x] 4.2 在 `/auth/authz` 中校验 credential clientCode、ClientBinding、PrincipalSession、实时 user/client 状态和 custom payload schema。
- [x] 4.3 保持 `/auth/authz` 对 `ClientStatus.Maintance` 与 `userExcluding` 的现有响应语义，maintenance 拒绝不得主动撤销 local session credential。
- [x] 4.4 在 PrincipalSession 失效、user disabled/deleted、client disabled/deleted、payload 缺失或 schema 无效时执行对应 lazy revoke。
- [x] 4.5 将 `/sso/logout` 迁移为 resolve 当前 PrincipalSession 后调用 Kernel revoke PrincipalSession，并保持无有效 session 时的幂等 cookie 删除和重定向。
- [x] 4.6 实现 custom SSO cleanup adapter：删除私有 payload key，Independent 模式 best-effort 通知 client logout endpoint，失败进入 revoke summary 或 system log。
- [x] 4.7 移除 custom SSO runtime 对 `global_session:*`、`auth_code:*`、`local_<client>_session:*`、`local_session_reverse:*`、`local_session_set:*` 作为权威 key 的依赖。
- [x] 4.8 更新 admin-api 管理端鉴权，使 `/admin` 与 `/rpc` 可解析新的 Kernel PrincipalSession `global_session` cookie，并保留 legacy session fallback。

## 5. 测试与验证

- [x] 5.1 更新 auth service/handler 测试，覆盖密码、手机、OA、WeChat 登录创建 Kernel PrincipalSession 和 cookie 响应。
- [x] 5.2 更新 SSO authorize/callback/token 测试，覆盖 PrincipalSession renew、auth code artifact、Gateway/Independent local session、ORCAS、client secret 和 redirect 校验。
- [x] 5.3 更新 session consistency 测试，覆盖 auth code replay tombstone、PrincipalSession 失效、local session payload 写入失败和不留下可用 credential。
- [x] 5.4 更新 `/auth/authz` 测试，覆盖 credential tombstone、clientCode 不匹配、PrincipalSession 失效、user/client 状态、maintenance 拒绝和 payload schema 无效。
- [x] 5.5 更新 logout 测试，覆盖 PrincipalSession revoke、payload cleanup、Independent logout notification 成功/失败和残留索引成员处理。
- [x] 5.6 增加架构或回归检查，防止 custom SSO 代码重新把 legacy Redis key 作为权威 session/auth code/local session 路径。
- [x] 5.7 运行 `pnpm --filter @iam/api test`。
- [x] 5.8 运行 `pnpm --filter @iam/api typecheck`。
- [x] 5.9 增加 admin-api 管理端鉴权回归测试并运行相关验证。
- [x] 5.10 将 custom SSO child 合并后的 smoke 结果回填到 `introduce-session-kernel` umbrella 记录。
