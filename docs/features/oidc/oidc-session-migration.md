# OIDC 与 Session Kernel 会话迁移说明

OIDC Provider、custom SSO 和 admin revoke 现在统一通过 Session Kernel 管理会话生命周期。新版本使用
`sess:v2:` namespace 保存 active lifecycle object、HMAC lookup、revoked tombstone 和索引；旧
`global_session:*` envelope、custom SSO local session authority key、OIDC provider runtime/index key 不再作为
登录态或 token 状态来源。

这是一次有意不向后兼容的切换。发布窗口内必须清理旧 key，并要求所有用户重新登录。

## Session Kernel 配置

三个后端 app 使用同一套 Session Kernel 配置规则：

- `SESSION_KERNEL_NAMESPACE` 默认是 `sess:v2:`。
- `SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS` 和 `SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS` 以秒配置，进入 Kernel 前转换为毫秒。
- `SESSION_KERNEL_TOMBSTONE_TTL_SECONDS` 和 `SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS` 控制 tombstone 保留窗口。
- `SESSION_LOOKUP_HMAC_CURRENT_ID` 和 `SESSION_LOOKUP_HMAC_CURRENT_SECRET` 用于生成当前 lookup hash。
- `SESSION_LOOKUP_HMAC_PREVIOUS_ID` 和 `SESSION_LOOKUP_HMAC_PREVIOUS_SECRET` 只用于平滑 lookup rotation，必须成对配置。
- 生产环境不得使用开发默认 HMAC secret；current 和 previous 的 id、secret 都不得冲突。

HMAC rotation 的发布顺序是：先把旧 current 配为 previous、新 key 配为 current；确认旧 session TTL 全部过期后，再移除 previous。

## 发布前清理范围

维护窗口内停止 login、authorize、callback、token、UserInfo、logout 和 session refresh/renewal 流量后，运行旧 key cleanup dry-run：

```bash
pnpm --filter @iam/api-core session:cleanup-legacy-keys -- --dry-run --batch-size 500
```

dry-run 必须覆盖以下 allowlist pattern，并只输出 pattern/count 摘要，不得输出完整 Redis key、session token、authorization code、access token 或 cookie 值：

- `global_session:*`
- `auth_code:*`
- `local_*_session:*`
- `local_session_reverse:*`
- `local_session_set:*`
- `oidc:model:*`
- `oidc:consumed:*`
- `oidc:grant-objects:*`
- `oidc:client-objects:*`
- `oidc:session-uid:*`
- `oidc:user-code:*`
- `oidc:user-tokens:*`
- `oidc:client-tokens:*`
- `oidc:global-session-tokens:*`
- `oidc:login-return:*`
- `oidc:provider-session-binding:*`
- `oidc:provider-session-binding-lookup:*`
- `oidc:pending-provider-session-binding:*`

确认 pattern/count 摘要符合预期后，显式运行 apply：

```bash
pnpm --filter @iam/api-core session:cleanup-legacy-keys -- --apply --batch-size 500
```

apply 完成后再次执行 dry-run，所有旧 key pattern 的 count 应为 `0`。清理完成后部署新版本并恢复流量，所有用户和 custom SSO/OIDC client 都必须重新登录或重新发起授权。

## 运行时兼容边界

- OIDC provider 不读取旧 `global_session:*` envelope，也不会把裸 user DTO 或旧 envelope 自动迁移为 PrincipalSession。
- UserInfo、logout 和 active revoke 不以旧 OIDC token index 作为权威状态来源。
- custom SSO 的 PrincipalSession token、auth code 和 local session sid 都是 opaque bearer。
- `Authorization` header 和 query `token` 作为 PrincipalSession 来源仅保留 legacy 兼容；新 client 不应通过 URL query 传递 PrincipalSession token。

## 回滚边界

如果需要回滚到不理解 Session Kernel 的旧版本，必须先停止登录和协议流量，然后清理新版本 key：

- `sess:v2:active:*`
- `sess:v2:lookup:*`
- `sess:v2:revoked:*`
- `sess:v2:revoked_lookup:*`
- `sess:v2:index:*`
- `custom-sso:local-session-payload:*`
- OIDC adapter 私有 payload/mapping key，例如 `oidc:model:*`、`oidc:consumed:*` 和 `oidc:provider-session-binding*`

回滚后同样要求用户重新登录，并重新执行 custom SSO、OIDC 和 admin revoke smoke。
