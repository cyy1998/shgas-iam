# 12 — 演练切换并完成集成验收

**What to build:** 将硬切换步骤、不可逆 artifact 清理、四类关键 smoke、性能基线与故障观测整理为可执行 runbook，并由维护者或 agent 在生产规模近似的临时环境组合现有公开接口、package 命令与 process smoke 完成最终验收。

**Blocked by:** 09, 11

**Status:** resolved

**Maintainer Decision:** 最终验收采用 runbook 驱动的手动联合演练和简洁人类可读记录；不要求或提交根级一键
orchestrator、JSONL receipt、机器 evidence manifest/transcript、历史旧 owner 可用性证明或自动 phase 状态机。完整
cutover runbook 联合演练与 10,002 行近规模性能验收可以作为两个专门执行分别完成；两项仍均为 Ticket 12 必需证据，
但不要求共享数据集、临时环境或执行批次。这一拆分不构成生产切换、容量阈值或发布审批。

- [x] runbook 明确维护窗口顺序：冻结 Client 与用户/任职/授权写入，备份 PostgreSQL 和需保留的 Redis operational data，运行 backfill/verify，停止旧 Worker，预热 Facts/Barrier，再切换认证流量。
- [x] 切换前逐个确认已启用 Client 的 mode、Redirect、Claims、callback/logout、ORCAS，以及 Independent Secret 已安全交付；任何未确认或 verify 失败都取消切换。
- [x] 当前 production entry 对 legacy-shaped Principal Session、grant 和 Local Session 一律 fail closed，且不读取六类 legacy key；cleanup 在明确目标和 dry-run/verify 保护下精确、幂等删除旧 Custom SSO grant、binding、credential、Local Session payload 与旧 Principal Session。旧 artifact 失效由 Ticket 11 后当前运行时移除旧 owner 保证，cleanup 只做 inventory hygiene，不承担认证失效。
- [x] cleanup 不主动批量删除 OIDC config、Provider Session、Authorization Code 或 Token；依赖已清理 Principal Session 的旧 OIDC artifact 按既有绑定自然失效并要求重新登录。
- [x] Gateway smoke 覆盖登录、Local Session、`/public/user-info`、`/auth/authz` header/body 一致、ORCAS 隔离、config version 失效和 Projection Not Ready。
- [x] Independent smoke 覆盖 Redirect/state、一次性 Grant、POST Basic/form 兑换、client-scoped `subject`、Secret 轮换/禁用与重放拒绝。
- [x] OIDC smoke 覆盖稳定 `sub`、scope 映射、Authorization Code 前 Snapshot、UserInfo replay，并证明 Custom SSO config/Secret/session 与 OIDC 独立。
- [x] 账号生命周期 smoke 覆盖禁用即时 401、Barrier 不确定 503、Cookie 清理差异、重新启用需新 Facts/新 Session，以及 repair backlog 收敛。
- [x] 性能验收记录切换前后 cache hit ratio、Redis/DB p95、single-flight wait、Projection Not Ready rate、Access Barrier unavailable rate 与 repair backlog；`/auth/authz` cache hit 必须证明零 PostgreSQL。
- [x] 日志、指标、错误与 runbook 产物不得包含 Secret、Subject Facts 全文、Dirty 内部状态或 Query Session Token。
- [x] 显式演练应用/数据库回滚边界：切换后不恢复旧字段或 payload，回滚应用前必须再次停止认证流量并回滚兼容 schema，已清理 Session 不可恢复。
- [x] Query Session Token 与 ORCAS transport 的已知风险在验收中记录为后续事项，本 feature 不改变其外部行为。
- [x] 最终验证覆盖相关单测、PostgreSQL、Redis、Admin Playwright、process smoke、文档检查、架构守卫、`git diff --check` 与一次完整 `pnpm verify`，并完成 Standards / Spec 双轴评审。
