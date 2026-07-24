# 01 — 建立测试编排任务图与验证入口

**What to build:** 建立跨平台的根 `test:smoke`、顺序 `verify`、Turbo transit task 和结构测试，使跨 package 调度、缓存边界、阶段顺序与失败传播先拥有可执行契约。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 根 `pnpm test` 继续以 Turbo package concurrency 2 调度普通测试，并且不通过 shell 专有语法组合命令。
- [x] 根 `pnpm test:smoke` 以 Turbo package concurrency 1 只调度声明该 script 的 workspace。
- [x] 根 `pnpm verify` 通过跨平台脚本依次执行 static、typecheck、test、smoke、build；任一阶段失败后不启动后续阶段。
- [x] Static 阶段覆盖 lint、文档索引、env naming 和 workflow guards，并保证一次 verify 中每项只执行一次。
- [x] `turbo.json` 使用 transit task 传播内部 workspace 变化；普通 `test` 不再依赖 `^test`，process smoke 明确禁用缓存。
- [x] Turbo dry-run 与结构测试证明依赖源码变化会影响消费者 test hash，但定向 package test 不会仅因依赖边执行依赖 package 的 test。
- [x] 根目录不建立 Vitest workspace；package-local runner ownership 保持不变。
- [x] 结构测试覆盖 root scripts、阶段顺序、failure propagation、task dependencies、cache flags 和 Turbo concurrency。
- [x] 冻结安装、聚焦结构测试、空 adoption 的根 smoke、根 lint/typecheck/build、workflow/docs 和 whitespace 检查通过；完整 root test/verify 在 Ticket 02 固定 runner 预算后执行。

## Comments

- 2026-07-24 — 首次实现态 `pnpm test` 在 transit 已生效但 runner 预算尚未实施时触发 SSO 5 秒 timeout，证明完整 root test/verify 依赖 Ticket 02。该 gate 顺延到 Ticket 02；Ticket 01 仍必须证明任务选择、hash 传播和 verify failure propagation。

## Resolution

- Ticket base: `5d365292eeffbe04330201b5a65a7e490615b994`
- Reviewed content head: `14b65e6a1217d64a5fcb27dd7593bac9d6e09df6`
- Candidate commits: `4b5e50460b1ad09a03eaceabbbfbd811fc10d3bb`, `14b65e6a1217d64a5fcb27dd7593bac9d6e09df6`
- Final squash commit: `461c711f8c610798795e96ecff74d34bfb7a239c`
- Validation:
  - `pnpm install --frozen-lockfile` — passed
  - `bun test scripts/__tests__/test-orchestration.test.ts` — passed
  - `bun test scripts/__tests__/tooling-performance.test.ts -t "reads the current root and workspace task graph"` — passed
  - `pnpm test:smoke` — passed
  - `pnpm lint` — passed
  - `pnpm typecheck` — passed
  - `pnpm build` — passed
  - `pnpm check:docs` — passed
  - `pnpm check:workflow -- --feature test-orchestration` — passed
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.
