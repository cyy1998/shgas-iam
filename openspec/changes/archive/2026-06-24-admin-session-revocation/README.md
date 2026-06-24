# admin-session-revocation

接入 admin-api 用户、密码和 client 变更后的 Session Kernel 主动撤销，目标分支 feature/session-kernel。

- Umbrella change: `introduce-session-kernel`
- Order: 4 / 5
- Target branch: `feature/session-kernel`
- Work branch: `work/admin-session-revocation`
- Depends on: `session-kernel-core` and adapter cleanup contract
- Handoff: 在 admin-api afterCommit 流程中触发 user、client 和协议配置 revoke，并记录 revoke summary / cleanup failure。
