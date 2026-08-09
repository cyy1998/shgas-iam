# OIDC 与 Session Kernel 会话迁移说明

OIDC Provider、custom SSO 和 admin revoke 现在统一通过 Session Kernel 管理会话生命周期。新版本使用
`sess:v2:` namespace 保存 active lifecycle object、HMAC lookup、revoked tombstone 和索引；旧
`global_session:*` envelope、custom SSO local session authority key、OIDC provider runtime/index key 不再作为
登录态或 token 状态来源。

当前 OIDC runtime 不写入、不读取、也不按 `oidc:user-tokens:*`、`oidc:client-tokens:*` 或
`oidc:global-session-tokens:*` 撤销 Access Token。这三类 key 只属于受控 legacy inventory/cleanup allowlist；当前 Access
Token 生命周期由 Session Kernel credential/token 与 provider-object ownership 共同管理。仓库删除旧 runtime 代码不表示
任何环境的 Redis inventory 已经为零。

这是一次有意不向后兼容的切换。发布窗口内必须清理旧 key，并要求所有用户重新登录。

## Session Kernel 配置

三个后端 app 使用同一套 Session Kernel 配置规则：

- 直接运行 app 时使用 `IAM_API_SESSION_*`、`IAM_ADMIN_API_SESSION_*` 和 `IAM_OIDC_PROVIDER_SESSION_*`。
- Docker compose 示例使用共享 `IAM_SESSION_*` 源变量，再 fan-out 到各 app 的 raw env。
- `*_SESSION_KERNEL_NAMESPACE` 默认是 `sess:v2:`。
- `*_SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS` 和 `*_SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS` 以秒配置，进入 Kernel 前转换为毫秒。
- `*_SESSION_KERNEL_TOMBSTONE_TTL_SECONDS` 和 `*_SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS` 控制 tombstone 保留窗口。
- `*_SESSION_LOOKUP_HMAC_CURRENT_ID` 和 `*_SESSION_LOOKUP_HMAC_CURRENT_SECRET` 用于生成当前 lookup hash。
- `*_SESSION_LOOKUP_HMAC_PREVIOUS_ID` 和 `*_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET` 只用于平滑 lookup rotation，必须成对配置。
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
- Access Token upsert/resolve/revoke、UserInfo、logout 和 active revoke 不注册或信任旧 OIDC token index；client invalidation
  通过 Session Kernel 撤销当前 binding/credential/token，并通过 provider-object owner 删除对应 protocol payload。
- 旧 OIDC token-index key 只由 `session:cleanup-legacy-keys` 的固定 allowlist 扫描和删除。运行该命令前必须 drain 仍可能写入
  或依赖旧 index 的实例、scheduler、sidecar 和旧镜像，并在维护窗口内完成 dry-run review、apply 与 verify。
- custom SSO 的 PrincipalSession token、auth code 和 local session sid 都是 opaque bearer。
- `Authorization` header 和 query `token` 作为 PrincipalSession 来源仅保留 legacy 兼容；新 client 不应通过 URL query 传递 PrincipalSession token。

短期 `oidc:pending-provider-session-binding:*` payload 不再写入数据库 `userId`，TTL 最长为 60 秒。新 reader 会忽略
旧 payload 中额外的 `userId`，但旧 reader 仍要求该字段，无法读取新 writer 产生的 payload。因此发布时不得长期混跑
新旧 OIDC 实例：应统一切换全部实例，或先停止新 authorization、等待至少 60 秒使旧 pending payload 全部过期，再
切换 writer/reader 并恢复流量；本仓库不提供永久双读兼容层。

## 回滚边界

删除 legacy key 前必须先确定回滚策略。若候选旧镜像仍依赖已退役的 OIDC token index，不得先清理这些 key；cleanup 后的
回滚只能使用不依赖旧 index 的版本，并仍需按下列范围清理新状态、要求用户重新登录和重做 client owner smoke。

如果需要回滚到不理解 Session Kernel 的旧版本，必须先停止登录和协议流量，然后清理新版本 key：

- `sess:v2:active:*`
- `sess:v2:lookup:*`
- `sess:v2:revoked:*`
- `sess:v2:revoked_lookup:*`
- `sess:v2:index:*`
- `custom-sso:local-session-payload:*`
- OIDC adapter 私有 payload/mapping key，例如 `oidc:model:*`、`oidc:consumed:*` 和 `oidc:provider-session-binding*`

回滚后同样要求用户重新登录，并重新执行 custom SSO、OIDC 和 admin revoke smoke。
