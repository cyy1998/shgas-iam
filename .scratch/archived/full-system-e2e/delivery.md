# Full-system E2E 开发记录

## 当前状态

- 正式范围：[spec.md](spec.md)。
- 目标分支：`main`；功能分支：`codex/full-system-e2e`。
- 先行 feature [test-collection-migration](../archived/test-collection-migration/spec.md) 已完成并归档。
- [01 — 建立 Exact-project Infra 与 Migration Lifecycle](issues/01-establish-exact-project-lifecycle.md) 已完成实现、聚焦验证和
  Standards/Spec 双轴复审，状态为 `resolved`。
- [02 — 启动 Repo Runtimes 并封闭诊断清理路径](issues/02-start-runtimes-and-close-cleanup.md) 已完成实现、验证与复审，
  Standards 0 findings、Spec 0 findings，状态为 `resolved`。
- [03 — 建立 One-shot Seed 与单一 Gateway Origin](issues/03-establish-seed-and-origin.md) 已完成实现、聚焦验证与双轴复审，
  Standards 0 findings、Spec 0 findings，状态为 `resolved`。
- [04 — 交付 Admin Custom SSO 真实 Journey](issues/04-deliver-admin-custom-sso-journey.md) 已完成实现、TDD、真实 slice
  验证与双轴复审，Standards 0 findings、Spec 0 findings，状态为 `resolved`。
- [05 — 交付 OIDC Authorization Code + PKCE 真实 Journey](issues/05-deliver-oidc-pkce-journey.md) 已完成实现、TDD、真实 slice
  验证与三轮双轴复审，Standards 0 findings、Spec 0 findings，状态为 `resolved`。
- [06 — 发布完整 test:e2e 并同步 Owner 文档](issues/06-publish-test-e2e.md) 已完成实现、TDD、Windows 本地真实 E2E
  验证与双轴复审，Standards 0 findings、Spec 0 findings，状态为 `resolved`。
- 六张 tickets 已全部 `resolved`。本次未运行最终 `pnpm verify`，也未授权或执行归档、merge、push、PR 或部署；下一安全动作是
  维护者按仓库 workflow 另行决定是否授权本地收尾。

## 验收与验证计划

- 每张后续中间 ticket 从空 project 运行其 workspace-local 完整 slice，并核对 best-effort exact-project cleanup；异常残留通过
  明确 descriptor/project 恢复，不把四类资源归零作为硬门禁。
- Contract tests 覆盖 descriptor-before-resource、migration/readiness/timeout/signal failure、bounded raw diagnostics、
  raw Playwright evidence、cleanup exit propagation 与 descriptor recovery。
- Tickets 04/05 分别运行单条真实 journey；Ticket 06 从干净环境无 retry 运行完整 `pnpm test:e2e` 一次。
- 每票运行 workspace lint/typecheck、最高层相关测试与 `git diff --check`；Ticket 06 另运行 root orchestration tests 和
  `pnpm check:docs`。
- 准备本地合入时仍按仓库 workflow 另行取得一次性收尾授权；不得把 Windows 本地结果表述为 Linux/CI adoption。

## 事件

- 2026-08-03 — Authorization：维护者明确授权发布四份正式 specs、delivery journals 与 24 张 implementation tickets；
  未授权代码实现或 Docker/browser/E2E 运行。
- 2026-08-03 — Publication：本 feature 的 spec、delivery 与 6 张 tickets 已发布；所有 tickets 保持
  `ready-for-agent`，production/test/tooling 尚未修改。
- 2026-08-05 — Implementation：在 `codex/full-system-e2e` 上以 `495a418c` 建立 root-owned `@iam/e2e-system`、
  exact-project descriptor、动态 Gateway port、四项 infra health、one-shot Drizzle migration 与精确 cleanup；以
  `84ae4dd9` 修正 Current owner 文档并把 workspace-local command 明确命名为 `infra:lifecycle`。
- 2026-08-05 — TDD：lifecycle、Docker command、descriptor、APISIX etcd hostname、migration image cleanup 与公开 command
  seam 均先观察到聚焦失败再转绿；最终 workspace contract tests 5/5 通过。
- 2026-08-05 — Validation：真实 empty-volume infra slice 连续两次无 retry 通过，Drizzle migrations 成功，结束后 exact
  project 的 containers、network、volumes 与本地 migration image 均为零；workspace lint/typecheck、文档与 collection
  guards、frozen lockfile、Compose config 和 `git diff --check` 通过。
- 2026-08-06 — Review：对 `9730e992...84ae4dd9` 完整范围复审；首轮 Standards 两项 finding 已由独立 fix commit 修复，
  最终 Standards 0 findings、Spec 0 findings。
- 2026-08-06 — Handoff：Ticket 01 验收项全部满足并标为 `resolved`；依赖前沿推进到 Ticket 02，但未授权开始 Ticket 02。
- 2026-08-06 — Implementation：按正式 [spec](spec.md) 与
  [Ticket 02](issues/02-start-runtimes-and-close-cleanup.md) 启动六个 repo runtimes、渲染单一 Gateway origin 并完成协议级 route
  readiness；诊断改为仅接收 synthetic data/credentials 的 bounded raw artifacts，原样保留 synthetic token/password/key 与
  raw Playwright trace/PNG/WebM。终止与 cleanup 简化为一次 best-effort 尝试，允许残留并保留 descriptor 供显式 recovery。
- 2026-08-06 — TDD：先复现 raw artifacts 被脱敏/删除、Playwright unavailable metadata 缺失及旧 termination gate 约束，再以
  runtime lifecycle、diagnostics、command boundary、cleanup 与 recovery contracts 转绿；失败 source 仍写真实 unavailable
  placeholder、继续保存其余 evidence，并在 cleanup 尝试后保持顶层非零。
- 2026-08-06 — Validation：真实 empty-volume runtime success 完成全部 readiness 后 cleanup；无效 Postgres image 的受控失败保留
  descriptor、receipt 与 raw diagnostics；Windows 真实 SIGINT 允许部分资源残留，随后按 descriptor 显式 recovery 成功。最终
  workspace tests 38/38、root tooling tests 106/106、全仓 lint/typecheck/unit、frozen lockfile、四项 guards、Compose config 与
  `git diff --check` 均通过。
- 2026-08-06 — Review：Ticket 02 最终 Standards 0 findings、Spec 0 findings；正式裁定保持 synthetic-only raw artifacts，
  signal/timeout 使用 best-effort termination，允许 residual 并依赖 exact descriptor recovery。
- 2026-08-06 — Handoff：Ticket 02 四项验收全部满足并标为 `resolved`；依赖前沿推进到 Ticket 03，但未授权开始 Ticket 03，下一步
  必须由维护者授权后交给全新 implementation 子代理。
- 2026-08-06 — Implementation：按正式 [spec](spec.md) 与
  [Ticket 03](issues/03-establish-seed-and-origin.md) 交付 production-owner one-shot seed、安全 receipt、rendered/public
  canonical origin contract，并使 APISIX 按完整动态 authority 匹配 Custom SSO routes。
- 2026-08-06 — TDD：从 lifecycle 顺序、seed/receipt/probe/origin seams、真实 APISIX authority mismatch 与缺失 Subject Facts
  的聚焦失败逐步转绿；后续 characterization 覆盖 migration/seed 共用 atomic JSON writer 的序列化与失败清理语义。
- 2026-08-06 — Validation：empty-project runtime lifecycle 无 retry 通过真实 migrations、owner seed、协议 readiness、诊断与
  exact-project cleanup；最终 E2E tests 48/48、Gateway tests 33/33，相关 lint/typecheck、guards、frozen lockfile、Compose config
  与 `git diff --check` 通过，未运行最终 `pnpm verify`。
- 2026-08-06 — Review：Ticket 03 经三轮 Standards/Spec 完整复审与额外 focused fix commits，最终 Standards 0 findings、
  Spec 0 findings。
- 2026-08-06 — Handoff：Ticket 03 三项验收全部满足并标为 `resolved`；Ticket 04 为默认下一票，Ticket 05 同时解阻，但均未授权
  开始实现，merge、push、PR、部署、归档与最终 `pnpm verify` 也未获授权。
- 2026-08-06 — Implementation：按正式 [spec](spec.md) 与
  [Ticket 04](issues/04-deliver-admin-custom-sso-journey.md) 交付 workspace-local Admin Custom SSO 真实 journey；独立 bootstrap
  Admin client 经真实 SSO 登录与 callback 返回 Admin，再从 UI 配置、启用并读回目标 client，失败 evidence 继续进入统一诊断与
  exact-project cleanup。
- 2026-08-06 — TDD：seed 双 client、lifecycle 顺序、Playwright command、Docker build context、collection owner 与共享 env reader
  均先观察聚焦失败再转绿；journey 不使用 `page.route` 替代 repo-owned core。
- 2026-08-06 — Validation：workspace-local slice 从 empty exact project 无 retry 通过 migrations、全部 runtime readiness、真实登录/
  callback、Custom SSO configure/enable/read-back 与 cleanup；workspace tests、root orchestration、相关 lint/typecheck/guards、frozen
  lockfile、Compose config 与 `git diff --check` 通过，未运行最终 `pnpm verify`。
- 2026-08-06 — Review：对 `fd4fef23...471d633b` 完整范围复审；Standards finding 由独立 focused fix commit 修复，最终
  Standards 0 findings、Spec 0 findings。
- 2026-08-06 — Handoff：Ticket 04 三项验收全部满足并标为 `resolved`；默认依赖前沿推进到 Ticket 05，但尚未授权开始实现；merge、
  push、PR、部署、归档与最终 `pnpm verify` 也未获授权。
- 2026-08-06 — Authorization：维护者授权按正式 [spec](spec.md) 与
  [Ticket 05](issues/05-deliver-oidc-pkce-journey.md) 实施单条 OIDC Authorization Code + PKCE journey；未授权 Ticket 06、merge、
  push、PR、部署、归档或最终 `pnpm verify`。
- 2026-08-06 — Implementation：交付 test-owned RP S256/callback helper、真实 authorize/password login/resume/token/UserInfo journey
  与 workspace-local lifecycle；同时修正 interaction Cookie 的显式 `cookieSecure` 配置和 SSO opaque return handle 接收，并将
  Admin/OIDC 共用浏览器 runner 与 lifecycle 收敛到 workspace-private seam。
- 2026-08-06 — TDD：RP helper、journey command、lifecycle、Cookie、opaque return、workspace command 与 Collection Guard contracts
  均先观察聚焦失败再转绿；Guard 最终只允许文档化的 Admin/OIDC owners，并继续从 Playwright list 动态验证 spec 唯一归属。
- 2026-08-06 — Validation：OIDC workspace-local slice 从 empty exact project 以零 retry 通过真实授权、PKCE mismatch、token、UserInfo
  与 code replay，并完成 exact-project cleanup；最终 E2E tests 57/57、root tooling 109/109，相关 integration/unit、lint/typecheck、
  guards、frozen lockfile、Compose config 与 `git diff --check` 通过，未运行最终 `pnpm verify`。
- 2026-08-06 — Review：Ticket 05 经三轮 Standards/Spec 完整范围复审及独立 focused fix commits，最终 Standards 0 findings、
  Spec 0 findings；未引入逐 spec Guard mapping、plugin platform 或额外 journey。
- 2026-08-06 — Handoff：Ticket 05 三项验收全部满足并标为 `resolved`；依赖前沿推进到 Ticket 06 `ready-for-agent`，但 Ticket 06
  尚未授权，merge、push、PR、部署、归档与最终 `pnpm verify` 也未执行。
- 2026-08-06 — Authorization：维护者明确授权按正式 [spec](spec.md) 与
  [Ticket 06](issues/06-publish-test-e2e.md) 发布完整 root `pnpm test:e2e` 并同步 Current owner 文档；未授权最终
  `pnpm verify`、归档、merge、push、PR 或部署。
- 2026-08-06 — Implementation：发布 root `pnpm test:e2e`、Turbo `test:e2e` 与 `@iam/e2e-system#test:e2e` owner command，
  在同一个 exact-project lifecycle 中完成资源前 preflight、固定 Admin → OIDC 顺序、diagnostics 与 cleanup exit propagation；
  Collection Guard 通过 Playwright machine list 唯一收集两条 journey，并同步测试架构、仓库地图、命令与 ADR Current 文档。
- 2026-08-06 — TDD：root/workspace command、完整 journey 组合、Collection Guard 与 Current docs contracts 均先观察到聚焦失败再
  转绿；完整 seam 验证两条 journey 在资源前完成 preflight、Admin 失败时不运行 OIDC，并在 diagnostics 后传播 cleanup failure。
- 2026-08-06 — Validation：Windows 本地从新的 exact project volumes 一次、零 retry 运行 `pnpm test:e2e` 通过，project
  `iam-e2e-20260806045632077-861c02b6`、origin `http://127.0.0.1:50063`，migration/seed receipts 均为 `applied`，diagnostics
  无 unavailable source；结束后按 exact project 核对 containers、networks、volumes 与 images 均无本 run 残留。E2E workspace
  tests 60/60、root orchestration 44/44、相关 lint/typecheck、Collection/Architecture/Env/Docs guards、Turbo dry-run 与
  `git diff --check` 均通过；未运行最终 `pnpm verify`，未宣称 Linux/CI 验收。
- 2026-08-06 — Review：对 Ticket 06 fixed point `b477e73c93f5932007f26cea2cef957ac07eb94a` 到候选实现完整范围执行双轴复审，
  最终 Standards 0 findings、Spec 0 findings。
- 2026-08-06 — Handoff：Ticket 06 四项验收全部满足并标为 `resolved`；Full-system E2E 六张 tickets 全部完成。未运行最终
  `pnpm verify`，未归档、merge、push、创建 PR 或部署，后续本地收尾仍需维护者另行授权。
