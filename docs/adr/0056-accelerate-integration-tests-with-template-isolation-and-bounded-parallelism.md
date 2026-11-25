---
status: accepted
---

# 采用模板隔离、静态托管与有界并发加速 Integration 测试

`pnpm test:integration` 在保持每命令独占、确定性隔离与精确回收的前提下，通过 **PostgreSQL 预迁移模板库克隆 + 非持久内存盘**、**Redis 多逻辑 DB 槽位 + 根 runner 有界并发调度**、**前端 Playwright 指纹静态托管**、**Windows Job `.dll` 哈希缓存** 以及 **`@iam/e2e-system` 剥离为路径触发门禁** 重构集成测试运行体系。本决定修订 [ADR-0009](0009-adopt-canonical-test-collections.md#资源生命周期与验证取舍) 中“同环境资源测试严格串行”与全量默认收集 `e2e/system` 的条款，保留其“每命令独占隔离环境、零手动防残留、失败即停与精确资源回收”的核心取舍。

原有全量 `pnpm test:integration` 在 Windows 宿主机串行耗时约 12–14 分钟：临时 PostgreSQL 保持默认全落盘持久化，10 套重复的 workspace harness 在 117+ 个测试文件（部分套件甚至在每条 `test()` 内）重复执行全量 46 个 Drizzle SQL migration；`run-test-integration.mjs` 顺序运行 `bun` → `playwright` 并经 `turbo --concurrency=1` 单队列排队；`@iam/admin` 与 `@iam/sso` 无后端依赖的 mock-API Playwright 套件每次冷启 Vite dev server 且 worker 上限锁死在 1–2；Windows 进程树包装器每次 spawn 现场通过 `powershell.exe` + `Add-Type -Language CSharp` 编译 Job API（单次固定惩罚约 500ms）；`@iam/e2e-system` 12 个重型编排器测试（约 135s）被默认纳入日常全量集成；Gateway APISIX 本地镜像在每次测试收尾被 `--rmi local` 删除并在下次重建。

## 每命令独占即毁与 PostgreSQL 模板隔离

- **保持每命令独占即毁**。我们拒绝效仿 [ADR-0055](0055-adopt-hybrid-host-runtime-for-full-system-e2e.md) 为 Integration 引入第二套常驻中间件栈与跨 worktree 互斥锁。Integration 根容器仅包含 PostgreSQL 与 Redis，冷启动本身仅约 3–5 秒，保持每命令独占即毁可消除常驻状态污染面并简化多终端与 AFK 回收语义。
- **非持久 PostgreSQL 与带上限 `tmpfs`**。临时测试 PostgreSQL（涵盖根 [compose.yaml](../../scripts/test-resources/compose.yaml) 与 `e2e/system` 自身 PG 容器）关闭 `fsync`、`synchronous_commit` 与 `full_page_writes`（并调大 `max_wal_size` / `checkpoint_timeout`），同时挂载显式大小上限（如 `1g`）的 `tmpfs` 内存盘，既消除 Docker Desktop / WSL2 虚拟磁盘写放大，又防止 Windows 提交内存或 AFK 沙盒内存无界膨胀。
- **根单次预迁移模板库与轻依赖共享 Harness**。根 runner 启动 PostgreSQL 后一次性执行全量 Drizzle migrations，生成只读模板库 `iam_test_template`（`IS_TEMPLATE true`）。在 `@iam/test-support` 新增仅依赖 `postgres` 驱动的共享模板克隆 harness（不反向依赖 `@iam/db` 或 `drizzle-orm`，避免循环依赖），由各业务 workspace 薄封装自己的 `drizzle({ client, relations })`：
  - 普通集成测试文件在 `beforeAll` 执行 `CREATE DATABASE <rand> TEMPLATE iam_test_template`，获得标准 `public` schema 的独立数据库；文件内用例间通过动态查询 `pg_tables`（排除 `__drizzle_migrations`）执行完整 `TRUNCATE ... RESTART IDENTITY CASCADE`（根治手写表清单漏表导致的 per-test 重复迁移）；`afterAll` 执行 `DROP DATABASE WITH (FORCE)`。
  - 原先显式读取 `schemaName` 或 `search_path` 的少量测试（如 `apps/worker`、`apps/ops`、`apps/api` OIDC fixture）适配为标准独立数据库 URL 与 `public` schema；`@iam/db` 的迁移专项测试与 `apps/ops` 的 `database-migrate-command` 仍从空库验证真实 `migrate()`。
  - 我们拒绝“每 workspace 复用单个预迁移 schema + `search_path`”方案，因为前者保留了 `search_path` 耦合、无法天然隔离 `GRANT`/DDL 副作用，且限制后续并发扩展。
- **APISIX 本地镜像按配置哈希复用与按需诊断**。Gateway APISIX 子栈取消 `removeLocalImages: true`，改用按 `apisix.config.yaml` 内容哈希打确定性 tag 的本地镜像，仅在配置变化时重建。`managed-resources.mjs` 仅在执行失败、超时或清理异常时采集 `docker compose ps` 与 `docker compose logs` 诊断，正常通过路径直接执行精确 `down`。

## Redis 多 DB 槽位与根 Runner 有界并行

- **按任务分配唯一 Redis 逻辑 DB**。已确认非 `e2e/system` 的全部 Redis 集成测试均严格读取注入的 `IAM_*_TEST_REDIS_URL` 并仅执行 `FLUSHDB`（无 `FLUSHALL` 与跨库硬编码），且 `@iam/runtime` 的 `redisUrlString()` 原生支持任意非负 DB 编号。根 Redis 启动参数配置 `--databases 32`（零额外容器开销），根 runner 为每个声明 Redis 的 `workspace:executor` 任务分配唯一逻辑 DB 编号（`/1`、`/2`...）并写入 `test-environment.json`，包级 runner 继续强校验运行记录与 URL 一致性。
- **根 Runner 有界并发调度与独立分包日志**。取消 `bun` → `playwright` 的串行大阶段划分与外层 `turbo --concurrency=1` 包装（`test:integration:*` 本身禁用缓存且无构建产物依赖），由 [run-test-integration.mjs](../../scripts/run-test-integration.mjs) 直接按有界并发槽调度选中的 `workspace:executor` 任务：
  - 默认并发上限保守设为 `3`（可通过 `--concurrency` 或环境变量覆盖），使无外部资源的前端 Playwright、PG-only 包与多 DB 隔离的 Redis 后端包在同一轮内安全并发；按任务重度优先入队以消除长尾；
  - 保留 fail-fast 与精确回收语义：任一任务失败立即通过 `AbortController` 取消其余在途任务进程树，并先逆序清理子 Compose project 再回收主栈；
  - 为每个任务写入独立完整日志（`test-results/integration/<run-id>/logs/<pkg>-<executor>.log`），消除原先 128KB 混合日志截断导致的排查盲区。
  - 跨命令的**同宿主串行验证**约束保持不变（不允许多个顶层验证命令在同一宿主并发抢占资源）。

## 前端 Playwright 静态预构建托管与自适应并发

- **指纹缓存静态托管（不污染生产 `dist`）**。`@iam/admin` 与 `@iam/sso` 的全部集成 `.spec.ts` 均基于 Playwright `page.route` mock 后端 API，无 PG/Redis 依赖。复用 [ADR-0055](0055-adopt-hybrid-host-runtime-for-full-system-e2e.md#前端托管与独立缓存) 的确定性指纹构建模式：Playwright `webServer` 默认将构建产物输出至受 `.gitignore` 与 `.dockerignore` 保护的独立缓存目录（如 `.cache/integration-frontend/{admin,sso}`，严禁写入 `apps/*/dist` 或污染 Turbo 生产构建缓存），指纹命中且产物完好时跳过 `vite build`，直接以极简静态 SPA 服务托管（`@iam/sso` 构建输入纳入其固定测试公钥环境变量）；保留 `IAM_PW_DEV_SERVER=1` 调试开关按需切回 Vite dev server。
- **放开无资源 Playwright 并发上限**。`run-package-integration.mjs` 解除对无外部资源 Playwright 集合 `--browser-workers` 的 `1|2` 硬限制，改为有界自适应默认值 `min(4, max(2, floor(cpus / 2)))`（支持环境变量覆盖），同时为 `@iam/admin` 与 `@iam/sso` 启用，并在确认无跨用例共享状态后开启 `fullyParallel: true`。

## Windows 进程树包装器 `.dll` 哈希缓存

- [windows-job-supervisor.ps1](../../packages/runtime/src/process/windows-job-supervisor.ps1) 同时服务于测试 runner 与 `apps/worker` 生产调度（含 Windows standalone 模式）。为消除每次 `spawnOwnedProcessTree` 现场调用 `csc.exe` 带来的约 500ms 编译惩罚，脚本内部按 `IamOwnedProcess.JobApi` C# 源码哈希将程序集编译输出到系统临时/缓存目录（`IamOwnedProcess.JobApi.<sha256>.dll`，采用临时文件 + 原子重命名防并发竞态），后续调用直接 `Add-Type -Path` 加载；缓存损坏、缺失或权限异常时无缝回退至内存编译。
- 我们拒绝引入独立预编译原生 `.exe` 替代 `powershell.exe`，以免在仓库引入额外的跨平台原生构建工具链或二进制签入审计负担；由此接受保留约 100ms 的 PowerShell 进程冷启动开销。

## `@iam/e2e-system` 剥离与路径触发门禁

- **独立入口与默认剥离**。`@iam/e2e-system` 的集成测试验证的是 E2E 编排器本身（每例独立启停整套容器与宿主机进程），不属于业务应用日常集成回归。从 `e2e/system/package.json` 移除 `iamTest.integration` 声明并从 [integration-selection.mjs](../../scripts/test-resources/integration-selection.mjs) 的默认扫描范围剥离，同时在 `e2e/system/package.json` 保留可直接执行的 `test:integration` 脚本，确保 `pnpm --filter @iam/e2e-system test:integration` 开箱即用。
- **路径触发门禁与发布覆盖**。在 [run-verification-gate.mjs](../../scripts/run-verification-gate.mjs) 新增与 `verify:container-smoke --base <commit-sha>` 同构的 `pnpm verify:e2e-runtime --base <commit-sha>`：当差异命中 `e2e/system/**`、`packages/runtime/**`、`scripts/test-resources/**`、门禁脚本、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.npmrc`、`turbo.json`、`**/vite.config.*`，或命中 Hybrid E2E 运行时闭包内（及根）`package.json` 的运行时/构建敏感字段（含前端闭包 `devDependencies`/`scripts.build`/`scripts.dev`、后端闭包 `scripts.db:migrate` 及根 `test:e2e*`/`verify:e2e-runtime` 脚本）时自动执行 `pnpm --filter @iam/e2e-system test:integration`（修改无关 `Dockerfile`、测试脚本、`iamTest` 或非闭包 `package.json` 时跳过）。
- `pnpm verify:ci` 运行瘦身后的默认 `pnpm test:integration`；`pnpm verify:release` 显式执行 `pnpm --filter @iam/e2e-system test:integration`；手动交付与 Sandcastle AFK 最终验证阶段与 `verify:container-smoke` 一致，按合入基线自动运行 `pnpm verify:e2e-runtime --base <target-commit-sha>`。代价是仅修改普通业务代码且不触碰上述路径时，日常 `verify:ci` 不再自动跑 E2E 运行时测试，由发布门禁与路径规则兜底。

## 重型用例与冗余子进程的覆盖保底边界

在不削弱真实契约行为证据的前提下，治理已定位的单点机械耗时：

- **`@iam/worker` Windows standalone 编译缓存**：`user-document-repair-schedule` 的 `worker.exe` 与 `windows-job-launcher.exe` 编译改为按输入指纹缓存至独立 `.cache/` 目录，命中时跳过重复 `bun build --compile`，保留 Windows standalone 行为验证；
- **`@iam/ops` CLI 子进程收敛**：`session-clear-command` 与 `user-document-maintenance` 各保留 3–4 条真实 CLI 子进程用例（覆盖参数解析、退出码、env 脱敏、信号/连接收尾与主成功路径），其余业务变体迁至已有进程内 composition（`fixture.run()`）；
- **单点大造数与固定加密开销**：`apps/api` 的 501 条组织查询上限测试改为直接批量插入合法已发布 `organization_document` 夹具（outbox/rebuild 链路由专用用例及 `@iam/documents` 覆盖）；`apps/admin-api` 的 10001 条 session 边界测试通过 Redis pipeline 批量造数（或可配置阈值 + pipeline）验证真实批量逻辑；`apps/api` 的 `api-env.fixture.ts` 改用预生成测试专用静态 RSA PEM 常量，消除模块加载期同步密钥生成；`e2e/system` 精简模板指纹测试对整个 `packages/` 与 `apps/worker/` 目录的无差别拷贝。

实施落地后同步更新[测试与验证](../engineering/testing.md)、[构建、测试与开发命令](../engineering/commands.md)与[Sandcastle AFK 工作流](../agents/sandcastle-afk.md)中的现行编排、并发、日志和门禁说明；本决策不涉及业务领域概念，不修改 `GLOSSARY.md`。

[Canonical Test Collections](0009-adopt-canonical-test-collections.md) · [Hybrid Full-system E2E](0055-adopt-hybrid-host-runtime-for-full-system-e2e.md)
