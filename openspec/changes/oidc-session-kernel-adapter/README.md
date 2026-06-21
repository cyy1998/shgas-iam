# oidc-session-kernel-adapter

将 OIDC provider 会话、binding、artifact 和 token 索引适配 Session Kernel，目标分支 feature/session-kernel。

- Umbrella change: `introduce-session-kernel`
- Order: 3 / 5
- Target branch: `feature/session-kernel`
- Work branch: `work/oidc-session-kernel-adapter`
- Depends on: `session-kernel-core`
- Handoff: 保留 `oidc-provider` 协议 payload 与原子语义，同时把登录态、binding、artifact tombstone 和 access token lifecycle 接入 Kernel。
