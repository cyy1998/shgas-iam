## Why

`introduce-session-kernel` 已经将 OIDC provider 的登录态、binding、return handle、Authorization Code、Access Token 索引和 logout 列为 Session Kernel 的第三个子变更。当前 OIDC runtime 仍使用旧 global session helper、provider session binding store、return handle store 和 token store 自建生命周期与反向索引；如果不迁移，OIDC 将继续绕过 Kernel 的 tombstone-first、HMAC lookup、统一撤销和 cleanup summary。

## What Changes

- 将 `apps/oidc-provider` 的浏览器登录态解析迁移为 Session Kernel PrincipalSession lookup、校验和前台 authorize 续期。
- 将 provider session binding 迁移为 Kernel ClientBinding，同时保留 `oidc-provider` 需要的 provider session uid 到 bindingId 私有映射。
- 将 OIDC login return handle 迁移为 Kernel ProtocolArtifact，并在 resume 成功后写入 consumed tombstone。
- 将 OIDC Authorization Code 安全边界登记为 Kernel artifact ref，保持 provider 原有 code 原子 consume 和 PKCE/client authentication 语义。
- 将 OIDC opaque Access Token 注册为 Kernel IssuedCredential，并把 user、client、PrincipalSession、binding 和 protocol 反向索引迁移到 Kernel 通用索引。
- 更新 UserInfo、client/user/config 状态校验、maintenance 撤销和 RP-Initiated Logout，使运行时拒绝以 Kernel tombstone 和 lazy revoke 为准。
- 保留 OIDC 协议 payload、UserInfo snapshot、Interaction、Grant 和 provider model 的私有存储，不把 claims 或 provider model 写入 Kernel 公共模型。
- 不改变 OIDC endpoint 外部协议契约、ID Token claim 规则、PKCE 要求、CORS 策略或 custom SSO 外部响应契约。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `oidc-provider`: OIDC provider 的 global session resolver、provider session binding、return handle、Authorization Code、Access Token 索引、UserInfo 校验和 logout 迁移到 Session Kernel 语义。

## Impact

- 影响应用：`apps/oidc-provider` 的 composition、interaction、session、stores、storage adapter、token flow、UserInfo、client invalidation 和 logout middleware。
- 影响共享依赖：消费已归档的 `@iam/api-core/session/kernel` public API，不在 OIDC app 内复制 lifecycle、lookup、tombstone 或通用索引实现。
- 影响 Redis runtime：OIDC active lifecycle 对象、lookup、tombstone 和反向索引进入 `sess:v2:` namespace；OIDC 协议 payload 和 provider model 继续留在 OIDC 私有 namespace。
- 影响验证：需要覆盖 authorize、prompt/max_age、return handle replay、token exchange、Authorization Code replay、UserInfo tombstone、client config changed、maintenance revoke、user disabled lazy revoke 和 RP-Initiated Logout 回归。
