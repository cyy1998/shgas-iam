---
status: accepted
---

# 统一测试分层、单容器无特权沙箱与 GitHub Actions CI 权威门禁架构

本决定整合测试分层、L2 资源供给、单容器开发沙箱、L3 生产容器全系统验收、根命令面与 GitHub Actions 合入门禁，取代并合并原 ADR-0009、ADR-0055 与 ADR-0056（原文见固定基线 [`5d621a0c`](https://github.com/cyy1998/shgas-iam/tree/5d621a0ca2236a2ae2c4e6f3132c05a6671a9f97/docs/adr)）。

既有取舍继续保留：按最小外部依赖归类测试、顶层命令独占测试资源、整体隔离优于逐用例防残留、PostgreSQL 模板克隆与 Redis 多逻辑 DB 有界并发，以及根工具链默认一次性验证。同时移除 Hybrid 宿主混跑 E2E、常驻中间件互斥锁、手写前端指纹构建缓存、分散的 25 个包级测试环境变量、路径门禁包装脚本，以及 AFK 沙箱对宿主 `docker.sock` 与 `--network=host` 的依赖。

我们不再并行维护 Hybrid 宿主 E2E、独立 Container Smoke、E2E 编排器集成自测与本地路径裁剪门禁，也不为多沙箱并发引入宿主机特权容器（Sysbox）或编排器 Sidecar 容器。随着仓库启用 GitHub-hosted Linux Runner CI 与 `main` Branch Protection，合入裁判交由远端 CI 承担，本地与 AFK 沙箱专注轻量内循环与局部快跑，以此换取更小的维护面与更窄的安全边界。

## 收集分层与根工具链

- **三层最小依赖集合**。全仓测试按外部依赖分为三层：
  - **Unit（L1）**：纯内存测试（含前端 Vitest `node` / `dom` 与 Vite 代理单测），由 Turbo 编排并缓存。
  - **Integration（L2）**：依赖真实 PostgreSQL、Redis、APISIX、HTTP 服务或应用子进程的测试，全部归入 `pnpm test:integration`，不再保留孤立的 Docker 特例。
  - **Full-system E2E（L3）**：运行在生产容器栈上的 9 个跨服务业务旅程（`pnpm test:e2e`）。
- **根命令面**。面向使用者的入口缩减为 `pnpm check`、`pnpm fix`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:e2e` 与 `pnpm verify`（本地 L1+L2 全量组合），退役全部旧 `verify:*` 路径门禁包装脚本。各命令定义见[命令入口](../engineering/commands.md)。
- **收集校验与根工具链验证**。不维护独立 Collection Guard，归属唯一性与根可达性通过配置评审和实际运行核对。根工具链、资源管理、Git hook 与静态守卫默认采用一次性行为验证，仅按 [ADR-0059](0059-adopt-native-sandcastle-afk-orchestration.md) 为 `.sandcastle/__tests__/boundaries.test.ts` 保留窄范围常驻边界单测。

## L2 集成测试：专用端点、直接调度与前端解耦

- **基础设施供给与测试执行分离**。本地 Compose、AFK 沙箱和 CI 提前启动各自独占的测试服务，根 runner 统一经端点环境变量消费。L2 并发窗口内保持容器和网络稳定，避免宿主 `NETLINK_ROUTE` 广播中断 Chromium 请求。端点与恢复约定见[专用资源与隔离](../engineering/testing.md#专用资源与隔离)。
- **PG 模板克隆与 Redis 32 DB 槽位**。每条顶层命令独占所用端点。PostgreSQL 按轮建模板并按文件克隆，重置用例时只截断含数据或需重置序列的业务表；Redis 预检 `SELECT 31` 后为各并发任务分配独占 `/1`–`/31` 槽位，fixture 先停止执行者再清理。根 runner 直接调度执行器，保留有界并发、首错取消和任务日志。
- **统一测试环境变量与建模板前守卫**。全仓原 25 个 `IAM_<PKG>_TEST_(DATABASE|REDIS)_URL` 合并为 `IAM_TEST_POSTGRES_URL` 与 `IAM_TEST_REDIS_URL`，各包 `iamTest.integration` 简化为布尔声明。`requireDedicatedPostgresTestUrl()` 在执行 `CREATE DATABASE` 准备模板库之前先校验：拒绝系统库（`postgres`/`template0`/`template1`）、拒绝匹配 `DATABASE_URL` 或任意 `IAM_*_DATABASE_URL` 开发库，并要求库名显式包含测试标识（如 `iam_test` 或 `*_test`）。
- **前端测试归入 L1**。退役前端 L2 Playwright、手写构建指纹缓存与自建静态服务（不保留 `build:test`、`dist-test/` 与 `IAM_PW_DEV_SERVER`）。`@iam/admin` 与 `@iam/sso` 的页面和路由行为由 L1 Vitest（`node` + `dom` jsdom/RTL/MSW 及 SSO Vite 代理单测）覆盖，跨服务浏览器与 Cookie 隔离由 L3 Full-system E2E 覆盖，见[测试与验证](../engineering/testing.md#收集与编排)。

## 方案 X：单容器预装四件套与非 root 启动

- **无特权单容器供给测试服务**。沙箱镜像预装 PostgreSQL、Redis、etcd 与 APISIX，不再挂载宿主 `docker.sock`、不使用 `--network=host`，也不引入编排器 Sidecar。容器适配宿主动态 `AGENT_UID` / `AGENT_GID`，可写会话就绪时运行[启动脚本](../../.sandcastle/start-test-infra.sh)以非 root 用户在容器内拉起服务，退出随容器回收；只读会话保留独立的挂载、凭据和网络边界。代价是沙箱镜像体积增大，且基础设施与测试进程共享同一容器。

## L3 Full-system E2E：生产容器栈与 `e2e-stubs`

- **单一生产容器拓扑**。全部 9 个跨服务业务旅程直接在生产 Dockerfile 构建的 Docker Compose 容器栈上运行，一并验证生产镜像、`nginx.conf` 与 `pnpm deploy` 依赖闭包。原 Hybrid 拓扑与独立 `container-smoke.spec.ts` 随之退役。
- **不侵入生产镜像的 `e2e-stubs` 容器**。测试侧替代能力集中在一个轻量 Bun 容器 `e2e-stubs` 中：
  - 通过 Compose 网络 `aliases: ["qyapi.weixin.qq.com"]` 与测试自签 CA（仅挂载给 `auth-api` 并配置 `NODE_EXTRA_CA_CERTS`）拦截企微 HTTPS 请求；
  - 通过既有 `IAM_AUTH_API_SMS_URL` 接收短信并在内存中缓存，由测试经 `GET /_stubs/sms` 轮询读取，免去宿主共享文件与 bind-mount；
  - 承载 `gateway-sync.ts` 指向的 RP 回调终端页 `/portal/e2e-rp.html`，避免向生产 `sso` 镜像注入测试页；
  - 提供 `POST /_stubs/reset` 随整库复位清空状态。
- **静态 Compose 与原地复位**。拓扑由 [Compose 文件](../../e2e/system/docker-compose.e2e.yml)声明，构建交由 Compose（CI 叠加 GHA 缓存配置，本地可复用 `iam-e2e-*:local` 镜像）。每轮迁移后由运行时进程完成 seed 并等待 Worker 发布 User Documents，保存一次 PostgreSQL 与 Redis 快照；后续 spec、重试或重复执行由单个 Playwright worker 原地恢复两份快照并重置桩状态，容器和已发布的 APISIX 路由贯穿整轮。因既有连接会经历数据切换，此模式依赖单 worker 串行执行与每轮资源独占。失败通过 Playwright 原生留证与 E2E Compose 日志定位。

## GitHub Actions CI 合入门禁

- **公开仓库安全默认**。[CI workflow](../../.github/workflows/ci.yml) 运行在 GitHub-hosted `ubuntu-latest`，避免公开 PR 触达持久自建机。顶层锁定只读 `contents` 权限、`pnpm install --frozen-lockfile`、PR CI 不注入真实外部 Secret、只上传脱敏产物并按 PR 编号取消旧运行。
- **分级 Job 与 `ci-gate` 汇总**。`detect` 按变更范围分流：纯文档走 `doc-check`，代码或配置变更并行执行 `fast`（`check + test:unit + build`）与 `integration`（经 `pnpm test:infra:up` 拉起独立测试服务并在 `always()` 中拆除）；Ready PR 与 `main` 接续运行 `e2e`。各阶段参数与服务版本以 [CI workflow](../../.github/workflows/ci.yml) 与[命令入口](../engineering/commands.md)为准。
- **单一 Required Check**。`ci-gate`（`if: always()`，`needs` 全部上游 Job）作为 `main` Branch Protection 的必填检查（Draft PR 跳过 `e2e` 时不得通过），配合 `Require branches to be up to date before merging` 判定合入资格。

[纯 Linux 运行面](0058-standardize-development-and-runtime-tooling-on-linux.md) · [原生 Sandcastle AFK 编排](0059-adopt-native-sandcastle-afk-orchestration.md) · [测试与验证](../engineering/testing.md)
