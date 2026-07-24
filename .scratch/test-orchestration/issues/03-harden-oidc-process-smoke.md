# 03 — 加固 OIDC 真实进程 Smoke

**What to build:** 把 OIDC entry smoke 重构为具有真实协议就绪探针、提前退出诊断、有界输出和完整 Windows/POSIX 进程树清理的 package-local process smoke。

**Blocked by:** 01, 02

**Status:** resolved

- [x] Smoke 继续通过真实 `node --import tsx src/index.ts` 和 production composition 启动 OIDC entry，不替换为进程内 app factory。
- [x] Readiness 使用最多 30 秒的独立 deadline，并以 OIDC discovery HTTP 成功响应为证据，不把日志文本作为唯一就绪信号。
- [x] Readiness 同时监听 child `error` 与 `exit`；进程提前退出时立即报告退出码、错误和已捕获输出。
- [x] 端口与临时资源按运行唯一分配，不依赖固定端口，并消除或显式处理当前 reserve-close-spawn 的端口竞争窗口。
- [x] stdout/stderr 使用有界缓冲；成功时不制造噪声，失败时保留足够的启动、探针和退出诊断。
- [x] 成功、断言失败、readiness timeout、child 提前退出和 runner cleanup 路径都回收完整进程树；cleanup 使用独立有界 deadline。
- [x] Cleanup timeout 或失败使测试明确失败；Windows 不假设向父进程发送单个 POSIX signal 就能回收 loader/runtime 后代。
- [x] Harness 的快速失败 child、永不就绪 child、提前退出和 cleanup failure 通过聚焦测试覆盖，不用真实等待 30 秒。
- [x] OIDC 普通测试保持已声明的 Vitest 10 秒默认值；只有 process smoke 自身拥有 readiness 与总生命周期预算，不继续提高全局 timeout。
- [x] OIDC 普通测试、harness 聚焦测试、真实 `test:smoke`、package lint/typecheck、根 test/smoke、workflow/docs 和 whitespace 检查通过。

## Comments

- 2026-07-24 — 双轴评审发现首个候选只凭 discovery 响应无法排除同 issuer 竞争服务，且父进程 `exit`/`close`
  不能证明完整进程树已结束；修复后 readiness 同时要求 child-owned 启动证据与 HTTP discovery，退出诊断先等待有界
  stdio drain，POSIX 独立探测进程组、Windows tree owner 必须明确成功，并为每次尝试创建和清理 owned OS 临时目录。
- 2026-07-24 — 第二轮复审确认 `taskkill` 无法通过已退出的 Windows PID 回收后代，并发现 readiness 文本跨输出 chunk
  和真实 spawn `ENOENT` 的诊断边界；修复后 Windows target 由 `KILL_ON_JOB_CLOSE` Job Object supervisor 持有，真实
  leader/descendant 回收测试位于 smoke lane，readiness 在每个原始流上滚动匹配，未创建 PID 的 spawn failure 只等待 stdio close。
- 2026-07-24 — 第三轮 Standards 复审发现 Windows launcher 直接 `process.exit()` 可能截断尚未排空的失败诊断，
  且原真实 Job 用例的后代没有脱离 leader，不能排除普通父子退出行为造成的假通过；修复后 smoke 用 detached/unref
  后代和 256 KiB 尾标记验证真实 Job 所有权，launcher 有界等待已排队的 stdout/stderr 写入后以 `exitCode` 自然退出。
- 2026-07-24 — 第四轮 Spec 复审为 0 finding；Standards 复审指出 launcher 等待已排队输出时没有独立 deadline，
  在下游停止读取的异常条件下仍可能挂住。维护者明确决定本次不处理该 finding，并要求 Ticket 03 标记为 resolved；
  正常 smoke 路径、已验证的大尾部输出和真实 Job 回收保持不变，异常下游阻塞风险作为显式延期项保留。

## Resolution

- Ticket base: `c3470ea9731fc6215104f20c4b545ca2e8a67997`
- Reviewed content head: `05aea45146fb68f3c1950cf65e3ed54be4deece8`
- Candidate commits: `8a8d7da2b38384e9c252d351126e339a5d7de527`, `540bde4d8216e5526dc6423cffff5c2dd9ce03bf`, `3c25000f64e85a2a43d332afa408dff7f2abd988`, `05aea45146fb68f3c1950cf65e3ed54be4deece8`
- Final squash commit: `461c711f8c610798795e96ecff74d34bfb7a239c`
- Validation:
  - `pnpm install --frozen-lockfile` — passed
  - `bun test scripts/__tests__/test-orchestration.test.ts` — passed
  - `pnpm --filter @iam/oidc-provider exec vitest run src/__tests__/process-smoke-harness.test.ts` — passed
  - `pnpm --filter @iam/oidc-provider test` — passed
  - `pnpm --filter @iam/oidc-provider test:smoke` — passed
  - `pnpm --filter @iam/oidc-provider lint` — passed
  - `pnpm --filter @iam/oidc-provider typecheck` — passed
  - `pnpm test` — passed
  - `pnpm test:smoke` — passed
  - `pnpm check:docs` — passed
  - `pnpm check:workflow -- --feature test-orchestration` — passed
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.
