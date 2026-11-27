---
status: accepted
---

# 统一测试分层、单容器无特权沙箱与 GitHub Actions CI 权威门禁架构

仓库将测试分层、L2 资源供给、单容器开发沙箱、L3 生产容器全系统验收、根命令面以及 GitHub Actions 权威合入裁判统一收口为单一架构，取代并合并原 ADR-0009、ADR-0055 与 ADR-0056（被取代前的三篇原文可经固定基线 [`5d621a0c`](https://github.com/cyy1998/shgas-iam/tree/5d621a0ca2236a2ae2c4e6f3132c05a6671a9f97/docs/adr) 追溯）。本决定保留“按最小外部依赖归类测试、运行期间独占测试资源、确定性整体隔离优于逐用例手工防残留、PG 模板克隆与 Redis 多逻辑 DB 有界并发、以及根工具链一次性验证”等经实践验证的核心取舍，同时彻底清除 Hybrid 宿主混跑 E2E、常驻中间件互斥锁、手写前端指纹构建缓存、25 个分散测试环境变量、7 个路径门禁包装脚本以及 AFK 沙箱对宿主 `docker.sock` 与 `--network=host` 的依赖。

我们拒绝继续维护“Hybrid 宿主 E2E + 独立 Container Smoke + E2E 编排器集成自测 + 本地路径裁剪门禁”四套重叠设施，也拒绝为多沙箱并发引入宿主机特权容器（Sysbox）或编排器 Sidecar 容器编排。随着 `cyy1998/shgas-iam` 上线 GitHub-hosted Linux Runner CI 并启用 `main` Branch Protection，权威合入裁判回归远端 CI；本地与 AFK 沙箱专注轻量内循环与局部快跑，由此换取更小的维护面、更窄的安全边界与唯一的发布真值来源。

## 收集分层与根工具链

- **三层最小依赖集合与单一公开命令面**。全仓测试严格按外部依赖归类为 **Unit**（L1，纯内存，含前端 Vitest `node` / `dom` 与 Vite 代理单测，由 Turbo 编排并缓存）、**Integration**（L2，真实 PostgreSQL / Redis / APISIX / HTTP 服务或应用子进程，100% 收归 `pnpm test:integration`，不再保留孤立的 Docker 专项特例）与 **Full-system E2E**（L3，生产容器栈 + 9 个跨服务业务旅程，`pnpm test:e2e`）。面向使用者的根命令面收敛为 6 个核心入口：`pnpm check`（全部静态检查、`typecheck`、`@iam/db db:check` 与守卫）、`pnpm fix`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:e2e` 与 `pnpm verify`（本地一键全量 L1+L2：`check + test:unit + test:integration + build`），退役全部旧 `verify:*` 路径门禁包装脚本。
- **精简收集守卫与 Root 工具链一次性验证**。不维护独立 Collection Guard（唯一归属与根可达性由配置评审与实际运行核对）；根工具链、资源管理、Git hook 与静态守卫默认采用一次性行为验证，仅在 [ADR-0059](0059-adopt-native-sandcastle-afk-orchestration.md) 中为 `.sandcastle/__tests__/boundaries.test.ts` 保留窄范围常驻边界单测。

## L2 集成测试：专用端点、直接调度与前端解耦

- **基础设施供给与测试执行分离**。本地 Compose、AFK 沙箱和 CI 提前启动各自独占的测试服务。根 runner 统一通过端点环境变量消费资源，在 L2 的并发执行窗口内保持容器和网络稳定，避免宿主 `NETLINK_ROUTE` 广播中断 Chromium 请求。端点与恢复约定见[专用资源与隔离](../engineering/testing.md#专用资源与隔离)。
- **PG 模板克隆与 Redis 32 DB 槽位**。每条顶层命令仍独占所用端点。PostgreSQL 按轮建模板并按文件克隆，重置用例时只截断含数据或需重置序列的业务表。Redis 预检 `SELECT 31` 后为各并发任务注入独占 `/1`–`/31` 槽位，fixture 先停止执行者再清理。根 runner 直接启动执行器并保留有界并发、首错取消和任务日志。
- **25 变量收敛为 2 个标准变量与建模板前双保险守卫**。全仓 workspace 分散声明的 25 个 `IAM_<PKG>_TEST_(DATABASE|REDIS)_URL` 统一收敛为 `IAM_TEST_POSTGRES_URL` 与 `IAM_TEST_REDIS_URL`（各包 `iamTest.integration` 简化为布尔声明）。`requireDedicatedPostgresTestUrl()` 必须在执行 `CREATE DATABASE` 准备模板库**之前**完成双保险校验：拒绝系统库（`postgres`/`template0`/`template1`）、拒绝匹配 `DATABASE_URL` 及当前环境任意 `IAM_*_DATABASE_URL` 开发库，且要求数据库名显式包含测试标识（如 `iam_test` / `*_test`）。
- **前端测试解耦与 L1 收敛（已修订）**。本决定最初规划退役 `e2e/system/src/frontend/` 的手写文件哈希缓存与自建静态服务，改用前端 `build:test` + `vite preview` + Playwright；后续已进一步彻底移除前端 L2 Playwright（不再保留 `build:test`、`dist-test/` 与 `IAM_PW_DEV_SERVER`），`@iam/admin` 与 `@iam/sso` 的页面与路由行为统一收敛至 L1 Vitest（`node` + `dom` jsdom/RTL/MSW，及 SSO Vite 代理单测），跨服务浏览器与 Cookie 隔离统一由 L3 Full-system E2E 覆盖，见[测试与验证](../engineering/testing.md#收集与编排)。

## 方案 X：单容器预装四件套与非 root 启动

- **零 `docker.sock`、零 `--network=host`、零 Sidecar 编排**。沙箱镜像预装 PostgreSQL 18.4、Redis 8.8.0、etcd 3.5.11 与 APISIX 3.16.0，适配宿主动态 `AGENT_UID` / `AGENT_GID`。可写会话就绪时运行 [启动脚本](../../.sandcastle/start-test-infra.sh)，全部服务在容器内以非 root 用户启动，随容器回收。只读会话保留独立的挂载、凭据和网络边界。四件套增加镜像体积，由同一沙箱承担基础设施和测试进程。

## L3 Full-system E2E：生产容器栈 + 四合一 `e2e-stubs` 承接全部业务旅程

- **回归单一生产容器拓扑，整块退役 Hybrid 与独立 Container Smoke**。全部 9 个跨服务业务旅程直接在生产 Dockerfile 构建的 Docker Compose 容器栈上运行，天然覆盖生产镜像、`nginx.conf` 与 `pnpm deploy` 依赖闭包；原 `container-smoke.spec.ts` 被超集覆盖后直接退役。
- **生产镜像零侵入的四合一 `e2e-stubs` 容器**。全部测试侧替代能力集中在一个轻量 Bun 容器 `e2e-stubs` 中：① 通过 Compose 网络 `aliases: ["qyapi.weixin.qq.com"]` 与测试自签 CA（仅挂载给 `auth-api` 容器并设 `NODE_EXTRA_CA_CERTS`）拦截企微 HTTPS 请求；② 通过既有 `IAM_AUTH_API_SMS_URL` 接收短信并在内存中缓存，由测试通过 `GET /_stubs/sms` 轮询读取（免除宿主共享文件与 bind-mount）；③ 承载 `gateway-sync.ts` 指向的 RP 回调终端页 `/portal/e2e-rp.html`（不侵入生产 `sso` 镜像）；④ 暴露 `POST /_stubs/reset` 随整库复位清空状态。
- **静态 Compose 与原地复位**。拓扑由 [Compose 文件](../../e2e/system/docker-compose.e2e.yml) 声明，构建交给 Compose，CI 仅在构建时叠加 GHA 缓存配置。本地可复用 `iam-e2e-*:local` 镜像。每轮迁移后由运行时进程完成 seed 并等待 Worker 发布 User Documents，再一次性保存 PostgreSQL 与 Redis 快照。后续 spec、重试或重复执行由单个 Playwright worker 原地恢复两份快照并重置桩状态。容器和已发布的 APISIX 路由贯穿整轮。既有连接会经历数据切换，因此这一模式依赖单 worker 串行执行及每轮资源独占。失败通过 Playwright 原生留证和E2E Compose 日志定位。

## GitHub Actions CI 权威合入门禁

- **公开仓库安全默认与严格真值表 `ci-gate`**。`.github/workflows/ci.yml` 运行于 GitHub-hosted `ubuntu-latest`（避免公开 PR 触达持久自建机），顶层锁定 `permissions: { contents: read }`、`pnpm install --frozen-lockfile`、PR CI 零真实外部 Secret 与脱敏产物白名单（`retention-days: 7`），按 PR 编号 `cancel-in-progress: true`。流程分为 `detect` → 纯文档走 `doc-check`，代码/配置变更并行走 `fast`（`check + test:unit + build`）与 `integration`（通过 `pnpm test:infra:up` 从 `scripts/test-resources/compose.yaml` 启动 PG 18.4、Redis 8.8 `--databases 32`、etcd 3.5.11 与 APISIX 3.16.0，配 `if: always()` `pnpm test:infra:down` 拆除，以并发上限 `2` 运行全量 `pnpm test:integration`）→ Ready PR 与 `main` 接续 `e2e`（生产容器栈 + 9 个业务旅程）→ 最终由 `ci-gate`（`if: always()`，`needs` 全部上游 Job）按严格真值表汇总唯一 Required Check（Draft PR 跳过 `e2e` 时不得绿灯），配合 Branch Protection 的 `Require branches to be up to date before merging` 成为合入 `main` 的唯一权威裁判。

本决定属工程测试与 CI 基础设施架构，不涉及 IAM 业务领域概念，不修改 [`GLOSSARY.md`](../../GLOSSARY.md)。

[纯 Linux 运行面](0058-standardize-development-and-runtime-tooling-on-linux.md) · [原生 Sandcastle AFK 编排](0059-adopt-native-sandcastle-afk-orchestration.md) · [测试与验证](../engineering/testing.md)
