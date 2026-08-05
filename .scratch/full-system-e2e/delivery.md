# Full-system E2E 开发记录

## 当前状态

- 正式范围：[spec.md](spec.md)。
- 目标分支：`main`；规划固定点：`1e181eee200b74085ff1fae6b6b52a46a712c4bd`。
- Feature branch 尚未创建；本 tracker 发布于 `codex/test-architecture-wayfinding` 的规划工作区。
- 6 张 implementation tickets 均已发布为 `ready-for-agent`；整个 feature 被
  [test-collection-migration](../test-collection-migration/spec.md) 阻塞，完成后依赖前沿从
  [01 — 建立 Exact-project Infra 与 Migration Lifecycle](issues/01-establish-exact-project-lifecycle.md) 开始。
- 维护者只授权发布 tracker，尚未授权 `/implement`、Docker/browser/E2E 运行、commit、merge、push 或部署。
- 下一安全动作：先完成并验收先行 feature；维护者另行明确授权 `/implement` 后，再确认目标 tip、创建/使用
  `codex/full-system-e2e` 并由全新 implementation 子代理领取 Ticket 01。

## 验收与验证计划

- 每张中间 ticket 从空 project 运行其 workspace-local 完整 slice，并核对 exact project 的 container/network/volume 清理。
- Contract tests 覆盖 descriptor-before-resource、migration/readiness/timeout/signal failure、bounded redacted diagnostics、
  cleanup exit propagation 与 descriptor recovery。
- Tickets 04/05 分别运行单条真实 journey；Ticket 06 从干净环境无 retry 运行完整 `pnpm test:e2e` 一次。
- 每票运行 workspace lint/typecheck、最高层相关测试与 `git diff --check`；Ticket 06 另运行 root orchestration tests 和
  `pnpm check:docs`。
- 准备本地合入时仍按仓库 workflow 另行取得一次性收尾授权；不得把 Windows 本地结果表述为 Linux/CI adoption。

## 事件

- 2026-08-03 — Authorization：维护者明确授权发布四份正式 specs、delivery journals 与 24 张 implementation tickets；
  未授权代码实现或 Docker/browser/E2E 运行。
- 2026-08-03 — Publication：本 feature 的 spec、delivery 与 6 张 tickets 已发布；所有 tickets 保持
  `ready-for-agent`，production/test/tooling 尚未修改。
