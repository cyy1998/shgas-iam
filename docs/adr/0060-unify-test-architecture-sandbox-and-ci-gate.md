---
status: accepted
---

# 统一测试分层、单容器无特权沙箱与 GitHub Actions CI 权威门禁架构

仓库将测试分层、L2 资源供给、单容器开发沙箱、L3 生产容器全系统验收、根命令面以及 GitHub Actions 权威合入裁判统一收口为单一架构，取代并合并原 ADR-0009、ADR-0055 与 ADR-0056（被取代前的三篇原文可经固定基线 [`5d621a0c`](https://github.com/cyy1998/shgas-iam/tree/5d621a0ca2236a2ae2c4e6f3132c05a6671a9f97/docs/adr) 追溯）。本决定保留“按最小外部依赖归类测试、每条顶层命令独占即毁、确定性整体隔离优于逐用例手工防残留、PG 模板克隆与 Redis 多逻辑 DB 有界并发、以及根工具链一次性验证”等经实践验证的核心取舍，同时彻底清除 Hybrid 宿主混跑 E2E、常驻中间件互斥锁、手写前端指纹构建缓存、25 个分散测试环境变量、7 个路径门禁包装脚本以及 AFK 沙箱对宿主 `docker.sock` 与 `--network=host` 的依赖。

我们拒绝继续维护“Hybrid 宿主 E2E + 独立 Container Smoke + E2E 编排器集成自测 + 本地路径裁剪门禁”四套重叠设施，也拒绝为多沙箱并发引入宿主机特权容器（Sysbox）或编排器 Sidecar 容器编排。随着 `cyy1998/shgas-iam` 上线 GitHub-hosted Linux Runner CI 并启用 `main` Branch Protection，权威合入裁判回归远端 CI；本地与 AFK 沙箱专注轻量内循环与局部快跑，由此换取更小的维护面、更窄的安全边界与唯一的发布真值来源。

## 收集分层与根工具链

- **三层最小依赖集合与单一公开命令面**。全仓测试严格按外部依赖归类为 **Unit**（L1，纯内存，由 Turbo 编排并缓存）、**Integration**（L2，真实 PostgreSQL / Redis / APISIX / 进程 / 浏览器，100% 收归 `pnpm test:integration`，不再保留孤立的 Docker 专项特例）与 **Full-system E2E**（L3，生产容器栈 + 9 个跨服务业务旅程，`pnpm test:e2e`）。面向使用者的根命令面收敛为 6 个核心入口：`pnpm check`（全部静态检查、`typecheck`、`@iam/db db:check` 与守卫）、`pnpm fix`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:e2e` 与 `pnpm verify`（本地一键全量 L1+L2：`check + test:unit + test:integration + build`），退役全部旧 `verify:*` 路径门禁包装脚本。
- **精简收集守卫与 Root 工具链一次性验证**。不维护独立 Collection Guard（唯一归属与根可达性由配置评审与实际运行核对）；根工具链、资源管理、Git hook 与静态守卫默认采用一次性行为验证，仅在 [ADR-0059](0059-adopt-native-sandcastle-afk-orchestration.md) 中为 `.sandcastle/__tests__/boundaries.test.ts` 保留窄范围常驻边界单测。

## L2 集成测试：窄 Provider 边界、统一环境变量与前端解耦

- **基础设施供给与测试执行分离**。L2 并发执行窗口内严禁任何测试代码动态创建或销毁 Docker 容器与网络（根治宿主机 `NETLINK_ROUTE` 抖动）。根集成 runner（`scripts/run-test-integration.mjs`）以单一窄 `ResourceProvider` 接口收敛三种供给形态，通过显式 `IAM_TEST_RESOURCE_PROVIDER=docker|native|external` 选择（本地默认 `docker`，AFK 沙箱固定注入 `native`，GitHub Actions CI 固定注入 `external`）；处于 `external` 模式或检测到任意外置端点变量时严格校验必需服务完整性，禁止半外置混用或静默回退 Docker。
- **每命令独占即毁、PG 模板克隆与 Redis 32 DB 槽位**。每条顶层集成命令独占一套资源与扁平记录 `run.json`（淘汰 `children.jsonl` 与 `IAM_GATEWAY_TEST_APISIX_RECORD`）。PostgreSQL 在跑测试前一次性执行全量迁移并封存只读模板库 `iam_test_template`，业务测试通过 `@iam/test-support` 共享的 `createDrizzlePostgresTestHarness()` 按文件克隆独立库并在用例间动态 `TRUNCATE`；Redis 显式开启 `--databases 32 --save "" --appendonly no` 并在预检阶段实测 `/31` 可选，由根 runner 为每个并发子任务注入独占 `/1`–`/31` 槽位。根 runner 继续负责有界并发调度（默认 3，重度优先、首错取消与独立任务日志），直接删除 `turbo.json` 中闲置的 `test:integration:*` 配置，让 Turbo 专注带缓存任务（`build`、`build:test`、`typecheck`、`test:unit`）。
- **25 变量收敛为 2 个标准变量与建模板前双保险守卫**。全仓 workspace 分散声明的 25 个 `IAM_<PKG>_TEST_(DATABASE|REDIS)_URL` 统一收敛为 `IAM_TEST_POSTGRES_URL` 与 `IAM_TEST_REDIS_URL`（各包 `iamTest.integration` 简化为布尔声明）。`requireDedicatedPostgresTestUrl()` 必须在执行 `CREATE DATABASE` 准备模板库**之前**完成双保险校验：拒绝系统库（`postgres`/`template0`/`template1`）、拒绝匹配 `DATABASE_URL` 及当前环境任意 `IAM_*_DATABASE_URL` 开发库，且要求数据库名显式包含测试标识（如 `iam_test` / `*_test`）。
- **前端 L2 去手写缓存与零反向依赖**。退役 `e2e/system/src/frontend/` 的手写文件哈希缓存与自建静态服务。`@iam/admin` 与 `@iam/sso` 新增独立的 Turbo 缓存任务 `build:test`（输出至 `dist-test/`，不污染生产 `dist/`；`@iam/sso` 在脚本内固化测试登录公钥，`turbo.json` 纳入 `IAM_*_WEB_*` 缓存键），Playwright `webServer` 改用 `vite preview --outDir dist-test --host 127.0.0.1 --port <动态端口>`（`@iam/sso` 同步补齐 `configurePreviewServer` 重定向并保留 `IAM_PW_DEV_SERVER=1` 调试开关），彻底切断前端 L2 对 `e2e/system` 的反向依赖并消除固定端口冲突。

## 方案 X：单容器预装四件套与非 root 按轮启停进程

- **零 `docker.sock`、零 `--network=host`、零 Sidecar 编排**。`.sandcastle/Dockerfile`（Debian 12 Bookworm）精准预装 `postgresql-18`（18.4）、`redis 8.8.0`、`etcd 3.5.11` 与 `apisix=3.16.0-0`（移除沙箱内 Docker CLI / Compose 插件），适配宿主动态 `AGENT_UID` / `AGENT_GID` 权限。容器内禁止常驻数据库或中间件服务；`native` Provider 复用 `packages/runtime/src/process/owned-process-tree.mjs` 与 `scripts/test-resources/owned-command.mjs`，在每条顶层集成命令启动时按需于每轮独立 `/tmp` 临时目录拉起非 root 进程（PG 启用 `fsync=off`/`synchronous_commit=off`/`full_page_writes=off` 借助 Linux page cache 提速、规避容器默认 64MB `/dev/shm` 限制；APISIX 动态覆写 `127.0.0.1` 回环监听与本地 etcd 地址；仅选 PG 任务时不启 APISIX），命令退出或中断后终止整个所属进程树并销毁临时目录。代价是构建沙箱镜像体积增大且需同步维护四件套精确版本，换取 AFK 编排器永久只管理单容器、同沙箱多轮重跑零脏态以及可随时回退至外部供给的可逆边界。

## L3 Full-system E2E：生产容器栈 + 四合一 `e2e-stubs` 承接全部业务旅程

- **回归单一生产容器拓扑，整块退役 Hybrid 与独立 Container Smoke**。全部 9 个跨服务业务旅程直接在生产 Dockerfile 构建的 Docker Compose 容器栈上运行，天然覆盖生产镜像、`nginx.conf` 与 `pnpm deploy` 依赖闭包；原 `container-smoke.spec.ts` 被超集覆盖后直接退役。
- **生产镜像零侵入的四合一 `e2e-stubs` 容器**。全部测试侧替代能力集中在一个轻量 Bun 容器 `e2e-stubs` 中：① 通过 Compose 网络 `aliases: ["qyapi.weixin.qq.com"]` 与测试自签 CA（仅挂载给 `auth-api` 容器并设 `NODE_EXTRA_CA_CERTS`）拦截企微 HTTPS 请求；② 通过既有 `IAM_AUTH_API_SMS_URL` 接收短信并在内存中缓存，由测试通过 `GET /_stubs/sms` 轮询读取（免除宿主共享文件与 bind-mount）；③ 承载 `gateway-sync.ts` 指向的 RP 回调终端页 `/portal/e2e-rp.html`（不侵入生产 `sso` 镜像）；④ 暴露 `POST /_stubs/reset` 随整库复位清空状态。
- **静态 Compose 与原地复位**。拓扑由 [Compose 文件](../../e2e/system/docker-compose.e2e.yml) 声明，构建交给 Compose，CI 仅在构建时叠加 GHA 缓存配置。本地可复用 `iam-e2e-*:local` 镜像。每轮迁移后由运行时进程完成 seed 并等待 Worker 发布 User Documents，再一次性保存 PostgreSQL 与 Redis 快照。后续 spec、重试或重复执行由单个 Playwright worker 原地恢复两份快照并重置桩状态。容器和已发布的 APISIX 路由贯穿整轮。既有连接会经历数据切换，因此这一模式依赖单 worker 串行执行及每轮资源独占。失败通过 Playwright 原生留证和共享资源日志定位。

## GitHub Actions CI 权威合入门禁

- **公开仓库安全默认与严格真值表 `ci-gate`**。`.github/workflows/ci.yml` 运行于 GitHub-hosted `ubuntu-latest`（避免公开 PR 触达持久自建机），顶层锁定 `permissions: { contents: read }`、`pnpm install --frozen-lockfile`、PR CI 零真实外部 Secret 与脱敏产物白名单（`retention-days: 7`），按 PR 编号 `cancel-in-progress: true`。流程分为 `detect` → 纯文档走 `doc-check`，代码/配置变更并行走 `fast`（`check + test:unit + build`）与 `integration`（原生 `services:` PG 18.4 + Redis 8.8 `--databases 32` + 前置 step 启 `apisix.compose.yaml` 配 `if: always()` 拆除，全量 197 文件）→ Ready PR 与 `main` 接续 `e2e`（生产容器栈 + 9 个业务旅程）→ 最终由 `ci-gate`（`if: always()`，`needs` 全部上游 Job）按严格真值表汇总唯一 Required Check（Draft PR 跳过 `e2e` 时不得绿灯），配合 Branch Protection 的 `Require branches to be up to date before merging` 成为合入 `main` 的唯一权威裁判。

本决定属工程测试与 CI 基础设施架构，不涉及 IAM 业务领域概念，不修改 [`GLOSSARY.md`](../../GLOSSARY.md)。

[纯 Linux 运行面](0058-standardize-development-and-runtime-tooling-on-linux.md) · [原生 Sandcastle AFK 编排](0059-adopt-native-sandcastle-afk-orchestration.md) · [测试与验证](../engineering/testing.md)
