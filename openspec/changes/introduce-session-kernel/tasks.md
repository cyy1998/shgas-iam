## 1. Umbrella 协调

- [x] 1.1 从 `main` 创建 `feature/session-kernel` 集成分支，并记录 child change 顺序与目标分支。
- [x] 1.2 为 `session-kernel-core`、`custom-sso-session-kernel-adapter`、`oidc-session-kernel-adapter`、`admin-session-revocation` 和 `session-kernel-release-hardening` 创建 child OpenSpec change。
- [x] 1.3 在 umbrella design 中持续记录跨 child 的决策变更、风险和验收状态。
- [ ] 1.4 每个 child 合并到 `feature/session-kernel` 后运行对应跨模块 smoke check，并记录结果。
  - 已记录 `session-kernel-core` 的 `@iam/api-core` lint/test/typecheck 结果。
  - 已记录 `custom-sso-session-kernel-adapter` 的 `@iam/api`、`@iam/admin-api` 与管理端兼容验证结果；其余 child 待合并后逐项运行并填写结果。

## 2. Session Kernel Core

- [x] 2.1 在 `packages/api-core/src/session` 下新增 kernel 模块结构，并保留 legacy session helper 导出。
- [x] 2.2 定义 PrincipalSession、ClientBinding、IssuedCredential、ProtocolArtifact、RevokedTombstone、CleanupRef、RevocationReason 和 result union 类型。
- [x] 2.3 实现 `sess:v2:` Redis key builder、zset index member 编码、JSON/Zod schema 校验和 namespace 配置。
- [x] 2.4 实现 high-entropy external token generator、HMAC lookup、current/previous key 解析和 secret 启动校验。
- [x] 2.5 实现 create/resolve PrincipalSession，包括 lookup tombstone first、idle/absolute TTL、PrincipalSnapshot 和 clientContext。
- [x] 2.6 实现 create ClientBinding、issue IssuedCredential、create/consume ProtocolArtifact 的原子状态转换。
- [x] 2.7 实现 revoked tombstone 写入、lookup tombstone、consumed tombstone、TTL 计算和 tombstone first resolve。
- [x] 2.8 实现 renew PrincipalSession、renewal policy、freshness evaluation 和重认证旧 session 撤销入口。
- [x] 2.9 实现幂等 revoke API、批量 revoke summary、causedBy 传播、adapter cleanup 分组和 cleanup failure 结果。
- [x] 2.10 实现 validation hooks 与 lazy revoke 编排，但不在 kernel 中引入 DB 或 app-local service。
- [x] 2.11 覆盖 `@iam/api-core` kernel 单元测试：HMAC lookup、previous key、issue/resolve/revoke、artifact consume/replay、tombstone、TTL、zset 懒清理和 fail closed。
- [x] 2.12 运行 `pnpm --filter @iam/api-core test` 和 `pnpm --filter @iam/api-core typecheck`。

## 3. Custom SSO Adapter

- [x] 3.1 在 `apps/api` composition 中创建 custom SSO Session Kernel adapter 和 revoker，接入 app-local Redis、logger、client/user service 与 audit/system log 端口。
- [x] 3.2 将密码、手机、OA、WeChat 登录成功后的 global session 创建迁移为 Kernel PrincipalSession，同时保持 `{ token, isMobileSet }` 与 `global_session` cookie。
- [x] 3.3 将 `/sso/authorize` 迁移为 Kernel PrincipalSession resolve + custom SSO auth code ProtocolArtifact 创建。
- [x] 3.4 保留 `/sso/authorize` 对 cookie、`Authorization` header 和 query `token` 的 legacy token 来源兼容，并记录脱敏 legacy usage system log。
- [x] 3.5 将 `/sso/callback` 和 `/sso/token` 迁移为 Kernel artifact consume + ClientBinding + local session IssuedCredential。
- [x] 3.6 将 custom SSO local session payload 移到 adapter 私有 key，继续保存并返回兼容的 `UserDetailDto`。
- [x] 3.7 将 `/auth/authz` 迁移为 local session HMAC lookup、tombstone first、binding/principal 校验、user/client 实时校验和 custom payload 摘要返回。
- [x] 3.8 将 `/sso/logout` 迁移为 Kernel revoke 当前 PrincipalSession，并由 custom SSO adapter best-effort 通知 Independent client logout endpoint。
- [x] 3.9 移除 custom SSO 对 `global_session:*`、`auth_code:*`、`local_<client>_session:*`、`local_session_reverse:*`、`local_session_set:*` 作为权威 key 的依赖。
- [x] 3.10 覆盖 custom SSO authorize、callback、token、authz、logout、auth code replay、local session tombstone、maintenance 拒绝不撤销和 Independent logout failure 测试。
- [x] 3.11 运行 `pnpm --filter @iam/api test` 和 `pnpm --filter @iam/api typecheck`。

## 4. OIDC Adapter

- [ ] 4.1 在 `apps/oidc-provider` composition 中创建 OIDC Session Kernel adapter 和 revoker，接入 provider stores、Redis adapter、token store、client runtime 和 account repository。
- [ ] 4.2 将 OIDC global session resolver 改为通过 Kernel PrincipalSession external token lookup 解析浏览器登录态。
- [ ] 4.3 将 OIDC provider session binding 并入 Kernel ClientBinding，并保留 provider session uid 到 bindingId 的私有映射。
- [ ] 4.4 将 OIDC login return handle 迁移为 Kernel ProtocolArtifact，并在 resume 成功后写 consumed tombstone。
- [ ] 4.5 将 OIDC authorization code 安全边界登记为 Kernel artifact ref，保留 `oidc-provider` 原子 consume 语义并覆盖 replay tombstone。
- [ ] 4.6 将 OIDC access token 注册为 Kernel IssuedCredential，迁移 user/client/PrincipalSession/binding/protocol 反向索引。
- [ ] 4.7 更新 UserInfo 校验路径，使 Bearer token 先经过 Kernel tombstone/credential/binding/principal 校验，再返回 OIDC UserInfo snapshot。
- [ ] 4.8 更新 OIDC RP-Initiated Logout，使其通过 Kernel 撤销当前 PrincipalSession 并清理 custom SSO 与 OIDC 派生对象。
- [ ] 4.9 实现 OIDC maintenance、client config version、client disabled、user disabled 的 active revoke 和 lazy revoke 行为。
- [ ] 4.10 覆盖 OIDC authorize、prompt/max_age、return handle replay、token exchange、UserInfo tombstone、client config changed、maintenance revoke 和 logout 回归测试。
- [ ] 4.11 运行 `pnpm --filter @iam/oidc-provider test` 和 `pnpm --filter @iam/oidc-provider typecheck`。

## 5. Admin 触发撤销

- [ ] 5.1 为 admin-api 定义 Session Revocation port，支持 revoke user sessions、revoke client protocol、revoke client all protocols 和 revoke except current session。
- [ ] 5.2 在用户禁用、删除、管理员重置密码和用户改密码流程后通过 afterCommit 触发对应 Kernel revoke。
- [ ] 5.3 在 client Disable/Delete 状态变化后撤销该 client 所有协议会话对象。
- [ ] 5.4 在 custom SSO 协议配置、client secret、callback/logout/managementLevel 变化后撤销该 client 的 custom-sso 对象。
- [ ] 5.5 在 OIDC 配置、secret、enabled、maintenance、status 和 delete 变化后撤销该 client 的 OIDC 对象。
- [ ] 5.6 记录 revoke summary system log，确保 adapter cleanup failure 不阻断原业务事务。
- [ ] 5.7 覆盖 user/client/password/status afterCommit revoke 测试和 best-effort failure 测试。
- [ ] 5.8 运行 `pnpm --filter @iam/admin-api test` 和 `pnpm --filter @iam/admin-api typecheck`。

## 6. 发布加固与文档

- [ ] 6.1 新增统一 Session Kernel env schema 和配置映射，覆盖 apps/api 与 apps/oidc-provider。
- [ ] 6.2 编写旧 Redis session key 清理脚本或 runbook，覆盖 global/local/custom auth code 和旧 OIDC token index。
- [ ] 6.3 更新 OIDC 发布回滚手册和 SSO 接入文档，说明维护窗口、强制重新登录、opaque token 和 legacy query/header token 风险。
- [ ] 6.4 增加系统日志事件：legacy bearer source、revoke summary、cleanup failure、schema corrupted、tombstone replay。
- [ ] 6.5 增加架构测试，禁止协议 adapter 绕过 Kernel lifecycle key、lookup、tombstone 和通用索引。
- [ ] 6.6 运行受影响共享包、`@iam/api`、`@iam/admin-api`、`@iam/oidc-provider`、`@iam/admin` 和 `@iam/sso` 的必要 test/typecheck/lint。
- [ ] 6.7 在开发环境完成 custom SSO 登录、网关鉴权、OIDC authorize/token/UserInfo/logout 和用户/client 禁用撤销 smoke test。
- [ ] 6.8 归档所有 child changes 后，完成 umbrella 验收并将 `feature/session-kernel` 合并回 `main`。
