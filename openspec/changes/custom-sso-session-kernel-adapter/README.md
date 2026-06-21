# custom-sso-session-kernel-adapter

将 apps/api custom SSO 迁移到 Session Kernel，目标分支 feature/session-kernel。

- Umbrella change: `introduce-session-kernel`
- Order: 2 / 5
- Target branch: `feature/session-kernel`
- Work branch: `work/custom-sso-session-kernel-adapter`
- Depends on: `session-kernel-core`
- Handoff: 保持 custom SSO 外部响应契约，同时让 PrincipalSession、auth code、local session credential 和 logout 通过 Kernel 生命周期。
