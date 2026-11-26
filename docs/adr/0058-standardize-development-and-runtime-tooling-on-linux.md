---
status: accepted
---

# 将开发、测试与编排运行面收敛为纯 Linux 并退役 Windows 适配层

仓库的全部生产服务（API / Admin API / Worker / Ops / Gateway / PostgreSQL / Redis / APISIX）与 Sandcastle AFK 执行器均运行在 Linux 环境，本地开发机也已全面切换至原生 Linux。决定将本仓库的开发、测试、Sandcastle AFK 编排与运行时工具链**统一收敛为纯 Linux（Linux-only）**，彻底退役全部 Windows（`win32`）以及缺乏真实运行验证的 macOS（`darwin` / Docker Desktop）宿主适配层，并在非 Linux 宿主上显式快速失败（fail-fast）。本决定修订 [ADR-0055](0055-adopt-hybrid-host-runtime-for-full-system-e2e.md) 中关于 Docker Desktop（Windows / macOS）`bridge` + `host.docker.internal` 连通模式与三场景验收的条款，以及 [ADR-0056](0056-accelerate-integration-tests-with-template-isolation-and-bounded-parallelism.md) 中关于 Windows Job `.dll` 哈希缓存与 `@iam/worker` Windows standalone 编译验证的条款。

我们拒绝“保留原生 Windows 支持、仅做局部抽象收口”的渐进路线——在开发、编排与生产均已脱离 Windows 的前提下，继续维护 PowerShell Job Object 包装器、`taskkill.exe`、进程内假 `SIGTERM` 预加载夹具、NTFS `rename` 重试、`cmd.exe` 路径转义与双轨 E2E 网络拓扑只会持续制造维护噪声与测试失真；我们也拒绝“仅删除 Windows、保留 macOS 分支”的折中方案，因为无人实测的 `macOwnedProcesses`（`/bin/ps`）与 Docker Desktop `bridge` 路径终将退化为不可信代码。由此接受的代价是：非 Linux 工作站（Windows / macOS）上的贡献者需通过原生 Linux、WSL2 或 Linux 容器/虚拟机运行本仓库的开发与测试命令；若未来需要重新支持原生 Windows 或 macOS 宿主，须通过新的架构决策并重新设计对应运行面。

## 纯 Linux 宿主边界与进程树所有权

- **入口显式快速失败**。`@iam/runtime/process`（`spawnOwnedProcessTree`、`closeOwnedProcessScope`）、`@iam/test-support/process-smoke-harness`（`terminateProcessTree`）、根测试/验证 runner 与 `pnpm sandcastle` 入口在 `process.platform !== "linux"` 时立即报错退出，不再静默降级或保留不可测分支。
- **单一进程树回收机制**。删除 `windows-job-supervisor.ps1`、`windows-job-launcher.mjs`、`macOwnedProcesses`、`windowsJob`、`requestGracefulStop`、`runWindowsTreeKill` 及所有 `win32`/`darwin` 分支。Linux 进程树所有权统一由 [owned-process-tree.mjs](../../packages/runtime/src/process/owned-process-tree.mjs) 通过继承 `IAM_OWNED_PROCESS_MARKERS` 与扫描 `/proc/<pid>/environ` 回收 detached/reparented 后代；[process-smoke-harness.ts](../../packages/test-support/src/process-smoke-harness.ts) 同时保留对普通 `detached: true` 子进程的 POSIX `-pid` 进程组终止（供 `apps/sso-api` 需要 `stdin` 管道的 `fixture-process.ts` 使用），并在删除 `process-smoke-windows-job.integration.test.ts` 的同时补齐一条真实 Linux `detached` 后代进程回收集成测试。

## 退役 Worker Standalone 与替换假 `SIGTERM` 夹具

- **Worker 仅保留源码交付路径**。生产镜像 `apps/worker/Dockerfile` 实际以 `bun run src/index.ts` 运行，不交付 `bun build --compile` 单文件可执行体。彻底移除 `apps/worker/src/composition/document-repair-schedule.ts` 中的 standalone 分支以及 `apps/worker/test-integration/support/standalone-build.ts` 与相关测试，不再维护生产未使用的独立可执行体打包路径。
- **回归真实 POSIX `SIGTERM` 测试**。删除 `e2e/system/src/host-windows-shutdown.mjs` 以及 `apps/gateway`、`apps/worker`、`apps/ops` 中因 Windows 缺少 POSIX 信号而引入的 3 个假 `SIGTERM` 预加载测试夹具（`shutdown.fixture.ts`、`interrupt-worker.fixture.ts`、`interrupt-command.fixture.ts`），改为由测试向子进程发送真实 OS `SIGTERM`（在需要防启动竞态处通过既有 readiness 或数据库锁证据确保监听器已就绪），彻底消除测试文档中关于“未验证真实 POSIX 信号投递”的豁免。

## E2E、测试资源与 Sandcastle AFK 宿主收口

- **Full-system E2E 单一 `host` 拓扑与精简内存采样**。在 [hybrid-compose.ts](../../e2e/system/src/hybrid-compose.ts) 及相关 E2E 代码中移除 `bridge` 网络模式、`IAM_E2E_UPSTREAM_HOST`、`host.docker.internal`（含 `vite-dev.mjs` 允许列表）以及 `host-memory.ts` 中的 `windowsMemoryReader()`（`bun:ffi` `kernel32.dll`），统一为 `network_mode: "host"` + `127.0.0.1` 与 `os.freemem()` 采样；`docker/compose.dev.yaml` 中 Grafana 的 `host.docker.internal:host-gateway` 属 Linux 容器访问宿主机代理的标准写法，保持不变。
- **克制裁剪 `@ai-hero/sandcastle` 补丁**。`patches/@ai-hero__sandcastle@0.12.0.patch` 仅移除 2 处 Windows 专属 hunk（`execGit` 的 `-c core.longpaths=true` 与 `patchGitMountsForWindows`），完整保留其余 7 处 Linux/AFK 必需改动（`daemonSocket`、匿名卷/命名卷生命周期、`SANDCASTLE_HOST_HANDLES_SIGNALS` 与 Codex stream 错误解析）；不把摆脱上游 SDK 补丁的更大重构混入本次范围。
- **简化 Sandcastle 与测试资源宿主调用**。
  - `workspace-dependencies.mts` 移除 `windowsPnpm` 与 `.cmd`/`.bat` 分支，保留简洁的 Linux `pnpm list` 实现（同时保留 `packageManager` 精确版本核验与 pnpm 原生 workspace 解析）；
  - `scripts/sandcastle/commands.ts` 移除 `win32` 的 `-c core.longpaths=true`；
  - `scripts/sandcastle/resources.ts` 与 `scripts/sandcastle/docker-smoke.mts` 的 `resolveSocketGroupId()` 改为宿主直接 `fs.stat("/var/run/docker.sock").gid` 零容器开销读取（在原生 Linux Docker Engine 与 WSL2 + Docker Desktop 下均与容器内 socket GID 一致）；`.sandcastle/README.md` 与 `hostNetworkRequirements` 继续保留 Linux Docker Engine 或 WSL2 下 Docker Desktop 4.34+ 开启 host networking 的要求；
  - [managed-resources.mjs](../../scripts/test-resources/managed-resources.mjs) 移除 `win32` 的 20×50ms `rename` 重试与 PowerShell 引号转义，保留 `managedServiceEndpoint()` 的 Compose bridge IP 优先直连策略（失败回退 `127.0.0.1:<port>`，兼容原生 Linux、WSL2 与 AFK）。

## 零散兼容残留、明确保留项与文档同步

- **同步清理的残留项**。清理 `AGENTS.md` 中的 PowerShell 7 约定、`docs/agents/code-investigation.md` 的 PowerShell `Select-String`、`scripts/playwright-e2e-preflight.mjs` 的非 Linux 跳过分支（改为非 Linux 快速失败，保留 Linux/WSL2 缺失系统依赖提示）、`.husky/pre-commit` 的 `--max-arg-length 6000`、全部 `windowsHide: true`、测试环境白名单中的 Windows/macOS 变量、`symlink(..., "junction")`、各处 `win32` 测试分支/跳过与专为 Windows 反斜杠保留的 `.replaceAll("\\", "/")` 及对应单测；[网关管理](../releases/apisix-gateway-release.md) 与 [登录与会话](../releases/authentication-and-session.md) 运维手册中的 PowerShell 7 示例改写为 Linux `bash` + `curl`。
- **明确保留项**。保留 `.gitattributes`（`* text=auto eol=lf`）通用换行符护栏、`scripts/sandcastle/` 对 GitHub API 响应体 `\r\n` 的规范化、HTTP/Redis 协议层 `\r\n` 处理，以及业务代码中面向终端用户浏览器的 Windows User-Agent 识别。
- **文档与词表影响**。实施落地后同步更新 [仓库地图](../engineering/repository-map.md)、[测试与验证](../engineering/testing.md)、`AGENTS.md`、`apps/worker/README.md`、`.sandcastle/README.md` 与对应运维手册；本决策不涉及 IAM 业务领域概念，不修改 `GLOSSARY.md`。

[Hybrid Full-system E2E](0055-adopt-hybrid-host-runtime-for-full-system-e2e.md) · [Integration 测试加速](0056-accelerate-integration-tests-with-template-isolation-and-bounded-parallelism.md)
