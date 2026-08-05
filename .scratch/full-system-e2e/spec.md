# Full-system E2E

## 问题陈述

仓库当前的 Playwright 入口使用 mock backend，只能证明 frontend/browser Integration。仓库没有一个从空 volumes 执行真实
migrations、局部 seed、启动全部 IAM runtimes、渲染 Gateway routes、运行用户 journey、采集诊断并精确清理资源的闭环。
现有 dev Compose 依赖开发者状态，也没有 migration/init/seed step，不能作为可重复的 E2E gate。

维护者需要一个固定 IAM 拓扑的 Full-system E2E，使 Admin Custom SSO 与独立 OIDC Authorization Code + PKCE 两条首期
journey 都经单一 Gateway origin 和真实 repo-owned core；同时必须避免把首个调用方扩张为通用测试平台、全局 janitor 或
不可审计的 Docker 清理器。

## 方案

在 [Canonical Collection 与命令迁移](../test-collection-migration/spec.md) 完成后，建立 root-owned
`@iam/e2e-system` workspace。它以 project-scoped、one-shot orchestrator 深 Module 持有唯一 Compose project、run
descriptor、动态 Gateway port、migrations、E2E-local seed、readiness、诊断与 cleanup lifecycle；Playwright 只持有两条
用户 journey。

本 feature 与 [真实 Redis 测试迁移](../real-redis-test-migration/spec.md) 可以并行。E2E seed 遵守 production Redis owner
原则，但不依赖 RESP 测试迁移的实现完成。`verify:release` 由 [测试 Gate 发布](../test-gate-rollout/spec.md) 独立组合。

## 实施决策

### 固定系统边界

每次运行拥有唯一 Compose project、run-scoped artifacts 和动态 Gateway host port。共享系统包含 PostgreSQL、Redis、etcd、
APISIX、API、Admin API、OIDC Provider、Worker、Admin 与 SSO。除 Gateway 外，服务端口默认只存在于 Compose network；
host 直连 app/APISIX admin 只用于 orchestrator readiness 或失败诊断，不成为 browser 入口。

Journey 实际经过的 repo-owned runtimes 全部真实。CAPTCHA 显式关闭；不选择 SMS、WeChat、邮件、分析或外部身份源路径；
Custom SSO seed 使用 `orcas.enabled=false`。只允许关闭或替代 journey 明确不经过的第三方边。

### 单一 Gateway origin

浏览器、Playwright request 与 host-side readiness 只使用
`http://127.0.0.1:<dynamic-gateway-port>`。Gateway manifest 的 `IAM_SSO_INTERNAL_HOST`、`IAM_SSO_EXTERNAL_HOST`，
OIDC issuer、SSO external origin、registered redirect URI 与 test-owned RP callback 都使用同一完整
`scheme + host + port`。

首期不依赖 `*.localhost` 特殊解析，不修改 hosts 文件，不使用 browser host resolver rules。登录 Cookie 保持 host-only 与
既有 SameSite/Path contract；OIDC interaction Cookie 继续使用 `Path=/oidc`。本地 HTTP 只通过测试配置令其
`Secure=false`，不修改 production Cookie contract。

### Lifecycle

Orchestrator 使用固定顺序，不公开可编程 phase graph：

1. 在创建资源前 fail fast 检查 Docker、browser 和必要配置，并落盘不含 secret 的 run descriptor；
2. 启动 PostgreSQL、Redis、etcd 与 APISIX，以协议 health 确认就绪；
3. 在空 project volumes 上显式执行真实 Drizzle migrations；
4. 启动 API、Admin API、OIDC Provider、Worker、Admin 与 SSO，渲染单一 origin 的 Gateway routes，完成 runtime readiness
   与外部 route probes；
5. 运行局部 `seedE2EScenario`，以 run id/canonical origin 通过 production repository/Drizzle 与 Redis owner seam 建立
   两条 journey 的领域状态；
6. 仅在全部 gates 通过后运行 Playwright；任何失败先采集诊断，再进入同一幂等 cleanup。

Descriptor 至少记录 exact project、动态 port、canonical origin、resource labels 与 artifact directory，不记录 password、
token 或 secret。Seed 只返回 run-scoped 非敏感引用，不公开通用 fixture DSL，不复制 Redis key、serializer、TTL、index
或 Lua。

### 两条首期 journey

**Admin Custom SSO：** 浏览器从 `/iam-admin` 开始，经真实 `/sso/authorize`、`/portal/login`、
`/api/iam/auth/login/password` 与 `/sso/callback` 返回 Admin，再通过真实 `/api/iam/rpc` 配置、启用并读回 seeded
client 的 Custom SSO 状态。Gateway、Admin、SSO、API、Admin API、PostgreSQL、Redis、Session/Cookie 与 callback 全部真实，
不得用 `page.route` 替代 journey 中的 repo-owned core。

**OIDC Authorization Code + PKCE：** Test-owned RP helper 只生成 S256 verifier/challenge 并接收 registered callback；
浏览器经真实 `/oidc/auth`、`/portal/login`、password API 与 `/oidc/resume` 取得 authorization code，再调用真实 token
endpoint 和 `/oidc/me`。RP 是系统外调用方，可以由测试拥有；authorize、login、Session、token 与 UserInfo runtime 必须真实。

两条 journey 可独立验收，但同一 feature branch 默认按 ticket 顺序实施。只有两条都完整后才公开 root `pnpm test:e2e`；
中间 tickets 只提供 workspace-local slice command。

### 诊断、清理与恢复

Migration、seed、readiness、journey、timeout、assertion 或 cleanup 失败时，先保存 Compose `ps`/health、各服务有界且脱敏的
最近日志、Gateway render/route 状态、migration/seed receipt 与已有 Playwright trace/screenshot/video，再清理。

正常完成、失败、timeout 与可捕获 signal 都调用同一 cleanup，只对 descriptor 中 exact project 执行
`docker compose -p <exact-project> down -v --remove-orphans`。Cleanup 幂等但 failure 必须使整次运行非零，不能被吞掉或
降级为 warning。恢复入口只接受明确 descriptor/project，不扫描模糊前缀、不执行全局 prune，也不承诺 SIGKILL/宿主崩溃后
自动恢复。

### 命令与文档所有权

Root `test:e2e` 从第一次出现起就运行 preflight、完整 lifecycle、两条 journeys、diagnostics 与 cleanup；不先发布
placeholder、silent skip 或 warning-only success。本 feature 更新 E2E workspace、orchestrator、journeys、命令、资源与
generated artifact 边界对应的 Current 测试架构、命令文档和仓库地图。

三层/profile 路径语言、真实 Redis 测试迁移和上层 Gate 由各自 feature 拥有，本 spec 只链接。

## 迁移不变量

- Run descriptor 在任何资源创建前落盘且不含 secret；所有资源和 cleanup 都绑定 exact project。
- 浏览器只看见单一 `127.0.0.1` Gateway origin；issuer、SSO origin 与 redirects 使用同一完整 origin。
- 两条 journey 经过的 repo-owned core 全部真实；只替代明确位于 journey 外的第三方边。
- 任何失败先保存 bounded、脱敏诊断，再 cleanup；cleanup failure 始终传播为顶层非零。
- `test:e2e` 只在 lifecycle 与两条 journey 全部完整后公开。
- 每张中间 ticket 从空环境运行自己的完整 slice，并精确清理本 run project。
- 首期只有固定拓扑，不建立 plugin platform、janitor、run registry、resume/retry 或任意 service composition。

## 验收标准

- 空 project volumes 上真实 migrations、局部 seed、全部 runtime readiness 与 Gateway route probes 通过。
- Admin Custom SSO 与 OIDC PKCE 两条 journey 都从 canonical origin 走真实登录、Session/Cookie、协议和 owner persistence。
- 成功、assertion failure、migration/seed/readiness failure、timeout、可捕获 signal 与 descriptor recovery 都只清理本 run
  资源，并在 cleanup failure 时非零。
- Artifacts 与 descriptor 不泄漏 password、token、secret、完整敏感 payload 或无界日志。
- Root `test:e2e` 从第一次出现起即完整可运行；缺 Docker/browser/config 时在创建资源前明确失败。
- Current 文档准确描述 E2E owner、命令、资源、diagnostics 与 artifact 边界，未宣称 Linux/CI adoption。

## 测试决策

- Lifecycle contract tests 对 descriptor-before-resource、phase/order、migration failure、readiness timeout、signal、诊断顺序、
  cleanup failure 与 exact-project inventory 注入可控失败。
- 每个中间 ticket 使用 workspace-local command 从空 project 运行完整 slice，结束后核对本 run container/network/volume
  均被清理。
- Journey 用公开 UI/API/OIDC 结果验收，不直连内部 persistence 作为业务断言；owner read-back 只用于 seed contract。
- 每票运行 workspace lint/typecheck、最高层相关 contract/journey 与 `git diff --check`，不反复运行全仓 `pnpm verify`。
- 最后一票从干净环境无 retry 运行 `pnpm test:e2e` 一次，并运行 root orchestration tests、`pnpm check:docs` 与
  `git diff --check`。

## 交付切片

1. [建立 Exact-project Infra 与 Migration Lifecycle](issues/01-establish-exact-project-lifecycle.md)
2. [启动 Repo Runtimes 并封闭诊断清理路径](issues/02-start-runtimes-and-close-cleanup.md)
3. [建立 One-shot Seed 与单一 Gateway Origin](issues/03-establish-seed-and-origin.md)
4. [交付 Admin Custom SSO 真实 Journey](issues/04-deliver-admin-custom-sso-journey.md)
5. [交付 OIDC Authorization Code + PKCE 真实 Journey](issues/05-deliver-oidc-pkce-journey.md)
6. [发布完整 test:e2e 并同步 Owner 文档](issues/06-publish-test-e2e.md)

## 回滚

移除 E2E workspace、`test:e2e`、Compose/Gateway 增量与相应文档，不回滚 canonical Unit/Integration。若
`test-gate-rollout` 已合入，必须先回滚 Gate；真实 Redis feature 可独立保留。

## 范围外

- 通用 E2E/orchestrator 平台、service adapters/plugins、janitor、持久 run registry、可恢复 phase state machine、
  transparent resume/retry 或任意 topology；
- 模糊前缀资源扫描、全局 Docker prune 或清理未知 project；
- 两条首期 journey 之外的场景、真实 CAPTCHA/SMS/邮件/外部身份源；
- CI provider workflow、Linux/CI adoption、`verify:release` 或 branch gate；
- 修改 production Cookie contract、无关业务行为、数据库 schema、`CONTEXT.md` 或冻结的 `openspec/`。

## 决策来源

正式实现以本 spec 为 feature 范围来源；背景裁定见 [Wayfinder map](../test-architecture-refactor-wayfinding/map.md)、
[Full-system E2E 最小边界](../test-architecture-refactor-wayfinding/issues/04-scope-full-system-e2e-mvp.md)、
[Feature 边界](../test-architecture-refactor-wayfinding/issues/06-decide-feature-spec-boundaries.md)和
[最终 ticket shape](../test-architecture-refactor-wayfinding/issues/07-validate-executable-spec-and-ticket-shape.md)。当前基线见
[测试编排架构](../../docs/architecture/testing-architecture.md)与[仓库地图](../../docs/architecture/repository-map.md)。
