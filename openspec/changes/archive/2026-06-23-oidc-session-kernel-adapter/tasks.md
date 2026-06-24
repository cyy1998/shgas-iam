## 1. Adapter Wiring

- [x] 1.1 在 `apps/oidc-provider` 新增 OIDC Session Kernel adapter/revoker 模块，定义 provider runtime 消费的 port 类型。
- [x] 1.2 在 composition 中创建 Session Kernel 实例，映射 OIDC provider env、Redis、logger、validation hooks 和 cleanup adapter。
- [x] 1.3 将 OIDC adapter 注入 provider runtime、interaction handler、storage adapter、token/UserInfo 路径和 invalidation 模块。
- [x] 1.4 保留 OIDC 私有 protocol payload store，同时移除 provider 模块对 Kernel lifecycle key 的直接写入需求。

## 2. PrincipalSession 与 Provider Binding

- [x] 2.1 将 OIDC global session resolver 改为读取 `global_session` cookie 中的 Kernel PrincipalSession external token。
- [x] 2.2 在 authorize 成功路径执行 PrincipalSession tombstone/schema/TTL/user 校验，并按前台交互规则续期。
- [x] 2.3 将 provider session binding 迁移为 Kernel ClientBinding，metadata 保存 provider session uid 与 `oidcConfigVersion`。
- [x] 2.4 保留 provider session uid 到 bindingId 的 OIDC 私有映射，并把该映射加入 ClientBinding cleanupRef。
- [x] 2.5 覆盖旧 `global_session:*`、schema invalid、PrincipalSession 过期和用户不可用的未登录或 lazy revoke 行为。

## 3. Interaction Return Handle

- [x] 3.1 将未登录 authorize 的 login return handle 创建迁移为 `protocol=oidc`、`artifactType=login_return_handle` 的 Kernel ProtocolArtifact。
- [x] 3.2 在 return handle artifact metadata 中记录 interaction uid、clientCode、browser binding、return target 和 `oidcConfigVersion`。
- [x] 3.3 将 resume endpoint 改为原子 consume Kernel return handle artifact，并在成功后写 consumed tombstone。
- [x] 3.4 覆盖 handle consumed replay、过期、撤销、client/config version 变化和浏览器绑定不匹配测试。

## 4. Authorization Code 与 Token

- [x] 4.1 在合法 authorize 创建 Authorization Code 后，为 code 登记 `protocol=oidc`、`artifactType=authorization_code` 的 Kernel artifact ref。
- [x] 4.2 在 token endpoint 成功通过 provider code consume、PKCE 和 client authentication 后，原子 consume 对应 Kernel authorization code artifact。
- [x] 4.3 将 opaque Access Token 注册为 `protocol=oidc`、`credentialType=access_token` 的 Kernel IssuedCredential，renewal policy 使用 `fixed_at_issue`。
- [x] 4.4 将 UserInfo snapshot 和 provider token payload 改为通过 Kernel credentialId 或 provider token uid 与 OIDC 私有 store 关联。
- [x] 4.5 在 code/artifact consume 或 credential issue 任一步失败时 fail closed，并确保不返回可用 Access Token 或 ID Token。
- [x] 4.6 覆盖 public/confidential token exchange、code replay、PKCE/client auth failure、config version changed 和 credential issue failure 测试。

## 5. UserInfo、撤销与 Logout

- [x] 5.1 将 UserInfo Bearer token 校验改为先走 Kernel credential tombstone-first resolve，再读取 OIDC 私有 UserInfo snapshot。
- [x] 5.2 将 user disabled/deleted、client disabled/deleted、OIDC disabled/config changed 的读取时校验接入 Kernel validation hooks 和 lazy revoke。
- [x] 5.3 将 OIDC maintenance、client OIDC config/secret/status 变化接入 `revokeClientProtocol(clientCode, "oidc", reason)`。
- [x] 5.4 更新 OIDC protocol object cleanup，使 provider token payload、session uid mapping、return handle/code artifact payload 在 tombstone 后 best-effort 清理。
- [x] 5.5 将 RP-Initiated Logout 改为通过 Kernel 撤销当前 PrincipalSession，并记录 revoke summary 与 cleanup failure。
- [x] 5.6 覆盖 UserInfo tombstone、PrincipalSession missing、client maintenance revoke、user disabled lazy revoke、cleanup failure 和 RP-Initiated Logout 回归测试。

## 6. 验证与收尾

- [x] 6.1 更新 `apps/oidc-provider/src/__tests__/architecture.test.ts`，防止 OIDC adapter 绕过 Kernel public API 写 `sess:v2:` lifecycle、lookup、tombstone 或通用索引。
- [x] 6.2 更新 affected OIDC tests：`interaction.test.ts`、`session-security.test.ts`、`token-flow.test.ts`、`redis-adapter.test.ts` 和 provider wiring 测试。
- [x] 6.3 运行 `pnpm --filter @iam/oidc-provider test`。
- [x] 6.4 运行 `pnpm --filter @iam/oidc-provider typecheck`。
- [x] 6.5 如修改 `@iam/api-core/session/kernel` public API，运行 `pnpm --filter @iam/api-core test` 和 `pnpm --filter @iam/api-core typecheck`。
- [x] 6.6 完成后在 `introduce-session-kernel` umbrella design 中记录 OIDC child smoke check 结果。
