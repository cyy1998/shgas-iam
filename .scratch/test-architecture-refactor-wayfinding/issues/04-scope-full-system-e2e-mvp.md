# 收敛 Full-system E2E 的最小系统边界

Type: prototype

Status: resolved

Blocked by: None — can start immediately

Prototype: [Full-system E2E 最小系统边界](../prototypes/04-full-system-e2e-boundary/README.md)

## Question

在单一 Gateway origin 和首阶段两条 journey 已确定的前提下，Full-system E2E 的最小可交付 workspace/orchestrator 应拥有
哪些服务生命周期、migrations、seed、readiness、诊断与精确清理能力，才能验证所有自有核心组件而不提前建设通用测试平台？

本 ticket 应做一个低保真生命周期与接口草图，并与维护者共同决定：

- 两条 journey 共享的最小系统启动 gate、seed 和 service set；
- Admin Custom SSO 与独立 OIDC Authorization Code + PKCE 各自必须真实经过哪些本仓库边界；
- 单 Gateway origin 的 path/route/cookie contract，以及哪些第三方依赖允许关闭或替代；
- 动态端口、Compose project、诊断采集、`down -v` 和中断恢复的最低可靠实现；
- 首阶段是否真的需要 janitor、run registry、通用 phase state machine 或可插拔 orchestrator。

若 project-scoped lifecycle 加 CI post-job 已足够，不应为尚未出现的并发 runner、宿主机崩溃恢复或多套 E2E 产品线建立平台层。

## Answer

维护者确认采用 project-scoped 的一次性 Full-system E2E orchestrator。它是固定 IAM 系统拓扑的深 Module，不是通用测试平台；
root 对外仍只有已确定的 `pnpm test:e2e` interface，Playwright 只负责两条用户 journey，不持有 Docker、migration、seed、
readiness、诊断或清理生命周期。

### Workspace、系统边界与 origin

- 新建一个 root-owned E2E workspace，持有唯一 Compose project、run descriptor、动态 Gateway host port、run-scoped
  artifacts 和固定 lifecycle。除 Gateway 外，服务端口默认只存在于 Compose network；直连 app port 与 APISIX admin port
  只用于 orchestrator readiness 或失败诊断，不成为浏览器测试入口。
- 每次运行的唯一 browser-visible origin 是 `http://127.0.0.1:<dynamic-gateway-port>`。Gateway manifest 必须渲染
  `IAM_SSO_INTERNAL_HOST=127.0.0.1` 与 `IAM_SSO_EXTERNAL_HOST=127.0.0.1`；OIDC issuer、SSO external origin、registered
  redirect URI 和 test-owned RP callback 都使用同一个完整 `scheme + host + port`。
- 首期不依赖 `*.localhost` 的浏览器或运行时特殊解析，不修改 hosts 文件，也不使用浏览器 `host-resolver-rules`。浏览器、
  Playwright request 与 host-side Node readiness 因而观察同一个可达地址。
- 共享系统启动 gate 包含 PostgreSQL、Redis、etcd、APISIX、API、Admin API、OIDC Provider、Worker、Admin 与 SSO。CAPTCHA
  显式关闭；journeys 不选择 SMS、WeChat、邮件、分析或外部身份源；Custom SSO seed 使用 `orcas.enabled=false`。这些第三方
  边界可以关闭或由 test-owned adapter 替代，但两条 journey 实际经过的本仓库 runtime 不得 mock。

### 固定 lifecycle 与 seed

Orchestrator 按固定顺序执行，不暴露可编程 phase graph：

1. fail fast 检查 Docker、浏览器和必要配置，然后在创建资源前写入 run descriptor；descriptor 至少记录精确 Compose
   project name、动态 Gateway port、canonical origin、resource labels 与 artifact directory，不记录密码、token 或 secret；
2. 启动 PostgreSQL、Redis、etcd 与 APISIX，并以协议 health 而非日志文本确认基础设施就绪；
3. 在空 project volumes 上显式运行真实 migrations；当前 dev Compose 没有 migration/init/seed step，因此不得依赖开发者
   现有 volume 或手工初始化；
4. 运行一个 E2E-local one-shot `seedE2EScenario` Module，以 run id 与 canonical origin 形成两条 journey 共用的 active
   admin subject、密码、组织/任职/角色，以及各自的 Custom SSO client 和公开 OIDC PKCE client；数据库状态复用 production
   repository/Drizzle seam，Redis 状态遵守「收敛真实 Redis 迁移的最小测试 seam」并通过各 production owner 建立，不复制
   Redis key、serializer、TTL、index 或 Lua；
5. 启动 API、Admin API、OIDC Provider、Worker、Admin 与 SSO，应用已渲染的 Gateway routes；先验证各 runtime 的真实
   readiness，再从 canonical origin 探测 `/iam-admin`、`/portal`、`/sso/*`、`/api/iam/*` 和 `/oidc/*` 等外部 route
   contract。Worker `/healthz` 在 Compose network 内检查，不为 E2E 额外公开 host port；
6. 只有全部 startup gates 通过后才运行 Playwright；任一 migration、seed、readiness 或 route probe 失败时，两条 journey
   均不启动并直接进入诊断与清理。

首期 seed 是该 E2E workspace 的局部实现，不公开通用 fixture/seed DSL。只有未来出现第二套真实系统拓扑或其他稳定调用方，
并重复同一段非平凡 seed ownership 时，才重新评估更高层 interface。

### 首期两条 journey

**Admin Custom SSO** 使用 seeded admin subject 与 client：浏览器从 `/iam-admin` 开始，经真实 `/sso/authorize`、
`/portal/login`、`/api/iam/auth/login/password` 与 `/sso/callback` 返回 Admin，再通过真实 `/api/iam/rpc` 配置、启用并读回
该 client 的 Custom SSO 状态。Gateway、Admin、SSO、API、Admin API、PostgreSQL、Redis、Session/Cookie 与 Custom SSO
callback 都必须真实；不得以 `page.route` 或 frontend mock 替代。

**独立 OIDC Authorization Code + PKCE** 使用 seeded public client。Journey-local test-owned RP helper 只生成 S256
verifier/challenge 并接收 registered callback；浏览器经真实 `/oidc/auth`、`/portal/login`、password API 与 `/oidc/resume`
取得 authorization code，再通过真实 token endpoint 和 `/oidc/me` 验证 token 与用户信息。RP 是系统外调用方，因此 callback
helper 可以是测试替代；authorize、login、Session、token 与 UserInfo runtime 不能替代。

所有登录 Cookie 保持 host-only 与既有 SameSite/Path contract；OIDC interaction binding Cookie 继续使用 `Path=/oidc`。
首期使用本地 HTTP，因此显式采用非 production 的 `Secure=false` 配置，而不改变 production Cookie contract。

### 诊断、清理与中断恢复

- migration、seed、readiness、journey、timeout、断言或 cleanup 任一阶段失败时，先保存 Compose `ps`/health、各服务有界且
  脱敏的最近日志、Gateway 渲染/route 状态、migration/seed receipt，以及 Playwright trace、截图和视频，再清理资源。
- 正常完成、失败、timeout 与可捕获的 Ctrl+C/signal 都调用同一个幂等 cleanup，只对 descriptor 中的精确 project 执行
  `docker compose -p <exact-project> down -v --remove-orphans`。Cleanup 失败必须让整次运行非零退出，不能吞掉或降级为 warning。
- CI post-job 取得同一个 descriptor/project name 后重复调用该精确 cleanup。SIGKILL、runner 崩溃或宿主断电无法由进程内
  `finally` 保证；恢复方式是按保留下来的 descriptor 显式诊断并幂等清理，而不是扫描或删除未知 project、container、network
  或 volume。

### 删除测试与首期排除项

Project-scoped orchestrator 通过删除测试：若删除，Compose project、动态端口、migration、seed、readiness、诊断和清理知识会
重新分散到两条 journey、root command 与 CI post-job。相反，当前只有一个系统拓扑和一个 Compose implementation；删除
service adapters、journey plugins、通用 readiness framework、持久 run registry、janitor、可恢复 phase state machine 或
resume/retry layer 后，复杂度不会在多个真实调用方重新出现，因此首期全部不建设。

首期也不自动清理按模糊前缀发现的陈旧资源，不执行 Docker 全局 prune，不支持任意服务组合，不把现有 process smoke harness
包装成 Docker orchestrator，也不提前决定 Gate 与兼容发布的证据契约。
