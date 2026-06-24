# session-kernel-release-hardening

补齐 Session Kernel 配置、发布 runbook、旧 Redis key 清理、观测与 smoke test，目标分支 feature/session-kernel。

- Umbrella change: `introduce-session-kernel`
- Order: 5 / 5
- Target branch: `feature/session-kernel`
- Work branch: `work/session-kernel-release-hardening`
- Depends on: stable runtime contracts from the first four child changes
- Handoff: 补齐统一 env、旧 Redis key 清理、system log、架构测试、发布回滚 runbook 和最终 smoke 记录。
