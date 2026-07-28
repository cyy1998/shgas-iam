# 简化并集中架构守卫开发记录

## 当前状态

Tickets 01–06 已全部 `resolved`。根级 `pnpm check:architecture` 是唯一静态架构入口；legacy package
architecture suites、User Profile testing-only analyzer 和残留迁移墓碑已删除，普通 package tests 只保留
port/type、public behavior/contract、User Profile、process smoke、PostgreSQL 与测试编排等本层职责。

Feature branch 为 `codex/simplify-architecture-guards`，target branch 为 `main`。Ticket 06 在
`209100c22bf1d9f00679a09304959902ad8adfa7` 完成最终双轴评审，Standards 与 Spec 均为 0 findings。

用户已授权 merge preparation；主代理已在 tracker 前最终内容 `dc3809e6d071dec76c8e9e28b56185f5a604f317`
上运行一次 `pnpm verify` 并通过。下一安全动作是等待用户单独授权本地 merge；当前仍未 merge、push 或 archive。

## 验收与验证计划

Ticket-level root/package focused validations、typecheck、lint、Turbo dry-run、docs guard 与 diff checks 均已完成；
Architecture Guard warm wall-clock 仅记录、不设 gate。最终 `pnpm verify` 已按约定在
`dc3809e6d071dec76c8e9e28b56185f5a604f317` 内容上仅运行一次并通过；无需重复运行。

## 事件

- 2026-07-26 Decision：采用根级单次静态检查，不再由可缓存 package tests 跨 workspace 扫描。
- 2026-07-26 Decision：采用平衡收敛，永久依赖方向与 module seam 保留，迁移墓碑、历史拼写和具体 factory shape 约束删除。
- 2026-07-26 Validation：当前 one-pass AST 基线约为 339 个 production TypeScript 文件、0.84 MB source、153 ms parse time。
- 2026-07-26 Decision：发布 6 张 expand–contract tickets；Ticket 01 建立基础，Tickets 02–05 迁移独立规则族，
  Ticket 06 在全部迁移完成后删除旧守卫并切换事实来源。
- 2026-07-26 Implementation：Ticket 01 建立根级 Architecture Guard、结构化
  `analyzeRepositoryArchitecture(repoRoot)` interface、`consumer-owned-port` 规则和 verify static 编排；实现及评审修复位于
  `c029668a` 与 `efb7f4e3`。
- 2026-07-26 Validation：`bun test scripts/__tests__/architecture-guard.test.ts`、测试编排测试、
  `pnpm check:architecture`、`pnpm lint:root`、`pnpm check:docs`、`pnpm typecheck`、四套既有 architecture suites 和
  `git diff --check` 均通过；warm 命令观察值为 952.5 ms。
- 2026-07-26 Review：对 `7d422047...efb7f4e3` 的 Standards 与 Spec 全量复审均为 0 findings。
- 2026-07-26 Implementation：Ticket 02 在 `84bb7033`、`c437c513`、`d82e402e`、`3eb8ddff` 与
  `6a636b95` 集中 backend 依赖方向规则；覆盖 import/re-export、type/value、`@api`/`@admin-api` 与
  `~api/src`/`~admin-api/src` alias 归一化，并将 audit context owner 与 concrete service factory 分离，删除符号白名单和
  service type re-export，消费者直接依赖 context owner。
- 2026-07-26 Validation：根 guard 22 项、API 216 项、Admin API 126 项及 OIDC/Role 12 项测试通过；
  `pnpm check:architecture`、API/Admin typecheck、全仓 lint、docs guard 与 `git diff --check` 均通过。
- 2026-07-26 Review：对 fixed point `d3565ebe...6a636b95` 的 Standards 与 Spec 最终复审均为 0 findings。
- 2026-07-26 Decision：Ticket 03 候选提交 `67c7f9ff`、`4cf707e5`、`d3457b5e` 因持续引入
  symbol/provenance/property/namespace 与语法矩阵而暂停且未验收。Architecture Guard 定位为维护性依赖图检查，不是
  对抗式扫描器；允许观察模型、封闭规则目录和 Tickets 03–06 边界已写入长期规范与 feature spec。所有权优先通过 package
  exports、专用 subpath 和 module interface 成为路径事实；transaction 语义留在 public behavior contracts。
- 2026-07-26 Implementation：Ticket 03 在 `9edf8962` 与 `b22b124c` 通过 dedicated Role Assignment schema subpath、
  User Profile producer/worker/query repository subpaths 和 owner import path 收缩 package seam；Docker build closure
  从全部 workspace manifests 构图，并穿过任意中间 workspace 追踪 backend image dependency closure。
- 2026-07-26 Implementation：`ab3c584a` 为 User Profile query service 建立窄
  `UserProfileQueryRepositoryPort`，repository implementation 以结构类型满足 read port；query-safe pure helpers 移出
  infrastructure，并由 root 与 `/query` 公开。`65b8798b` 补齐 producer/worker/query repository 的 type/value canonical
  negative fixture，未扩展语法矩阵。
- 2026-07-26 Validation：根 Architecture Guard 34 项、User Profile 61 项与 API 216 项测试通过；
  `pnpm check:architecture`、User Profile/API typecheck、root/User Profile/API lint、docs guard 与 `git diff --check`
  均通过。
- 2026-07-26 Review：对 fixed point `8ff25358...65b8798b` 的 R4 Standards 与 Spec 最终复审均为 0 findings。
- 2026-07-26 Implementation：Ticket 04 由 `/root/ticket_04_implementation` 在 `41c19f03` claim，并在
  `58c0788e` 以 declarative target-module pattern 与 allowed source path 集中 Custom SSO、Admin Session Revocation、
  OIDC 和 Worker direct static edge ownership。OIDC 通过 Session Kernel env-config public subpath 与 provider-local
  Basic auth pure helper 区分合法能力和 concrete implementation；未迁移 symbol/member/property、factory、composition
  text、authority-key literal、legacy tombstone、provenance 或 transitive TypeScript graph assertion。
- 2026-07-26 Repair：`09197cde` 在 Current backend architecture 中补齐 Admin Session Revocation 与 Worker
  API-private alias 的永久 owner 事实，没有扩大静态规则。
- 2026-07-26 Validation：根 Architecture Guard 39 项、API 216 项、Admin API 126 项、OIDC 72 项与 Worker 14 项普通
  测试通过；API Core/API/Admin API/OIDC/Worker typecheck、root/OIDC lint、`pnpm check:architecture`、四个 backend
  process smoke、docs guard 与 `git diff --check` 均通过。
- 2026-07-26 Review：对 Ticket 04 更新 HEAD `09197cde` 的 R2 Standards 与 Spec 完整复审均为 0 findings。
- 2026-07-26 Audit：Ticket 05 由 `/root/ticket_05_implementation` 在 `8d44c0ed` claim。既有
  `UserProfileInvalidation.recordChanges` tests 已覆盖六类 source change、canonical reason、dirty persistence、
  去重/version、单次 after-commit 最新版本 wake-up，以及 resolution/persistence/enqueue failure；UnitOfWork tests 已覆盖
  lifecycle/observability 共享、rollback、required/best-effort failure semantics 与 service-test parity。公开契约覆盖完整，
  因而没有 implementation commit，也未新增测试、production seam 或 transaction semantic analyzer。
- 2026-07-26 Validation：User Profile focused 18 项、API Core UnitOfWork focused 8 项、User Profile 61 项与
  API Core 103 项普通测试通过；User Profile、API Core、API、Admin API typecheck 通过；API/Admin API process smoke
  各 1 项通过；`pnpm check:architecture` 零 violations，`git diff --check` 通过。
- 2026-07-26 Review：Ticket 05 Standards 与 Spec 完整双轴评审均为 0 findings。
- 2026-07-26 Claim：Ticket 06 由 `/root/ticket_06_implementation` 在 `a514b043` claim。
- 2026-07-26 Implementation：`3fe3e411` 删除 API、Admin API、OIDC Provider 与 Role Assignment Resolution 的
  legacy architecture suites，以及 User Profile testing-only business-boundary analyzer、tests 和 package export；
  consumer audit 为零。Current architecture/development 文档改以 `pnpm check:architecture` 为唯一静态入口，并将
  type、behavior/contract、smoke 和外部资源事实指向各自验证层。根 analyzer 保持在允许观察模型内，封闭规则目录仍仅有
  `consumer-owned-port`、`dependency-direction`、`role-resolution-owner`、`user-profile-owner`、
  `session-runtime-owner`、`worker-ownership` 与 `docker-build-closure`，未新增规则或 fixture。
- 2026-07-26 Repair：R1 后的 `b3729ab8` 删除普通 package tests 中残留的 production source 扫描、
  TypeScript checker/export-symbol analyzer、exact export/method/object shape allowlist，以及历史 spelling、
  identifier、job 和文件墓碑；保留结构可赋值 port contracts、当前 User Profile/Session Kernel/worker/contracts/jobs
  行为、安全与生命周期测试。
- 2026-07-26 Repair：R2 后的 `72dfd36b` 继续删除 API public-operation denylist、API/Worker retired env 墓碑、
  Custom SSO legacy Redis/reverse-key absence assertions 与数据库历史拼写 negative assertion；补齐当前
  `rebuild-user-profile` versioned payload/job ID 的解析与委派，以及 unknown job 和 malformed current payload 在委派前
  失败的行为契约。R3 后的 `209100c2` 仅将 API Core Session Kernel 测试改为直接描述当前 token 行为，未改断言。
- 2026-07-26 Validation：根 Architecture Guard 39 项、测试编排 16 项与
  `pnpm check:architecture` 零 violations；docs guard 索引 31 篇文档。最终相关 package 普通测试为 API 191 项、
  Worker 12 项、User Profile 54 项、Database 9 项、API Core 102 项、Contracts 17 项与 Jobs 5 项；受影响 workspace
  lint/typecheck 通过，R2 focused tests 30 项、R3 Session Kernel focused tests 16 项通过。无 runtime/database
  行为变更，故本票无需新增 process smoke 或 PostgreSQL 验证；完整 `pnpm verify` 明确保留到用户授权 merge
  preparation 后运行。
- 2026-07-26 Validation：API、Admin API、OIDC Provider、Role Assignment Resolution 与 User Profile 的 Turbo
  `test --dry=json` 分别报告 233、178、73、9、34 个自身 inputs；每个 task 仅依赖自身 `#transit`、仅调度自身
  `#test`，`foreignWorkspaceInputs=[]` 且旧 architecture inputs 均为空。最终残留 audit 与 diff checks 均通过；
  Architecture Guard warm wall-clock 观察值为 943.8 ms，不设 gate。
- 2026-07-26 Review：Ticket 06 的 R1 发现 package ordinary tests 收缩残留，R2 合并为 4 项关于 API
  method denylist、canonical worker dispatch、env/session/database 墓碑的 findings，R3 Spec 为 0 findings 且
  Standards 有 1 项测试命名 finding；分别由 `b3729ab8`、`72dfd36b` 与 `209100c2` 修复。对最终 HEAD
  `209100c22bf1d9f00679a09304959902ad8adfa7` 的 R4 Standards 与 Spec 完整复审均为 0 findings。
- 2026-07-26 Validation：用户授权 merge preparation 后，主代理在 tracker 前最终内容
  `dc3809e6d071dec76c8e9e28b56185f5a604f317` 上运行唯一一次 `pnpm verify`，Exit 0，wall 80.8s；static
  （root lint、docs、env 与 architecture）、typecheck、ordinary tests、process smoke 和 build 全部成功。仅有既有
  frontend ESLint warnings，无 errors。当前等待用户单独授权本地 merge，仍未 merge、push 或 archive。
