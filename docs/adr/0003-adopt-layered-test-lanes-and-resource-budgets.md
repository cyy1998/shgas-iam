---
status: accepted
---

# 采用分层测试通道与显式资源预算

当前 monorepo 把不同资源模型的测试混在同一个 `test` 任务中。普通单元、组件、契约和纯内存集成测试可以安全缓存并行，
但 OIDC entry smoke 会生成密钥、启动真实 Node.js 子进程、占用端口并等待服务就绪。后者在 package 内单独执行时稳定，
进入根目录全仓测试后却会与 Turbo package 并发和测试运行器 worker 叠加竞争 CPU，固定就绪时限因而偶发耗尽；同一次调查中，
超时还会转移到另一个使用默认 5 秒阈值的测试。这表明问题不是单个断言错误，而是测试资源模型、并行预算与 timeout 职责混杂。

仓库采用分层测试通道。根 `test` 只运行环境无关、可缓存并适合日常反馈的普通测试；启动进程、占用端口或验证真实应用入口的
测试进入独立 `test:smoke`。真实 PostgreSQL、浏览器 E2E、Gateway 校验及其他外部资源测试继续使用显式专用命令，按照改动类型
附加执行，不进入环境无关的默认基线。根 `verify` 按 static、typecheck、test、smoke、build 顺序执行，各阶段内部才允许 package
并行；失败立即停止。

测试分类以资源模型为准，而不是以测试描述中的 “smoke” 一词为准。普通测试文件使用 `*.test.ts[x]`；只有属于 smoke 通道的测试
使用 `*.smoke.test.ts[x]`。现有 API 与 Admin API 的 OpenAPI HTTP “smoke” 在进程内调用应用，不占用外部资源，因此应改为普通
测试命名并留在 `test`；OIDC entry smoke 启动真实 runtime，因此迁入 `test:smoke`。

Turbo 只负责跨 package 编排，package 继续拥有自己的 Vitest、Bun 或 Playwright 配置。默认 `test` 不再通过 `^test` 强制依赖包
先运行测试，而采用只传播依赖源码变化的 transit task；确实依赖构建产物的测试必须显式声明 build 依赖。这样既保留正确的 cache
失效，又不把 package 依赖图误当作测试执行拓扑。

并行度使用保守的双层预算：普通测试的 Turbo package concurrency 初始为 2，Vitest worker 上限为可用 CPU 的 25%，Bun 测试
并发不超过 2；smoke 的 package concurrency 和 runner worker 都为 1。任何提高都必须在目标 runner 上单独测量，一次只调整
一层。普通测试允许 Turbo 缓存；process smoke、真实数据库测试、E2E 和其他外部资源测试禁用缓存。影响测试结果的环境、配置和
fixture 必须进入 task hash。

Timeout 只用于识别挂死，不承担性能 SLA。Package-local Vitest 普通测试统一使用 10 秒，Bun 普通测试保留运行器默认 5 秒；
经过明确标注的 hermetic integration 可以局部使用 15 秒。Process smoke 使用独立的 30 秒 readiness deadline 和有界 cleanup
deadline。服务就绪必须通过 HTTP 或端口等真实信号判断，同时监听子进程提前退出；不得只匹配日志文本。所有路径都必须清理完整
进程树、保留启动输出，并把 cleanup 失败作为明确失败报告。性能回归另由 benchmark 管理，不能通过继续放宽已声明的全局 timeout
掩盖。

当前仓库没有 CI 平台，因此首期强制证据只声明 Windows 本地环境：OIDC `test:smoke` 连续 20 次通过，完整 `pnpm verify` 连续
3 次通过，期间没有 timeout、flaky retry 或残留子进程。正式脚本仍必须跨 Windows 与 Linux，不得依赖 Bash、PowerShell 或
`cmd.exe` 专有语法；Linux/CI 状态在实际平台建立并验证前保持 pending。

该决策优先保证测试结果可信和故障可归因，代价是新增通道与编排脚本，并让完整验证比单一并行命令更串行。日常开发者仍可运行
package 或单文件测试获得快速反馈；部署型后端 app 最终都应拥有 package-local `test:smoke`，但首期只建立基础设施并完成 OIDC
迁移，其他 app 采用显式 adoption 状态逐步补齐。覆盖率门槛、统一 JUnit/趋势采集和自动启动外部服务不属于本决策。

当前规则、Windows 本地验收与 backend adoption 状态详见
[测试编排架构](../architecture/testing-architecture.md)；可执行入口见
[构建、测试与开发命令](../development/commands.md)。
