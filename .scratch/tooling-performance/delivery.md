# 工具链性能与缓存治理交付记录

Workflow-Version: 2
Feature-Slug: tooling-performance
Workflow-Kind: standard
Stage: delivered
Feature-Branch: codex/tooling-performance
Target-Branch: main
Target-Base: 55c25384e82fca2935dec782e4dd270090a9d5dc
Ticketing-Authorization: granted
Implementation-Authorization: granted
Authorized-Implementation-Scope: tickets 01-06
Current-Ticket: none
Current-Ticket-Base: none
Change-Types: agent-config,code,database,dependencies,docs,frontend,gateway
Affected-Workspaces: @iam/admin,@iam/admin-api,@iam/api,@iam/api-core,@iam/contracts,@iam/db,@iam/domain,@iam/eslint-config,@iam/gateway-apisix,@iam/jobs,@iam/oidc-provider,@iam/role-assignment-resolution,@iam/sso,@iam/user-profile-read-model,@iam/worker
Validation-Plan: declared
Content-Head: 232f2de75043fb0985cbadff17f73213c6282c5c
Verified-Content-Head: 232f2de75043fb0985cbadff17f73213c6282c5c
Reviewed-Content-Head: 232f2de75043fb0985cbadff17f73213c6282c5c
Merge-Target-Tip: 55c25384e82fca2935dec782e4dd270090a9d5dc
Final-Squash-Commit: a5f1355ea4d0f164417e5bab32367cf6d7dadf16

## 范围与验收

- Approved spec：[`spec.md`](spec.md)。
- Tickets：[`01`](issues/01-establish-tooling-performance-seams.md)、[`02`](issues/02-build-efficient-eslint-config-package.md)、[`03`](issues/03-migrate-eslint-consumers.md)、[`04`](issues/04-cache-root-lint-with-turbo.md)、[`05`](issues/05-govern-test-and-typecheck-budgets.md)、[`06`](issues/06-lock-tooling-practices-and-verify.md)。
- 治理仓库 lint、typecheck 与 test 的超时、嵌套并发、缓存输入和共享 ESLint 配置边界。
- 已取得 tickets 01–06 的实现授权；未授权 merge、push 或远端清理。

## Validation Plan

| Scope | Change-Types | Affected-Workspaces | Required-Commands |
|---|---|---|---|
| ticket:01 | agent-config,code | root | `bun test scripts/__tests__/tooling-performance.test.ts`<br>`pnpm lint`<br>`pnpm typecheck`<br>`pnpm check:docs`<br>`pnpm check:workflow`<br>`git diff --check` |
| ticket:02 | agent-config,code,dependencies,docs | @iam/eslint-config | `pnpm install --frozen-lockfile`<br>`pnpm --filter @iam/eslint-config test`<br>`pnpm --filter @iam/eslint-config lint`<br>`pnpm --filter @iam/eslint-config typecheck`<br>`node scripts/benchmark-eslint-config.mjs --rounds 5`<br>`pnpm check:docs`<br>`pnpm check:workflow`<br>`git diff --check` |
| ticket:03 | agent-config,code,database,dependencies,frontend,gateway | @iam/admin,@iam/admin-api,@iam/api,@iam/api-core,@iam/contracts,@iam/db,@iam/domain,@iam/eslint-config,@iam/gateway-apisix,@iam/jobs,@iam/oidc-provider,@iam/role-assignment-resolution,@iam/sso,@iam/user-profile-read-model,@iam/worker | `pnpm install --frozen-lockfile`<br>`bun test scripts/__tests__/eslint-config-equivalence.test.ts`<br>`node scripts/benchmark-eslint-config.mjs --rounds 5`<br>`pnpm lint`<br>`pnpm typecheck`<br>`pnpm --filter @iam/db db:check`<br>`pnpm --filter @iam/role-assignment-resolution test:postgres`<br>`pnpm --filter @iam/admin e2e`<br>`pnpm --filter @iam/sso e2e`<br>`pnpm gateway:apisix:validate -- --env dev:iam`<br>`pnpm check:docs`<br>`pnpm check:workflow`<br>`git diff --check` |
| ticket:04 | agent-config,code,dependencies | root | `pnpm install --frozen-lockfile`<br>`bun test scripts/__tests__/tooling-performance.test.ts`<br>`timeout 10s pnpm lint`<br>`pnpm typecheck`<br>`pnpm check:docs`<br>`pnpm check:workflow`<br>`git diff --check` |
| ticket:05 | agent-config,code,dependencies | @iam/oidc-provider | `pnpm install --frozen-lockfile`<br>`pnpm --filter @iam/oidc-provider exec vitest run src/__tests__/entry.smoke.test.ts`<br>`pnpm exec turbo typecheck --force --concurrency=3`<br>`pnpm exec turbo test --force --concurrency=2`<br>`pnpm lint`<br>`pnpm check:docs`<br>`pnpm check:workflow`<br>`git diff --check` |
| ticket:06 | agent-config,code,dependencies,docs,frontend | @iam/eslint-config,@iam/sso | `pnpm install --frozen-lockfile`<br>`bun test scripts/__tests__/tooling-performance.test.ts`<br>`bun test scripts/__tests__/eslint-config-equivalence.test.ts`<br>`pnpm --filter @iam/eslint-config test`<br>`pnpm --filter @iam/eslint-config lint`<br>`pnpm --filter @iam/eslint-config typecheck`<br>`pnpm exec turbo lint:fix lint:fix:root --dry=json`<br>`node scripts/benchmark-eslint-config.mjs --rounds 5`<br>`timeout 10s pnpm lint`<br>`pnpm exec turbo typecheck --force --concurrency=3`<br>`pnpm exec turbo test --force --concurrency=2`<br>`pnpm --filter @iam/sso test`<br>`pnpm --filter @iam/sso lint`<br>`pnpm --filter @iam/sso typecheck`<br>`pnpm --filter @iam/sso e2e`<br>`pnpm lint`<br>`pnpm typecheck`<br>`pnpm test`<br>`pnpm build`<br>`pnpm check:docs`<br>`pnpm check:workflow`<br>`git diff --check` |
| feature | agent-config,code,database,dependencies,docs,frontend,gateway | @iam/admin,@iam/admin-api,@iam/api,@iam/api-core,@iam/contracts,@iam/db,@iam/domain,@iam/eslint-config,@iam/gateway-apisix,@iam/jobs,@iam/oidc-provider,@iam/role-assignment-resolution,@iam/sso,@iam/user-profile-read-model,@iam/worker | `pnpm install --frozen-lockfile`<br>`pnpm lint`<br>`pnpm typecheck`<br>`pnpm test`<br>`pnpm build`<br>`pnpm --filter @iam/db db:check`<br>`pnpm --filter @iam/role-assignment-resolution test:postgres`<br>`pnpm --filter @iam/admin e2e`<br>`pnpm --filter @iam/sso e2e`<br>`pnpm gateway:apisix:validate -- --env dev:iam`<br>`pnpm check:docs`<br>`pnpm check:workflow`<br>`git diff --check` |

## 阶段证据

- `G1 Branch Ready` — 从 main 的 `55c25384e82fca2935dec782e4dd270090a9d5dc` 创建功能分支并初始化交付记录。
- `G3 Tickets Ready` — 维护者批准进入 ticket 阶段；spec 已批准，六张 tracer-bullet tickets 已发布并声明阻塞关系与 Validation Plan。
- `T2 Candidate Validated` — ticket 01；Content-Head: `69e05c4bea838c212f7821ff8baa8c58da060c85`；性能基准、结构测试、评审修复与 ticket Validation Plan 通过。
- `T3 Ticket Reviewed` — ticket 01；Content-Head: `69e05c4bea838c212f7821ff8baa8c58da060c85`；Standards 与 Spec 完整复审均无 finding。
- `T4 Ticket Resolved` — ticket 01；性能回归接缝、验证与双轴评审证据完整。
- `T2 Candidate Validated` — ticket 02；Content-Head: `d9480121eb742b95de9875d16a7565d1e04239ef`；共享配置包、backend/frontend 默认基准、四 profile 五轮对照、真实 TypeScript 编译、架构边界与依赖验证通过。
- `T3 Ticket Reviewed` — ticket 02；Content-Head: `d9480121eb742b95de9875d16a7565d1e04239ef`；Standards 与 Spec 经评审修复后完整复审均无 finding。
- `T4 Ticket Resolved` — ticket 02；共享 ESLint 配置选型、审计、验证与双轴评审证据完整。
- `T2 Candidate Validated` — ticket 03；Content-Head: `1fe00e596e2c41de28a30a2d9bc37689a34c745b`；15 个消费入口由实际 manifest lint scripts 动态发现，文件集合、退出码、诊断键与完整依赖所有权严格等价，专项与性能验证通过。
- `T3 Ticket Reviewed` — ticket 03；Content-Head: `1fe00e596e2c41de28a30a2d9bc37689a34c745b`；Standards 与 Spec 经评审修复后完整复审均无 finding。
- `T4 Ticket Resolved` — ticket 03；全仓共享配置迁移、等价基线、依赖所有权、性能复测与专项验证证据完整。
- `T2 Candidate Validated` — ticket 04；Content-Head: `7b8b545ed2f54f878ac2e47bfd34dafbc776b96b`；根 lint/fix 已纳入单次 Turbo 调度，root task 精确执行全局 workflow 检查，缓存命中、共享 preset 哈希传播与诊断等价验证通过。
- `T3 Ticket Reviewed` — ticket 04；Content-Head: `7b8b545ed2f54f878ac2e47bfd34dafbc776b96b`；Standards 与 Spec 经 root workflow input 精确性修复后完整复审均无 finding。
- `T4 Ticket Resolved` — ticket 04；根 lint 缓存、workflow 输入、共享配置哈希 amendment、单进程对照与 warm 反馈环证据完整。
- `T2 Candidate Validated` — ticket 05；Content-Head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`；根 test/typecheck 并发预算、OIDC 两层定点 timeout、钉死实际 runtime 的 TS7/TS6 双轨、命名准确的结构守卫和经 amendment 调整的连续冷执行预算均验证通过。
- `T3 Ticket Reviewed` — ticket 05；Content-Head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`；Standards 与 Spec 经 runtime pin、timeout 消费守卫、窄化任务图 seam、suite 命名及验证新鲜度修复后完整复审均无 finding。
- `T4 Ticket Resolved` — ticket 05；命令级并发预算、OIDC 定点 timeout、TS7/TS6 双轨解析、连续冷执行预算和完整新鲜验证证据齐备。
- `T2 Candidate Validated` — ticket 06；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；Current 文档、结构守卫、性能复测、工具版本边界和完整 feature 验证矩阵均已执行，连续达标样本与一次 typecheck 超阈值波动均如实记录。
- `T2 Candidate Validated` — ticket 06；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；评审发现的重复 consumer scanner 已移除并复用既有 ESLint ownership seam，最终 benchmark 补齐 config/lint RSS 与基线对比，全部性能和正确性验证在修复后的 content HEAD 重新执行。
- `T2 Candidate Validated` — ticket 06；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；Validation Plan 新鲜度与重复 SSO 测试尾延迟 finding 已修复；不提高 timeout 的压力回归、最终性能样本和完整 feature 验证矩阵均在当前 content HEAD 通过。
- `T2 Candidate Validated` — ticket 06；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；Ticket 06 的 frontend/@iam/sso 范围与性能、SSO 专项命令已进入 Validation Plan，更新后的完整 ticket/feature 矩阵在同一 content HEAD 通过。
- `T3 Ticket Reviewed` — ticket 06；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；Standards 与 Spec 经重复 scanner、RSS 证据、Validation Plan 新鲜度/范围和 SSO 测试尾延迟修复后完整复审均无 finding。
- `T4 Ticket Resolved` — ticket 06；Current 文档、结构 guard、性能/版本审计、SSO 稳定性修复、完整验证矩阵与双轴评审证据齐备。
- `T1 Ticket Claimed` — ticket 06；最终 feature 双轴评审发现基准失败传播、职责边界、`lint:fix` 完整性、首文件 lint 分段和 CPU 时间证据缺口，按原验收范围重开。
- `T2 Candidate Validated` — ticket 06 remediation；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；基准 fail-fast、独立结构契约模块、全 workspace `lint:fix` guard、首文件 lint 分段、CPU 时间文档与新鲜性能/正确性矩阵全部验证通过。
- `T3 Ticket Reviewed` — ticket 06 remediation；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；Standards 与 Spec 对 remediation base 后的完整范围复审均无 finding，修正后的故障注入命令原样复跑通过。
- `T4 Ticket Resolved` — ticket 06 remediation；五项最终 feature finding、验证证据文字偏差与完整双轴复审均已闭环。
- `G5 Feature Verified` — content、verified 与 reviewed head 均固定为 `232f2de75043fb0985cbadff17f73213c6282c5c`；target tip 仍为 `55c25384e82fca2935dec782e4dd270090a9d5dc`，完整 feature 验证矩阵与最终 Standards/Spec 双轴评审均通过。
- `G6 Merge Ready` — target tip 与 merge-base 仍为 `55c25384e82fca2935dec782e4dd270090a9d5dc`；工作区干净且无未完成 Git 操作，Merge brief 已绑定相同的 content、verified 与 reviewed head，等待维护者授权本地 squash 事务。
- `G7 Delivered` — 本地 squash delivery commit 为 `a5f1355ea4d0f164417e5bab32367cf6d7dadf16`；最终 SHA 回填、tracker-only 元数据提交、最终检查和本地功能分支清理在同一本地事务内完成。

## 验证记录

- `bun test scripts/__tests__/tooling-performance.test.ts` — passed；Content-Head: `69e05c4bea838c212f7821ff8baa8c58da060c85`；7/7 通过。
- `node scripts/benchmark-eslint-config.mjs --profile current-backend --rounds 5 --compile-cache-dir <temp>` — passed；Content-Head: `69e05c4bea838c212f7821ff8baa8c58da060c85`；真实 domain config 与 lint 分阶段生成 5 轮隔离缓存样本。
- `pnpm lint` — passed；Content-Head: `69e05c4bea838c212f7821ff8baa8c58da060c85`；保留既有前端 warnings。
- `pnpm typecheck` — passed；Content-Head: `69e05c4bea838c212f7821ff8baa8c58da060c85`；14/14 workspace 通过。
- `pnpm check:docs` — passed；Content-Head: `69e05c4bea838c212f7821ff8baa8c58da060c85`；28 个 Current 文档索引通过。
- `pnpm check:workflow -- --feature tooling-performance` — passed；Content-Head: `69e05c4bea838c212f7821ff8baa8c58da060c85`；feature tracker 格式通过。
- `git diff --check` — passed；Content-Head: `69e05c4bea838c212f7821ff8baa8c58da060c85`；无 whitespace finding。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `d9480121eb742b95de9875d16a7565d1e04239ef`；16 个 workspace 锁文件安装通过。
- `pnpm --filter @iam/eslint-config test` — passed；Content-Head: `d9480121eb742b95de9875d16a7565d1e04239ef`；4/4 preset 测试通过。
- `pnpm --filter @iam/eslint-config lint` — passed；Content-Head: `d9480121eb742b95de9875d16a7565d1e04239ef`；共享包 TypeScript 源码、测试与 benchmark profile 通过。
- `pnpm --filter @iam/eslint-config typecheck` — passed；Content-Head: `d9480121eb742b95de9875d16a7565d1e04239ef`；所有公开 preset 模块通过 `tsc --noEmit`。
- `node scripts/benchmark-eslint-config.mjs --profile current-backend --profile candidate-backend --profile lean-backend --profile curated-backend --rounds 5` — passed；Content-Head: `b58dedb21dff208abf83ef5e7142f72cdf54adef`；四 profile 完整 domain lint 五轮对照通过。
- `node scripts/benchmark-eslint-config.mjs --profile current-backend --profile candidate-backend --profile lean-backend --profile curated-backend --rounds 5 --config-only` — passed；Content-Head: `b58dedb21dff208abf83ef5e7142f72cdf54adef`；TypeScript 源码与声明式 profile registry 修复后生成 20 个交错配置加载样本。
- `node scripts/benchmark-eslint-config.mjs --rounds 5` — passed；Content-Head: `d9480121eb742b95de9875d16a7565d1e04239ef`；默认 current-backend/current-frontend 各五轮，分别稳定扫描 42/78 个文件，退出码为 0，frontend 保留既有 25 个 warnings。
- `pnpm lint` — passed；Content-Head: `b58dedb21dff208abf83ef5e7142f72cdf54adef`；15/15 workspace 与 root lint 通过。
- `pnpm typecheck` — passed；Content-Head: `b58dedb21dff208abf83ef5e7142f72cdf54adef`；15/15 workspace 通过。
- `pnpm check:docs` — passed；Content-Head: `d9480121eb742b95de9875d16a7565d1e04239ef`；28 个 Current 文档索引通过。
- `pnpm check:workflow -- --feature tooling-performance` — passed；Content-Head: `d9480121eb742b95de9875d16a7565d1e04239ef`；feature tracker 格式通过。
- `git diff --check` — passed；Content-Head: `d9480121eb742b95de9875d16a7565d1e04239ef`；无 whitespace finding。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `1fe00e596e2c41de28a30a2d9bc37689a34c745b`；16 个 workspace 从仅含 ESLint 集中化差异的锁文件安装通过。
- `bun test scripts/__tests__/eslint-config-equivalence.test.ts` — passed；Content-Head: `1fe00e596e2c41de28a30a2d9bc37689a34c745b`；动态发现的 15 个消费入口在文件集合哈希、退出码、诊断键和依赖所有权上完全等价。
- `node scripts/benchmark-eslint-config.mjs --rounds 5` — passed；Content-Head: `1fe00e596e2c41de28a30a2d9bc37689a34c745b`；backend/frontend 共 10 个交错样本，分别稳定扫描 42/78 个文件，退出码为 0，frontend 保留 25 个既有 warnings。
- `pnpm lint` — passed；Content-Head: `1fe00e596e2c41de28a30a2d9bc37689a34c745b`；15/15 workspace 与根检查通过，保留 Admin 25、SSO 4 个既有 warnings。
- `pnpm typecheck` — passed；Content-Head: `1fe00e596e2c41de28a30a2d9bc37689a34c745b`；15/15 workspace 通过。
- `pnpm --filter @iam/db db:check` — passed；Content-Head: `1fe00e596e2c41de28a30a2d9bc37689a34c745b`；Drizzle schema 检查通过。
- `pnpm --filter @iam/role-assignment-resolution test:postgres` — passed；Content-Head: `1fe00e596e2c41de28a30a2d9bc37689a34c745b`；使用本地专用 `iam_role_assignment_test` 数据库，45/45 通过并清理随机 schema。
- `pnpm --filter @iam/admin e2e` — passed；Content-Head: `1fe00e596e2c41de28a30a2d9bc37689a34c745b`；Chromium 2/2 通过。
- `pnpm --filter @iam/sso e2e` — passed；Content-Head: `1fe00e596e2c41de28a30a2d9bc37689a34c745b`；Chromium 3/3 通过。
- `pnpm gateway:apisix:validate -- --env dev:iam` — passed；Content-Head: `1fe00e596e2c41de28a30a2d9bc37689a34c745b`；APISIX 12 条 routes 与关联资源通过校验。
- `pnpm check:docs` — passed；Content-Head: `1fe00e596e2c41de28a30a2d9bc37689a34c745b`；28 个 Current 文档索引通过。
- `pnpm check:workflow -- --feature tooling-performance` — passed；Content-Head: `1fe00e596e2c41de28a30a2d9bc37689a34c745b`；feature tracker 格式通过。
- `git diff --check` — passed；Content-Head: `1fe00e596e2c41de28a30a2d9bc37689a34c745b`；无 whitespace finding。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `8621d6682667ae8835bef56b703e187bef00fcc3`；16 个 workspace 冻结安装通过且 lockfile 无变化。
- `bun test scripts/__tests__/tooling-performance.test.ts` — passed；Content-Head: `8621d6682667ae8835bef56b703e187bef00fcc3`；8/8 通过并锁定 root lint/fix task、精确 inputs 与既有 task graph。
- `bun test scripts/__tests__/eslint-config-equivalence.test.ts` — passed；Content-Head: `8621d6682667ae8835bef56b703e187bef00fcc3`；15 个 consumer 的文件集合、诊断与直接配置依赖保持等价。
- `pnpm exec turbo run lint lint:root typecheck test --dry=json` — passed；Content-Head: `8621d6682667ae8835bef56b703e187bef00fcc3`；临时改变共享 preset 后 lint 15/15、root lint 1/1、typecheck 15/15、test 15/15 hash 均按批准 amendment 失效，探针已完整回退。
- `timeout 10s pnpm lint` — passed；Content-Head: `8621d6682667ae8835bef56b703e187bef00fcc3`；预热后连续三轮为 1.30、1.50、1.40 秒，root lint 三轮均命中同一 Turbo cache。
- `pnpm typecheck` — passed；Content-Head: `8621d6682667ae8835bef56b703e187bef00fcc3`；15/15 workspace 命中有效 cache 并通过。
- `pnpm check:docs` — passed；Content-Head: `8621d6682667ae8835bef56b703e187bef00fcc3`；28 个 Current 文档索引通过。
- `pnpm check:workflow -- --feature tooling-performance` — passed；Content-Head: `8621d6682667ae8835bef56b703e187bef00fcc3`；feature tracker 格式通过。
- `git diff --check` — passed；Content-Head: `8621d6682667ae8835bef56b703e187bef00fcc3`；无 whitespace finding。
- `pnpm exec eslint --concurrency=off <15 consumer targets + config owner> --format json` — passed；Content-Head: `8621d6682667ae8835bef56b703e187bef00fcc3`；首次/预热为 45.82/39.65 秒，最大 RSS 1,300,848/1,250,376 KiB，两轮 JSON 一致，15 个 consumer 分区与基线完全等价，配置包额外 11 files 无诊断。
- `pnpm exec turbo run lint lint:root --force` — passed；Content-Head: `8621d6682667ae8835bef56b703e187bef00fcc3`；16/16 强制执行为 148.33 秒、最大 RSS 724,736 KiB；该命令额外包含 Admin/SSO Stylelint，正式模型保持不变。
- `bun test scripts/__tests__/tooling-performance.test.ts` — passed；Content-Head: `7b8b545ed2f54f878ac2e47bfd34dafbc776b96b`；8/8 通过，锁定 root lint 执行全局 workflow checker 及 delivery/spec/issues 精确 inputs。
- `pnpm exec turbo run lint lint:root --dry=json` — passed；Content-Head: `7b8b545ed2f54f878ac2e47bfd34dafbc776b96b`；root task 命令包含 workflow checker，48 个 workflow inputs 不再包含未读取的 legacy verification 文档。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `7b8b545ed2f54f878ac2e47bfd34dafbc776b96b`；16 个 workspace 冻结安装通过且 lockfile 无变化。
- `timeout 10s pnpm lint` — passed；Content-Head: `7b8b545ed2f54f878ac2e47bfd34dafbc776b96b`；预热后连续三轮为 2.91、2.51、2.61 秒，root lint 均命中 cache；未命中时实际执行全局 workflow checker 并通过。
- `pnpm typecheck` — passed；Content-Head: `7b8b545ed2f54f878ac2e47bfd34dafbc776b96b`；15/15 workspace 通过。
- `pnpm check:docs` — passed；Content-Head: `7b8b545ed2f54f878ac2e47bfd34dafbc776b96b`；28 个 Current 文档索引通过。
- `pnpm check:workflow -- --feature tooling-performance` — passed；Content-Head: `7b8b545ed2f54f878ac2e47bfd34dafbc776b96b`；feature tracker 格式通过。
- `git diff --check` — passed；Content-Head: `7b8b545ed2f54f878ac2e47bfd34dafbc776b96b`；无 whitespace finding。
- `pnpm exec eslint --concurrency=off <15 consumer targets + config owner> --format json` — passed；Content-Head: `7b8b545ed2f54f878ac2e47bfd34dafbc776b96b`；连续两次为 36.22/66.06 秒，最大 RSS 1,349,548/1,347,828 KiB，JSON 一致且 15 个 consumer 分区与基线完全等价，配置包额外 11 files 无诊断。
- `pnpm exec turbo run lint lint:root --force` — passed；Content-Head: `7b8b545ed2f54f878ac2e47bfd34dafbc776b96b`；16/16 强制执行为 151.22 秒、最大 RSS 731,060 KiB，同时执行并通过全局 workflow checker；正式 package-level 模型保持不变。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `648f26b7703517cfc24c7df1bbce32e81ae63419`；16 个 workspace 冻结安装通过且 lockfile 无变化。
- `pnpm --filter @iam/oidc-provider exec vitest run src/__tests__/entry.smoke.test.ts` — passed；Content-Head: `648f26b7703517cfc24c7df1bbce32e81ae63419`；真实 composition root smoke 1/1 通过，测试体 3.83 秒，保留子进程输出失败路径。
- `bun test scripts/__tests__/tooling-performance.test.ts` — passed；Content-Head: `648f26b7703517cfc24c7df1bbce32e81ae63419`；8/8 通过，锁定根 concurrency 3/2、无全局 concurrency 和 OIDC 15,000/25,000 毫秒阈值。
- `pnpm exec turbo typecheck --force --concurrency=3` — passed；Content-Head: `648f26b7703517cfc24c7df1bbce32e81ae63419`；连续两轮 32.69/55.65 秒，15/15 成功，最大 RSS 2,332,868/2,376,100 KiB。
- `pnpm exec turbo test --force --concurrency=2` — passed；Content-Head: `648f26b7703517cfc24c7df1bbce32e81ae63419`；连续两轮 62.85/46.47 秒，15/15 成功，最大 RSS 439,144/448,148 KiB。
- `pnpm lint` — passed；Content-Head: `648f26b7703517cfc24c7df1bbce32e81ae63419`；16/16 lint/root tasks 通过，保留 Admin 25、SSO 4 个既有 warnings。
- `pnpm typecheck` — passed；Content-Head: `648f26b7703517cfc24c7df1bbce32e81ae63419`；根脚本使用 concurrency 3，15/15 workspace 通过。
- `pnpm test` — passed；Content-Head: `648f26b7703517cfc24c7df1bbce32e81ae63419`；根脚本使用 concurrency 2，15/15 workspace 通过。
- `pnpm exec tsc --version && node -e <typescript version probe>` — failed；Content-Head: `648f26b7703517cfc24c7df1bbce32e81ae63419`；初次探针误读 wrapper manifest 为 compatibility API 版本；复审确认 wrapper 为 6.0.2、实际 runtime API 为 6.0.3。
- `pnpm check:docs` — passed；Content-Head: `648f26b7703517cfc24c7df1bbce32e81ae63419`；28 个 Current 文档索引通过。
- `pnpm check:workflow -- --feature tooling-performance` — passed；Content-Head: `648f26b7703517cfc24c7df1bbce32e81ae63419`；feature tracker 格式通过。
- `git diff --check` — passed；Content-Head: `648f26b7703517cfc24c7df1bbce32e81ae63419`；无 whitespace finding。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `ab39309add7b8f40cfa23721c6daffea9c599a6a`；窄化 override 后 16 个 workspace 冻结安装通过，lockfile 仅将 compatibility runtime 从 6.0.3 钉死为 6.0.2。
- `bun test scripts/__tests__/tooling-performance.test.ts` — passed；Content-Head: `ab39309add7b8f40cfa23721c6daffea9c599a6a`；9/9 通过、36 个断言，新增 timeout 消费位置及 TS 双轨实际 runtime 回归守卫。
- `pnpm --filter @iam/oidc-provider exec vitest run src/__tests__/entry.smoke.test.ts` — passed；Content-Head: `ab39309add7b8f40cfa23721c6daffea9c599a6a`；真实 composition root smoke 1/1 通过，测试体 5.02 秒。
- `pnpm exec turbo typecheck --force --concurrency=3` — passed；Content-Head: `ab39309add7b8f40cfa23721c6daffea9c599a6a`；连续两轮 64.05/49.92 秒，15/15 成功，最大 RSS 2,401,656/2,367,700 KiB，均低于 80 秒 amendment 阈值。
- `pnpm exec turbo test --force --concurrency=2` — passed；Content-Head: `ab39309add7b8f40cfa23721c6daffea9c599a6a`；连续两轮 51.61/52.13 秒，15/15 成功，最大 RSS 1,151,832/437,432 KiB，均低于 75 秒 amendment 阈值。
- `pnpm lint` — passed；Content-Head: `ab39309add7b8f40cfa23721c6daffea9c599a6a`；lockfile 变化触发完整冷执行，16/16 lint/root tasks 于 123.657 秒通过，保留 Admin 25、SSO 4 个既有 warnings。
- `pnpm typecheck` — passed；Content-Head: `ab39309add7b8f40cfa23721c6daffea9c599a6a`；根脚本使用 concurrency 3，15/15 workspace 通过。
- `pnpm test` — passed；Content-Head: `ab39309add7b8f40cfa23721c6daffea9c599a6a`；根脚本使用 concurrency 2，15/15 workspace 通过。
- `pnpm exec tsc --version && node -e <wrapper/runtime version probe>` — passed；Content-Head: `ab39309add7b8f40cfa23721c6daffea9c599a6a`；CLI 为 7.0.2，wrapper 与实际 compatibility runtime API 均为 6.0.2。
- `pnpm check:docs` — passed；Content-Head: `ab39309add7b8f40cfa23721c6daffea9c599a6a`；28 个 Current 文档索引通过。
- `pnpm check:workflow -- --feature tooling-performance` — passed；Content-Head: `ab39309add7b8f40cfa23721c6daffea9c599a6a`；feature tracker 格式通过。
- `git diff --check` — passed；Content-Head: `ab39309add7b8f40cfa23721c6daffea9c599a6a`；无 whitespace finding。
- `bun test scripts/__tests__/tooling-performance.test.ts` — passed；Content-Head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`；9/9 通过、36 个断言；suite 名准确覆盖 ESLint 基准、任务图、并发、timeout 与 TypeScript 双轨契约。
- `pnpm exec eslint --config eslint.root.config.mjs scripts/__tests__/tooling-performance.test.ts` — passed；Content-Head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`；聚焦 root ESLint 检查通过。
- `git diff --check` — passed；Content-Head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`；无 whitespace finding。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`；16 个 workspace 冻结安装通过且 lockfile 无变化。
- `pnpm --filter @iam/oidc-provider exec vitest run src/__tests__/entry.smoke.test.ts` — passed；Content-Head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`；真实 composition root smoke 1/1 通过，测试体 6.67 秒。
- `pnpm exec turbo typecheck --force --concurrency=3` — passed；Content-Head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`；连续两轮 57.66/64.43 秒，15/15 成功，最大 RSS 2,359,144/2,359,936 KiB，均低于 80 秒阈值。
- `pnpm exec turbo test --force --concurrency=2` — passed；Content-Head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`；连续两轮 58.17/47.93 秒，15/15 成功，最大 RSS 436,260/425,640 KiB，均低于 75 秒阈值。
- `pnpm lint` — passed；Content-Head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`；16/16 lint/root tasks 于 31.67 秒通过，15 个 package task 命中 cache，root task 执行结构守卫；保留 Admin 25、SSO 4 个既有 warnings。
- `pnpm typecheck` — passed；Content-Head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`；根默认 concurrency 3，15/15 workspace 通过。
- `pnpm test` — passed；Content-Head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`；根默认 concurrency 2，15/15 workspace 通过。
- `pnpm exec tsc --version && node -e <wrapper/runtime version probe>` — passed；Content-Head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`；CLI 7.0.2，官方 wrapper 与实际 compatibility runtime API 均为 6.0.2。
- `pnpm check:docs` — passed；Content-Head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`；28 个 Current 文档索引通过。
- `pnpm check:workflow -- --feature tooling-performance` — passed；Content-Head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`；feature tracker 格式通过。
- `git diff --check` — passed；Content-Head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`；完整 Ticket 05 Validation Plan 后仍无 whitespace finding。
- `bun test scripts/__tests__/tooling-performance.test.ts` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；9/9 通过、67 个断言，锁定 root lint、共享配置依赖、并发预算、全局 timeout 禁令与 TypeScript 双轨。
- `pnpm exec eslint --config eslint.root.config.mjs scripts/benchmark-eslint-config.mjs scripts/__tests__/tooling-performance.test.ts` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；新增结构审计 helper 与测试通过聚焦 ESLint。
- `pnpm check:docs` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；28 个 Current 文档索引通过。
- `pnpm check:workflow -- --feature tooling-performance` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；feature tracker 格式通过。
- `git diff --check` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；无 whitespace finding。
- `pnpm lint` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；预热轮 16.25 秒、最大 RSS 526,548 KiB，15 个 package lint 命中 cache、root lint 首次执行；16/16 tasks 通过，保留 Admin 25、SSO 4 个既有 warnings。
- `timeout 10s pnpm lint` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；预热后连续三轮 1.50/1.60/1.30 秒，最大 RSS 143,380/137,244/135,144 KiB，16/16 tasks 全部命中 cache；相对目标基线 warm lint 约 15.7 秒且 10 秒稳定超时，反馈环已进入预算。
- `node scripts/benchmark-eslint-config.mjs --rounds 5` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；backend/frontend 交错五轮并禁用 Node compile cache，分别稳定扫描 42/78 个文件且诊断不变。Backend 首轮 import/compose/总加载为 2433.55/677.31/3110.86 ms、完整 lint 28,588.79 ms，热中位数为 1744.10/417.09/2200.89 ms、lint 15,810.11 ms；frontend 首轮为 2850.09/789.76/3639.86 ms、lint 26,777.82 ms，热中位数为 1627.62/481.26/2108.88 ms、lint 16,275.90 ms。首轮总加载仍处于原始 Antfu 2.5–4.3 秒基线区间，说明固定插件图成本仍在；本次收益来自集中依赖与 Turbo cache，而不是宣称共享包消除了 Antfu 加载。
- `pnpm exec turbo typecheck --force --concurrency=3` — failed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；首次连续观测为 58.15/80.62 秒，15/15 均成功、最大 RSS 2,457,084/2,378,448 KiB，但第二轮超过 80 秒预算 0.62 秒，因此不计为验收通过。
- `pnpm exec turbo typecheck --force --concurrency=3` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；重新取得连续两轮 55.67/75.71 秒，15/15 成功、最大 RSS 2,356,848/2,362,176 KiB，均低于 80 秒预算；未修改并发、checker 或业务 timeout。
- `pnpm exec turbo test --force --concurrency=2` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；连续两轮 51.20/59.34 秒，15/15 成功、最大 RSS 439,476/435,004 KiB，均低于 75 秒预算。
- `pnpm exec tsc --version && node -e <tooling resolution probe>` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；TS CLI 为 7.0.2，官方 TS6 wrapper 与实际 compatibility API 均为 6.0.2；当前 flat-config owner 唯一解析 ESLint 10.7.0、Antfu 9.1.0、typescript-eslint parser/plugin 8.64.0，root 与 consumer 不直接解析 Antfu 或 parser/plugin。
- `pnpm why -r eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin --depth 12` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；安装图中的 ESLint 8.35.0 与 typescript-eslint 5.62.0 仅位于 `@umijs/lint@4.6.79` → `@umijs/max` 的 Admin/SSO 私有旧 lint 树；当前 flat-config 入口只走共享 owner 的 ESLint 10.7.0 与 typescript-eslint 8.64.0，不存在当前 lint 链路的重复加载。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；16 个 workspace 冻结安装通过且 lockfile 无变化。
- `bun test scripts/__tests__/eslint-config-equivalence.test.ts` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；2/2 测试、48 个断言通过；15 个 consumer 的文件集合、退出码、诊断键与插件所有权保持等价。
- `pnpm typecheck` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；根默认 concurrency 3，15/15 workspace 通过并命中有效 cache。
- `pnpm test` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；根默认 concurrency 2，15/15 workspace 通过并命中有效 cache。
- `pnpm build` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；Admin 与 SSO 2/2 build 于 39.92 秒内通过。
- `pnpm --filter @iam/db db:check` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；Drizzle schema 检查通过。
- `pnpm --filter @iam/role-assignment-resolution test:postgres` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；使用本地专用测试数据库，45/45 通过并清理随机 schema。
- `pnpm gateway:apisix:validate -- --env dev:iam` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；APISIX 12 条 routes 与关联资源通过校验。
- `pnpm --filter @iam/admin e2e` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；Chromium 2/2 于 35.5 秒通过，保留既有 MaxListenersExceeded warning。
- `pnpm --filter @iam/sso e2e` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；Chromium 3/3 于 55.6 秒通过，保留既有 MaxListenersExceeded 与 mock proxy 连接日志。
- `pnpm check:docs` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；最终完整矩阵复核仍为 28 个 Current 文档索引通过。
- `pnpm check:workflow -- --feature tooling-performance` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；最终完整矩阵复核 feature tracker 格式通过。
- `git diff --check` — passed；Content-Head: `6503f4f8de86c93be3f8adcba151f238158f5358`；最终完整矩阵后无 whitespace finding。
- `bun test scripts/__tests__/tooling-performance.test.ts` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；9/9 通过、37 个断言；任务图、全局 timeout 禁令、默认并发、OIDC 定点阈值和 TypeScript 双轨守卫通过。
- `bun test scripts/__tests__/eslint-config-equivalence.test.ts --test-name-pattern "keeps plugin graph ownership"` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；复用既有动态 consumer discovery seam，1/1 测试、47 个 ownership 断言通过。
- `pnpm exec eslint --config eslint.root.config.mjs scripts/benchmark-eslint-config.mjs scripts/__tests__/tooling-performance.test.ts scripts/tooling-performance/eslint-equivalence.ts scripts/__tests__/eslint-config-equivalence.test.ts` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；评审修复涉及的 benchmark、结构测试与共享 seam 通过聚焦 ESLint。
- `pnpm lint` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；预热轮 31.24 秒、最大 RSS 526,604 KiB，15 个 package lint 命中 cache、root lint 首次执行；16/16 tasks 通过，保留 Admin 25、SSO 4 个既有 warnings。
- `timeout 10s pnpm lint` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；预热后连续三轮 2.71/2.51/3.11 秒，最大 RSS 139,092/135,152/134,964 KiB，16/16 tasks 全部命中 cache；原始基线约 15.7 秒且稳定超过 10 秒。
- `node scripts/benchmark-eslint-config.mjs --rounds 5` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；backend/frontend 交错五轮、Node compile cache 禁用，分别稳定扫描 42/78 个文件且诊断不变。Backend 首轮 import/compose/总加载 2985.55/630.56/3616.10 ms、config/lint RSS 397,936/499,716 KiB、lint 20,360.25 ms；热中位数 1792.94/334.89/2127.83 ms、RSS 396,300/503,788 KiB、lint 15,004.73 ms。Frontend 首轮 2208.89/613.24/2822.13 ms、RSS 420,640/616,608 KiB、lint 19,115.81 ms；热中位数 2011.94/556.72/2573.59 ms、RSS 417,060/575,164 KiB、lint 17,955.49 ms。首轮总加载仍在原始 Antfu 2.5–4.3 秒区间；相对迁移前完整 lint RSS，backend 热中位数约 492 MiB、增加约 5%，frontend 约 562 MiB、降低约 2%；backend config RSS 相对早期 307–320 MiB 观测更高，未把共享包记作规则加载收益。
- `pnpm exec turbo typecheck --force --concurrency=3` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；连续两轮 55.21/69.74 秒，15/15 成功、最大 RSS 2,364,188/2,359,460 KiB，均低于 80 秒预算。
- `pnpm exec turbo test --force --concurrency=2` — failed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；第一轮 43.88 秒、15/15 成功；第二轮 SSO 登录页用例在默认 5 秒阈值以约 5.49 秒超时，未放宽任何 timeout，此组不计为验收通过。
- `pnpm --filter @iam/sso exec vitest run src/pages/login/__tests__/login-page.test.tsx --reporter=dot` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；隔离五轮均通过，测试体 1.08–1.59 秒。
- `pnpm --filter @iam/oidc-provider test & pnpm --filter @iam/sso exec vitest run src/pages/login/__tests__/login-page.test.tsx --reporter=dot; wait` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；并行诊断五轮均通过，未复现默认 timeout 失败。
- `pnpm --filter @iam/oidc-provider test & pnpm --filter @iam/sso test; wait` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；完整两 workspace 并行诊断三轮均通过，支持一次整机资源竞争尾延迟而非稳定用例回退。
- `pnpm exec turbo test --force --concurrency=2` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；重新取得连续两轮 39.60/60.27 秒，15/15 成功、最大 RSS 435,060/434,468 KiB，均低于 75 秒预算；保留前述失败样本。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；16 个 workspace 冻结安装通过且 lockfile 无变化。
- `bun test scripts/__tests__/eslint-config-equivalence.test.ts` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；2/2 测试、48 个断言通过；15 个 consumer 的文件集合、退出码、诊断键与配置所有权保持等价。
- `pnpm typecheck` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；根默认 concurrency 3，15/15 workspace 命中有效 cache 并通过。
- `pnpm test` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；根默认 concurrency 2，15/15 workspace 命中有效 cache 并通过。
- `pnpm build` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；Admin 与 SSO 2/2 build 命中内容有效的 Turbo cache 并通过。
- `pnpm --filter @iam/db db:check` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；Drizzle schema 检查通过。
- `pnpm --filter @iam/role-assignment-resolution test:postgres` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；使用本地专用测试数据库，45/45 通过并清理随机 schema。
- `pnpm gateway:apisix:validate -- --env dev:iam` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；APISIX 12 条 routes 与关联资源通过校验。
- `pnpm --filter @iam/admin e2e` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；Chromium 2/2 通过，保留既有 MaxListenersExceeded warning。
- `pnpm --filter @iam/sso e2e` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；Chromium 3/3 通过，保留既有 MaxListenersExceeded 与 mock proxy 连接日志。
- `pnpm exec tsc --version && node -e <tooling resolution probe>` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；TS CLI 7.0.2，官方 TS6 wrapper/runtime 6.0.2；当前 flat-config owner 唯一解析 ESLint 10.7.0、Antfu 9.1.0、typescript-eslint 8.64.0，root/consumer 不直接解析其插件图。
- `pnpm why -r eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin --depth 12` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；旧 ESLint 8.35.0/typescript-eslint 5.62.0 只位于 `@umijs/lint@4.6.79` 私有树，当前 flat-config 入口只走 10.7.0/8.64.0。
- `pnpm check:docs` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；28 个 Current 文档索引通过。
- `pnpm check:workflow -- --feature tooling-performance` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；feature tracker 格式通过。
- `git diff --check` — passed；Content-Head: `4977381c4aaccbd4d5eae5bee368cd5cac8df9e2`；无 whitespace finding。
- `pnpm exec turbo test --force --concurrency=2` — failed；Content-Head: `5e582a75d03086881fc75eceab790b447ea1ecf5`；第一轮 50.28 秒、15/15 成功；第二轮 SSO 登录页用例在默认 5 秒阈值以 5.079 秒超时，证明前一 content HEAD 的测试尾延迟可重复，未通过反复重跑或放宽 timeout 掩盖。
- `pnpm --filter @iam/sso exec vitest run src/pages/login/__tests__/login-page.test.tsx --reporter=dot` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；16 个受控 CPU 压力进程下连续三轮通过，测试体 1.65/3.07/3.73 秒；修复只让用例在 `Modal.error` 边界断言强提示参数，不改变产品代码或 5 秒 timeout。
- `pnpm --filter @iam/sso test && pnpm --filter @iam/sso lint && pnpm --filter @iam/sso typecheck` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；SSO 19/19 测试、ESLint/Stylelint 与 TypeScript 通过，保留 4 个既有 warnings；临时 `DEBUG-sso-login-perf` 标记已清理。
- `pnpm lint` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；预热轮 19.96 秒、最大 RSS 546,304 KiB，14 个 tasks 命中 cache，SSO lint 与 root lint 实际执行；16/16 通过。
- `timeout 10s pnpm lint` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；预热后连续三轮 1.60/1.50/1.30 秒，最大 RSS 141,244/143,056/134,800 KiB，16/16 tasks 全部命中 cache；原始约 15.7 秒且稳定超时的反馈环已进入预算。
- `node scripts/benchmark-eslint-config.mjs --rounds 5` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；backend/frontend 交错五轮、Node compile cache 禁用，分别稳定扫描 42/78 个文件且诊断不变。Backend 首轮 import/compose/总加载 1556.66/358.26/1914.91 ms、config/lint RSS 390,888/515,176 KiB、lint 14,661.41 ms；热中位数 1848.55/388.43/2236.98 ms、RSS 389,892/497,964 KiB、lint 13,227.00 ms。Frontend 首轮 1575.23/415.19/1990.43 ms、RSS 418,596/558,508 KiB、lint 17,001.14 ms；热中位数 1677.37/505.06/2242.59 ms、RSS 415,316/569,692 KiB、lint 14,274.18 ms。相对迁移前完整 lint RSS，backend 热中位数约 486 MiB、增加约 4%，frontend 约 556 MiB、降低约 3%；共享配置仍不被记作 Antfu 固定加载收益。
- `pnpm exec turbo typecheck --force --concurrency=3` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；连续两轮 65.64/55.89 秒，15/15 成功、最大 RSS 2,392,868/2,410,800 KiB，均低于 80 秒预算。
- `pnpm exec turbo test --force --concurrency=2` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；连续两轮 35.41/51.14 秒，15/15 成功、最大 RSS 432,404/432,556 KiB，均低于 75 秒预算，普通测试 timeout 未改变。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；16 个 workspace 冻结安装通过且 lockfile 无变化。
- `bun test scripts/__tests__/tooling-performance.test.ts` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；9/9 通过、37 个断言；任务图、全局 timeout 禁令、默认并发、OIDC 定点阈值和 TypeScript 双轨守卫通过。
- `pnpm exec eslint --config eslint.root.config.mjs scripts/benchmark-eslint-config.mjs scripts/__tests__/tooling-performance.test.ts scripts/tooling-performance/eslint-equivalence.ts scripts/__tests__/eslint-config-equivalence.test.ts` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；性能脚本、结构测试与共享 ownership seam 通过聚焦 ESLint。
- `bun test scripts/__tests__/eslint-config-equivalence.test.ts` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；2/2 测试、48 个断言通过；15 个 consumer 的文件集合、退出码、诊断键与配置所有权保持等价。
- `pnpm typecheck` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；根默认 concurrency 3，15/15 workspace 通过。
- `pnpm test` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；根默认 concurrency 2，15/15 workspace 通过。
- `pnpm build` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；Admin/SSO 2/2 通过，SSO build 因测试文件输入变化实际执行，Admin 命中有效 cache。
- `pnpm --filter @iam/db db:check` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；Drizzle schema 检查通过。
- `pnpm --filter @iam/role-assignment-resolution test:postgres` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；使用本地专用测试数据库，45/45 通过并清理随机 schema。
- `pnpm gateway:apisix:validate -- --env dev:iam` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；APISIX 12 条 routes 与关联资源通过校验。
- `pnpm --filter @iam/admin e2e` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；Chromium 2/2 通过，保留既有 MaxListenersExceeded warning。
- `pnpm --filter @iam/sso e2e` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；Chromium 3/3 通过，保留既有 MaxListenersExceeded 与 mock proxy 连接日志。
- `pnpm exec tsc --version && node -e <tooling resolution probe>` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；TS CLI 7.0.2、官方 TS6 wrapper/runtime 6.0.2；当前 flat-config owner 唯一解析 ESLint 10.7.0、Antfu 9.1.0、typescript-eslint 8.64.0，root/consumer 不直接解析其插件图。
- `pnpm why -r eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin --depth 12` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；旧 ESLint 8.35.0/typescript-eslint 5.62.0 只位于 `@umijs/lint@4.6.79` 私有树，当前 flat-config 入口只走 10.7.0/8.64.0。
- `pnpm check:docs` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；28 个 Current 文档索引通过。
- `pnpm check:workflow -- --feature tooling-performance` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；feature tracker 格式通过。
- `git diff --check` — passed；Content-Head: `2107e13d03f165219046b777afe3a4d5055ec177`；无 whitespace finding。
- `pnpm lint` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；预热轮 18.81 秒、最大 RSS 522,612 KiB，15 个 tasks 命中 cache、root lint 实际执行；16/16 通过并保留 Admin 25、SSO 4 个既有 warnings。
- `timeout 10s pnpm lint` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；预热后连续三轮 1.80/1.60/1.70 秒，最大 RSS 134,984/137,292/134,352 KiB，16/16 tasks 全部命中 cache；原始约 15.7 秒且稳定超时的反馈环已进入预算。
- `node scripts/benchmark-eslint-config.mjs --rounds 5` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；backend/frontend 交错五轮、Node compile cache 禁用，分别稳定扫描 42/78 个文件且诊断不变。Backend 首轮 import/compose/总加载 1679.46/344.53/2023.99 ms、config/lint RSS 389,460/506,864 KiB、lint 15,317.53 ms；热中位数 1722.97/432.34/2154.04 ms、RSS 386,904/505,160 KiB、lint 16,655.57 ms。Frontend 首轮 1626.61/441.95/2068.57 ms、RSS 417,452/614,916 KiB、lint 15,963.28 ms；热中位数 1683.72/448.54/2116.06 ms、RSS 418,660/616,264 KiB、lint 15,667.08 ms。相对迁移前完整 lint RSS，backend/frontend 热中位数约 493/602 MiB、分别增加约 5%/4%；加载与 RSS 没有稳定收益，Antfu 固定插件图成本仍在，正式收益只归于统一所有权与 Turbo cache。
- `pnpm exec turbo typecheck --force --concurrency=3` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；连续两轮 64.20/55.74 秒，15/15 成功、最大 RSS 2,375,824/2,384,560 KiB，均低于 80 秒预算。
- `pnpm exec turbo test --force --concurrency=2` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；连续两轮 36.60/46.63 秒，15/15 成功、最大 RSS 433,364/431,492 KiB，均低于 75 秒预算，普通测试 timeout 未改变。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；16 个 workspace 冻结安装通过且 lockfile 无变化。
- `bun test scripts/__tests__/tooling-performance.test.ts` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；9/9 通过、37 个断言；任务图、全局 timeout 禁令、默认并发、OIDC 定点阈值和 TypeScript 双轨守卫通过。
- `bun test scripts/__tests__/eslint-config-equivalence.test.ts` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；2/2 测试、48 个断言通过；15 个 consumer 的文件集合、退出码、诊断键与配置所有权保持等价。
- `pnpm --filter @iam/sso test` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；SSO 8 个文件、19/19 测试通过，登录失败用例未再触发默认 5 秒 timeout。
- `pnpm --filter @iam/sso lint` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；ESLint/Stylelint 通过，保留 4 个既有 warnings。
- `pnpm --filter @iam/sso typecheck` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；TypeScript 检查通过，临时 `DEBUG-sso-login-perf` 标记不存在。
- `pnpm typecheck` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；根默认 concurrency 3，15/15 workspace 通过。
- `pnpm test` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；根默认 concurrency 2，15/15 workspace 通过。
- `pnpm build` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；Admin/SSO 2/2 通过并命中内容有效的 Turbo cache。
- `pnpm --filter @iam/db db:check` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；Drizzle schema 检查通过。
- `pnpm --filter @iam/role-assignment-resolution test:postgres` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；使用本地专用测试数据库，45/45 通过并清理随机 schema。
- `pnpm gateway:apisix:validate -- --env dev:iam` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；APISIX 12 条 routes 与关联资源通过校验。
- `pnpm --filter @iam/admin e2e` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；Chromium 2/2 通过，保留既有 MaxListenersExceeded warning。
- `pnpm --filter @iam/sso e2e` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；Chromium 3/3 通过，保留既有 MaxListenersExceeded 与 mock proxy 连接日志。
- `pnpm exec tsc --version && node -e <tooling resolution probe>` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；TS CLI 7.0.2、官方 TS6 wrapper/runtime 6.0.2；当前 flat-config owner 唯一解析 ESLint 10.7.0、Antfu 9.1.0、typescript-eslint 8.64.0，root/Admin/SSO 不直接解析其插件图。
- `pnpm why -r eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin --depth 12` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；旧 ESLint 8.35.0/typescript-eslint 5.62.0 只位于 `@umijs/lint@4.6.79` 私有树，当前 flat-config 入口只走 10.7.0/8.64.0。
- `pnpm check:docs` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；28 个 Current 文档索引通过。
- `pnpm check:workflow` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；7 个 v2 feature 与 4 个 legacy feature 的全局记录格式通过。
- `pnpm check:workflow -- --feature tooling-performance` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；feature tracker 格式通过。
- `git diff --check` — passed；Content-Head: `336585da98878c35c55478074b62a0f4b9f39d75`；无 whitespace finding。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；16 个 workspace 已是最新状态，lockfile 无变化。
- `bun test scripts/__tests__/tooling-performance.test.ts` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；10/10 测试、72 个断言通过，覆盖 lint 非零退出/无效 JSON 传播、独立 config/首文件/workspace cache 阶段、15 个 workspace 的 `lint`/`lint:fix` 完整性、任务图、timeout 与 TS 双轨。
- `node_bin=$(command -v node); env PATH=/usr/bin:/bin "$node_bin" scripts/benchmark-eslint-config.mjs --profile current-backend --rounds 5` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；先固定外层 Node 路径，再通过 PATH 故障注入使底层 `pnpm` 不可用；首文件 lint 子进程退出 127，benchmark CLI 自身退出 1，并输出对应两层错误，证明验证不再假绿。
- `bun test scripts/__tests__/eslint-config-equivalence.test.ts` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；首次运行准确发现拆出的结构契约模块使 root 受检文件从 16 增为 17；更新显式文件集合基线后 2/2 测试、48 个断言通过，15 个 consumer 的退出码、诊断键和插件所有权不变。
- `pnpm --filter @iam/eslint-config test` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；4/4 preset 测试、7 个断言通过。
- `pnpm --filter @iam/eslint-config lint` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；共享配置源码、测试与 benchmark profiles 无诊断。
- `pnpm --filter @iam/eslint-config typecheck` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；TS6 compatibility API 下完整 `tsc --noEmit` 通过。
- `pnpm exec turbo lint:fix lint:fix:root --dry=json` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；`@iam/eslint-config#lint:fix` 不再是 `<NONEXISTENT>`，命令为共享范围的 `eslint --fix`；结构测试同时逐 workspace 锁定入口。
- `node scripts/benchmark-eslint-config.mjs --profile current-backend --profile candidate-backend --profile lean-backend --profile curated-backend --profile current-frontend --rounds 5` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；五个 profile 共 25 组 config/首文件/完整 lint 独立进程样本全部退出 0，backend 每组扫描 1/42 个文件且零诊断，frontend 扫描 1/78 个文件并保留完整 lint 的 25 个既有 warnings；完整首轮/热中位数、CPU 与双阶段 RSS 已写入 `packages/eslint-config/benchmark.md`。
- `node scripts/benchmark-eslint-config.mjs --rounds 5` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；默认 backend/frontend 各五轮交错，Node compile cache 禁用且 10/10 组 lint 退出 0。Backend 首轮 config import/compose/总加载 1833.85/381.79/2215.65 ms、首文件/完整 lint 15631.95/15535.13 ms、三阶段 RSS 389,392/397,904/497,940 KiB；热中位数 1467.75/323.20/1790.95 ms、12702.77/13854.66 ms、397,616/425,816/495,472 KiB。Frontend 首轮 1673.10/458.39/2131.49 ms、13044.67/13237.85 ms、417,344/461,700/569,476 KiB；热中位数 1439.83/413.99/1844.78 ms、12243.58/14244.89 ms、418,668/450,176/592,200 KiB。首文件与完整 lint 接近，继续支持 Antfu 固定插件图成本而非共享包加载收益的结论。
- `pnpm lint` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；共享包 manifest 变化使首次全 cache miss 预热在执行器 120 秒上限被终止，无残留进程；已完成任务写入的 Turbo cache 保留，随后正式命令以 15 hits/1 miss、16/16 成功，19.28 秒、最大 RSS 625,604 KiB 完成。该冷路径没有 spec 墙钟预算，终止样本不计为 warm 验收通过。
- `timeout 10s pnpm lint` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；完整预热后连续三轮 1.00/1.00/1.20 秒、最大 RSS 134,600/134,904/142,868 KiB，16/16 tasks 全部命中 cache；保留 Admin 25、SSO 4 个既有 warnings。
- `/usr/bin/time ... pnpm exec turbo typecheck --force --concurrency=3` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；连续两轮墙钟 46.78/72.12 秒、user CPU 256.81/370.90 秒、system CPU 50.53/97.68 秒、最大 RSS 2,370,484/2,405,956 KiB，15/15 且低于 80 秒预算。
- `/usr/bin/time ... pnpm exec turbo test --force --concurrency=2` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；连续两轮墙钟 50.93/53.60 秒、user CPU 258.72/292.26 秒、system CPU 68.59/83.32 秒、最大 RSS 417,904/433,484 KiB，15/15 且低于 75 秒预算，普通测试 timeout 未改变。
- `pnpm typecheck` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；根默认 concurrency 3，15/15 实际执行并于 41.80 秒通过。
- `pnpm test` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；根默认 concurrency 2，15/15 实际执行并于 59.17 秒通过。
- `pnpm build` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；Admin/SSO 2/2 实际执行并于 37.12 秒通过。
- `pnpm --filter @iam/db db:check` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；Drizzle schema 检查通过。
- `pnpm --filter @iam/role-assignment-resolution test:postgres` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；首次因 shell 未提供必需的专用测试库 URL 在任何业务用例前安全失败；恢复同一 `iam_role_assignment_test` 专用库后 45/45 通过，并确认随机 schema 全部清理。
- `pnpm gateway:apisix:validate -- --env dev:iam` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；APISIX 12 条 routes 与关联资源通过校验。
- `pnpm --filter @iam/sso test && pnpm --filter @iam/sso lint && pnpm --filter @iam/sso typecheck` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；SSO 8 个文件、19/19 测试通过，ESLint/Stylelint 与 TypeScript 通过，保留 4 个既有 warnings。
- `pnpm --filter @iam/admin e2e` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；Chromium 2/2 通过，保留既有 MaxListenersExceeded warning。
- `pnpm --filter @iam/sso e2e` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；Chromium 3/3 通过，保留既有 MaxListenersExceeded 与 mock proxy 连接日志。
- `pnpm exec tsc --version && node -e <tooling resolution probe>` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；TS CLI 7.0.2、官方 TS6 wrapper/runtime 6.0.2；仅 `@iam/eslint-config` 解析 Antfu 9.1.0 与 typescript-eslint parser/plugin 8.64.0，root/Admin/SSO 均不能直接解析。
- `pnpm why -r eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin --depth 12` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；当前配置路径使用 ESLint 10.7.0/typescript-eslint 8.64.0，旧 ESLint 8.35.0/typescript-eslint 5.62.0 仍只在 `@umijs/lint@4.6.79` 私有树。
- `pnpm check:docs` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；28 个 Current 文档索引通过。
- `pnpm check:workflow` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；7 个 v2 feature 与 4 个 legacy feature 格式通过。
- `pnpm check:workflow -- --feature tooling-performance` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；remediation 状态、Validation Plan 与 content head 字段通过。
- `git diff --check` — passed；Content-Head: `232f2de75043fb0985cbadff17f73213c6282c5c`；无 whitespace finding。

## 评审记录

- Ticket 01 — fixed point: `7f438dff50aa2a42ff22d6655c93698ec378b09d`；reviewed head: `69e05c4bea838c212f7821ff8baa8c58da060c85`；Standards: passed；Spec: passed；两轮评审修复后完整范围清零。
- Ticket 02 — fixed point: `449f2ca66f2edbe206177d3806ded4dc372032d8`；reviewed head: `d9480121eb742b95de9875d16a7565d1e04239ef`；Standards: passed；Spec: passed；共享包实现、Current 文档、分段基准与默认 frontend 覆盖经三轮评审修复后完整范围清零。
- Ticket 03 — fixed point: `865a3f99a2399de2860c4db6de724982ca41a2d8`；reviewed head: `1fe00e596e2c41de28a30a2d9bc37689a34c745b`；Standards: passed；Spec: passed；动态 consumer 发现与完整依赖所有权修复后完整范围清零。
- Ticket 04 — fixed point: `ed41538b933b4f629176a84a26e95491a048e56d`；reviewed head: `7b8b545ed2f54f878ac2e47bfd34dafbc776b96b`；Standards: passed；Spec: passed；root workflow input finding 修复后完整范围清零。
- Ticket 05 — fixed point: `7150e4eed80d1a29eac5a969c43d31f34b847ee0`；reviewed head: `f06ebcfdc9392b4030fc0c9c1aa21a4a309884fc`；Standards: passed；Spec: passed；实际 compatibility runtime、timeout 消费位置、任务图 seam、suite 命名与 content-head 验证新鲜度修复后完整范围清零。
- Ticket 06 — fixed point: `10e5cc80f78cfbe582151048adfd65e487223e7b`；reviewed head: `336585da98878c35c55478074b62a0f4b9f39d75`；Standards: passed；Spec: passed；重复 scanner、RSS、Validation Plan 新鲜度/范围和可复现 SSO 测试尾延迟修复后完整范围清零。
- Feature — fixed point: `55c25384e82fca2935dec782e4dd270090a9d5dc`；reviewed head: `336585da98878c35c55478074b62a0f4b9f39d75`；Standards: findings；Spec: findings；基准未传播 lint 失败且混合结构审计职责，共享配置 workspace 缺少 `lint:fix`，性能基准缺少首文件 lint 分段，冷 test/typecheck 证据缺少 CPU 时间。
- Ticket 06 — fixed point: `63ed5274e2bdd20c59dd77e1e94950bd9de3de98`；reviewed head: `232f2de75043fb0985cbadff17f73213c6282c5c`；Standards: passed；Spec: passed；原五项 finding 全部闭环，修正后的故障注入命令确认内层 lint 退出 127、外层 benchmark 退出 1。
- Feature — fixed point: `55c25384e82fca2935dec782e4dd270090a9d5dc`；reviewed head: `232f2de75043fb0985cbadff17f73213c6282c5c`；Standards: passed；Spec: passed；最终评审覆盖至 tracker HEAD `49adff0a68e63819a1e175603f1e64f307b0d59f`，确认其后仅有 tracker-only 变化，完整 feature 范围无 finding。

## 授权记录

- 2026-07-23 — 维护者要求正式解决工具链性能与 monorepo 最佳实践问题；当前仅授权调查与形成 draft spec，拆票、实现和本地交付分别等待后续 checkpoint。
- 2026-07-23 — 维护者明确授权进入 ticket 阶段并发布本 spec 的六张 tickets；未授权实现、merge、push 或远端清理。
- 2026-07-23 — 维护者明确授权实施 tickets 01–06；未授权 merge、push 或远端清理。
- 2026-07-23 — 维护者批准共享 ESLint 配置缓存语义 amendment：保留各 consumer 的直接 workspace 依赖，接受配置源码变化使 consumer test/typecheck cache 一并失效；未授权改为单进程 lint、merge、push 或远端清理。
- 2026-07-23 — 维护者批准连续强制冷执行墙钟预算 amendment：typecheck concurrency 3 由 55 秒调整为 80 秒，test concurrency 2 由 60 秒调整为 75 秒；不改变并发、工具内部 worker/checker 或普通测试 timeout，未授权 merge、push 或远端清理。
- 2026-07-24 — 维护者确认按 Merge brief 执行本地 squash、最终 SHA 回填和本地功能分支清理；未授权 push、远端分支删除或其他远端操作。

## Waivers

- 无。

## 重开与修复

- 2026-07-23 — 最终 feature 评审发现 Ticket 06 的验证工具与证据仍有五项原范围缺口：ESLint lint 子进程失败未传播、benchmark 与结构审计职责混合、`@iam/eslint-config` 缺少 `lint:fix`、未记录首文件 lint 分段、冷 test/typecheck 未记录 CPU 时间；已重开 Ticket 06，未扩大批准范围。
- 2026-07-24 — Ticket 06 remediation 在 content HEAD `232f2de75043fb0985cbadff17f73213c6282c5c` 完成完整验证与双轴复审；五项缺口及故障注入证据文字偏差均已闭环，ticket 恢复为 resolved。

## Merge brief

- Feature branch: `codex/tooling-performance`
- Target branch: `main`
- Target base: `55c25384e82fca2935dec782e4dd270090a9d5dc`
- Target tip: `55c25384e82fca2935dec782e4dd270090a9d5dc`
- Content head: `232f2de75043fb0985cbadff17f73213c6282c5c`
- Verified content head: `232f2de75043fb0985cbadff17f73213c6282c5c`
- Reviewed content head: `232f2de75043fb0985cbadff17f73213c6282c5c`
- Delivery summary: 统一 15 个 workspace 的 ESLint 10 flat-config 所有权与 package-level Turbo lint/fix，加入可缓存 root task、结构/等价性 guard、可失败的分段性能基准，并把 typecheck/test 默认并发固定为 3/2；保留 TypeScript 7 CLI 与 TypeScript 6 compatibility API 双轨。
- Commit range: `55c25384e82fca2935dec782e4dd270090a9d5dc...232f2de75043fb0985cbadff17f73213c6282c5c`
- Validation: passed
- Review: passed
- Waivers and risks: 无 waiver；共享配置 manifest 变化后的首次全 cache miss `pnpm lint` 曾超过执行器 120 秒上限，预热完成后的正式 warm lint 稳定为 1.00–1.20 秒；首文件与完整 lint 都约 12–14 秒，说明 Antfu 固定插件图加载成本仍在，共享包收益是所有权与缓存治理而非规则加载提速。
- Local transaction:
  1. 再次确认 `main` tip 仍为 `55c25384e82fca2935dec782e4dd270090a9d5dc`、功能分支可达、工作区干净且无未完成 Git 操作。
  2. 切换到 `main`，执行 `git merge --squash codex/tooling-performance`，创建一个 focused squash delivery commit。
  3. 将最终 squash SHA 回填到 ledger 与 tickets 01–06 的所有 Resolution，创建 tracker-only 元数据提交。
  4. 确认不存在残留 `pending`，运行 `pnpm check:workflow`、`pnpm check:docs` 与 `git diff --check`。
  5. 全部成功后执行 `git branch -d codex/tooling-performance` 删除本地功能分支。

## Delivery receipt

- Target branch: `main`
- Squash commit: `a5f1355ea4d0f164417e5bab32367cf6d7dadf16`
- Tracker metadata: planned
- Final checks:
  - `pnpm check:workflow` — passed
  - `pnpm check:docs` — passed
  - `git diff --check` — passed
- Local feature branch: deleted
