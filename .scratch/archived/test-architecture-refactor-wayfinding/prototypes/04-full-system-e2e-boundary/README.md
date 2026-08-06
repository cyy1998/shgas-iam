# PROTOTYPE — Full-system E2E 最小系统边界

这是 ticket「收敛 Full-system E2E 的最小系统边界」的可丢弃讨论草图，不是 production、test 或 tooling 实现。

## Question

首期同时交付 Admin Custom SSO 与独立 OIDC Authorization Code + PKCE 两条 journey 时，生命周期应该散落在
Playwright hooks 中、集中在 project-scoped 的一次性 orchestrator 中，还是抽象成可插拔 E2E 平台？哪一种形状能以单一
Gateway origin、真实自有 runtimes、可靠诊断与精确清理形成最低可交付系统，又不会预建尚无第二调用方的 interface？

## Run

```text
node .scratch/archived/test-architecture-refactor-wayfinding/prototypes/04-full-system-e2e-boundary/prototype.mjs
```

非交互快照：

```text
node .scratch/archived/test-architecture-refactor-wayfinding/prototypes/04-full-system-e2e-boundary/prototype.mjs --snapshot
```

交互键：`1`/`2`/`3` 切换候选，`n` 切换观察场景，`q` 退出。每次切换都会完整重绘 ownership、flow、
interface、失败恢复与删除测试。

## Discussion baseline

- 浏览器、Playwright 和 host-side orchestrator 只看见 `http://127.0.0.1:<dynamic-gateway-port>`；redirect URI、issuer、
  外部 SSO origin 与 host-only Cookie 都以这个完整 `scheme + host + port` 为准。
- Gateway manifest 渲染 `IAM_SSO_INTERNAL_HOST=127.0.0.1` 与 `IAM_SSO_EXTERNAL_HOST=127.0.0.1`。首期不依赖
  `*.localhost` 的运行时特殊解析、hosts 文件或浏览器 `host-resolver-rules`。
- PostgreSQL、Redis、etcd、APISIX，以及 API、Admin API、OIDC Provider、Worker、Admin、SSO 均属于共享系统启动 gate。
- 两条 journey 不 mock 所经过的本仓库核心 runtime；CAPTCHA、短信、邮件、分析和 test-owned OIDC RP callback 可以关闭或替代。
- 推荐候选只有一个长期 root interface：`pnpm test:e2e`。内部 lifecycle 固定，不暴露 service adapter、journey plugin、
  通用 seed DSL、持久 phase state machine 或全局 janitor。
- 中断恢复只接受精确 run descriptor/project name；不扫描或删除未知 Compose project、volume、container 或网络。

## Recommended candidate B contract

1. E2E workspace 先写入带唯一 Compose project name、动态 Gateway port、canonical origin 和 artifact directory 的 run
   descriptor，再创建任何资源。
2. 只启动 PostgreSQL、Redis、etcd 与 APISIX；等待协议 health 后显式运行真实 migrations。当前 dev Compose 没有
   migration/init/seed step，不能把已有 volume 当作前置条件。
3. 一个 E2E-local one-shot seed Module 形成 active admin subject、密码、组织/任职/角色、Custom SSO client 与公开 OIDC
   PKCE client。数据库写入留在 production repository/Drizzle seam，Redis 状态继续通过各 production owner 建立；不公开
   seed DSL，不复制 key、serialization、TTL 或 Lua。
4. 启动 API、Admin API、OIDC Provider、Worker、Admin 与 SSO，把两个 Gateway SSO host variables 都渲染为
   `127.0.0.1`，再分别验证容器内 readiness 与 canonical origin 上的外部 routes。浏览器只走 `/iam-admin`、`/portal`、
   `/sso/*`、`/api/iam/*` 和 `/oidc/*` 等现有 route families；直连 app/APISIX admin ports 只用于诊断。
5. Admin journey 从 `/iam-admin` 经 `/sso/authorize`、`/portal/login`、`/api/iam/auth/login/password`、
   `/sso/callback` 返回 Admin，再通过真实 `/api/iam/rpc` 配置并读回 seeded client 的 Custom SSO 状态。
6. OIDC journey 以 test-owned RP 生成 S256 verifier/challenge，经 `/oidc/auth`、真实 SSO/API password login 与
   `/oidc/resume` 获得 code，再验证真实 token 与 `/oidc/me`。issuer、registered redirect URI 与 callback 都使用完整的
   `http://127.0.0.1:<dynamic-gateway-port>`；RP callback 可以由 journey-local helper 接住，因为它不是 repo-owned core
   runtime。
7. CAP 显式关闭，journeys 不选择 SMS、WeChat 或外部身份源；Custom SSO seed 使用 `orcas.enabled=false`。HTTP 本地运行时
   OIDC interaction Cookie 显式 `Secure=false`，其 `Path=/oidc` 及其他 host-only/SameSite 行为保持 production contract。
8. 任一阶段失败先保存 bounded logs、Compose ps/health、Gateway 渲染状态、migration/seed receipt 与 Playwright artifacts，
   再只对 descriptor 中的精确 project 执行 `down -v --remove-orphans`。Ctrl+C 与 CI post-job 复用同一幂等 cleanup；首期不做
   自动 janitor、透明 resume 或跨 run registry。

## Evidence pointers

- ticket 与完整问题：`../../issues/04-scope-full-system-e2e-mvp.md`
- map 中的固定约束：`../../map.md`
- 当前测试资源与 readiness 规则：`../../../../docs/architecture/testing-architecture.md`
- 当前 dev stack：`../../../../docker/docker-compose-dev.yml`
- 当前 Gateway routes：`../../../../gateway/manifests/dev/iam.yaml`
- SSO host 约束：`../../../../gateway/README.md`
- Admin auth 入口：`../../../../apps/admin/src/utils/auth.ts`
- API Custom SSO/Cookie：`../../../../apps/api/src/routes/sso/sso.handlers.ts`
- OIDC interaction：`../../../../apps/oidc-provider/src/interaction/handler.ts`
- 原始调查交接：`%TEMP%/iam-service-testing-architecture-handoff-1e181eee.md`
- 外部审阅：`%USERPROFILE%/Downloads/test-architecture-review.md`
