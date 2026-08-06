# 测试架构重构实施计划寻路图

## Destination

产出一套经过减法审查、可以跨会话直接实施的测试架构重构计划：一个清晰的跨 feature 依赖图，以及最少必要的多份
`spec.md`、`delivery.md` 和 implementation tickets。每份 feature 都能独立验收、合并和回滚；本地图不授权进入代码实现。

## Notes

- 当前事实固定点为 `main@1e181eee200b74085ff1fae6b6b52a46a712c4bd`；当前行为以代码、可执行测试和 Current 文档为准。
- 输入包括 `C:\Users\caiyi\AppData\Local\Temp\iam-service-testing-architecture-handoff-spec-split-20260803.md`、
  `C:\Users\caiyi\AppData\Local\Temp\iam-service-testing-architecture-handoff-1e181eee.md` 和
  `C:\Users\caiyi\Downloads\test-architecture-review.md`。
- 已确认的目标结果作为约束：对外只使用 Unit、Integration、E2E 三层；删除 RESP/Redis 协议替身；默认 `pnpm verify`
  不运行 Integration；普通 Integration 使用调用方提供的专用 PostgreSQL/Redis；只有 Full-system E2E 管理 Docker 生命周期；
  Full-system E2E 使用单一 Gateway origin，第一阶段覆盖 Admin Custom SSO 与独立 OIDC Authorization Code + PKCE 两条旅程；
  除永久 `test -> test:unit` 外，旧入口在替代 collection 完整后直接原子切换，不保留 migration aliases。
- spec 数量与边界、profile/命令细节、collection guard 形态、测试 seam、实施顺序和 ticket 粒度都可以调整。
  若目标约束出现正确性或安全问题，或者候选设计出现明显过度设计，必须通过 HITL ticket 向维护者提出取舍，不得静默改写。
- 每个候选机制都应用删除测试：删除后复杂度若不会重新分散到多个调用方或测试，就不应成为长期抽象。迁移期检查必须有明确退出条件，
  不自动升级为永久架构守卫。
- 决策会话使用 `grilling`、`domain-modeling` 和 `codebase-design`；最终发布 specs/tickets 时使用
  `request-refactor-plan` 与仓库本地 tracker 规则。只有后续 implementation 会话才使用 `tdd` 和强制 implementation 子代理流程。
- 测试层级、profile、run set、gate 和 compatibility alias 是测试架构语言，不写入 IAM 业务领域的 `CONTEXT.md`。

## Decisions so far

<!-- 每个已解决 ticket 在此只保留一行摘要和链接；完整答案只写在对应 ticket。 -->

- 公开测试 interface 采用三层、六个 harness-owner Integration profiles 和统一 `test:*`/`verify*` 命令；`test` 永久别名 Unit，其他旧入口直接迁移，不引入 run-set taxonomy（[收敛公开测试语言与最小命令面](issues/01-minimize-public-test-language.md)）。
- Collection Guard 长期只保护当前文件的唯一收集、路径命名和 task 可达性；自动基线、覆盖映射与例外由迁移 feature 持有并在完成后删除（[决定 Collection Guard 的最小职责与退出策略](issues/02-rightsize-collection-guard.md)）。
- 真实 Redis 测试直接复用 production Session Kernel 与各状态 owner seam；普通测试按随机 namespace 隔离，legacy cleanup 在独占 disposable Redis 中以 ACL、sentinel 和完整 inventory 证明精确删除，不新增通用 test scope（[收敛真实 Redis 迁移的最小测试 seam](issues/03-minimize-real-redis-test-seam.md)）。
- Full-system E2E 由 root-owned、project-scoped 的一次性 orchestrator 通过单一 `127.0.0.1` Gateway origin 驱动两条真实 journey，集中管理 migration、局部 seed、readiness、诊断与精确清理，不建设通用测试平台（[收敛 Full-system E2E 的最小系统边界](issues/04-scope-full-system-e2e-mvp.md)）。
- `verify`、`verify:ci` 与 `verify:release` 只在其 Unit、Integration、E2E 能力完整且 Windows 聚合证据通过后发布；旧入口以 collection equality 原子切换，资源缺失由 owner command fail closed，真实 CI/Linux 启用不属于本计划（[决定 Gate 与兼容发布的证据契约](issues/05-set-gate-and-compatibility-evidence.md)）。
- 最终采用四份 feature specs：Canonical Collection 与命令迁移先行，真实 Redis 测试迁移和 Full-system E2E 并行，最后汇合到测试 Gate 发布；ADR、Current 文档和回滚均随能力 owner 分治（[裁定最终 Feature Spec 边界与依赖](issues/06-decide-feature-spec-boundaries.md)）。
- 四份 specs 的正式来源、迁移不变量与 24 票实施树已通过低保真验证：Canonical Collection 按 owner surface 迁移，Redis shim 最后删除，Full-system 两条 journey 完成后才发布 `test:e2e`，两个上层 Gate 同票发布（[验证 Specs 的可执行性与 Ticket 粒度](issues/07-validate-executable-spec-and-ticket-shape.md)）。

## Not yet specified

<!-- 当前没有尚未清晰到可出票的雾区；剩余规划工作已由 live child ticket 承接。 -->

## Out of scope

- 修改 production/test/tooling 代码、移动测试文件、运行完整或外部资源测试，以及进入任何 implementation ticket。
- 绑定 GitHub Actions、GitLab CI 等具体 CI 平台，创建平台 workflow，或定义和收集真实 CI/Linux runner 的强制门禁启用证据。
- 在迁移完成和目标 runner 有证据前提高 Redis、PostgreSQL、Browser 或 E2E 并发。
- 建设覆盖率门槛、JUnit/趋势平台、通用 flaky quarantine 系统或测试基础设施产品化平台。
- 修改冻结的 `openspec/` 历史产物。
