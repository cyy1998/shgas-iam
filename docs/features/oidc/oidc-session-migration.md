# OIDC 与 Session Kernel 当前维护边界

OIDC Provider、custom SSO 和 admin revoke 现在统一通过 Session Kernel 管理会话生命周期。新版本使用
`sess:v2:` namespace 保存 active lifecycle object、HMAC lookup、revoked tombstone 和索引；旧
`global_session:*` envelope、custom SSO local session authority key、OIDC provider runtime/index key 不再作为
登录态或 token 状态来源。

当前 OIDC runtime 不写入、不读取、也不按 `oidc:user-tokens:*`、`oidc:client-tokens:*` 或
`oidc:global-session-tokens:*` 撤销 Access Token。这三类旧 key 已退出当前维护支持范围；当前 Access
Token 生命周期由 Session Kernel credential/token 与 provider-object ownership 共同管理。仓库删除旧 runtime 代码不表示
任何环境的 Redis inventory 已经为零。

旧环境或旧备份的首次升级迁移不在当前候选支持范围。迁移必须另行固定适用版本、数据边界与操作流程，不得混跑旧 reader/writer。

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

## 当前维护范围

两条旧 Session cleanup 命令及其公开入口已撤销。当前 Session Kernel 撤销、正常清理、pending cleanup 和 OIDC cleanup adapters 继续有效。
`client-protocol:artifacts` 按 manifest 精确清理协议 artifact 并保护 Principal Session 与非目标状态，详见
[Client Protocol artifact 手册](../../releases/client-protocol-v2-artifact-cutover.md)。它不是旧工具的完整等价替代，也不提供全体登出或全量认证状态重置。
当前 OIDC store/key helpers 继续由协议 owner 使用，不能按旧 allowlist 删除同名 key。

Spec #115 的当前在线时间模型切换另由 `online-auth:state` 拥有：显式停流并排空全部 reader/writer 后，直接扫描 Kernel、
Grant、OIDC 主对象/索引与 Provider Session 衔接状态，不依赖可能丢失的旧索引；它会终止全体 Principal，且不写 PostgreSQL。
仅用于当前 owner 键族，不恢复退役工具或支持退役 namespace；完整前提、独立 verify 和人工验收见
[Redis 时间切换手册](../../releases/online-auth-redis-time-cutover.md)。本段不表示环境已执行。

Spec #128 以同一 `online-auth:state` owner 清理本次旧主体上下文状态，不新增命令或 namespace。
最终 Kernel 只存不透明 context、无旧字段双读，全部消费者必须统一切换；完整执行与回退见
[Subject Access 维护手册](../../releases/subject-access-operation-cutover.md)。

## 运行时兼容边界

- OIDC provider 不读取旧 `global_session:*` envelope，也不会把裸 user DTO 或旧 envelope 自动迁移为 PrincipalSession。
- Access Token upsert/resolve/revoke、UserInfo、logout 和 active revoke 不注册或信任旧 OIDC token index；client invalidation
  通过 Session Kernel 撤销当前 binding/credential/token，并通过 provider-object owner 删除对应 protocol payload。
- 旧 OIDC token-index key 不由当前命令扫描、验证或删除；仓库代码退役不证明目标环境已完成迁移。
- custom SSO 的 PrincipalSession token、auth code 和 local session sid 都是 opaque bearer。
- `Authorization` header 和 query `token` 作为 PrincipalSession 来源仅保留 legacy 兼容；新 client 不应通过 URL query 传递 PrincipalSession token。

短期 `oidc:pending-provider-session-binding:*` payload 不再写入数据库 `userId`，TTL 最长为 60 秒。新 reader 会忽略
旧 payload 中额外的 `userId`，但旧 reader 仍要求该字段，无法读取新 writer 产生的 payload。因此发布时不得长期混跑
新旧 OIDC 实例：应统一切换全部实例，或先停止新 authorization、等待至少 60 秒使旧 pending payload 全部过期，再
切换 writer/reader 并恢复流量；本仓库不提供永久双读兼容层。

## 回滚边界

回滚候选必须理解当前 Session Kernel 和协议存储契约。不理解当前存储的旧版本或旧备份恢复需要独立迁移流程，
不能使用已撤销的 Session cleanup 命令，也不能以精确 artifact cleanup 的成功报告代替迁移验收。
回滚后的当前协议行为仍须执行 Custom SSO、OIDC 与 Admin revoke smoke。
