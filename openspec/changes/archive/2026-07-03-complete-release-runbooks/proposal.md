## Why

`docs/releases/` 已经承载 OIDC、Session Kernel、系统日志、SM 加密登录和 user-profile dirty queue 的发布交接信息，但各手册颗粒度不一致，部分内容仍是英文或历史记录格式，也缺少若干已交付能力的 release 手册。现在补齐这些手册，可以让后续发布、回滚、smoke 验收和文档新鲜度检查有统一入口。

## What Changes

- 补强现有 release 手册：user-profile dirty queue、SM 加密密码登录、系统日志可观测性、OIDC Provider 和 Session Kernel smoke 记录。
- 新增 release 手册：角色分配统一与角色管理、APISIX gateway 配置发布、统一审计日志与 `login_log` 退役。
- 将 `docs/releases/` 下手册统一为简体中文正文，保留必要英文技术术语、命令、路径和配置名。
- 确保新增和现有 release 手册都纳入 `docs/index.md`，并具备符合索引规则的 status、last verified 和 next review 信息。
- 明确哪些文档是可复用 runbook，哪些是 historical release record，避免把一次性 smoke 证据误当作当前发布流程。

## Capabilities

### New Capabilities

- `release-runbook-governance`: 管理 release 手册的完整性、中文语言要求、索引新鲜度和可复用发布/回滚/smoke 验收结构。

### Modified Capabilities

无。该变更只建立和补齐发布文档合同，不改变 IAM 运行时业务能力。

## Impact

- 文档：`docs/releases/`、`docs/index.md`，必要时引用 `docs/features/` 和 `gateway/README.md` 作为事实来源。
- OpenSpec：新增 release 手册治理规格，用于约束后续 release 文档质量。
- 验证：运行 `pnpm check:docs`，并按需要抽查手册引用的命令、路径、status 和 review 日期。
