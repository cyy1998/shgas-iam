const globalRules = [
  "每项正式需求只有一个 feature owner；跨 spec 只链接，不复制 contract。",
  "Feature 是 merge/revert 边界；ticket 是保持同一 feature branch 可工作的安全步。",
  "Ticket 以可观察行为或安全迁移步命名，不以文件、层或机械重命名命名。",
  "新 command 只有在所代表能力完整时才出现；禁止 placeholder、silent skip 与 warning-only success。",
  "每票运行最高层相关的聚焦验证；全仓 pnpm verify 不作为反复的 ticket 内循环。",
  "文档、ADR 与 rollback 跟随最接近行为变化的 owner；Gate feature 只做最终聚合收口。",
];

const features = [
  {
    key: "collection",
    slug: "test-collection-migration",
    name: "Canonical Collection 与命令迁移",
    dependency: "None — can start immediately",
    outcome:
      "在尽量不改变测试语义的前提下，把当前测试一次收敛为唯一 Unit/Integration collections、六个 Integration profiles、最小公开命令面、永久 Collection Guard 与基础 verify。",
    owns: [
      "Unit、Integration、E2E 三层语言，以及 component/process/redis/postgres/composition/browser 六个 Integration profile 的稳定定义。",
      "Unit 与 Integration 的路径、命名、runner、package/root commands、Turbo task graph 和 test -> test:unit 永久 alias。",
      "Unit owner-local、test-integration/<profile> siblings 与 e2e/system 的 canonical path/naming contract。",
      "pnpm check:test-collection 的当前 collection contract，以及基础 pnpm verify = static -> typecheck -> test:unit -> build。",
      "旧 test:smoke、test:external、package-local test:redis/test:postgres 与 mock Playwright e2e 入口的原子退役。",
      "把近规模 Subject Projection rehearsal 转为测试模型外的 subject-projection:rehearsal 操作入口。",
      "supersede ADR-0003，以及三层/profile/collection/命令/基础 verify 对应的 Current docs。",
    ],
    links: [
      "真实 Redis fidelity 与 RESP shim 删除链接 real-redis-test-migration。",
      "真正的 E2E collection、固定系统 lifecycle 与 test:e2e 链接 full-system-e2e。",
      "verify:ci、verify:release 与最终聚合证据链接 test-gate-rollout。",
    ],
    invariants: [
      "固定旧树的机器 collection baseline，并让每个现有测试文件有且只有一个经人工确认的目标归属。",
      "旧入口在其替代 collection 完整前继续完整工作；不得先删后补，也不得让新旧入口同时漏收。",
      "迁移只改变归属、命名与 orchestration；Redis fidelity、业务断言与 Full-system E2E 不在本 feature 顺带重写。",
      "迁移期 baseline、映射、例外与对照逻辑有明确 owner/清除条件；完成后不进入永久 Guard。",
      "不发布 test:e2e、verify:ci 或 verify:release 占位命令。",
      "迁移 tickets 按完整 owner/package surface 纵切；不会用单票横跨全仓某个 layer/profile。",
      "Unit 通常共置于 src；Integration 全部位于 test-integration/<profile>，browser 只是其中一个 sibling；Full-system 独占 e2e/system。",
    ],
    acceptance: [
      "每个候选测试文件恰由一个 canonical collection 收集，且路径/命名与归属一致。",
      "每个 canonical root command 经 Turbo 可达完整 package task；runner adapter 失败时非零退出并给出可定位诊断。",
      "test 永久等价 test:unit；基础 verify 不读取真实 PostgreSQL/Redis、不启动浏览器或 Full-system stack。",
      "迁移例外归零，旧 collection config/commands 与 live 对照逻辑删除，ADR 与 Current docs 同步。",
    ],
    rollback:
      "整体恢复旧目录、runner、命令、verify、Guard 与文档；若下游 feature 已合并，先按依赖图逆序回滚下游。",
    outOfScope: [
      "改变 Redis 测试 fidelity、删除 RESP shim、建设 Full-system E2E 或发布上层 Gate。",
      "运行标签、通用 runner framework、AST/data-flow 测试语义分析或 compatibility aliases。",
    ],
    risks: [
      "若先切 test/verify 再完成 profile collections，会出现静默覆盖空窗。",
      "若永久 Guard 吸收迁移 baseline/例外，会变成第二套 Architecture Guard。",
      "若把约 217 个 ordinary tests 全部机械视为 Unit，既会超出单会话，也会把现有 component contracts 错归类。",
    ],
    tickets: [
      {
        id: "C1",
        name: "锁定旧 Collection 基线与目标归属",
        blockedBy: "None",
        behavior:
          "从当前 runner list、Turbo dry-run 与 Bun 窄目录声明生成旧 collection baseline；逐文件记录唯一目标 layer/profile、当前业务行为与任何临时例外，作为全部迁移 tickets 的固定输入。",
        acceptance: [
          "固定点上的 267 个 candidate test/spec files 全部出现且不重复，其中显式处理 4 个 root tooling tests、唯一 MJS test；当前 release rehearsal 标记为将移出目标 test candidate set。",
          "每个例外写明原因、清除它的后续 ticket 与清除条件；不能整体刷新 baseline 来吞掉差异。",
          "Bun 目录枚举排除 admin-api 的非测试 process fixture；唯一 MJS test 与 Playwright JSON list 均被正确观察。",
          "目标 mapping 只允许 owner-local Unit、test-integration/<profile> Integration、测试模型外 rehearsal 或未来 e2e/system 四种明确归属。",
          "本票不改生产命令、runner 或测试语义。",
        ],
        verification: [
          "逐 runner 执行现有 list/dry-run 入口并规范化仓库相对路径。",
          "对 baseline、目标映射和文件系统候选集合做双向 diff；运行 git diff --check。",
        ],
        working:
          "只增加 feature-local 迁移证据；当前命令面完全不变，因此仓库行为不受影响。",
      },
      {
        id: "C2",
        name: "用 OIDC 纵切验证 Vitest 多 Profile 迁移",
        blockedBy: "C1 — 锁定旧 Collection 基线与目标归属",
        behavior:
          "以 OIDC Provider 作为 Vitest tracer bullet，把当前 ordinary/process/external/redis 四套 configs 与 18/5/1/1 文件迁为完整 package-local test:unit、process、composition、redis commands，同时保持旧 package scripts 可达。",
        acceptance: [
          "四个 Vitest lists 与 C1 的 OIDC 子集完全相等且互斥；Unit/component 的语义归属经人工映射而非按 src 机械决定。",
          "package scripts、Vitest include/exclude、tsconfig、lint 与 env-name guard 同步，不产生漏 lint/typecheck。",
          "只改变 collection/命名/orchestration；RESP fidelity 与业务断言留给下游 feature。",
        ],
        verification: [
          "四个 Vitest --list 机器输出的 equality/互斥 diff；逐 package canonical command 聚焦运行。",
          "pnpm --filter @iam/oidc-provider lint、typecheck 与 root orchestration tests。",
        ],
        working:
          "每个新 package command 自出现起即完整；旧 root/legacy commands 尚未切换，其他 workspaces 不受影响。",
      },
      {
        id: "C3",
        name: "用 API Core 纵切验证 Bun 与 Process Harness 迁移",
        blockedBy: "C2 — 用 OIDC 纵切验证 Vitest 多 Profile 迁移",
        behavior:
          "以 API Core 作为 Bun tracer bullet，迁移 ordinary/process/redis collections 与 package-local canonical commands；保留共享 process harness，同时把测试 harness/fake 本身的普通 tests 与真正 child-process tests 分开。",
        acceptance: [
          "35 ordinary、3 process、4 redis 文件按 C1 映射唯一收集；Bun 窄目录 adapter 不复制完整发现算法。",
          "process-smoke-harness 的普通 contract tests 不因文件名或 helper 语义被误归到真实 process profile。",
          "新 tasks 保持 transit dependency；resource lanes 保持 cache:false 与专用 URL fail-fast。",
        ],
        verification: [
          "逐 package canonical command、共享 harness 最高层测试与 C1 子集 equality diff。",
          "pnpm --filter @iam/api-core lint、typecheck 与 root orchestration tests。",
        ],
        working:
          "API Core 的全部新 package commands 完整可用；RESP shim 仍在，供尚未迁移的 consumers 使用。",
      },
      {
        id: "C4",
        name: "迁移 API 的完整 Canonical Package Surface",
        blockedBy: "C3 — 用 API Core 纵切验证 Bun 与 Process Harness 迁移",
        behavior:
          "按已验证的 Bun 形状，把 API 的 ordinary/process/composition/postgres/redis 测试迁成一组完整 package-local canonical commands；同时更新 lint/tsconfig/config 与旧命令兼容路径。",
        acceptance: [
          "约 56 个 API tests 与 C1 的 package 子集完全相等且互斥；composition 多资源行为不按全局优先级误归。",
          "process 只拥有 child/readiness/exit/tree-cleanup；Redis-dependent entry 行为暂保持原 fidelity，留给真实 Redis feature。",
          "专用 PG/Redis/composition 环境缺失时 package command 非零失败，不回退 runtime URL。",
        ],
        verification: [
          "逐 API canonical command 的 list/preflight/聚焦运行与 C1 equality diff。",
          "pnpm --filter @iam/api lint、typecheck；process cleanup 聚焦检查与 root orchestration tests。",
        ],
        working:
          "API 新 package interface 完整，旧 root commands 仍可达同一覆盖；不提前改默认 test/verify。",
      },
      {
        id: "C5",
        name: "迁移 Admin API 与 Worker 的 Canonical Package Surfaces",
        blockedBy: "C4 — 迁移 API 的完整 Canonical Package Surface",
        behavior:
          "把 Admin API 与 Worker 的 ordinary/process 以及 Worker postgres collections 迁成完整 package-local canonical commands；正确排除由 Admin API process test spawn 的非测试 fixture。",
        acceptance: [
          "约 46 个 runner-owned tests 与 C1 package 子集相等；client-cache-invalidation.composition-smoke.ts 只作为 fixture，不被 runner 收集。",
          "process assertions 锁定 readiness/not-ready/exit 等外部安全行为，不固化内部 PostgreSQL-first 顺序。",
          "路径迁移同步 lint、tsconfig 与 scripts；Worker postgres 保持 caller URL、随机 schema 与 fail-fast。",
        ],
        verification: [
          "逐 package canonical commands、process fixture 排除检查与 C1 equality diff。",
          "两个 workspace 的 lint/typecheck、process 聚焦运行与 root orchestration tests。",
        ],
        working:
          "两个 owner 各自完成整组 package interface；旧 smoke/postgres root 路径保留到最终 cutover。",
      },
      {
        id: "C6",
        name: "迁移 Database 与 Read-model 资源 Owners",
        blockedBy: "C5 — 迁移 Admin API 与 Worker 的 Canonical Package Surfaces",
        behavior:
          "把 DB、Role Assignment 与 User Profile Read Model 的 ordinary/postgres/redis collections 迁成完整 package-local canonical commands；另把近规模 rehearsal 转为测试模型外的 subject-projection:rehearsal 操作入口，保持其专用 PG/Redis、串行、JSON 摘要和精确清理。",
        acceptance: [
          "所有资源 test files 按 harness owner 唯一归属；rehearsal 不再使用 *.test 命名、不被 Collection Guard 收集，也不进入 test:integration/verify:ci。",
          "新的 rehearsal 操作命令保留 10,002 行合成数据、冷/热读取、prewarm、verify、single-flight、观测摘要与 owner-resource cleanup；不创建第七个 profile。",
          "tsconfig include、lint paths、Turbo passThroughEnv 与 package preflight 随路径/command 同步。",
          "随机 schema/namespace、migration destructive constraints 与 fail-fast 行为不变。",
        ],
        verification: [
          "三个 workspace 的 canonical command lists/preflights 与 C1 equality diff。",
          "在专用资源上聚焦运行 subject-projection:rehearsal，核对非零失败、JSON 摘要和 schema/namespace cleanup。",
          "受影响 workspace lint/typecheck；有资源时运行最高层相关 postgres/redis contract。",
        ],
        working:
          "每个资源 owner 的 package surface 完整；旧 root resource commands 继续存在到最终切换。",
      },
      {
        id: "C7",
        name: "迁移 Pure Shared Packages 与 Gateway Unit Surfaces",
        blockedBy: "C6 — 迁移 Database 与 Read-model 资源 Owners",
        behavior:
          "把不拥有外部资源 profile 的 shared packages、ESLint config 与 Gateway 收敛为完整 package-local test:unit/component surfaces，显式处理无目录参数的 Bun packages 与唯一 MJS test。",
        acceptance: [
          "各 package 的完整 test collection 与 C1 子集相等，MJS test 不因只扫描 TS/TSX 而漏收。",
          "ordinary tests 的 Unit/component 归属按公开行为与出站依赖确认，不把全部 src/*.test 机械当 Unit。",
          "package-local canonical tasks 保持 transit dependency；不扩大为 ^test 执行拓扑。",
        ],
        verification: [
          "逐 package canonical command、Bun directory adapter/MJS collection 与 C1 equality diff。",
          "受影响 workspace lint/typecheck 与 root orchestration tests。",
        ],
        working:
          "这些 owner 不依赖外部资源；迁完一个 package surface 就能独立验证，旧 root test 仍保持旧语义。",
      },
      {
        id: "C8",
        name: "迁移 Frontend Unit 与 Mock-browser Surfaces",
        blockedBy: "C7 — 迁移 Pure Shared Packages 与 Gateway Unit Surfaces",
        behavior:
          "把 Admin/SSO ordinary Vitest 与 6 个 mock-backend Playwright files 迁成完整 package-local test:unit/component/browser commands；browser 保留现有 API mocks、webServer 与 Chromium 行为。",
        acceptance: [
          "Admin 28 tests/3 Playwright files、SSO 4 tests/3 files 的 JSON list 与旧 baseline 相等；不称为 Full-system E2E。",
          "Vitest include/exclude、Playwright testDir/baseURL/webServer、lint/tsconfig 同步；不与未来 test:e2e 混用。",
          "不新增 journey、Gateway stack 或 page.route 禁令；只保持现有 browser Integration 行为。",
        ],
        verification: [
          "两个 Vitest lists/commands；两个 Playwright --list --reporter=json 与聚焦 browser runs。",
          "两个 frontend workspace lint/typecheck 与 C1 equality diff。",
        ],
        working:
          "frontend package surfaces 从出现起完整；旧 e2e scripts 在 root cutover 前仍运行同一 mocked collections。",
      },
      {
        id: "C9",
        name: "用 Root Commands 与永久 Guard 封闭 Collections",
        blockedBy: "C2-C8 — 所有 package canonical surfaces 完整",
        behavior:
          "在全部 package tasks 完整后发布 root test:unit（含 4 个 root tooling tests）、六个 profile commands 与带一次性资源预检的 test:integration，并实现 pnpm check:test-collection 证明唯一收集、命名和 Turbo 可达性。",
        acceptance: [
          "Guard 只观察路径/命名、package task 声明、runner list 与 Turbo dry-run；不分析断言、资源使用或 AST/data flow。",
          "漏收、重收、归属不一致、task 不可达或 adapter 失败均给出可定位诊断并非零退出。",
          "Guard 认可 Unit 的窄 owner-local roots、六个 sibling profile paths 与 e2e/system；browser 不形成独立 layer。",
          "test:integration 在任何 profile 启动前列出全部缺失资源，包括 IAM_API_CORE_CLEANUP_TEST_REDIS_URL；Turbo strict env 透传所有 owner URLs，resource tasks cache:false。",
          "root tooling tests 有明确 Unit owner；subject-projection:rehearsal 已是测试模型外的操作命令，不属于 Guard candidate 或任何 profile。",
        ],
        verification: [
          "Guard 外部 interface 的 allow/violation fixtures、pnpm check:test-collection 与全部 root lists/dry-runs。",
          "test:integration preflight/ordering/failure propagation 与 scripts/__tests__/test-orchestration.test.ts。",
        ],
        working:
          "root commands 只组合已经完整的 package surfaces；Guard 面向当前目标树，不需要永久兼容表或 live exception。",
      },
      {
        id: "C10",
        name: "原子切换默认命令并退役旧入口",
        blockedBy: "C9 — 用 Root Commands 与永久 Guard 封闭 Collections",
        behavior:
          "在同一可回滚 cutover 中令 test 永久代理 test:unit、把 verify 切为 static -> typecheck -> test:unit -> build，删除其他旧入口/config 与迁移期 live 对照物，并同步 ADR/Current docs。",
        acceptance: [
          "新旧 collection equality、唯一收集和例外归零在删除旧入口前通过。",
          "不保留 test:smoke/test:external/package-local test:redis|postgres/test:rehearsal/frontend e2e aliases；rehearsal 只保留已确认的操作命令，不发布 test:e2e 或上层 Gate placeholder。",
          "基础 verify fail fast，且不读取真实 PG/Redis、不启动 browser/E2E；ADR supersede 和文档 ownership 完整。",
          "README 与全部 Current architecture/commands/frontend/runbooks 中的旧入口改为 canonical commands；Historical records 保留原命令，不伪造历史。",
        ],
        verification: [
          "root orchestration 聚焦测试、pnpm check:test-collection、pnpm test:unit。",
          "在最终候选内容上运行一次新 pnpm verify；pnpm check:docs 与 git diff --check。",
          "盘点旧 command references，确认剩余命中只位于明确 Historical/冻结来源或有说明的非执行文本。",
        ],
        working:
          "公开行为只在所有替代 collections 已完整且 Guard 通过后一次切换；失败时整体 revert 即恢复旧命令与配置。",
      },
    ],
  },
  {
    key: "redis",
    slug: "real-redis-test-migration",
    name: "真实 Redis 测试迁移",
    dependency: "test-collection-migration",
    outcome:
      "在稳定 canonical redis/process/composition collections 内，把所有依赖 RESP shim 的可观察覆盖迁到真实 Redis 与 production owner Module interface，并安全删除协议替身。",
    owns: [
      "RESP shim 消费场景到真实 Redis 的 fidelity 迁移，以及 command-order assertions 到公开结果/真实状态的替换。",
      "普通随机 namespace Redis tests 与 destructive cleanup CLI 独占 disposable Redis 的不同资源契约。",
      "RESP shim、相关 testing exports、专属测试与 Redis migration 文档段落的退役。",
    ],
    links: [
      "三层/profile、目录和 canonical commands 链接 test-collection-migration。",
      "Full-system E2E 直接复用 production owner seam，但不依赖本 feature 的测试迁移实现。",
      "最终 verify:ci 聚合与证据链接 test-gate-rollout。",
    ],
    invariants: [
      "Fixture 只形成领域输入；key、serialization、TTL、index 与 Lua 一律由 production owner Module 实现。",
      "普通测试只清 owned namespace；禁止 FLUSHDB/FLUSHALL 与无范围清理。",
      "Legacy cleanup 必须在独占 disposable Redis 上，以 ACL、sentinel 与完整 before/after inventory 共同证明精确删除。",
      "Cleanup 资源只由 IAM_API_CORE_CLEANUP_TEST_REDIS_URL 提供；不回退普通 IAM_API_CORE_TEST_REDIS_URL/runtime Redis，也不自动启动 Docker。",
      "createSessionKernelForTesting 仍只用于 Unit/component；真实 Redis fidelity 通过 production createSessionKernel。",
      "只有两个真实调用方重复同一非平凡 lifecycle 后才允许新增窄 testing export。",
    ],
    acceptance: [
      "API、OIDC、Admin/API Core 等现有 RESP-dependent 行为保留公开协议与安全覆盖。",
      "只保留真实 Redis 才能证明的 Lua/CAS/TTL/transaction/index/concurrency contracts，不锁定命令排列。",
      "仓库不再导入或执行 RESP shim；专属 tests/testing exports/command-log assertions 删除。",
      "缺少专用 Redis URL 时 owner command 在测试前明确非零退出。",
    ],
    rollback:
      "只在 canonical collections 下恢复 RESP shim 与原覆盖；不回滚三层命令/目录。若 Gate 已发布，先回滚 Gate。",
    outOfScope: [
      "通用 Redis test framework、raw seed interface、serializer/key builder export 或可编程 command observer。",
      "改变 profile/command/Gate、建设 Full-system E2E 或提高资源并发。",
    ],
    risks: [
      "直接写 raw session payload 会把生产 persistence 语义复制进测试。",
      "只验证 sentinel 或 ACL 不能单独证明 cleanup target 精确。",
      "先删 shim 再迁 consumer 会让 entry/protocol coverage 静默消失。",
    ],
    tickets: [
      {
        id: "R1",
        name: "用 API External Entry 证明 Production-owner Seed",
        blockedBy: "test-collection-migration",
        behavior:
          "把 API external entry 作为第一个 composition tracer bullet：删除三个 RESP seed helpers 与 raw mset，通过 production Session Kernel、Subject Access Bootstrap、Subject Facts/Custom SSO owners 建立状态，再从真实 API HTTP 行为与独立 Redis observer 验证结果。",
        acceptance: [
          "保留 Independent Custom SSO、gateway projection、Subject Access、rotation/disable 等现有公开行为覆盖。",
          "fixture 只形成领域输入；不再手写 subject-access、subject-facts、client cache 或 Session key/payload。",
          "测试使用真实 process + PostgreSQL + Redis，因此归 composition；process 只是内部 harness，不决定 profile 身份。",
        ],
        verification: [
          "pnpm --filter @iam/api test:integration:composition；独立 Redis observer 验证公开 state/effect。",
          "RESP seed/raw mset import inventory diff；package lint/typecheck。",
        ],
        working:
          "该 consumer 的真实 entry coverage 先通过，再移除它的 shim import；shim 本体仍服务其他未迁调用方。",
      },
      {
        id: "R2",
        name: "让 OIDC External Entry 复用同一 Owner Pattern",
        blockedBy: "R1 — 用 API External Entry 证明 Production-owner Seed",
        behavior:
          "把 OIDC external entry 的 RESP seed/raw barrier/facts/cache writes 迁为 production owners，保留 discovery、PKCE、token、UserInfo 与 logout 的真实 process + PostgreSQL + Redis composition 行为。",
        acceptance: [
          "不使用 createSessionKernelForTesting 冒充真实 Redis persistence，不手写 Session/Subject Facts/Custom SSO payload。",
          "lookup HMAC、namespace、TTL 与 cleanup adapters 与被测 production entry 完全同源。",
          "沿用 R1 的局部 composition helper；只有实际重复非平凡 lifecycle 才提取窄 testing export。",
        ],
        verification: [
          "pnpm --filter @iam/oidc-provider test:integration:composition；公开 OIDC protocol 结果与真实 state 观察。",
          "RESP seed/raw mset import inventory diff；package lint/typecheck。",
        ],
        working:
          "第二个高价值 consumer 完整替换后才删其旧写法；其余 process consumers 仍由 shim 支撑。",
      },
      {
        id: "R3",
        name: "收窄 API 与 Admin API Process 覆盖",
        blockedBy: "R2 — 让 OIDC External Entry 复用同一 Owner Pattern",
        behavior:
          "把 API process 保留为 entry/env/docs/readiness，把 Redis-dependent HTTP/cache/legacy 行为迁入真实 redis/composition；Admin API process 只保留 /admin/doc 等进程行为，client-cache invalidation 通过 production cache owner 进入真实 Redis。",
        acceptance: [
          "process profile 不再承载 API/Admin API 的 Redis 语义或 command-log assertions。",
          "Admin client cache 使用 production createCustomSsoClientRuntimeReader/mutation seam，不复制 cache key/version。",
          "真实 Redis scenarios 保留 HTTP/entry observable coverage；process scenarios 仍验证 child/readiness/tree cleanup。",
        ],
        verification: [
          "API/Admin API 的 process + redis/composition 聚焦命令与公开 HTTP assertions。",
          "RESP imports/redis.commands inventory diff；两个 workspace lint/typecheck。",
        ],
        working:
          "每个旧 case 只在对应真实行为通过后移除；共享 process harness 保留，RESP shim 尚未删除。",
      },
      {
        id: "R4",
        name: "移除 OIDC、Worker 与 API Core 的 Process Shim 依赖",
        blockedBy: "R3 — 收窄 API 与 Admin API Process 覆盖",
        behavior:
          "OIDC process 只保留 discovery/readiness；Redis lifecycle/fail-closed 保留在现有真实 owner contracts。Worker 的 PG failure/command smokes 使用不可达 Redis 并断言 not-ready/no-consumption，而不是 RESP command ordering；API Core 保留 process harness，不保留 Redis server 作为 process dependency。",
        acceptance: [
          "OIDC Provider Session 的 atomic claim/generation CAS/TTL/lifecycle fence 继续由现有真实 Redis contract 覆盖。",
          "Worker assertions 锁定外部安全属性，不固化 PostgreSQL-first 或 Redis command count。",
          "除 cleanup CLI 专属场景外，所有 process-smoke RESP callers 已有真实 owner 替代或有证据删除。",
        ],
        verification: [
          "OIDC/Worker/API Core process 与真实 redis contracts 的最高层相关命令。",
          "RESP caller inventory diff；三个 workspace lint/typecheck。",
        ],
        working:
          "非破坏性 consumers 全部先脱离 shim；cleanup 专属 RESP case 留给下一票在真实 disposable Redis 替换。",
      },
      {
        id: "R5",
        name: "证明 Legacy Cleanup 的精确删除边界",
        blockedBy: "R4 — 移除 OIDC、Worker 与 API Core 的 Process Shim 依赖",
        behavior:
          "把 legacy cleanup CLI contract 迁到独占、可销毁 Redis logical DB/instance；以受限 ACL、non-target sentinel 和完整 owned-key inventory 验证 dry-run/apply/verify 与误删保护。",
        acceptance: [
          "测试资源不与普通 namespace-isolated Redis tests 或其他 owner 共享。",
          "缺少 IAM_API_CORE_CLEANUP_TEST_REDIS_URL 时在连接前明确非零退出；URL 必须标识 caller-owned exclusive disposable Redis。",
          "ACL 禁止 FLUSHDB/FLUSHALL；sentinel 保持；before/after inventory 精确等于预期 target 删除集合。",
          "CLI exit code 与人类可读摘要覆盖 dry-run/apply/verify、幂等和失败路径；cleanup failure 非零退出。",
        ],
        verification: [
          "通过 IAM_API_CORE_CLEANUP_TEST_REDIS_URL 在明确标识的 disposable Redis 上运行 API Core cleanup 聚焦 Integration。",
          "独立 client 获取完整 before/after inventory；package lint/typecheck 与 git diff --check。",
        ],
        working:
          "破坏性 contract 在 shim 删除前独立成立；普通共享测试资源永不承受固定 legacy allowlist 扫描。",
      },
      {
        id: "R6",
        name: "删除 RESP Shim 并收口 Redis 文档",
        blockedBy: "R1-R5 — 所有替代覆盖与 cleanup safety 已成立",
        behavior:
          "删除 process-smoke RESP server、专属 tests/testing exports 与 Redis command-order assertions；更新真实 Redis fidelity、隔离和 cleanup 对应的 Current docs。",
        acceptance: [
          "consumer inventory 为零，所有删除场景已有更高 fidelity 的公开行为覆盖。",
          "仓库不存在 shim import/export、Lua comment dispatch、MULTI/EXEC 排列或 redis.commands 断言。",
          "不顺带改变 canonical commands、Full-system E2E 或 Gate。",
        ],
        verification: [
          "运行所有受影响 redis/process/composition profiles 与 package lint/typecheck。",
          "rg inventory 证明 shim/command observer 退役；pnpm check:docs 与 git diff --check。",
        ],
        working:
          "删除发生在最后一票且已有完整替代覆盖；整体 feature revert 可恢复旧 fidelity。",
      },
    ],
  },
  {
    key: "e2e",
    slug: "full-system-e2e",
    name: "Full-system E2E",
    dependency: "test-collection-migration",
    outcome:
      "建立 root-owned、project-scoped 的固定 IAM 系统 orchestrator，从空 volumes 可靠启动真实自有 runtimes，经单一 Gateway origin 运行两条 journey，并始终先诊断后精确清理。",
    owns: [
      "唯一 Compose project/run descriptor、动态 Gateway port、migrations、E2E-local seed、readiness、diagnostics 与 cleanup lifecycle。",
      "Admin Custom SSO 与独立 OIDC Authorization Code + PKCE 两条真实 Playwright journeys。",
      "完整可运行时才发布的 test:e2e，以及 E2E workspace/command/artifact 对应 Current docs。",
    ],
    links: [
      "三层语言、目录约定与 Integration browser 的归属链接 test-collection-migration。",
      "Redis 状态建立遵守 real-redis-test-migration 已决定的 production owner seam，但两个 feature 不互相阻塞。",
      "verify:release 的组合与最终证据链接 test-gate-rollout。",
    ],
    invariants: [
      "浏览器只使用 http://127.0.0.1:<dynamic-gateway-port>；issuer、SSO origin 与 redirect URI 使用同一完整 origin。",
      "journey 实际经过的 repo-owned runtimes 全部真实；只关闭或替代 CAPTCHA、短信等不在 journey 内的第三方边。",
      "run descriptor 在创建资源前落盘且不含 secret；所有清理只针对 exact project。",
      "任何失败先保存 bounded、脱敏诊断，再执行 down -v --remove-orphans；cleanup failure 也是失败。",
      "首期没有 plugin platform、janitor、run registry、可恢复 phase state machine 或任意 topology。",
    ],
    acceptance: [
      "空 project volumes 上显式 migrations、局部 seed、全部 runtime readiness 与 Gateway route probes 通过。",
      "两条 journey 均从 canonical origin 走真实登录/Session/Cookie/协议与 owner persistence。",
      "成功、断言失败、timeout、可捕获 signal 与 descriptor-based recovery 都只清理本 run 资源。",
      "root test:e2e 从第一次出现起即执行完整 lifecycle 和两条 journeys。",
    ],
    rollback:
      "移除 E2E workspace、test:e2e、Compose/Gateway 增量与文档；若 Gate 已发布，先回滚 Gate。",
    outOfScope: [
      "通用 E2E 平台、service adapters/plugins、janitor、全局 Docker prune、透明 resume 或额外 journeys。",
      "真实第三方 CAPTCHA/SMS/邮件、CI provider workflow 或生产 Cookie contract 修改。",
    ],
    risks: [
      "在 Playwright hooks 分散 lifecycle 会让 setup failure、Ctrl+C 与 CI post-job 走不同 cleanup path。",
      "多 host/localhost 假设会破坏 host-only Cookie 与 OIDC redirect。",
      "test:e2e 过早暴露会形成可成功跳过的假 Gate。",
    ],
    tickets: [
      {
        id: "E1",
        name: "建立 Exact-project Infra 与 Migration Lifecycle",
        blockedBy: "test-collection-migration",
        behavior:
          "建立 root-owned E2E workspace 的第一条安全纵切：preflight、资源创建前的 descriptor、唯一 Compose project、动态 Gateway host port、PostgreSQL/Redis/etcd/APISIX health、空 volumes 上真实 migrations，以及 normal/failure exact-project cleanup。暂不启动 repo app runtimes、不发布 root test:e2e。",
        acceptance: [
          "空 volumes 可重复启动四个基础设施服务并执行真实 Drizzle migrations，不依赖开发者既有 volume。",
          "descriptor 记录 exact project、动态 port、origin、labels 与 artifact dir，不含 password/token/secret。",
          "正常、migration failure 与 cleanup retry 只对 exact project 执行幂等 down -v --remove-orphans，无未知资源扫描。",
        ],
        verification: [
          "workspace-local lifecycle command 从空 project 运行到 migrated infra healthy 再 cleanup。",
          "descriptor-before-resource、phase/order、migration failure 与 exact-project cleanup 聚焦 contract tests；workspace lint/typecheck。",
        ],
        working:
          "内部 workspace command 对其声明的 infra slice 已完整且可清理；repo runtimes/journeys 与公开 root command 尚不存在。",
      },
      {
        id: "E2",
        name: "启动 Repo Runtimes 并封闭诊断清理路径",
        blockedBy: "E1 — 建立 Exact-project Infra 与 Migration Lifecycle",
        behavior:
          "在 migrated infra 上启动 API、Admin API、OIDC、Worker、Admin 与 SSO，渲染单一 127.0.0.1 Gateway routes 并完成 protocol readiness/route probes；把 startup/readiness/timeout/可捕获 signal 统一到 collectDiagnostics -> cleanup finally，并提供 exact descriptor 恢复入口。",
        acceptance: [
          "清理前保存 compose ps/health、bounded logs、Gateway state、migration receipt 和已有 Playwright artifacts，且输出脱敏。",
          "setup 失败与 Ctrl+C 仍清理 exact project；cleanup 失败改变最终 exit code。",
          "恢复只接受明确 descriptor/project，不扫描模糊前缀、不做全局 prune、不承诺 SIGKILL 后自动恢复。",
          "只有 Gateway 暴露 browser-visible origin；Worker 等内部 readiness 不新增 host port。",
        ],
        verification: [
          "对 runtime startup、Gateway route readiness、timeout、signal 与 cleanup failure 注入聚焦失败。",
          "每个场景核对 artifacts 顺序、exit code 与 project-scoped resource inventory。",
        ],
        working:
          "在加入 seed/journeys 前先形成完整系统生命周期与安全恢复点；仍不发布 root test:e2e。",
      },
      {
        id: "E3",
        name: "建立 One-shot Seed 与单一 Gateway Origin",
        blockedBy: "E2 — 启动 Repo Runtimes 并封闭诊断清理路径",
        behavior:
          "实现 E2E-local seedE2EScenario，以 run id/canonical origin 通过 production repository/Drizzle 与 Redis owner seam 建立两条 journey 所需领域状态，并渲染/探测单一 Gateway origin contract。",
        acceptance: [
          "seed 形成 active admin subject、密码、组织/任职/角色、Custom SSO client 与公开 OIDC PKCE client，并返回 run-scoped 非敏感引用。",
          "Redis 不复制 key/serializer/TTL/Lua；seed 不公开 DSL 或通用 fixture interface。",
          "IAM_SSO_INTERNAL_HOST/IAM_SSO_EXTERNAL_HOST、issuer 与 registered redirects 都对应 127.0.0.1 动态 origin。",
        ],
        verification: [
          "空 project 上运行 migrate -> seed -> readiness/route probes -> cleanup。",
          "从 owner interface/read-back 验证 seed，检查 descriptor/receipt 不含 password/token/secret。",
        ],
        working:
          "seed 与 origin contract 独立可观察且受 E2 lifecycle 保护；尚未宣称任何 browser journey 已交付。",
      },
      {
        id: "E4",
        name: "交付 Admin Custom SSO 真实 Journey",
        blockedBy: "E3 — 建立 One-shot Seed 与单一 Gateway Origin",
        behavior:
          "浏览器从 /iam-admin 经真实 SSO 密码登录与 callback 返回 Admin，再通过真实 /api/iam/rpc 配置、启用并读回 seeded client 的 Custom SSO 状态。",
        acceptance: [
          "Gateway、Admin、SSO、API、Admin API、PostgreSQL、Redis、Session/Cookie 与 Custom SSO callback 均真实。",
          "不得用 page.route 替代 journey 经过的 repo-owned core；CAPTCHA/短信等明确不经过的第三方边可以关闭。",
          "失败保存 trace/screenshot/video，再走统一诊断与 cleanup。",
        ],
        verification: [
          "workspace-local Playwright 只运行 Admin journey，前后核对 exact project cleanup。",
          "从 UI/API read-back 验证可观察结果，不直连内部 persistence 作为业务断言。",
        ],
        working:
          "第一条完整纵向行为落地；OIDC journey 缺失仍不会被 root test:e2e 隐藏，因为该入口尚未发布。",
      },
      {
        id: "E5",
        name: "交付 OIDC Authorization Code + PKCE 真实 Journey",
        blockedBy: "E3 — 建立 One-shot Seed 与单一 Gateway Origin",
        behavior:
          "test-owned RP helper 生成 S256 challenge 并接收 callback；浏览器经真实 authorize、SSO/API password login 与 resume 取得 code，再调用真实 token endpoint 和 /oidc/me。",
        acceptance: [
          "OIDC Provider、SSO/API authentication、Gateway routes、Session 与 token/UserInfo runtime 均真实；只有系统外 RP callback 是 test-owned。",
          "issuer/redirect 精确使用 canonical origin；本地 HTTP 只令 interaction Cookie Secure=false，Path=/oidc 与其他 contract 保持。",
          "PKCE、code 单次使用、token 与 user info 以公开协议结果验收。",
        ],
        verification: [
          "workspace-local Playwright/HTTP helper 只运行 OIDC journey，前后核对 cleanup。",
          "验证 redirect/origin/Cookie contract 与公开 token/UserInfo 结果。",
        ],
        working:
          "与 Admin journey 共享已验证 lifecycle/seed，但行为与断言独立；仍不提前发布 root test:e2e。",
      },
      {
        id: "E6",
        name: "发布完整 test:e2e 并同步 Owner 文档",
        blockedBy: "E4 + E5 — 两条 journeys 均完整",
        behavior:
          "把已完成的 lifecycle、两条 journeys、诊断与精确清理作为唯一 root pnpm test:e2e 发布，并更新 E2E workspace、命令、资源和 artifact 边界对应的 Current docs。",
        acceptance: [
          "test:e2e 从第一次出现起运行 preflight -> lifecycle -> 两条 journeys -> diagnostics/cleanup，任何 cleanup 失败均非零。",
          "root/Turbo/workspace command 可达，缺 Docker/browser/config 时在创建资源前明确失败。",
          "不新增 test:e2e:smoke、plugin platform、额外 journey 或 provider workflow。",
        ],
        verification: [
          "从干净环境运行 pnpm test:e2e 一次且无 retry；验证成功后无本 run 资源残留。",
          "root orchestration 聚焦测试、pnpm check:docs 与 git diff --check。",
        ],
        working:
          "公开入口只包装已经完整的 owner command；feature 可整体 revert，不影响 canonical Unit/Integration。",
      },
    ],
  },
  {
    key: "gate",
    slug: "test-gate-rollout",
    name: "测试 Gate 发布",
    dependency: "real-redis-test-migration + full-system-e2e",
    outcome:
      "在全部 owner capabilities 完整后，以 provider-neutral、fail-fast 的固定组合发布 verify:ci 与 verify:release，并在最终候选树记录最小人类可读聚合证据。",
    owns: [
      "verify:ci = verify -> test:integration 与 verify:release = verify:ci -> test:e2e 的 root composition。",
      "最终候选树上的 Windows verify 3/3、全资源 verify:ci 1/1、干净 E2E verify:release 1/1 摘要。",
      "三个 Gate 最终语义、证据和 adoption 状态的 Current docs 一致性收口。",
    ],
    links: [
      "基础 verify、test:integration 与资源 preflight 链接 test-collection-migration。",
      "Redis owner 能力链接 real-redis-test-migration；test:e2e lifecycle 链接 full-system-e2e。",
    ],
    invariants: [
      "Gate 只顺序组合 owner commands 并透传失败，不复制 URL/browser/Docker/cleanup 规则。",
      "verify:ci/release 不在依赖能力完整前发布，不 silent skip、不用 warning 代替失败。",
      "Windows 本地通过不表述为 Linux/CI runner 已验收；本 feature 不绑定 provider。",
      "不建立 resource detector、receipt/manifest/transcript、retry 或 evidence state machine。",
    ],
    acceptance: [
      "三个 Gate 顺序与 fail-fast 行为有聚焦 orchestration tests。",
      "实际聚合验证无 retry，cleanup failure 能传播到顶层非零退出。",
      "证据只记录平台、命令、次数和清理结果，不包含 resource URLs、credentials 或 secrets。",
    ],
    rollback:
      "只撤回 verify:ci、verify:release 与最终 evidence/docs 收口；保留基础 verify 和三个 owner features。",
    outOfScope: [
      "任何 CI provider workflow、Linux runner 启用、强制 branch gate 或资源并发提升。",
      "机器 evidence schema、通用 preflight Module、coverage/JUnit/flaky 平台。",
    ],
    risks: [
      "Gate 内重复资源检测会与 owner command 漂移。",
      "先发布空 Gate 再补 capability 会制造成功但未验证的假信号。",
      "把本地 Windows receipt 写成 CI 采用证据会越过本 effort destination。",
    ],
    tickets: [
      {
        id: "G1",
        name: "发布完整 Provider-neutral Gate Interface",
        blockedBy: "real-redis-test-migration + full-system-e2e",
        behavior:
          "在同一 root orchestration change 中发布 verify:ci = verify -> test:integration 与 verify:release = verify:ci -> test:e2e；两者严格 fail fast，并原样传播 owner resource、diagnostics 与 cleanup failure。",
        acceptance: [
          "两个命令只组合已经完整的 owner commands，不读取资源变量、不复制 preflight/descriptor/diagnostics/cleanup，也不解释 profile failures。",
          "verify 失败时不启动 Integration；verify:ci 失败时不创建 E2E project；test:e2e/cleanup failure 保留 owner 诊断并顶层非零。",
          "顺序、fail-fast、signal/exit code 传播由同一根 orchestration 外部行为覆盖。",
          "命名只表达 provider-neutral 目的，不声明真实 CI 已启用。",
          "不引入 retry、test:e2e:smoke、resource detector、evidence framework 或 provider workflow。",
        ],
        verification: [
          "根 orchestration 聚焦测试覆盖两个 Gate 的 success、各阶段 failure、E2E 未启动与 cleanup failure propagation。",
          "用受控 child commands 验证完整顺序/exit propagation；受影响 root tooling lint/typecheck 与 git diff --check。",
        ],
        working:
          "全部依赖能力在 feature 开始前已经完整；两个浅 Gate compositions 一次发布，避免重复修改同一 Module 或形成 placeholder。",
      },
      {
        id: "G2",
        name: "取得最终聚合证据并收口 Current Docs",
        blockedBy: "G1 — 发布完整 Provider-neutral Gate Interface",
        behavior:
          "在最终候选树运行约定的三组实际 evidence，记录简短人类可读摘要，并统一三个 Gate 的 Current docs/adoption 描述。",
        acceptance: [
          "Windows pnpm verify 连续 3/3；提供全部专用资源时 verify:ci 1/1；干净 E2E 环境 verify:release 1/1，均无 retry。",
          "摘要说明实际平台、命令、次数与资源清理结果；不保存完整日志、machine receipt 或 secret。",
          "Linux/真实 CI 保持 pending，不成为本地 feature 完成或命令发布的虚假证据。",
        ],
        verification: [
          "执行三组真实 Gate evidence；pnpm check:docs 与 git diff --check。",
          "复核 owner docs 链接，不在 Gate spec 复制 collection/Redis/E2E 详细 contract。",
        ],
        working:
          "本票只验证完整最终树并收口文档；失败时不合并 feature，既有 owner commands 保持可用。",
      },
    ],
  },
];

const lenses = ["outline", "ticket", "audit"];

export function createState() {
  return { featureIndex: 0, ticketIndex: 0, lensIndex: 0 };
}

export function reduce(state, key) {
  if (["1", "2", "3", "4"].includes(key)) {
    return { ...state, featureIndex: Number(key) - 1, ticketIndex: 0 };
  }

  if (key === "n") {
    const feature = features[state.featureIndex];
    return {
      ...state,
      ticketIndex: (state.ticketIndex + 1) % feature.tickets.length,
    };
  }

  if (key === "l") {
    return { ...state, lensIndex: (state.lensIndex + 1) % lenses.length };
  }

  return state;
}

function lines(title, values) {
  return [title, ...values.map((value) => `  - ${value}`)];
}

function renderOutline(feature) {
  return [
    `Outcome\n  ${feature.outcome}`,
    `Dependency\n  ${feature.dependency}`,
    lines("Owns", feature.owns).join("\n"),
    lines("Links, does not copy", feature.links).join("\n"),
    lines("Migration invariants", feature.invariants).join("\n"),
    lines("Feature acceptance", feature.acceptance).join("\n"),
    `Rollback\n  ${feature.rollback}`,
    lines("Out of scope", feature.outOfScope).join("\n"),
  ].join("\n\n");
}

function renderTicket(feature, ticket) {
  return [
    `Ticket ${ticket.id} — ${ticket.name}`,
    `Blocked by\n  ${ticket.blockedBy}`,
    `Observable behavior / safe migration step\n  ${ticket.behavior}`,
    lines("Acceptance", ticket.acceptance).join("\n"),
    lines("Focused verification", ticket.verification).join("\n"),
    `Why the repository stays working\n  ${ticket.working}`,
  ].join("\n\n");
}

function renderAudit(feature) {
  return [
    lines("Global shape checks", globalRules).join("\n"),
    lines("Feature-specific failure risks", feature.risks).join("\n"),
    "Deletion test",
    feature.slug === "test-gate-rollout"
      ? "  Gate 只固定组合已存在的 owner commands；删除 resource/evidence framework 后复杂度不会散回多个调用方。"
      : feature.slug === "full-system-e2e"
        ? "  删除 project-scoped orchestrator 会把 lifecycle 知识散回 journeys/root/CI；删除 plugin platform 不会，因为当前只有一个 topology。"
        : feature.slug === "real-redis-test-migration"
          ? "  复用 production owners 后，删除新通用 test scope 不会把当前复杂度散回多个调用方；因此默认不创建它。"
          : "  删除永久 Collection Guard 会让漏收/重收检查散回各 runner；删除迁移 baseline/例外不会损失当前架构保护。",
  ].join("\n\n");
}

function renderState(state, ansi) {
  const bold = ansi ? "\u001B[1m" : "";
  const dim = ansi ? "\u001B[2m" : "";
  const reset = ansi ? "\u001B[0m" : "";
  const feature = features[state.featureIndex];
  const ticket = feature.tickets[state.ticketIndex];
  const lens = lenses[state.lensIndex];

  const body =
    lens === "outline"
      ? renderOutline(feature)
      : lens === "ticket"
        ? renderTicket(feature, ticket)
        : renderAudit(feature);

  return [
    `${bold}四份 Specs 可执行性 prototype${reset}`,
    `${dim}维护者已确认：Wayfinder 讨论资产，不是正式 spec/tickets${reset}`,
    "",
    `${bold}Feature${reset}: ${feature.name} (${feature.slug})`,
    `${bold}Lens${reset}: ${lens}`,
    lens === "ticket"
      ? `${bold}Ticket${reset}: ${ticket.id} (${state.ticketIndex + 1}/${feature.tickets.length})`
      : `${bold}Ticket tree size${reset}: ${feature.tickets.length}`,
    "",
    body,
  ].join("\n");
}

export function render(state, ansi = true) {
  return [
    renderState(state, ansi),
    "",
    ansi
      ? "\u001B[1m[1]\u001B[0m collection  \u001B[1m[2]\u001B[0m redis  \u001B[1m[3]\u001B[0m e2e  \u001B[1m[4]\u001B[0m gate  \u001B[1m[n]\u001B[0m next ticket  \u001B[1m[l]\u001B[0m next lens  \u001B[1m[q]\u001B[0m quit"
      : "[1] collection  [2] redis  [3] e2e  [4] gate  [n] next ticket  [l] next lens  [q] quit",
  ].join("\n");
}

export function renderSnapshot() {
  const blocks = [];

  for (let featureIndex = 0; featureIndex < features.length; featureIndex += 1) {
    const feature = features[featureIndex];
    blocks.push(renderState({ featureIndex, ticketIndex: 0, lensIndex: 0 }, false));
    for (let ticketIndex = 0; ticketIndex < feature.tickets.length; ticketIndex += 1) {
      blocks.push(renderState({ featureIndex, ticketIndex, lensIndex: 1 }, false));
    }
    blocks.push(renderState({ featureIndex, ticketIndex: 0, lensIndex: 2 }, false));
  }

  return blocks.join("\n\n---\n\n");
}
