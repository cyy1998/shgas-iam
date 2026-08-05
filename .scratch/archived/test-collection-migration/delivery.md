# Canonical Collection 与命令迁移开发记录

## 当前状态

- 正式范围：[spec.md](spec.md)。
- 目标分支：`main`；功能分支：`codex/test-collection-migration`；Ticket 10 的 review range 为
  `e84570b1...a65e8015`。
- [01 — 锁定旧 Collection 基线与目标归属](issues/01-lock-legacy-collection-baseline.md) 已完成聚焦验证并经三轮
  Standards/Spec 双轴评审清零，状态为 `resolved`。
- [02 — 用 OIDC 纵切验证 Vitest 多 Profile 迁移](issues/02-prove-vitest-profiles-with-oidc.md) 已完成聚焦验证并经三轮
  Standards/Spec 双轴评审清零，状态为 `resolved`。
- [03 — 用 API Core 纵切验证 Bun 与 Process Harness 迁移](issues/03-prove-bun-process-with-api-core.md) 已完成聚焦验证并经三轮
  Standards/Spec 双轴评审清零，状态为 `resolved`。
- [04 — 迁移 API 的完整 Canonical Package Surface](issues/04-migrate-api-canonical-surface.md) 已完成聚焦验证并经
  Standards/Spec 双轴评审清零，状态为 `resolved`。
- [05 — 迁移 Admin API 与 Worker 的 Canonical Package Surfaces](issues/05-migrate-admin-worker-surfaces.md) 已完成聚焦验证、
  首轮 finding 修复并经 Standards/Spec 双轴复审清零，状态为 `resolved`。
- [06 — 迁移 Database 与 Read-model 资源 Owners](issues/06-migrate-db-read-model-owners.md) 已完成聚焦验证、首轮
  Standards finding 修复并经 Standards/Spec 双轴复审清零，状态为 `resolved`。
- [07 — 迁移 Pure Shared Packages 与 Gateway Unit Surfaces](issues/07-migrate-shared-gateway-surfaces.md) 已完成聚焦验证、
  两轮 Standards finding 修复并经 Standards/Spec 双轴复审清零，状态为 `resolved`。
- [08 — 迁移 Frontend Unit 与 Mock-browser Surfaces](issues/08-migrate-frontend-browser-surfaces.md) 已完成聚焦验证并经
  Standards/Spec 双轴评审清零，状态为 `resolved`。
- [09 — 用 Root Commands 与永久 Guard 封闭 Collections](issues/09-publish-root-collections-and-guard.md) 已完成聚焦验证并经
  三轮 Standards/Spec 双轴评审清零，状态为 `resolved`。
- [10 — 原子切换默认命令并退役旧入口](issues/10-cut-over-default-commands.md) 已完成一次性 cutover、聚焦与完整验证，
  并经 Standards/Spec 双轴复审清零，状态为 `resolved`。
- 全部 implementation tickets 已完成；下一安全动作需另行取得本地合入授权。本次未授权 merge、push、PR、部署、归档或
  分支清理。

## 验收与验证计划

> Ticket 01–08 使用的 feature-local mapping、baseline 与 live 对照物属于迁移期证据，已按 Ticket 10 contract 退役；
> 当前 collection 正确性由永久 `check:test-collection` Guard 与正式架构、命令文档接管。下列记录只保留历史验证事实。

- Ticket 01 已验证固定 baseline 与文件系统候选双向相等：267 个文件、36 个旧 collections、4 个 root tooling tests、
  唯一 MJS、6 个 Playwright JSON 文件、1 个迁出测试模型的 rehearsal 与 2 个具名临时例外均符合 contract。
- Live 对照已通过 OIDC/Admin/SSO Vitest JSON list、Admin/SSO Playwright JSON list、Bun 窄目录枚举与 Turbo dry-run；
  36 个 runner collections 精确覆盖 267 个候选，Turbo 可达 `e2e`、`test`、`test:external`、`test:postgres`、
  `test:redis`、`test:smoke`。
- 目标归属 fixture 4/4 通过，覆盖未来 `e2e/system` 合法归属，并证明未知 target 与 behavior mismatch 继续 fail closed；
  feature-local TypeScript strict check、ESLint、`scripts/__tests__/test-orchestration.test.ts` 16/16 和
  `git diff --check` 均通过。
- Ticket 02 按维护者明确授权把冲突的四命令/列表修正为五个 profiles；迁移期固定证据驱动的 Vitest list
  对照证明 OIDC Unit/component/process/composition/redis 为 9/9/5/1/1、合计 25 个文件且互斥，旧 18/5/1/1 package
  scripts 仍可达。Unit 43/43、component 59/59、process 15/15、旧 ordinary 102/102 与旧 process 15/15 通过；OIDC
  lint/typecheck、env-name guard、Architecture Guard、root lint、root orchestration 16/16 与 whitespace 检查通过。
- Ticket 02 的 composition 与 redis canonical commands 在缺少调用方专用 URL 时各运行一次并按 contract fail fast；前者明确缺少
  `IAM_OIDC_PROVIDER_TEST_DATABASE_URL`，后者明确缺少 `IAM_OIDC_PROVIDER_TEST_REDIS_URL`，未 retry、未 fallback、未伪装通过。
- Ticket 02 的 Docker deploy context 曾由迁移期 BuildKit verifier 实际导出并枚举：production source 保留，
  `test-integration/**`、harness 与 Vitest configs 不进入 context；feature-local strict TypeScript 与 ESLint 检查通过。
- Ticket 03 以迁移期固定 mapping 对照 API Core 的 35 个 ordinary、3 个 process 与 4 个 Redis 文件，证明
  Unit/component/process/Redis 四个 canonical collections 完整互斥，旧 ordinary/process/Redis 入口继续完整可达；共享
  process harness contract tests 留在 component，真实 Windows Job 与 child-process tests 只进入 process。
- Ticket 03 的 Unit 40/40、component 190/190、process 6/6、旧 ordinary 230/230、旧 process 6/6 与共享 harness 28/28
  通过；API Core lint/typecheck、OIDC lint/typecheck、root lint、root orchestration 16/16、文档索引和 whitespace 检查通过。
  Redis canonical command 在缺少 `IAM_API_CORE_TEST_REDIS_URL` 时首次明确 fail fast，未 retry、fallback 或伪装通过。
- Ticket 04 以迁移期固定 mapping 对照 API 的 Unit/component/process/composition/PostgreSQL/Redis
  11/40/1/1/1/2 个文件，证明 56 个候选完整互斥，旧 ordinary/process/composition/PostgreSQL/Redis 入口继续可达同一覆盖。
- Ticket 04 的 Unit 58/58、component 328/328、旧 ordinary 386/386、canonical 与旧 process 各 2/2 通过；API
  lint/typecheck、root lint、env-name guard、root orchestration 20/20、文档索引、process/temp cleanup 与 whitespace 检查通过。
  未提供专用 PostgreSQL/Redis URL，因此 composition/PostgreSQL/Redis 正向资源测试未运行；各 canonical command 的缺资源
  fail-fast 均已验证，未 retry、fallback 或伪装通过。
- Ticket 05 以迁移期固定 mapping 对照 Admin API 的 Unit/component/process 7/25/2 与 Worker 的
  Unit/component/process/PostgreSQL 4/4/3/1，共 46 个候选完整互斥；Admin process fixture 保留为不可收集的 spawn 目标，
  旧 ordinary/process/PostgreSQL commands 继续代理相同覆盖。
- Ticket 05 的 Admin Unit/component/process 为 28/198/2、Worker 为 12/17/4，两个 legacy process commands 分别为 2/4；
  两个 workspace lint/typecheck、root lint/orchestration 20/20、文档/env/architecture guards、单文件 mutation sensitivity 与
  whitespace 检查通过。未提供 `IAM_WORKER_TEST_DATABASE_URL`，PostgreSQL 正向 contract 未运行；canonical/legacy commands
  均明确 fail fast，未 retry、fallback 或伪装通过。
- Ticket 06 以迁移期固定 mapping 对照 Database 的 Unit/PostgreSQL 7/5、Role Assignment 的
  component/PostgreSQL 1/2 与 User Profile Read Model 的 Unit/component/PostgreSQL/Redis 2/15/6/1，共 40 个测试候选
  完整互斥；rehearsal 已迁出测试候选并保留独立操作入口，canonical 与 legacy collections 覆盖相等。
- Ticket 06 的 Database canonical/legacy ordinary 均为 15/15、Role Assignment canonical/legacy component 均为 2/2、
  User Profile Unit/component/legacy ordinary 为 2/103/105；三个 workspace lint/typecheck、root lint/orchestration 23/23、
  文档/env/architecture guards 与 whitespace 检查通过。未提供四个 owner 专用 PostgreSQL/Redis URL，相关 canonical/legacy
  commands 与 rehearsal 均明确 fail fast；正向 PostgreSQL/Redis/rehearsal 未运行，未 retry、fallback 或伪装通过。
- Ticket 07 以迁移期固定 mapping 对照 Contracts、Domain、ESLint config、Jobs、Client Subject Projection
  与 Gateway 的 27 个候选，证明 Unit/component 完整互斥、唯一 MJS 可收集，且无目录 legacy commands 与 canonical
  collections 等价；[root orchestration contract](../../scripts/__tests__/test-orchestration.test.ts) 26/26、394 assertions 通过。
- Ticket 07 的六个 workspace canonical/legacy commands、lint/typecheck、root lint、文档/env/architecture guards 与
  whitespace 检查均通过；该票没有 PostgreSQL、Redis、browser 等外部资源正向验证项，按计划未运行全仓 `pnpm verify`。
- Ticket 08 以迁移期固定 mapping 对照 Admin/SSO 的 Unit/component/browser collections：Vitest files
  分别为 6/5 与 6/4，Playwright JSON lists 分别为 3 files/28 tests 与 3 files/4 tests；canonical 与迁移期 legacy
  collections 相等且互斥，不属于 Full-system E2E。
- Ticket 08 的 Admin Unit/component/legacy ordinary 为 17/26/43，SSO 为 18/6/24，两套 Chromium browser collections
  为 28/28 与 4/4；两个 frontend lint/typecheck、root lint/orchestration 27/27、文档/env/architecture guards 与
  whitespace 检查通过。该票没有 PostgreSQL/Redis 资源项，按计划未运行全仓 `pnpm verify`。
- Ticket 09 发布 root `test:unit`、六个 profile commands、一次性资源预检的 `test:integration` 与永久
  `check:test-collection`；[root orchestration contract](../../scripts/__tests__/test-orchestration.test.ts) 35/35、
  470 assertions，四个 root tooling files 103/103、646 assertions，Guard fixtures 5/5 通过。
- Windows 本地 `test:integration:process` 以全新 owner process/listening port/temp path 连续 20/20 通过，无 timeout、retry
  或 process/port/temp 残留；Linux/CI 保持 `pending`。调用方未提供全部 owner 专用 PostgreSQL/Redis/browser 资源，故未运行
  `test:integration` 正向聚合；缺资源 preflight 一次列出 11 个变量并非零退出，未 fallback 或伪装通过。
- 每票执行 ticket 中声明的 runner list、collection equality、最高层相关命令、受影响 workspace lint/typecheck 与根
  orchestration 聚焦测试；提交前运行 `git diff --check`。
- 资源票只使用调用方提供的专用 PostgreSQL/Redis/browser 条件；缺少资源时记录 fail-fast 结果，不 fallback 或伪造通过。
- Ticket 09 验证永久 Collection Guard、root task 可达性和 `test:integration` 一次性 preflight。
- Ticket 10 的 root orchestration 39/39（496 assertions）、root tooling 107/107、ESLint equivalence 2/2、
  `check:test-collection`、`test:unit`（Turbo 16/16）、`check:docs`、相关 lint/typecheck 与 `git diff --check` 均通过；
  最终候选内容只运行一次新的 `pnpm verify`，158.4 秒通过。
- 准备本地合入时仍按仓库 workflow 另行取得一次性收尾授权，再在最终内容上执行完整验证。

## 事件

- 2026-08-03 — Authorization：维护者明确授权发布四份正式 specs、delivery journals 与 24 张 implementation tickets；
  未授权代码实现。
- 2026-08-03 — Publication：本 feature 的 spec、delivery 与 10 张 tickets 已发布；所有 tickets 保持
  `ready-for-agent`，production/test/tooling 尚未修改。
- 2026-08-05 — Implementation：维护者授权实现 Ticket 01；在 `codex/test-collection-migration` 上固定旧 runner
  collections、逐文件目标 mapping、例外和 live 对照，只增加 feature-local 迁移证据。
- 2026-08-05 — Review 1：Spec 0 findings；Standards 2 findings，要求把新增 JavaScript 入口迁为 TypeScript，并合并重复的
  TSV、候选枚举与集合诊断逻辑。修复后两个入口改用共享 feature-local TypeScript helper。
- 2026-08-05 — Review 2：Standards 0 findings；Spec 1 finding，指出 `e2e/system` 虽在允许集合中却缺少 behavior contract。
  通过独立 fixture 先复现失败，再补齐 `e2e/system → full-system-e2e`，同时锁定未知 target 与 behavior mismatch 的拒绝行为。
- 2026-08-05 — Review 3：对 `76fb1585...3dbb4c1b` 完整范围复审，Standards 0 findings、Spec 0 findings。
- 2026-08-05 — Handoff：Ticket 01 验收项全部满足并标为 `resolved`；依赖前沿推进到 Ticket 02。
- 2026-08-05 — Authorization：维护者授权实现 Ticket 02，并把正式 ticket 中冲突的四命令/列表最小修正为五个 profiles，补齐
  `test:integration:component`；未扩大业务断言或 Redis fidelity 范围。
- 2026-08-05 — Implementation：按 [Ticket 02](issues/02-prove-vitest-profiles-with-oidc.md) 把 OIDC 的 Unit 与四个
  Integration profiles 迁到 canonical path、命名、Vitest configs 与 package/Turbo commands，同时保留旧 package scripts。
- 2026-08-05 — TDD：root orchestration 的公开 Vitest list seam 先因 canonical config 缺失变红，再以
  Ticket 01 迁移期固定映射证明五个 lists 完整、互斥且旧入口等价后转绿。
- 2026-08-05 — Validation：环境无关的 Unit/component/process、legacy commands、lint/typecheck、env/architecture guards 与
  root tooling 均通过；composition/redis 缺少专用 URL 时各首次 fail fast，未 retry 或 fallback。
- 2026-08-05 — Review 1：Spec 0 findings；Standards 1 个 P2，指出 canonical Integration tests/harness 可能进入 OIDC
  Docker deploy context。先以 focused file-list seam 复现，再增加 `test-integration` context 排除。
- 2026-08-05 — Review 2：Spec 0 findings；Standards 1 个 P2，指出上一轮 Bun Glob 近似测试没有观察真实 Docker context。
  删除近似测试，改由迁移期 BuildKit verifier 直接导出 context；red 同时发现 Integration 与 nested Vitest
  configs 泄漏，修复后只保留 production files。
- 2026-08-05 — Review 3：对 `78f8fd05...6a8303db` 完整范围复审，Standards 0 findings、Spec 0 findings。
- 2026-08-05 — Handoff：Ticket 02 验收项全部满足并标为 `resolved`；依赖前沿推进到 Ticket 03。本分支未获得 merge、push、
  部署或归档授权。
- 2026-08-05 — Implementation：按 [Ticket 03](issues/03-prove-bun-process-with-api-core.md) 把 API Core 的 Unit 与三个
  Integration profiles 迁到 canonical path、命名与 package/Turbo commands；保留 RESP shim、共享 process harness 和旧入口。
- 2026-08-05 — TDD：root orchestration 的公开 Bun 窄目录 seam 先因 canonical paths、commands 与 Redis env contract 缺失
  变红，再以 Ticket 01 迁移期固定 mapping 证明四个 collections 完整、互斥且旧入口等价后转绿。
- 2026-08-05 — Validation：环境无关的 Unit/component/process、legacy ordinary/process、共享 harness、API Core 与 OIDC
  lint/typecheck、root lint/tooling、文档索引和 whitespace 检查均通过；Redis 缺少专用 URL 时首次 fail fast。
- 2026-08-05 — Review 1：Spec 0 findings；Standards 2 findings。修复 Current 文档中的 API Core 迁移期例外，并把重复的
  OIDC/API Core mapping reader 收敛为共享参数化 helper。
- 2026-08-05 — Review 2：Spec 0 findings；Standards 1 finding。同步 fixed point 已存在的 OIDC 五 profile canonical
  paths/configs/commands 与迁移期 legacy alias 关系，不提前发布 root cutover。
- 2026-08-05 — Review 3：对 `1b46d40d...5946893c` 完整范围复审，Standards 0 findings、Spec 0 findings。
- 2026-08-05 — Handoff：Ticket 03 验收项全部满足并标为 `resolved`；依赖前沿推进到 Ticket 04。本分支未获得 merge、push、
  部署或归档授权。
- 2026-08-05 — Implementation：按 [Ticket 04](issues/04-migrate-api-canonical-surface.md) 把 API 的 Unit 与五个 Integration
  profiles 迁到 canonical path、命名和 package/Turbo commands，并保留迁移期旧入口的完整覆盖。
- 2026-08-05 — TDD：root orchestration 的 Bun 窄目录、mapping equality、task/resource contract 先因各 canonical surface
  缺失变红；真实 process 首次运行又定位迁移后的 workspace root 偏移，修正后全部转绿。
- 2026-08-05 — Validation：环境无关的 Unit/component/process、legacy ordinary/process、API lint/typecheck、root
  lint/orchestration、env-name guard、文档索引、cleanup 与 whitespace 均通过；缺少专用 URL 时三个资源 profiles 明确 fail fast，
  正向资源测试未运行。
- 2026-08-05 — Review：对 `0b433130...cce832e6` 完整范围执行 Standards/Spec 双轴评审，两个轴均为 0 findings。
- 2026-08-05 — Handoff：Ticket 04 验收项全部满足并标为 `resolved`；依赖前沿推进到 Ticket 05。本分支未获得 merge、push、
  部署或归档授权。
- 2026-08-05 — Implementation：按 [Ticket 05](issues/05-migrate-admin-worker-surfaces.md) 把 Admin API 的三个 profiles 与
  Worker 的四个 profiles 迁到 canonical path、命名和 package/Turbo commands，同时保留迁移期兼容入口与不可收集 fixture。
- 2026-08-05 — TDD：root orchestration 的 Bun 窄目录、迁移期固定 mapping、fixture 排除与 Worker PostgreSQL
  env contract 先因 canonical surface 缺失变红，完成路径、scripts、tsconfig 与 Turbo wiring 后转绿。
- 2026-08-05 — Validation：两个 owner 的环境无关 Unit/component/process、legacy process、lint/typecheck 与 root tooling
  均通过；缺少 Worker 专用 PostgreSQL URL 时 canonical/legacy commands 明确 fail fast，正向资源测试未运行。
- 2026-08-05 — Review 1：Spec 0 findings；Standards 1 finding，指出 Worker repair process smoke 与 Current 文档的旧
  PostgreSQL-first 描述冲突。修复后 process 只锁定 command entry、必需存储不可用、非零退出、cleanup 与日志脱敏，phase/order
  继续由公开 command behavior contract 负责。
- 2026-08-05 — Review 2：对 Ticket 05 完整范围复审，Standards 0 findings、Spec 0 findings。
- 2026-08-05 — Handoff：Ticket 05 验收项全部满足并标为 `resolved`；依赖前沿推进到 Ticket 06。本分支未获得 merge、push、
  部署或归档授权。
- 2026-08-05 — Implementation：按 [Ticket 06](issues/06-migrate-db-read-model-owners.md) 把 Database、Role Assignment 与
  User Profile Read Model 的 ordinary/PostgreSQL/Redis collections 迁到 package-local canonical paths 与 commands；rehearsal
  改为测试模型外的独立操作入口，同时保留迁移期 legacy aliases。
- 2026-08-05 — TDD：root orchestration 先以 19/23 通过暴露 Turbo env、canonical paths/commands 与 rehearsal contract 缺失，
  再以迁移期固定 mapping 锁定三个 owners 的候选归属、collection equality 与操作边界，完成 wiring 后以
  23/23、344 assertions 转绿。
- 2026-08-05 — Validation：环境无关 collections、三个 workspace lint/typecheck、root lint/tooling、文档/env/architecture guards
  与 whitespace 检查均通过；缺少 `IAM_DB_TEST_DATABASE_URL`、`IAM_ROLE_ASSIGNMENT_TEST_DATABASE_URL`、
  `IAM_USER_PROFILE_TEST_DATABASE_URL`、`IAM_USER_PROFILE_TEST_REDIS_URL` 时，相关 canonical/legacy resource commands 与
  rehearsal 均首次明确 fail fast。正向 PostgreSQL/Redis/rehearsal 未运行，未 retry 或 fallback。
- 2026-08-05 — Review 1：Spec 0 findings；Standards 1 个 P3，指出三个 owners 的 collection/resource contract 断言存在重复。
  修复后收敛为共享参数化 mapping 与 owner-resource helpers。
- 2026-08-05 — Review 2：对 `44beb883...37f22721` 完整范围复审，Standards 0 findings、Spec 0 findings。
- 2026-08-05 — Handoff：Ticket 06 验收项全部满足并标为 `resolved`；依赖前沿推进到 Ticket 07。本分支未获得 merge、push、
  部署或归档授权。
- 2026-08-05 — Implementation：按 [Ticket 07](issues/07-migrate-shared-gateway-surfaces.md) 发布 pure shared packages、ESLint
  config、Client Subject Projection 与 Gateway 的完整 package-local Unit/component surfaces，并同步
  [Current 命令文档](../../docs/development/commands.md)。
- 2026-08-05 — TDD：[root orchestration contract](../../scripts/__tests__/test-orchestration.test.ts) 依次从缺少 pure shared
  `test:unit`、Client Subject Projection component 目录和 Gateway component 目录变红，再以迁移期固定 mapping、
  MJS/无目录 Bun adapter 与 Turbo transit contract 转绿。
- 2026-08-05 — Validation：六个 owners 的 canonical 与 legacy collections、workspace lint/typecheck、root
  orchestration、文档/env/architecture guards 和 whitespace 检查均通过；本票无外部资源验证项，未运行全仓 `pnpm verify`。
- 2026-08-05 — Review：对 `0fe24edf...5289fcdb` 完整范围复审，前两轮 Standards 的重复断言 finding 已收敛为共享 helper，
  第三轮 Standards 0 findings、Spec 0 findings。
- 2026-08-05 — Handoff：Ticket 07 验收项全部满足并标为 `resolved`；依赖前沿推进到 Ticket 08。本次未授权下一票，也未授权
  merge、push、PR、部署或归档。
- 2026-08-05 — Authorization：维护者授权实现 [Ticket 08](issues/08-migrate-frontend-browser-surfaces.md)，限定迁移
  Admin/SSO ordinary Vitest 与六个 mock-browser Playwright files，不扩展 journey、Gateway stack、route policy 或
  Full-system E2E。
- 2026-08-05 — Implementation：Admin/SSO 发布完整 package-local Unit/component/browser paths、runner configs、commands
  与 Turbo task；迁移期旧 `test`/`e2e` 保持相同 collections，并同步 [Current 命令](../../docs/development/commands.md)与
  [测试架构](../../docs/architecture/testing-architecture.md)。
- 2026-08-05 — TDD：[root orchestration contract](../../scripts/__tests__/test-orchestration.test.ts) 先后因 canonical
  Vitest config 缺失、browser fixture 相对路径漂移与 Unit/component include 未隔离变红，再以迁移期固定 mapping、
  Vitest/Playwright JSON lists 与 Turbo contract 转绿。
- 2026-08-05 — Validation：两端 canonical/legacy Vitest、两套真实 Chromium browser collections、frontend
  lint/typecheck、root lint/orchestration、文档/env/architecture guards 与 whitespace 均通过；按计划未运行全仓
  `pnpm verify`。
- 2026-08-05 — Review：对 `08f925f4...c958fc9c` 完整范围执行 Standards/Spec 双轴评审，两个轴均为 0 findings。
- 2026-08-05 — Handoff：Ticket 08 验收项全部满足并标为 `resolved`；依赖前沿推进到 Ticket 09。本次未授权下一票，也未授权
  merge、push、PR、部署或归档。
- 2026-08-05 — Authorization：维护者授权实现 [Ticket 09](issues/09-publish-root-collections-and-guard.md)，限定发布完整
  root collections、一次性 Integration 编排与永久 Guard；未授权默认命令 cutover 或 Ticket 10。
- 2026-08-05 — Implementation：发布 root `test:unit`、六个 Integration profile commands 与固定顺序的聚合入口，并以
  [测试架构](../../docs/architecture/testing-architecture.md)和 [Current 命令](../../docs/development/commands.md)记录公开契约。
- 2026-08-05 — TDD：[root orchestration contract](../../scripts/__tests__/test-orchestration.test.ts) 先因公开 root commands、
  preflight 与 Guard 缺失变红，再由 runner lists、Turbo dry-runs、失败传播和 allow/violation fixtures 转绿。
- 2026-08-05 — Validation：环境无关 root Unit/tooling/Guard 与相关 lint、typecheck、docs、env/architecture guards 均通过；
  Windows process 连续 20/20 且无 retry 或残留，Linux/CI 保持 `pending`；因未提供 owner 专用资源，未运行正向资源聚合。
- 2026-08-05 — Review：对 `f2ef8dfd...53c6c388` 完整范围执行三轮 Standards/Spec 双轴评审；finding 均以独立 focused
  commits 修复，最终 Standards 0 findings、Spec 0 findings。
- 2026-08-05 — Handoff：Ticket 09 验收项全部满足并标为 `resolved`；依赖前沿推进到
  [Ticket 10](issues/10-cut-over-default-commands.md)，但本次未授权或实施 Ticket 10，也未授权 merge、push、PR、部署或归档。
- 2026-08-05 — Implementation：按 [Ticket 10](issues/10-cut-over-default-commands.md) 原子切换默认 `test` 与 `verify`，退役旧
  aliases/configs、迁移期 live 对照物，并由永久 Guard、ADR 与 Current docs 接管公开契约。
- 2026-08-05 — Validation：root orchestration 39/39、root tooling 107/107、ESLint equivalence 2/2、Unit Turbo 16/16、
  collection/docs guards、相关 lint/typecheck 与 whitespace 检查通过；最终候选内容唯一一次 `pnpm verify` 以 158.4 秒通过。
- 2026-08-05 — Review：对 `e84570b1...a65e8015` 完整范围执行 Standards/Spec 双轴复审，两个轴均为 0 findings；迁移期
  evidence 删除被确认为更具体 feature contract 的要求。
- 2026-08-05 — Handoff：Ticket 10 验收项全部满足并标为 `resolved`；全部 implementation tickets 已完成。本次未授权 merge、
  push、PR、部署、归档或分支清理。
