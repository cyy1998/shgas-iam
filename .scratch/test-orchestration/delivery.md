# Monorepo 测试编排交付记录

Workflow-Version: 2
Feature-Slug: test-orchestration
Workflow-Kind: standard
Stage: merge-ready
Feature-Branch: codex/test-orchestration
Target-Branch: main
Target-Base: 5fc1b7169bd2a75b2eadf4b5453f591c96d456bc
Ticketing-Authorization: granted
Implementation-Authorization: granted
Authorized-Implementation-Scope: tickets 01-04
Current-Ticket: none
Current-Ticket-Base: none
Change-Types: agent-config,code,database,dependencies,docs,frontend,gateway
Affected-Workspaces: @iam/admin,@iam/admin-api,@iam/api,@iam/api-core,@iam/contracts,@iam/db,@iam/domain,@iam/eslint-config,@iam/gateway-apisix,@iam/jobs,@iam/oidc-provider,@iam/role-assignment-resolution,@iam/sso,@iam/user-profile-read-model,@iam/worker
Validation-Plan: declared
Content-Head: b79f83ae20cebccdf511425d03bfff6a6a68953f
Verified-Content-Head: b79f83ae20cebccdf511425d03bfff6a6a68953f
Reviewed-Content-Head: b79f83ae20cebccdf511425d03bfff6a6a68953f
Merge-Target-Tip: 5fc1b7169bd2a75b2eadf4b5453f591c96d456bc
Final-Squash-Commit: pending

## 范围与验收

- Approved spec：[`spec.md`](spec.md)。
- Tickets：[`01`](issues/01-establish-test-orchestration-graph.md)、[`02`](issues/02-separate-test-lanes-and-worker-budgets.md)、[`03`](issues/03-harden-oidc-process-smoke.md)、[`04`](issues/04-validate-and-document-test-orchestration.md)。
- 四张 tracer-bullet tickets 覆盖任务图、通道/预算、OIDC process harness 和连续验收/文档收束。
- 已授权 tickets 01–04 的 implementation 与评审；merge、push 和远端操作仍需后续明确授权。

## Validation Plan

| Scope | Change-Types | Affected-Workspaces | Required-Commands |
|---|---|---|---|
| ticket:01 | agent-config,code,dependencies | root | `pnpm install --frozen-lockfile`<br>`bun test scripts/__tests__/test-orchestration.test.ts`<br>`bun test scripts/__tests__/tooling-performance.test.ts -t "reads the current root and workspace task graph"`<br>`pnpm test:smoke`<br>`pnpm lint`<br>`pnpm typecheck`<br>`pnpm build`<br>`pnpm check:docs`<br>`pnpm check:workflow -- --feature test-orchestration`<br>`git diff --check` |
| ticket:02 | agent-config,code,database,dependencies,docs,frontend,gateway | @iam/admin,@iam/admin-api,@iam/api,@iam/api-core,@iam/contracts,@iam/db,@iam/domain,@iam/eslint-config,@iam/gateway-apisix,@iam/jobs,@iam/oidc-provider,@iam/role-assignment-resolution,@iam/sso,@iam/user-profile-read-model,@iam/worker | `pnpm install --frozen-lockfile`<br>`bun test scripts/__tests__/test-orchestration.test.ts`<br>`pnpm lint`<br>`pnpm typecheck`<br>`pnpm test`<br>`pnpm test:smoke`<br>`pnpm build`<br>`pnpm verify`<br>`pnpm --filter @iam/db db:check`<br>`pnpm --filter @iam/role-assignment-resolution test:postgres`<br>`pnpm --filter @iam/admin e2e`<br>`pnpm --filter @iam/sso e2e`<br>`pnpm gateway:apisix:validate -- --env dev:iam`<br>`pnpm check:docs`<br>`pnpm check:workflow -- --feature test-orchestration`<br>`git diff --check` |
| ticket:03 | agent-config,code,dependencies | @iam/oidc-provider | `pnpm install --frozen-lockfile`<br>`bun test scripts/__tests__/test-orchestration.test.ts`<br>`pnpm --filter @iam/oidc-provider exec vitest run src/__tests__/process-smoke-harness.test.ts`<br>`pnpm --filter @iam/oidc-provider test`<br>`pnpm --filter @iam/oidc-provider test:smoke`<br>`pnpm --filter @iam/oidc-provider lint`<br>`pnpm --filter @iam/oidc-provider typecheck`<br>`pnpm test`<br>`pnpm test:smoke`<br>`pnpm check:docs`<br>`pnpm check:workflow -- --feature test-orchestration`<br>`git diff --check` |
| ticket:04 | agent-config,docs | root | `pnpm install --frozen-lockfile`<br>`bun test scripts/__tests__/test-orchestration.test.ts`<br>`pnpm lint`<br>`pnpm typecheck`<br>`pnpm test`<br>`pnpm test:smoke`<br>`pnpm build`<br>`pnpm verify`<br>`pnpm --filter @iam/db db:check`<br>`pnpm --filter @iam/role-assignment-resolution test:postgres`<br>`pnpm --filter @iam/admin e2e`<br>`pnpm --filter @iam/sso e2e`<br>`pnpm gateway:apisix:validate -- --env dev:iam`<br>`pnpm check:docs`<br>`pnpm check:workflow -- --feature test-orchestration`<br>`git diff --check` |
| feature | agent-config,code,database,dependencies,docs,frontend,gateway | @iam/admin,@iam/admin-api,@iam/api,@iam/api-core,@iam/contracts,@iam/db,@iam/domain,@iam/eslint-config,@iam/gateway-apisix,@iam/jobs,@iam/oidc-provider,@iam/role-assignment-resolution,@iam/sso,@iam/user-profile-read-model,@iam/worker | `pnpm install --frozen-lockfile`<br>`bun test scripts/__tests__/test-orchestration.test.ts`<br>`pnpm lint`<br>`pnpm typecheck`<br>`pnpm test`<br>`pnpm test:smoke`<br>`pnpm build`<br>`pnpm verify`<br>`pnpm --filter @iam/db db:check`<br>`pnpm --filter @iam/role-assignment-resolution test:postgres`<br>`pnpm --filter @iam/admin e2e`<br>`pnpm --filter @iam/sso e2e`<br>`pnpm gateway:apisix:validate -- --env dev:iam`<br>`pnpm check:docs`<br>`pnpm check:workflow -- --feature test-orchestration`<br>`git diff --check` |

## 阶段证据

- `G0 Intake` — 已调查根测试、Turbo task graph、OIDC process smoke 与其他同名进程内测试，并通过逐项设计确认形成共享理解。
- `G1 Branch Ready` — 已从 main 的 `5fc1b7169bd2a75b2eadf4b5453f591c96d456bc` 创建 `codex/test-orchestration`，首次受版本控制写入前工作区干净。
- `G2 Spec Ready` — draft spec、ADR 与测试编排目标架构已提交；Content-Head: `fd724d47904b21362c15d8beef5092b769ef2694`；问题、范围、验收、测试接缝和拟议 delivery slices 已明确。
- `G3 Tickets Ready` — approved spec 与 tickets 01–04 已提交；Content-Head: `f945dc3eb019052bdbca7904251da7666d546d75`；阻塞关系、ticket/feature Validation Plan 和未授权 implementation 边界已固定。
- `G4 Implementing` — 维护者已授权在当前任务与分支依次实施 tickets 01–04；merge、push 和远端操作仍未授权。
- `T1 Ticket Claimed` — ticket 01；blockers 为空，本 tracker-only checkpoint 固定其评审基线。
- `T2 Candidate Validated` — ticket 01；Content-Head: `4b5e50460b1ad09a03eaceabbbfbd811fc10d3bb`；任务图、hash 传播、verify 顺序/fail-fast 与修正后的 Ticket 01 Validation Plan 全部通过。
- `T2 Candidate Validated` — ticket 01；Content-Head: `14b65e6a1217d64a5fcb27dd7593bac9d6e09df6`；评审后改用真实 Node seam 并收拢任务图契约所有权，聚焦与根验证重新通过。
- `T3 Ticket Reviewed` — ticket 01；Content-Head: `14b65e6a1217d64a5fcb27dd7593bac9d6e09df6`；Standards 与 Spec 对原 claim fixed point 后的完整范围复审均无 finding。
- `T4 Ticket Resolved` — ticket 01；任务图、跨平台 verify、transit hash、验证证据和双轴评审均已闭环。
- `T1 Ticket Claimed` — ticket 02；ticket 01 已 resolved，本 tracker-only checkpoint 固定其评审基线。
- `T2 Candidate Validated` — ticket 02；Content-Head: `8b78564f9dbb2fc71cd7736f539bad372085b288`；普通/smoke 收集互斥、runner 预算、10 秒 Vitest 默认值、OpenAPI 分类迁移和完整 Ticket 02 Validation Plan 均通过。
- `T2 Candidate Validated` — ticket 02；Content-Head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`；首轮评审 findings 已修复，全仓 Bun 预算、OIDC 真实端口分类、Turbo 专用通道语义和增强后的结构测试在完整 Validation Plan 下通过。
- `T3 Ticket Reviewed` — ticket 02；Content-Head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`；Standards 与 Spec 对原 claim fixed point 后的完整范围复审均无 finding。
- `T4 Ticket Resolved` — ticket 02；普通/smoke 通道、全仓 runner 预算、专用任务 cache/output 语义、完整验证矩阵和双轴复审均已闭环。
- `T1 Ticket Claimed` — ticket 03；tickets 01、02 均已 resolved，本 tracker-only checkpoint 固定其评审基线。
- `T2 Candidate Validated` — ticket 03；Content-Head: `8a8d7da2b38384e9c252d351126e339a5d7de527`；真实 HTTP readiness、提前退出诊断、有界输出、端口竞争恢复和 Windows/POSIX 进程树清理通过聚焦故障注入、真实 entry smoke 与根验证。
- `T2 Candidate Validated` — ticket 03；Content-Head: `540bde4d8216e5526dc6423cffff5c2dd9ce03bf`；首轮评审 findings 已修复，readiness 同时验证协议和 child 归属，退出诊断等待 stdio close，独立临时目录与父进程先退出后的完整进程树验证通过全部 Ticket 03 gates。
- `T2 Candidate Validated` — ticket 03；Content-Head: `3c25000f64e85a2a43d332afa408dff7f2abd988`；第二轮 findings 已修复，Windows 使用独立 Job Object owner，真实 stubborn descendant 回收进入 smoke，跨 chunk readiness 与真实 spawn `ENOENT` 通过聚焦回归和全部 Ticket 03 gates。
- `T2 Candidate Validated` — ticket 03；Content-Head: `05aea45146fb68f3c1950cf65e3ed54be4deece8`；第三轮 Standards findings 已修复，Windows launcher 有界排空转发输出后自然退出，真实 Job smoke 以 detached/unref 后代和超过 pipe 容量的尾标记证明输出与进程树所有权，全部 Ticket 03 gates 通过。
- `T3 Ticket Reviewed` — ticket 03；Content-Head: `05aea45146fb68f3c1950cf65e3ed54be4deece8`；Spec 轴为 0 finding；Standards 轴的下游停止读取时 drain 无独立 deadline finding 由维护者明确延期并接受本次风险。
- `T4 Ticket Resolved` — ticket 03；真实 entry readiness、诊断、端口/临时资源、POSIX/Windows 完整进程树回收和验证矩阵闭环；下游完全停止读取的异常风险按维护者决定留待后续。
- `T1 Ticket Claimed` — ticket 04；tickets 02、03 均已 resolved，本 tracker-only checkpoint 固定连续验收与 Current 文档收束的评审基线。
- `T2 Candidate Validated` — ticket 04；Content-Head: `470204c053dbcf6f60855ba1eaa3089049ad57ca`；Windows 本地 OIDC smoke 连续 20/20、正式 `pnpm verify` 连续 3/3、完整 feature matrix、Current 文档与平台/adoption 状态全部通过。
- `T2 Candidate Validated` — ticket 04；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；首轮评审发现的 feature diff 并集与外部 gate 缺口已修复，新的 smoke 20/20、`verify` 3/3、数据库、PostgreSQL、Gateway、E2E 和完整矩阵全部通过。
- `T3 Ticket Reviewed` — ticket 04；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；Standards 与 Spec 对原 claim fixed point 后的完整范围复审均无 finding。
- `T4 Ticket Resolved` — ticket 04；20/20 smoke、3/3 verify、零残留、完整 feature matrix、Current 文档和平台/adoption 状态均已闭环。
- `T1 Ticket Claimed` — ticket 02 remediation；最终 feature 双轴评审 findings 属于原 Ticket 02 验收范围，本 tracker-only checkpoint 固定 remediation 评审基线。
- `T2 Candidate Validated` — ticket 02 remediation；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；E2E `cache: false` 回归断言、修正后的 docs/database/gateway 分类与全部专项 gate 均通过。
- `T3 Ticket Reviewed` — ticket 02 remediation；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；Standards 与 Spec 对 remediation fixed point 后的完整范围复审均无 finding。
- `T4 Ticket Resolved` — ticket 02 remediation；E2E cache 回归保护、实际范围分类、专项 gate 与授权摘要均已闭环。
- `G5 Feature Verified` — Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；目标 tip `5fc1b7169bd2a75b2eadf4b5453f591c96d456bc` 未漂移，完整 feature Validation Plan 通过，最终 Standards 与 Spec 双轴评审均为 0 finding。
- `G6 Merge Ready` — content、verified 与 reviewed HEAD 均为 `b79f83ae20cebccdf511425d03bfff6a6a68953f`，目标 tip 未漂移，ledger、tickets、waivers 与本地交付事务均已完整记录。

## 验证记录

- `pnpm check:docs` — passed；Content-Head: `fd724d47904b21362c15d8beef5092b769ef2694`；29 篇文档均已纳入索引，目标测试架构按设计保持 Needs Review。
- `pnpm check:workflow -- --feature test-orchestration` — waived；Content-Head: `fd724d47904b21362c15d8beef5092b769ef2694`；pre-ticket standard feature 与 checker 的已确认冲突由用户批准本次跳过。
- `git diff --check` — passed；Content-Head: `fd724d47904b21362c15d8beef5092b769ef2694`；G2 content diff 无 whitespace finding。
- `pnpm check:docs` — passed；Content-Head: `f945dc3eb019052bdbca7904251da7666d546d75`；29 篇索引文档通过，目标测试架构继续保持 Needs Review。
- `pnpm check:workflow -- --feature test-orchestration` — passed；Content-Head: `f945dc3eb019052bdbca7904251da7666d546d75`；approved spec、四张 tickets、依赖和 Validation Plan 格式通过。
- `git diff --check` — passed；Content-Head: `f945dc3eb019052bdbca7904251da7666d546d75`；G3 content diff 无 whitespace finding。
- `pnpm check:docs` — passed；Content-Head: `0dacf1f9ae9fdcd54e31070dc64d33884e53f8ab`；拆票验证顺序调整未改变索引文档集合。
- `pnpm check:workflow -- --feature test-orchestration` — passed；Content-Head: `0dacf1f9ae9fdcd54e31070dc64d33884e53f8ab`；Ticket 01/02 验证顺序与 ledger Validation Plan 一致。
- `git diff --check` — passed；Content-Head: `0dacf1f9ae9fdcd54e31070dc64d33884e53f8ab`；验证顺序 content diff 无 whitespace finding。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `4b5e50460b1ad09a03eaceabbbfbd811fc10d3bb`；16 个 workspace 已是冻结锁文件的最新状态。
- `bun test scripts/__tests__/test-orchestration.test.ts` — passed；Content-Head: `4b5e50460b1ad09a03eaceabbbfbd811fc10d3bb`；4/4 通过，覆盖任务契约、transit hash、verify 顺序和 fail-fast。
- `bun test scripts/__tests__/tooling-performance.test.ts -t "reads the current root and workspace task graph"` — passed；Content-Head: `4b5e50460b1ad09a03eaceabbbfbd811fc10d3bb`；既有工具链任务图契约已迁移到 transit。
- `pnpm test:smoke` — passed；Content-Head: `4b5e50460b1ad09a03eaceabbbfbd811fc10d3bb`；Ticket 02 adoption 前以 0 个 package task 正常退出且 cache 关闭。
- `pnpm lint` — passed；Content-Head: `4b5e50460b1ad09a03eaceabbbfbd811fc10d3bb`；16/16 task 通过，保留既有前端 warnings。
- `pnpm typecheck` — passed；Content-Head: `4b5e50460b1ad09a03eaceabbbfbd811fc10d3bb`；15/15 workspace 通过。
- `pnpm build` — passed；Content-Head: `4b5e50460b1ad09a03eaceabbbfbd811fc10d3bb`；Admin 与 SSO 生产构建通过。
- `pnpm test` — failed；Content-Head: `4b5e50460b1ad09a03eaceabbbfbd811fc10d3bb`；transit 生效而 runner 预算尚未实施时，SSO login-page 用例首次运行在 5 秒阈值超时；该非 Ticket 01 gate 已按拆票修正顺延到 Ticket 02。
- `pnpm check:docs` — passed；Content-Head: `4b5e50460b1ad09a03eaceabbbfbd811fc10d3bb`；29 篇索引文档通过，目标架构保持 Needs Review。
- `pnpm check:workflow -- --feature test-orchestration` — passed；Content-Head: `4b5e50460b1ad09a03eaceabbbfbd811fc10d3bb`；Ticket 01 记录和 Validation Plan 格式通过。
- `git diff --check` — passed；Content-Head: `4b5e50460b1ad09a03eaceabbbfbd811fc10d3bb`；candidate diff 无 whitespace finding。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `14b65e6a1217d64a5fcb27dd7593bac9d6e09df6`；评审修复后的 16 个 workspace 冻结安装状态最新。
- `bun test scripts/__tests__/test-orchestration.test.ts` — passed；Content-Head: `14b65e6a1217d64a5fcb27dd7593bac9d6e09df6`；4/4 通过，verify 顺序和 fail-fast 均通过真实 Node CLI seam。
- `bun test scripts/__tests__/tooling-performance.test.ts -t "reads the current root and workspace task graph"` — passed；Content-Head: `14b65e6a1217d64a5fcb27dd7593bac9d6e09df6`；旧测试不再重复拥有 test/transit/smoke 契约。
- `pnpm test:smoke` — passed；Content-Head: `14b65e6a1217d64a5fcb27dd7593bac9d6e09df6`；0 个 package task 的 Ticket 01 adoption 状态正常。
- `pnpm lint` — passed；Content-Head: `14b65e6a1217d64a5fcb27dd7593bac9d6e09df6`；16/16 task 通过，保留既有前端 warnings。
- `pnpm typecheck` — passed；Content-Head: `14b65e6a1217d64a5fcb27dd7593bac9d6e09df6`；15/15 workspace 通过。
- `pnpm build` — passed；Content-Head: `14b65e6a1217d64a5fcb27dd7593bac9d6e09df6`；Admin 与 SSO 生产构建通过。
- `pnpm check:docs` — passed；Content-Head: `14b65e6a1217d64a5fcb27dd7593bac9d6e09df6`；29 篇索引文档通过。
- `pnpm check:workflow -- --feature test-orchestration` — passed；Content-Head: `14b65e6a1217d64a5fcb27dd7593bac9d6e09df6`；评审修复后的记录格式通过。
- `git diff --check` — passed；Content-Head: `14b65e6a1217d64a5fcb27dd7593bac9d6e09df6`；评审修复 diff 无 whitespace finding。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `8b78564f9dbb2fc71cd7736f539bad372085b288`；16 个 workspace 与冻结锁文件一致。
- `bun test scripts/__tests__/test-orchestration.test.ts` — passed；Content-Head: `8b78564f9dbb2fc71cd7736f539bad372085b288`；7/7 通过，真实 Vitest collection 证明 OIDC 普通/smoke 集合互斥，并锁定 package-local worker、timeout、Bun 并发和 OpenAPI 分类。
- `pnpm lint` — passed；Content-Head: `8b78564f9dbb2fc71cd7736f539bad372085b288`；16/16 task 通过，OIDC 两个 Vitest config 已进入 package lint；保留既有前端 warnings。
- `pnpm typecheck` — passed；Content-Head: `8b78564f9dbb2fc71cd7736f539bad372085b288`；15/15 workspace 通过。
- `pnpm test` — passed；Content-Head: `8b78564f9dbb2fc71cd7736f539bad372085b288`；15/15 package 通过，OIDC ordinary 为 20 files/79 tests，entry smoke 未被收集；Admin hermetic UI integration 在统一 10 秒阈值内通过。
- `pnpm test:smoke` — passed；Content-Head: `8b78564f9dbb2fc71cd7736f539bad372085b288`；只执行 OIDC entry smoke，1/1 通过，cache bypass 且 package concurrency 1。
- `pnpm build` — passed；Content-Head: `8b78564f9dbb2fc71cd7736f539bad372085b288`；Admin 与 SSO 生产构建通过。
- `pnpm verify` — passed；Content-Head: `8b78564f9dbb2fc71cd7736f539bad372085b288`；static → typecheck → test → smoke → build 在候选头按固定顺序完整通过。
- `pnpm --filter @iam/admin e2e` — failed；Content-Head: `8b78564f9dbb2fc71cd7736f539bad372085b288`；首次 precondition 检查后 Playwright 因本机缺少 chromium-headless-shell v1228 未进入页面断言。
- `pnpm --filter @iam/admin e2e:install:browsers` — passed；Content-Head: `8b78564f9dbb2fc71cd7736f539bad372085b288`；安装仓库锁定 Playwright 版本所需的 Chromium、headless shell 与 FFmpeg。
- `pnpm --filter @iam/admin e2e` — passed；Content-Head: `8b78564f9dbb2fc71cd7736f539bad372085b288`；2/2 Chromium tests 通过；webServer 保留一条既有 MaxListeners warning。
- `pnpm --filter @iam/sso e2e` — passed；Content-Head: `8b78564f9dbb2fc71cd7736f539bad372085b288`；3/3 Chromium tests 通过；mocked flows 通过，webServer 保留既有 MaxListeners 与未启动 API proxy 的 ECONNREFUSED 诊断。
- `pnpm check:docs` — passed；Content-Head: `8b78564f9dbb2fc71cd7736f539bad372085b288`；29 篇文档均已索引，目标架构按计划继续保持 Needs Review 到 Ticket 04。
- `pnpm check:workflow -- --feature test-orchestration` — passed；Content-Head: `8b78564f9dbb2fc71cd7736f539bad372085b288`；timeout 设计修订、claim fixed point 与验证记录格式通过。
- `git diff --check` — passed；Content-Head: `8b78564f9dbb2fc71cd7736f539bad372085b288`；候选内容与 tracker sync 无 whitespace finding。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`；16 个 workspace 已是冻结锁文件的最新状态。
- `bun test scripts/__tests__/test-orchestration.test.ts` — passed；Content-Head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`；8/8 通过，覆盖全仓 Bun 预算、PostgreSQL 单 worker、Turbo coverage/cache、真实 runner collection、监听端口分类和 verify fail-fast。
- `pnpm lint` — passed；Content-Head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`；`pnpm verify` static 阶段在精确候选头执行 16/16 task，0 error，保留既有前端 warnings。
- `pnpm typecheck` — passed；Content-Head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`；`pnpm verify` 执行 15/15 workspace 通过。
- `pnpm test` — passed；Content-Head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`；`pnpm verify` 执行全仓 ordinary lane 通过，所有 Bun workspace 显式使用并发 2，OIDC 真实端口 smoke 未被收集。
- `pnpm test:smoke` — passed；Content-Head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`；OIDC 4 files/8 tests 通过，cache bypass 且 package concurrency 1。
- `pnpm build` — passed；Content-Head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`；Admin 与 SSO 生产构建通过。
- `pnpm verify` — passed；Content-Head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`；static → typecheck → test → smoke → build 在精确候选头完整通过。
- `pnpm --filter @iam/admin e2e` — passed；Content-Head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`；2/2 Chromium tests 通过，保留既有 webServer MaxListeners warning。
- `pnpm --filter @iam/sso e2e` — passed；Content-Head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`；3/3 Chromium tests 通过，保留既有 MaxListeners 与未启动 API proxy 的 ECONNREFUSED 诊断。
- `pnpm check:docs` — passed；Content-Head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`；29 篇文档均已索引，目标架构按计划继续保持 Needs Review 到 Ticket 04。
- `pnpm check:workflow -- --feature test-orchestration` — passed；Content-Head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`；扩大后的 workspace 范围、候选 SHA 和 Validation Plan 格式通过。
- `git diff --check` — passed；Content-Head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`；评审修复内容与 tracker sync 均无 whitespace finding。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `8a8d7da2b38384e9c252d351126e339a5d7de527`；16 个 workspace 已是冻结锁文件的最新状态。
- `bun test scripts/__tests__/test-orchestration.test.ts` — passed；Content-Head: `8a8d7da2b38384e9c252d351126e339a5d7de527`；8/8 通过，OIDC ordinary/smoke 真实 collection 继续互斥。
- `pnpm --filter @iam/oidc-provider exec vitest run src/__tests__/process-smoke-harness.test.ts` — passed；Content-Head: `8a8d7da2b38384e9c252d351126e339a5d7de527`；9/9 通过，以快速 fake child 覆盖 spawn error、提前退出、永不就绪、断言失败、cleanup failure/timeout、端口竞争和 Windows/POSIX tree kill。
- `pnpm --filter @iam/oidc-provider test` — passed；Content-Head: `8a8d7da2b38384e9c252d351126e339a5d7de527`；18 files/81 tests 通过，harness 聚焦测试进入 ordinary lane，真实 entry smoke 未被收集。
- `pnpm --filter @iam/oidc-provider test:smoke` — passed；Content-Head: `8a8d7da2b38384e9c252d351126e339a5d7de527`；4 files/8 tests 通过，entry 以 discovery HTTP 响应证明 production composition 就绪。
- `pnpm --filter @iam/oidc-provider lint` — passed；Content-Head: `8a8d7da2b38384e9c252d351126e339a5d7de527`；OIDC source 与两个 Vitest config 无 lint error。
- `pnpm --filter @iam/oidc-provider typecheck` — passed；Content-Head: `8a8d7da2b38384e9c252d351126e339a5d7de527`；OIDC TypeScript 检查通过。
- `pnpm test` — passed；Content-Head: `8a8d7da2b38384e9c252d351126e339a5d7de527`；15/15 package task 通过，OIDC ordinary 为 18 files/81 tests。
- `pnpm test:smoke` — passed；Content-Head: `8a8d7da2b38384e9c252d351126e339a5d7de527`；根单 package smoke 4 files/8 tests 通过且无残留 entry 子进程。
- `pnpm check:docs` — passed；Content-Head: `8a8d7da2b38384e9c252d351126e339a5d7de527`；29 篇文档均已索引，目标架构继续保持 Needs Review 到 Ticket 04。
- `pnpm check:workflow -- --feature test-orchestration` — passed；Content-Head: `8a8d7da2b38384e9c252d351126e339a5d7de527`；Ticket 03 claim fixed point、候选 SHA 和 Validation Plan 格式通过。
- `git diff --check` — passed；Content-Head: `8a8d7da2b38384e9c252d351126e339a5d7de527`；candidate content 与 tracker sync 无 whitespace finding。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `540bde4d8216e5526dc6423cffff5c2dd9ce03bf`；16 个 workspace 与冻结锁文件一致。
- `bun test scripts/__tests__/test-orchestration.test.ts` — passed；Content-Head: `540bde4d8216e5526dc6423cffff5c2dd9ce03bf`；8/8 通过，ordinary/smoke collection、worker、cache 和 verify 契约保持不变。
- `pnpm --filter @iam/oidc-provider exec vitest run src/__tests__/process-smoke-harness.test.ts` — passed；Content-Head: `540bde4d8216e5526dc6423cffff5c2dd9ce03bf`；18/18 通过，新增覆盖同 issuer 竞争服务、exit-before-close 尾部输出、leader 先退出且后代忽略 TERM、Windows tree owner 不确定失败，以及临时目录成功/失败清理。
- `pnpm --filter @iam/oidc-provider test` — passed；Content-Head: `540bde4d8216e5526dc6423cffff5c2dd9ce03bf`；18 files/90 tests 通过，聚焦 harness 留在 ordinary lane，真实 entry 未被收集。
- `pnpm --filter @iam/oidc-provider test:smoke` — passed；Content-Head: `540bde4d8216e5526dc6423cffff5c2dd9ce03bf`；4 files/8 tests 通过，entry 同时取得 child-owned listening 证据与 discovery HTTP 响应，结束后无 entry 进程或 owned 临时目录残留。
- `pnpm --filter @iam/oidc-provider lint` — passed；Content-Head: `540bde4d8216e5526dc6423cffff5c2dd9ce03bf`；OIDC source 与两个 Vitest config 无 lint error。
- `pnpm --filter @iam/oidc-provider typecheck` — passed；Content-Head: `540bde4d8216e5526dc6423cffff5c2dd9ce03bf`；OIDC TypeScript 检查通过。
- `pnpm test` — passed；Content-Head: `540bde4d8216e5526dc6423cffff5c2dd9ce03bf`；15/15 package task 通过，OIDC ordinary 18 files/90 tests 在根调度下通过。
- `pnpm test:smoke` — passed；Content-Head: `540bde4d8216e5526dc6423cffff5c2dd9ce03bf`；cache bypass、package concurrency 1，OIDC 4 files/8 tests 通过；entry 约 15 秒就绪且结束后无进程或临时目录残留。
- `pnpm check:docs` — passed；Content-Head: `540bde4d8216e5526dc6423cffff5c2dd9ce03bf`；29 篇文档均已索引，目标架构继续保持 Needs Review 到 Ticket 04。
- `pnpm check:workflow -- --feature test-orchestration` — passed；Content-Head: `540bde4d8216e5526dc6423cffff5c2dd9ce03bf`；Ticket 03 claim fixed point、修复候选和 Validation Plan 格式通过。
- `git diff --check` — passed；Content-Head: `540bde4d8216e5526dc6423cffff5c2dd9ce03bf`；评审修复候选无 whitespace finding。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `3c25000f64e85a2a43d332afa408dff7f2abd988`；16 个 workspace 与冻结锁文件一致。
- `bun test scripts/__tests__/test-orchestration.test.ts` — passed；Content-Head: `3c25000f64e85a2a43d332afa408dff7f2abd988`；8/8 通过，新增 Windows Job smoke 仍只由 smoke lane 收集。
- `pnpm --filter @iam/oidc-provider exec vitest run src/__tests__/process-smoke-harness.test.ts` — passed；Content-Head: `3c25000f64e85a2a43d332afa408dff7f2abd988`；19/19 通过，新增跨 chunk readiness 与真实 spawn `ENOENT` 回归，ordinary harness 不启动成功的外部进程。
- `pnpm --filter @iam/oidc-provider test` — passed；Content-Head: `3c25000f64e85a2a43d332afa408dff7f2abd988`；18 files/91 tests 通过，真实 Windows Job 验证未混入 ordinary lane。
- `pnpm --filter @iam/oidc-provider test:smoke` — passed；Content-Head: `3c25000f64e85a2a43d332afa408dff7f2abd988`；5 files/9 tests 通过，包含真实 production entry 和 leader 先退出后的 stubborn descendant Job 回收，结束后无 owner 资源残留。
- `pnpm --filter @iam/oidc-provider lint` — passed；Content-Head: `3c25000f64e85a2a43d332afa408dff7f2abd988`；OIDC TypeScript、Windows Node launcher 与 Vitest configs 无 lint error。
- `pnpm --filter @iam/oidc-provider typecheck` — passed；Content-Head: `3c25000f64e85a2a43d332afa408dff7f2abd988`；OIDC TypeScript 检查通过。
- `pnpm test` — passed；Content-Head: `3c25000f64e85a2a43d332afa408dff7f2abd988`；15/15 package task 通过，OIDC ordinary 18 files/91 tests 在根调度下通过。
- `pnpm test:smoke` — passed；Content-Head: `3c25000f64e85a2a43d332afa408dff7f2abd988`；cache bypass、package concurrency 1，OIDC 5 files/9 tests 通过；entry 约 9.5 秒，真实 Job 回收约 2.4 秒，结束后无进程或临时目录残留。
- `pnpm check:docs` — passed；Content-Head: `3c25000f64e85a2a43d332afa408dff7f2abd988`；29 篇文档均已索引，目标架构继续保持 Needs Review 到 Ticket 04。
- `pnpm check:workflow -- --feature test-orchestration` — passed；Content-Head: `3c25000f64e85a2a43d332afa408dff7f2abd988`；第二轮修复候选与 Ticket 03 Validation Plan 格式通过。
- `git diff --check` — passed；Content-Head: `3c25000f64e85a2a43d332afa408dff7f2abd988`；第二轮评审修复候选无 whitespace finding。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `05aea45146fb68f3c1950cf65e3ed54be4deece8`；16 个 workspace 与冻结锁文件一致。
- `bun test scripts/__tests__/test-orchestration.test.ts` — passed；Content-Head: `05aea45146fb68f3c1950cf65e3ed54be4deece8`；8/8 通过，真实 Windows Job 验证继续只由 smoke lane 收集。
- `pnpm --filter @iam/oidc-provider exec vitest run src/__tests__/process-smoke-harness.test.ts` — passed；Content-Head: `05aea45146fb68f3c1950cf65e3ed54be4deece8`；19/19 通过，Windows 上 owned temp cleanup 测试使用受普通 10 秒总预算约束的 2 秒独立 deadline，消除 100ms `fs.rm` 假失败。
- `pnpm --filter @iam/oidc-provider test` — passed；Content-Head: `05aea45146fb68f3c1950cf65e3ed54be4deece8`；18 files/91 tests 通过，真实 process smoke 未进入 ordinary lane。
- `pnpm --filter @iam/oidc-provider test:smoke` — passed；Content-Head: `05aea45146fb68f3c1950cf65e3ed54be4deece8`；5 files/9 tests 通过，真实 entry、256 KiB 尾输出和 detached stubborn descendant Job 回收完成后无进程或 owned temp 残留。
- `pnpm --filter @iam/oidc-provider lint` — passed；Content-Head: `05aea45146fb68f3c1950cf65e3ed54be4deece8`；OIDC TypeScript、Windows launcher 与 Vitest configs 无 lint error。
- `pnpm --filter @iam/oidc-provider typecheck` — passed；Content-Head: `05aea45146fb68f3c1950cf65e3ed54be4deece8`；OIDC TypeScript 检查通过。
- `pnpm test` — passed；Content-Head: `05aea45146fb68f3c1950cf65e3ed54be4deece8`；15/15 package task 通过，OIDC ordinary 在根调度下为 18 files/91 tests。
- `pnpm test:smoke` — passed；Content-Head: `05aea45146fb68f3c1950cf65e3ed54be4deece8`；cache bypass、package concurrency 1，OIDC 5 files/9 tests 通过；entry 约 12.8 秒、真实 Job 回收约 2.1 秒，结束后零残留。
- `pnpm check:docs` — passed；Content-Head: `05aea45146fb68f3c1950cf65e3ed54be4deece8`；29 篇文档均已索引，目标架构按计划继续保持 Needs Review 到 Ticket 04。
- `pnpm check:workflow -- --feature test-orchestration` — passed；Content-Head: `05aea45146fb68f3c1950cf65e3ed54be4deece8`；第三轮修复候选与 Ticket 03 Validation Plan 格式通过。
- `git diff --check` — passed；Content-Head: `05aea45146fb68f3c1950cf65e3ed54be4deece8`；第三轮评审修复候选无 whitespace finding。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `470204c053dbcf6f60855ba1eaa3089049ad57ca`；当前工作区与隔离候选 worktree 的 16 个 workspace 均与冻结锁文件一致。
- `bun test scripts/__tests__/test-orchestration.test.ts` — passed；Content-Head: `470204c053dbcf6f60855ba1eaa3089049ad57ca`；8/8 tests、58 个 expectations 通过，覆盖任务图、通道互斥、预算、cache、verify 顺序与 fail-fast。
- `pnpm test:smoke` — passed；Content-Head: `470204c053dbcf6f60855ba1eaa3089049ad57ca`；Windows local 连续验收 20/20 轮退出码均为 0，Turbo 每轮均报告 `cache bypass`，无 retry 或 timeout；round trace 为 `01 18:30:32.302+08:00 / 8313ms`、`02 18:30:41.133+08:00 / 6212ms`、`03 18:30:47.706+08:00 / 6218ms`、`04 18:30:54.255+08:00 / 6202ms`、`05 18:31:14.360+08:00 / 6244ms`、`06 18:31:21.064+08:00 / 6321ms`、`07 18:31:27.742+08:00 / 6209ms`、`08 18:31:34.290+08:00 / 6394ms`、`09 18:31:53.738+08:00 / 6444ms`、`10 18:32:00.645+08:00 / 6457ms`、`11 18:32:07.456+08:00 / 6434ms`、`12 18:32:14.215+08:00 / 6444ms`、`13 18:32:32.641+08:00 / 6398ms`、`14 18:32:39.481+08:00 / 6357ms`、`15 18:32:46.197+08:00 / 6395ms`、`16 18:32:52.915+08:00 / 6357ms`、`17 18:33:16.523+08:00 / 6235ms`、`18 18:33:23.211+08:00 / 6331ms`、`19 18:33:29.901+08:00 / 6338ms`、`20 18:33:36.556+08:00 / 6367ms`；每轮只读比较命令前后的 harness 特征 PID，并检查新 PID 的监听端口和 `iam-oidc-entry-smoke-*` owned temp，20 轮的新增 PID、listener 与 temp 均为 0，未扫描后终止或误杀其他 Node 进程。
- `pnpm verify` — passed；Content-Head: `470204c053dbcf6f60855ba1eaa3089049ad57ca`；Windows local 连续验收 3/3 完成样本均按 static → typecheck → test → smoke → build 顺序退出 0，无 retry、测试 timeout 或资源残留；round trace 为 `01 18:36:10.885+08:00 / 69061ms`、`02 18:37:34.697+08:00 / 10471ms`、`03 18:38:15.753+08:00 / 10725ms`；计数前一次外层桌面命令通道在 64 秒硬截止处终止，未产生 gate 结果且资源审计为零，它未计入样本，连续计数按契约从 Round 01 重新开始，没有把重跑结果用于覆盖测试失败。
- `pnpm lint` — passed；Content-Head: `470204c053dbcf6f60855ba1eaa3089049ad57ca`；16 个 workspace lint、root lint 与全局 workflow guard 通过。
- `pnpm typecheck` — passed；Content-Head: `470204c053dbcf6f60855ba1eaa3089049ad57ca`；15 个 workspace typecheck 通过。
- `pnpm test` — passed；Content-Head: `470204c053dbcf6f60855ba1eaa3089049ad57ca`；全仓普通测试通道通过，真实 process smoke 未被收集。
- `pnpm test:smoke` — passed；Content-Head: `470204c053dbcf6f60855ba1eaa3089049ad57ca`；完整 feature matrix 的独立 smoke gate 继续以 cache bypass、单 package/单 worker 通过。
- `pnpm build` — passed；Content-Head: `470204c053dbcf6f60855ba1eaa3089049ad57ca`；Admin 与 SSO 生产构建通过。
- `pnpm verify` — passed；Content-Head: `470204c053dbcf6f60855ba1eaa3089049ad57ca`；正式环境无关基线连续 3/3 通过。
- `pnpm --filter @iam/admin e2e` — passed；Content-Head: `470204c053dbcf6f60855ba1eaa3089049ad57ca`；2/2 Chromium tests 通过。
- `pnpm --filter @iam/sso e2e` — passed；Content-Head: `470204c053dbcf6f60855ba1eaa3089049ad57ca`；3/3 Chromium tests 通过。
- `pnpm check:docs` — passed；Content-Head: `470204c053dbcf6f60855ba1eaa3089049ad57ca`；在不包含用户未跟踪 research 文件的隔离候选 worktree 中执行正式命令，29 篇受版本控制文档均已索引，测试架构提升为 Current。
- `pnpm check:workflow -- --feature test-orchestration` — passed；Content-Head: `470204c053dbcf6f60855ba1eaa3089049ad57ca`；Ticket 04 候选、Validation Plan 与 ledger 格式通过。
- `git diff --check` — passed；Content-Head: `470204c053dbcf6f60855ba1eaa3089049ad57ca`；Ticket 04 文档候选无 whitespace finding。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；首轮评审修复候选的 16 个 workspace 在隔离 worktree 中与冻结锁文件一致。
- `bun test scripts/__tests__/test-orchestration.test.ts` — passed；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；8/8 tests、58 个 expectations 通过。
- `pnpm lint` — passed；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；workspace、root lint 与全局 workflow guard 通过。
- `pnpm typecheck` — passed；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；15 个 workspace typecheck 通过。
- `pnpm test` — passed；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；全仓普通测试通道通过。
- `pnpm test:smoke` — passed；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；focused 修复后重新完成 Windows local 20/20 连续验收，所有轮次均 `cache bypass`、退出 0、无 retry/timeout，新增 harness PID、listener 与 owned temp 均为 0；round trace 为 `01 19:02:06.140+08:00 / 7267ms`、`02 19:02:13.858+08:00 / 7038ms`、`03 19:02:21.243+08:00 / 6982ms`、`04 19:02:28.563+08:00 / 6942ms`、`05 19:02:48.355+08:00 / 6831ms`、`06 19:02:55.637+08:00 / 6918ms`、`07 19:03:02.909+08:00 / 6995ms`、`08 19:03:10.242+08:00 / 6779ms`、`09 19:03:29.973+08:00 / 6904ms`、`10 19:03:37.324+08:00 / 6690ms`、`11 19:03:44.361+08:00 / 6651ms`、`12 19:03:51.343+08:00 / 6766ms`、`13 19:04:11.071+08:00 / 6723ms`、`14 19:04:18.251+08:00 / 6601ms`、`15 19:04:25.196+08:00 / 6753ms`、`16 19:04:32.273+08:00 / 6722ms`、`17 19:04:51.793+08:00 / 6798ms`、`18 19:04:59.052+08:00 / 6653ms`、`19 19:05:06.061+08:00 / 6664ms`、`20 19:05:13.053+08:00 / 6722ms`。
- `pnpm build` — passed；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；Admin 与 SSO 生产构建通过。
- `pnpm verify` — passed；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；focused 修复后重新完成 3/3 连续验收，每轮均按 static → typecheck → test → smoke → build 顺序退出 0 且资源审计为零；round trace 为 `01 19:05:34.244+08:00 / 17121ms`、`02 19:06:05.144+08:00 / 10142ms`、`03 19:06:29.197+08:00 / 10000ms`。
- `pnpm --filter @iam/db db:check` — passed；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；Drizzle schema 与 migration consistency 检查通过。
- `pnpm --filter @iam/role-assignment-resolution test:postgres` — passed；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；使用唯一 `--rm` PostgreSQL 18.4 容器、专用 `iam_ticket04_test` 数据库和随机本地端口 45682 通过，随机 schema 已由 harness 清理，容器已删除。
- `pnpm --filter @iam/admin e2e` — passed；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；2/2 Chromium tests 通过。
- `pnpm --filter @iam/sso e2e` — passed；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；3/3 Chromium tests 通过。
- `pnpm gateway:apisix:validate -- --env dev:iam` — passed；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；声明的 `dev:iam` manifest scope 通过，包含 5 upstreams、4 plugin configs、1 service 和 12 routes。
- `pnpm check:docs` — passed；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；隔离候选 worktree 的 29 篇受版本控制文档均已索引。
- `pnpm check:workflow -- --feature test-orchestration` — passed；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；补齐后的 feature Change-Types、workspaces、Validation Plan 与证据格式通过。
- `git diff --check` — passed；Content-Head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；focused 修复候选无 whitespace finding。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；隔离 remediation worktree 的 16 个 workspace 与冻结锁文件一致。
- `bun test scripts/__tests__/test-orchestration.test.ts` — passed；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；8/8 tests、59 个 expectations 通过，新增断言锁定 E2E 禁用缓存。
- `pnpm lint` — passed；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；workspace、root lint 与 workflow guard 通过，保留既有前端 warnings。
- `pnpm typecheck` — passed；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；15 个 workspace typecheck 通过。
- `pnpm test` — passed；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；全仓普通测试通道通过。
- `pnpm test:smoke` — passed；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；OIDC 5 files/9 tests 通过，cache bypass 且无 harness 资源残留。
- `pnpm build` — passed；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；Admin 与 SSO 生产构建通过。
- `pnpm verify` — passed；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；static → typecheck → test → smoke → build 按固定顺序完整通过。
- `pnpm --filter @iam/db db:check` — passed；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；Drizzle schema 与 migration consistency 检查通过。
- `pnpm --filter @iam/role-assignment-resolution test:postgres` — passed；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；使用唯一 `--rm` PostgreSQL 18.4 容器、专用 `iam_ticket02_remediation` 数据库和随机本地端口 45132，45/45 tests 通过；随机 schema 与容器已清理，Docker Desktop 已恢复停止状态。
- `pnpm --filter @iam/admin e2e` — passed；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；2/2 Chromium tests 通过。
- `pnpm --filter @iam/sso e2e` — passed；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；3/3 Chromium tests 通过。
- `pnpm gateway:apisix:validate -- --env dev:iam` — passed；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；`dev:iam` manifest 的 5 upstreams、4 plugin configs、1 service 与 12 routes 通过。
- `pnpm check:docs` — passed；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；隔离 remediation worktree 的 29 篇受版本控制文档均已索引。
- `pnpm check:workflow -- --feature test-orchestration` — passed；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；reopen lifecycle、修正后的 Ticket 02 Validation Plan 与 evidence 结构通过。
- `git diff --check` — passed；Content-Head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`；remediation candidate 无 whitespace finding。

## 评审记录

- Ticket 01 — fixed point: `5d365292eeffbe04330201b5a65a7e490615b994`；reviewed head: `14b65e6a1217d64a5fcb27dd7593bac9d6e09df6`；Standards: passed；Spec: passed；Node seam 与契约所有权 findings 修复后，完整范围两轴均为 0 finding。
- Ticket 02 — fixed point: `7c5c82cdcae2bdb2aee08542144d3475387c1760`；reviewed head: `8b78564f9dbb2fc71cd7736f539bad372085b288`；Standards: findings；Spec: findings；首轮共报告 5 项 finding：遗漏部分 Bun workspace、OIDC 真实监听测试仍在 ordinary lane、局部 timeout 超过上限，且 Turbo 缺少 PostgreSQL/coverage 专用任务语义，已进入 focused 修复。
- Ticket 02 — fixed point: `7c5c82cdcae2bdb2aee08542144d3475387c1760`；reviewed head: `d9ba45886d452deff36f8e322fa5d522e471ae1b`；Standards: passed；Spec: passed；首轮 5 项 finding 修复后，完整范围复审为 0 finding。
- Ticket 03 — fixed point: `c3470ea9731fc6215104f20c4b545ca2e8a67997`；reviewed head: `8a8d7da2b38384e9c252d351126e339a5d7de527`；Standards: findings；Spec: findings；首轮发现同 issuer 竞争服务可造成假就绪、`exit` 先于 `close` 时丢失尾部输出、父进程状态不能证明后代清理，以及缺少每次尝试的 owned 临时目录，已进入 focused 修复。
- Ticket 03 — fixed point: `c3470ea9731fc6215104f20c4b545ca2e8a67997`；reviewed head: `540bde4d8216e5526dc6423cffff5c2dd9ce03bf`；Standards: findings；Spec: findings；第二轮确认 Windows 已退出 PID 无法作为 tree owner、readiness 文本跨 stdout chunk 时无法命中，以及真实 spawn `ENOENT` 被错误聚合 cleanup failure，已进入第二次 focused 修复。
- Ticket 03 — fixed point: `c3470ea9731fc6215104f20c4b545ca2e8a67997`；reviewed head: `3c25000f64e85a2a43d332afa408dff7f2abd988`；Standards: findings；Spec: passed；第三轮发现 Windows launcher 强制退出可能截断尾部输出，且真实 Job 后代未 detached，已进入第三次 focused 修复。
- Ticket 03 — fixed point: `c3470ea9731fc6215104f20c4b545ca2e8a67997`；reviewed head: `05aea45146fb68f3c1950cf65e3ed54be4deece8`；Standards: passed；Spec: passed；下游停止读取时 launcher drain 缺少独立 deadline 的 finding 已由维护者明确延期并接受风险，因此本次 scope 不保留 unresolved finding。
- Ticket 04 — fixed point: `4f10dc40c43f698382534cf399d6a3cd4cfaa500`；reviewed head: `470204c053dbcf6f60855ba1eaa3089049ad57ca`；Standards: findings；Spec: findings；两轴均确认 feature committed diff 的 `database`、`gateway` 与受影响 workspace 并集未写入 ledger，导致 `db:check`、`test:postgres` 和带参数 Gateway validate 缺失，“完整 feature matrix”通过声明无效，已进入 focused 修复。
- Ticket 04 — fixed point: `4f10dc40c43f698382534cf399d6a3cd4cfaa500`；reviewed head: `59673110e5e33a8aa5e4cf0a1bb78ec9538032ad`；Standards: passed；Spec: passed；首轮 feature matrix findings 修复后，完整范围复审为 0 finding。
- Feature — fixed point: `5fc1b7169bd2a75b2eadf4b5453f591c96d456bc`；reviewed head: `520a24bb3324e8b3bd381d834b2990e3e8e3a44f`；Standards: findings；Spec: findings；Ticket 02 历史范围/专项 gate、ledger 授权摘要及 E2E cache 回归断言共 3 项 finding，已进入原票 reopen/remediation。
- Ticket 02 — fixed point: `7c1669fd18912ede7bd1cbf31d3bd019f7da000c`；reviewed head: `d3e12faa41aec425e195403e4e36b8e531967b47`；Standards: passed；Spec: passed；最终 feature 评审的 3 项 findings 修复后，完整 remediation 范围复审为 0 finding。
- Feature — fixed point: `5fc1b7169bd2a75b2eadf4b5453f591c96d456bc`；reviewed head: `d800f4431468b8dd7bac0c444dc2a6465e7b7845`；Standards: passed；Spec: passed；Ticket 02 remediation 后的完整 feature 范围最终复审为 0 finding。

## 授权记录

- 2026-07-24 — 用户明确要求开始本项目 workflow；本轮按已确认设计推进到 G2 Spec Ready，未授权 ticket 发布、implementation、merge、push 或远端操作。
- 2026-07-24 — 用户明确授权本次跳过 pre-ticket standard feature 与 workflow checker 的已确认冲突并继续完成 G2；授权只覆盖 G2 content commit 和紧随其后的 Content-Head sync，不扩大到 ticket 发布或 implementation。
- 2026-07-24 — 用户批准 draft spec 与四片拆票方案，授权进入 to-tickets 并发布 tickets 01–04；implementation、merge、push 和远端操作仍未授权。
- 2026-07-24 — 用户明确批准实施，授权范围为当前任务和分支内的 tickets 01–04；merge、push 和远端操作仍未授权。
- 2026-07-24 — 用户依据 Ticket 02 的实测诊断，明确要求所有 package-local Vitest 普通测试默认 timeout 统一放宽到 10 秒；Bun、process smoke、merge、push 与远端授权边界不变。

## Waivers

- 2026-07-24 — Command: `pnpm check:workflow -- --feature test-orchestration`；Reason: checker 在 standard feature 的 pre-ticket G2 阶段无条件要求至少一张 ticket，与 workflow 规定 tickets 只能在获批 G3 发布的授权边界冲突；Scope: 本 feature 的 G2 content commit 与紧随其后的 Content-Head sync checkpoint；Risk: G2 期间 workflow guard 保持失败，直到获批 tickets 在 G3 发布或 checker 后续修复；Approved by: 用户
- 2026-07-24 — Command: `Ticket 03 Standards review gate`；Reason: 维护者明确要求本次不处理 launcher 下游停止读取时 drain 无独立 deadline 的 finding，并将 Ticket 03 标记为 resolved；Scope: Ticket 03 Windows launcher 的异常输出阻塞路径；Risk: 下游停止读取时 launcher/Job 可能等待到外层 smoke timeout，掩盖原始诊断并影响连续验收；Approved by: 用户

## 重开与修复

- 2026-07-24 — Ticket 01 首次实现态全仓测试证明 transit 任务图与尚未实施的 runner 预算存在验证顺序依赖；不重跑掩盖 SSO timeout，把完整 root test/verify gate 顺延到 Ticket 02，feature 范围与最终验收不变。
- 2026-07-24 — Ticket 02 首轮分流后的 `pnpm test` 已移除 OIDC smoke，但 Admin UI integration 在 package 并行下稳定越过 5 秒；定向、文件集合、worker 上限与 10 秒诊断运行排除了 OIDC/Turbo 依赖边和单纯 worker 数假设。维护者据此把全部 package-local Vitest 普通默认值改为 10 秒，spec、ADR、目标架构与后续 tickets 同步修正。
- 2026-07-24 — Ticket 02 评审修复后的结构测试首次冷运行暴露两个跨进程契约用例越过 Bun 默认 5 秒；没有以重跑作为通过依据，而是并行真实 Vitest collection、复用固定 Node recorder fixture，并仅对四个明确的 hermetic process integration 使用规格允许的局部 15 秒上限。

## Merge brief

- Feature branch: `codex/test-orchestration`
- Target branch: `main`
- Target base: `5fc1b7169bd2a75b2eadf4b5453f591c96d456bc`
- Target tip: `5fc1b7169bd2a75b2eadf4b5453f591c96d456bc`
- Content head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`
- Verified content head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`
- Reviewed content head: `b79f83ae20cebccdf511425d03bfff6a6a68953f`
- Delivery summary: 建立跨平台 test/verify 任务图、普通与 smoke 通道及资源预算，强化 OIDC 真实进程 harness，并固化完整验证门禁与 Current 测试架构文档。
- Commit range: `5fc1b7169bd2a75b2eadf4b5453f591c96d456bc...95e24b250a2e4bd0759f4ce5448761b9886a317d`
- Validation: passed-with-waivers
- Review: passed
- Waivers and risks: G2 pre-ticket workflow checker 与授权边界冲突的历史 waiver 已获批准；Ticket 03 Windows launcher 在下游完全停止读取时缺少独立 drain deadline 的风险由维护者明确接受，可能等待到外层 smoke timeout。
- Local transaction:
  1. 再次确认 `main` tip 仍为 `5fc1b7169bd2a75b2eadf4b5453f591c96d456bc`，变化时立即停止并重新执行集成、验证与评审。
  2. 切换到 `main`，执行 `git merge --squash codex/test-orchestration`，并创建 `feat(testing): 固化 monorepo 测试编排` 交付提交。
  3. 把最终 squash SHA 回填到 ledger 与四张 ticket 的最新 Resolution，并创建 tracker-only 元数据提交。
  4. 确认 feature 目录不存在残留的最终 SHA `pending`，运行 workflow、document 与 whitespace 检查。
  5. 全部步骤成功后删除本地 `codex/test-orchestration` 分支。

## Delivery receipt

- 无。
