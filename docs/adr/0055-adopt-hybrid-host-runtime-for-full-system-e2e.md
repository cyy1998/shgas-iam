---
status: accepted
---

# 采用混合宿主运行时的 Full-system E2E 架构

Full-system E2E（`pnpm test:e2e`）改用 **Hybrid 混合拓扑**作为默认且唯一的全量业务旅程验证形态：Docker 仅承载 4 个基础中间件（`postgres`、`redis`、`apisix-etcd`、`apisix`），6 个仓库应用（`api`、`admin-api`、`worker`、`gateway-api`、`admin`、`sso`）及 `migrate`/`seed`/`gateway-sync` 直接在当前执行环境（宿主机或 AFK 沙盒）作为原生进程/脚本运行，由真实 APISIX 转发双入口流量。本决定修订 [ADR-0009](0009-adopt-canonical-test-collections.md#资源生命周期与验证取舍) 中 Full-system E2E 的全容器构建与单次命令独占边界，保留其“确定性整体隔离优于逐项保护共享环境”的核心取舍。

原有 10 容器全量串行构建每次冷启动耗时 54–117 秒，宿主 Windows 提交内存余量在浏览器阶段最低降至约 171 MB，且外层三段式编排遇错即停、无法单独重跑或使用 `--last-failed`，显著拖慢人工与 AI 调试循环。我们拒绝继续在业务 E2E 中每次支付 10 镜像构建成本，也拒绝同时维护两套全量 9-spec 业务 E2E；由此带来的代价是业务 E2E 不再直接覆盖生产 Dockerfile、`nginx.conf` 与 `pnpm deploy` 依赖闭包，这部分打包验证改由独立、低频的 Container Smoke 承担。

## 双模式生命周期、模板指纹与整库复位

- **本地常驻中间件 + 随命令启停业务进程**。本地默认复用常驻的 4 容器中间件栈（含 PG 模板库与固定 APISIX 路由），通过 `pnpm test:e2e:down` 显式回收。宿主机 4 个 Bun 业务进程（`api`、`admin-api`、`worker`、`gateway-api`）随每次 `pnpm test:e2e` 自动拉起、命令结束自动退出（启动约 1–2 秒），确保后端代码改动无需手动重启或热重载即可直接生效，同时避免后台常驻占用宿主内存与持有 PG 连接。
- **同宿主互斥保护与 CI/AFK 独占即毁**。遵循同宿主串行验证约束，本地常驻中间件栈通过互斥锁文件（记录持有者 PID、worktree 路径与启动时间，确认进程已死后可自动接管）防止多终端或多 worktree 误并发互相 `FLUSHDB`；冲突时立即失败并报告占用者，避免在共享常驻栈上叠加多套动态路由与 Redis 分库复杂度。在 `CI=true`、Sandcastle AFK 或显式传入 `--fresh` 时，自动切换为独立动态端口独占环境并在结束时精确回收。
- **带指纹的 PG 模板库**。PostgreSQL 模板库命名包含 `migrations` 与 `seed` 相关输入的内容指纹（如 `iam_e2e_tpl_<hash>`）。复用常驻 PG 时先核对当前指纹：目标模板库存在则直接复用，不存在（例如切换至包含新 migration 或改动 seed 的分支）则从空库重新执行 `migrate + seed` 建立新模板并清理旧指纹模板库，避免跨分支复用过期基线。
- **按 spec 文件边界的自动整库复位与停止语义**。沿用 [ADR-0009](0009-adopt-canonical-test-collections.md)“拒绝逐用例手工防残留、接受同环境单 worker 串行（`workers: 1`）”的取舍。外层编排器（或 `globalSetup`）在 `127.0.0.1` 暴露内部控制端点，负责执行**停后端进程 → `DROP/CREATE DATABASE FROM TEMPLATE` + Redis `FLUSHDB` 并重建基础 Redis key → 起后端进程**；Playwright 通过 `{ scope: "test", auto: true }` fixture 跟踪当前 `testInfo.file`，每进入一个新的 `.spec.ts` 文件自动调用该控制端点完成整库复位（同文件内多条用例共享同一干净基线，无需各 spec 手工声明，也不扩展 Architecture Guard 扫描测试文件）。复位停止后端进程（含 `worker`）时，先发送终止信号并在短超时预算（3–5 秒）内等待所属进程树退出，超时后强杀；因随后立即整库重建与 `FLUSHDB`，复位阶段不等待 `worker` 排空队列，以快速释放 PG 连接、清空进程内状态且不向生产代码注入测试专用端点。

## 前端托管与独立缓存

- **默认预构建静态托管，按需切 Vite dev**。默认使用极简宿主机 Bun 静态服务托管预构建前端产物（提供 `/iam-admin/`、`/portal/` 的 SPA history fallback 与 `/portal/e2e-rp.html` 终端页），并提供 `--dev-frontend` 参数按需切换 Vite dev server。
- **独立输出目录与内容指纹跳过**。由于 [turbo.json](../../turbo.json) 的 `build` 任务未将 `IAM_*_WEB_*` 纳入缓存输入，E2E 前端构建必须输出到独立目录 `e2e/system/.cache/frontend/{admin,sso}`，严禁覆写 `apps/*/dist` 或污染 Turbo 生产构建缓存。`e2e/system/.cache` 与 `e2e/system/.reports` 均受 `.gitignore` 与 `.dockerignore` 保护。构建前为每个前端计算确定性输入指纹（覆盖该 app 源码、其 workspace 传递依赖源码、`pnpm-lock.yaml` 与 E2E 静态 `IAM_*_WEB_*` 环境变量）并写入 `.build-fingerprint.json`；指纹命中且输出产物完好时 ~0 秒跳过 `vite build`，发生变更时仅重编受影响的单个前端。

## 原生 Playwright 入口与聚合失败摘要

- **原生入口直连透传与参数剥离**。根目录 `pnpm test:e2e` 改为直连 `@iam/e2e-system`（绕过 `turbo test:e2e` 包装），原生支持单文件、`-g`、`--last-failed`、`-x`、`--ui` 等 Playwright 参数，并新增 `pnpm test:e2e:down` 与 `pnpm test:e2e:container-smoke`。包装脚本向 Playwright CLI 透传参数前，必须先显式解析并剥离 E2E 专属开关（`--fresh`、`--dev-frontend`、`--keep`，尊重 `--` 透传边界），避免触发 Playwright 未知参数错误；其中 `--keep` 用于失败后保留本次数据库、日志与调试现场并输出精确恢复/清理命令。
- **编排收口与旧脚本退场**。移除 `admin:journey`、`hr-admin:journey`、`oidc:journey` 与 `runtime:lifecycle` 外层三段式壳命令；将 `hr-admin` 的后置数据库与拒绝日志校验内聚回 [hr-admin-user-management.spec.ts](../../e2e/system/hr-admin-user-management.spec.ts)。托管环境验收 [managed-hosting.spec.ts](../../e2e/system/managed-hosting.spec.ts) 保持独立入口；紧急恢复保留 `runtime:cleanup`，与 `pnpm test:e2e:down` 共用底层精确清理。
- **独立报告目录与自定义 Reporter 聚合**。默认跑完全部选中的 spec（首错即停按需通过 `-x` / `--max-failures=1` 启用；非 TTY/Agent 环境默认采用紧凑 `line` 进度输出）。Playwright 的 `outputDir` 仅存放其每次运行开始时可被清空的临时产物（`trace.zip`、截图、视频）；持久化失败摘要写入 `outputDir` 之外的 `e2e/system/.reports/<runId>/`（同时生成 `failure-summary.md` 与 `failure-summary.json`），并同步更新 `e2e/system/.reports/last-failure.md` / `last-failure.json` 指向本轮完整汇总。聚合由**自定义 Playwright Reporter**（`onTestEnd` / `onEnd`）统一完成并在 stdout 末尾打印摘要绝对路径，fixture 仅负责通过 `testInfo.attach()` 挂载用例起止时间窗、浏览器 `console.error`/`pageerror` 与 HTTP/tRPC ≥400 请求响应摘要；同期后端与 APISIX 的 `warn`/`error` 日志过滤健康检查噪音，每服务设行数上限（如 200 行）并对重复错误行折叠去重，确保单次运行汇总全部失败且不淹没上下文。

## Sandcastle AFK（DooD）与跨平台连通模式

- **零宿主机 bind-mount**。`postgres`、`redis`、`apisix-etcd` 使用官方镜像与命名卷（`apisix-etcd` 参照 [Gateway APISIX 测试配置](../../apps/gateway/test-integration/support/apisix.compose.yaml) 使用 `entrypoint: ["etcd"]` 与 1 秒健康检查）。`apisix` 保留极薄 2 行 `apisix.Dockerfile`（`FROM` + `COPY apisix.yaml`）并将 `build.context` 收窄至仅含配置资产的子目录（不扫描 monorepo 根，构建耗时低于 1 秒），确保在 Sandcastle AFK 的 Docker-outside-of-Docker（DooD）环境中无宿主机路径映射问题。
- **按环境选择连通模式，业务进程始终仅绑 `127.0.0.1`**（**已由 [ADR-0058](0058-standardize-development-and-runtime-tooling-on-linux.md) 修订**：随着开发与运行面收敛至纯 Linux，下方 Docker Desktop Windows / macOS 的 `bridge` + `host.docker.internal` 分支及 Windows 本机三场景验收要求已退役，统一仅保留 `network_mode: host` + `127.0.0.1` 单一连通模式）。我们放弃“全平台绑定 `0.0.0.0` + `host-gateway`”的单一方案——在 Windows 本机绑定 `0.0.0.0` 会触发 Defender 防火墙弹窗并暴露端口到局域网，而在 Docker Desktop 4.34+ 上运行 `--network host` 的 AFK 沙盒时经 `host-gateway` 往返宿主存在脆弱的双重转发。改按运行环境选择两种连通模式，使所有业务进程始终只监听 `127.0.0.1:<动态端口>`：
  - **Docker Desktop 本机直跑（Windows / macOS）**：`apisix` 使用 compose bridge 网络（动态端口仅映射至 `127.0.0.1`），upstream 指向 `${IAM_E2E_UPSTREAM_HOST:-host.docker.internal}:<动态端口>`，利用 Docker Desktop 回环转发访问宿主 `127.0.0.1`。
  - **原生 Linux 与 Sandcastle AFK（含原生 Linux 及 Docker Desktop 4.34+ `--network host` 沙盒）**：`apisix` 使用 `network_mode: host`，在配置中通过 APISIX 原生 `${{ENV}}` 变量动态化监听端口（`9080`/`9443`/`9180` 对应动态分配端口）并直连 `127.0.0.1:<etcdPort>`，upstream 直接指向 `127.0.0.1:<动态端口>`。
  - 两种模式均在就绪阶段从 APISIX 容器侧执行显式 upstream 连通性探针，异常时直接输出网络诊断而非静默触发 502。
- **三场景实测验收与 AFK 边界**。本方案的完整验收覆盖三类环境：① **Windows 本机直跑**（确认 `127.0.0.1` + `host.docker.internal` 连通且不触发 Defender 防火墙弹窗）；② **Docker Desktop 上的 Sandcastle AFK 沙盒**（`--network host` + `${{ENV}}` 动态端口 + DooD）；③ **原生 Linux / Linux Docker Engine 边界**。其中在 Sandcastle AFK Linux 沙盒内执行交付门禁时，AFK 负责完成 ② 的真实连通性实测及 bridge 模式的单测/配置验证，并在交付交接中将无法在沙盒内直接观察的 ①（Windows 宿主）与 ③（原生 Linux 引擎）显式登记为受执行环境限制的未验证缺口；① 由维护者在 AFK 交付后的 Windows 本机执行复核验收。连通模式判定与生命周期模式（常驻复用 / `--fresh`）保持正交，便于在单环境中通过显式配置分别验证两类生命周期路径。

## 独立生产容器冒烟（Container Smoke）

新增独立命令 `pnpm test:e2e:container-smoke` 并挂入 `pnpm verify:release`（`verify:ci → e2e-runtime → test:e2e → test:e2e:container-smoke`），日常开发与普通 `pnpm test:e2e` 不触发；当变更命中生产打包路径（`**/Dockerfile`、`**/nginx.conf`、`**/pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.npmrc`、`.husky/install.mjs`、`patches/**`、`e2e/system/docker/**`、Container Smoke 编排/spec 或门禁脚本），或命中 6 个冒烟生产镜像依赖闭包内（及根）`package.json` 的打包敏感字段（如 `dependencies`、`optionalDependencies`、`peerDependencies`、`exports`/`main`/`module`/`bin`/`files`、`packageManager`/`engines`/`pnpm`；前端构建闭包另含 `devDependencies` 与 `scripts.build`）时，手动交付与 Sandcastle AFK 最终验证阶段须自动追加执行一次 Container Smoke，避免打包回归拖延至发布阶段才暴露，同时避免仅修改测试脚本或无关 `package.json` 触发整套镜像重建。

该冒烟负责按有界并发（默认 `2`，支持 `IAM_CONTAINER_SMOKE_BUILD_CONCURRENCY` 在 `1–4` 之间覆盖，单镜像写入独立构建日志并首错取消）构建 6 个生产 Dockerfile 与 APISIX 镜像（全部生产 Dockerfile 在共享 `base` 层预热固化 `pnpm` 原生二进制并统一 `id=iam-pnpm-v12` BuildKit store 缓存），启动容器组并通过全部 healthcheck，执行 migration、最小 seed 与网关路由同步（Linux/AFK 下 PostgreSQL、Redis、APISIX Admin 与 Gateway API 优先经 `managedServiceEndpoint()` 直连容器 bridge IP，浏览器仍经 `*.iam.localhost` 双域名访问网关以验证 Cookie 隔离），经真实 APISIX 在浏览器跑通 1 条最短登录与后台调用链路（覆盖 Nginx SPA 路由、静态资源、API/Admin-API 转发与 Worker 文档发布），结束后精确清理本次 Compose project。

实施落地后同步更新[测试与验证](../engineering/testing.md)与[构建、测试与开发命令](../engineering/commands.md)中的现行入口与生命周期说明；本决策不涉及业务领域概念，不修改 `GLOSSARY.md`。

[Canonical Test Collections](0009-adopt-canonical-test-collections.md) · [Sandcastle AFK 工作流](../agents/sandcastle-afk.md)
