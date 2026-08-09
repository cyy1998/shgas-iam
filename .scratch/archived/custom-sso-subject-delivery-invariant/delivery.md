# Custom SSO Subject Projection 交付不变量开发记录

## 当前状态

- 功能分支：`codex/custom-sso-subject-delivery-invariant`。
- 正式范围与测试决定见 [spec](spec.md)。
- 唯一的 [Ticket 01](issues/01-close-custom-sso-subject-delivery-invariant.md) 已 `resolved`，无剩余 blocker。
- 实现、聚焦验证、全仓 Unit collection 与 Standards / Spec 双轴评审均已完成；下一安全动作是按 `/implement` 授权提交当前分支。

## 验收与验证计划

- Ticket 级内循环先通过新的 Package 公开 Interface 固定 Subject mismatch、invalid Wire 与既有 resolve error 传播，再通过 API Grant redemption seam 固定 Credential/Grant/audit 副作用顺序和 lease 行为。
- 聚焦验证覆盖 Client Subject Projection workspace 的 unit、lint、typecheck，API 的相关 component integration、lint、typecheck，以及 `pnpm check:architecture`、`pnpm check:docs` 与 `git diff --check`。
- 实现完成后按仓库工作流执行 Standards / Spec 双轴评审；只有在后续取得本地收尾授权时，才在最终内容上运行一次 `pnpm verify`、归档 tracker 并 squash merge。

## 事件

- 2026-08-09 — **Decision:** 维护者确认该功能只有一个不可安全拆开的端到端安全 seam，采用一张 tracer-bullet ticket，`Blocked by: None`。
- 2026-08-09 — **Authorization:** 维护者显式调用 `/to-tickets` 并批准一票方案；本次授权只包含 tracker 发布，不包含 production implementation、commit、merge、push、PR 或部署。
- 2026-08-09 — **Authorization:** 维护者显式调用 `/implement ticket01`，授权在当前 feature 分支实现并提交 Ticket 01；不包含 merge、push、PR、部署或 tracker 归档。
- 2026-08-09 — **Validation:** Client Subject Projection unit 15/15、component 12/12，API component 338/338；两个 workspace 的 lint/typecheck、Architecture Guard、docs index guard 与 whitespace 检查均通过。仓库 canonical Unit collection 17/17 tasks 通过。
- 2026-08-09 — **Review:** 固定点 `9944bcae` 的 Standards 轴无 hard violation，修复一个仅含唯一字面量参数的 speculative helper；Spec 轴补齐 token route 对非法 `sid`/`ttl` 的 defense-in-depth 回归测试。复验后 findings 清零。
