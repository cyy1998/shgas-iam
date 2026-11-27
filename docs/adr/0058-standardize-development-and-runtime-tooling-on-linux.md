---
status: accepted
---

# 将开发、测试与编排运行面收敛为纯 Linux 并退役 Windows 适配层

仓库的全部生产服务、基础中间件与 Sandcastle AFK 执行器均运行在 Linux 环境，本地开发机也已切换至原生 Linux。决定将开发、测试、AFK 编排与运行时工具链限定为纯 Linux（Linux-only），移除全部 Windows（`win32`）以及缺乏真实运行验证的 macOS（`darwin` / Docker Desktop）宿主适配层，并在非 Linux 宿主上显式快速失败（fail-fast）。本决定当时同步修订了原 ADR-0055 与 ADR-0056 的跨平台条款（两篇旧 ADR 现已由 [ADR-0060](0060-unify-test-architecture-sandbox-and-ci-gate.md) 取代）。

继续保留原生 Windows 支持，意味着为已不再使用的宿主维护 PowerShell Job Object 包装器、`taskkill.exe`、假 `SIGTERM` 预加载夹具、NTFS `rename` 重试与双轨 E2E 网络拓扑；只删 Windows 而保留 macOS 分支，则会留下无人实测的 `/bin/ps` 进程扫描与 Docker Desktop `bridge` 路径。选择 Linux-only 的代价是 Windows 和 macOS 工作站上的贡献者需要通过原生 Linux、WSL2 或 Linux 容器/虚拟机运行本仓库的开发与测试命令。

## 纯 Linux 宿主边界与进程树所有权

- **入口快速失败**。`@iam/runtime/process`（`spawnOwnedProcessTree`、`closeOwnedProcessScope`）、`@iam/test-support/process-smoke-harness`（`terminateProcessTree`）、根测试/验证 runner 与 `pnpm sandcastle` 入口在 `process.platform !== "linux"` 时直接报错退出，不静默降级。
- **单一进程树回收机制**。移除全部 `win32`/`darwin` 进程管理适配，由 [owned-process-tree.mjs](../../packages/runtime/src/process/owned-process-tree.mjs) 通过继承 `IAM_OWNED_PROCESS_MARKERS` 并扫描 `/proc/<pid>/environ` 回收 detached/reparented 后代进程；[process-smoke-harness.ts](../../packages/test-support/src/process-smoke-harness.ts) 同时保留对普通 `detached: true` 子进程的 POSIX `-pid` 进程组终止，供 `apps/sso-api` 需要 `stdin` 管道的测试夹具使用。

## 退役 Worker Standalone 与回归真实 `SIGTERM`

- **Worker 仅保留源码运行路径**。生产镜像 `apps/worker/Dockerfile` 以 `bun run src/index.ts` 启动，不交付 `bun build --compile` 单文件可执行体。移除 Worker 中未用于生产的 standalone 打包分支与对应测试路径。
- **测试发送真实 POSIX `SIGTERM`**。移除此前因 Windows 缺少 POSIX 信号而引入的进程内假 `SIGTERM` 预加载夹具，改为由测试直接向子进程投递真实 OS `SIGTERM`（需要防启动竞态时以既有 readiness 或数据库锁作为监听器就绪依据），取消测试规范中“未验证真实信号投递”的豁免。

## E2E、测试资源与宿主保留约定

本决定当年对原 Hybrid E2E 网络拓扑、内存采样、`patches/@ai-hero__sandcastle` 补丁以及 `scripts/sandcastle/` 做的 Linux 裁剪（明细见 Git 历史），随后已由 [ADR-0059](0059-adopt-native-sandcastle-afk-orchestration.md)（原生 `.sandcastle/` 编排）与 [ADR-0060](0060-unify-test-architecture-sandbox-and-ci-gate.md)（单容器方案 X 与静态生产容器 E2E）整体取代。仍在生效的两项宿主网络规则如下：

- `docker/compose.dev.yaml` 中 Grafana 的 `host.docker.internal:host-gateway` 属于 Linux 容器访问宿主机代理的标准写法，保持不变；
- [E2E Compose 运行时](../../e2e/system/src/runtime/compose-runtime.ts) 优先直连 Compose bridge IP，失败时回退 `127.0.0.1:<port>`，兼容原生 Linux、WSL2 与 AFK 环境。

## 清理范围与明确保留项

- **零散兼容清理**。同步移除仓库文档、运维手册、Git hook、测试环境白名单与脚本中的 PowerShell 示例、`windowsHide`、Windows/macOS 专用分支、`junction` 符号链接及为反斜杠保留的路径替换逻辑。
- **明确保留项**。保留 `.gitattributes`（`* text=auto eol=lf`）通用换行符护栏、`.sandcastle/` 对 GitHub API 响应体 `\r\n` 的规范化、HTTP/Redis 协议层 `\r\n` 处理，以及业务代码中面向终端用户浏览器的 Windows User-Agent 识别。

[统一测试与 CI 架构](0060-unify-test-architecture-sandbox-and-ci-gate.md) · [原生 Sandcastle AFK 编排](0059-adopt-native-sandcastle-afk-orchestration.md)
