# 工具链性能与 Monorepo 缓存治理

**Status:** approved

## 背景

仓库的 `lint`、`typecheck` 和 `test` 都由 Turborepo 调度多个 workspace 工具进程，但各工具自身还会继续并行：

- ESLint 在 14 个 workspace 中分别启动并重复初始化 Antfu、typescript-eslint 与格式化插件；
- TypeScript 7 每个 `tsc` 进程默认启动 4 个 checker；
- Vitest 会在单个 workspace 内并行测试文件，部分测试还会启动真实子进程；
- 根目录 ESLint 位于 Turbo 之外，workspace 全部命中缓存后仍然每次执行。

这台开发机的 WSL 环境可见 18 个逻辑 CPU、15 GiB 内存，诊断时已有约 2.5 GiB swap 使用。当前任务图把外层 workspace 并发与工具内层并发相乘，导致进程启动、内存占用和调度竞争超过收益。

## 已复现基线

以下数据在 2026-07-23、目标基线 `55c25384e82fca2935dec782e4dd270090a9d5dc` 上采集：

| 场景 | 结果 |
|---|---|
| workspace lint 全部命中 Turbo 缓存 | `turbo lint` 约 1.2 秒 |
| 当前完整 warm lint | `pnpm lint` 约 15.7 秒 |
| 10 秒 warm lint 反馈环 | `timeout 10s pnpm lint` 稳定超时 |
| 根目录 ESLint 最小复现 | 单独运行超过 10 秒 |
| 单 workspace lint | domain 约 15.5 秒；API 约 18.2 秒；Admin 约 19.1 秒 |
| Antfu 当前 backend 配置冷构建 | 约 2.5–4.3 秒，RSS 约 307–320 MiB |
| Antfu 精简 TypeScript 配置构建 | 约 1.7–2.4 秒，RSS 约 275–295 MiB；仍承担 Antfu 入口的固定导入成本 |
| 精选 backend 插件直接导入 | 约 1.0–1.1 秒，RSS 约 218–221 MiB；尚未验证规则与诊断等价 |
| Node compile cache 热构建 | 交错 5 轮中位数约 2.23 秒，对照约 2.73 秒；冷构建没有收益 |
| 冷 lint，Turbo concurrency 3 | 120 秒内未完成 |
| 冷 typecheck，Turbo concurrency 10 | 55 秒内未完成 |
| 冷 typecheck，Turbo concurrency 2 | 约 55 秒完成 12/14 个 workspace 后被观察超时终止 |
| 冷 typecheck，Turbo concurrency 3 | 14/14 通过，约 44 秒，最大单进程 RSS 约 2.2 GiB |
| 冷 typecheck，Turbo concurrency 4 | 14/14 通过，约 63 秒，明显慢于 concurrency 3 |
| 冷 test，Turbo concurrency 3 | OIDC entry smoke 因 10 秒启动阈值失败 |
| OIDC entry smoke 单独运行 | 通过，约 7.3 秒 |
| OIDC workspace test 单独运行 | 80/80 通过，约 10.5 秒 |
| 冷 test，Turbo concurrency 2 | 14/14 workspace 通过，约 41 秒 |

最小反馈环已经证明 warm lint 的主因是 Turbo 之外的根 ESLint；typecheck 与 test 的失败则由外层和内层并发相乘造成，而不是源代码诊断或测试逻辑错误。

## 目标

1. 让根级 lint 进入 Turbo 的显式 root task，不再在 `turbo lint` 之后执行不可缓存的串行尾部命令。
2. 保持 Turborepo 推荐的 package-level lint 任务与细粒度缓存；将 ESLint 10 单进程全仓 lint 仅作为冷启动对照原型，不预设为最终执行模型。
3. 将共享 ESLint 配置建模为正式 workspace 配置包，使规则变化进入 Turbo 依赖图，并消除重复配置正文。
4. 降低每个 ESLint 进程加载 Antfu preset 和插件图的固定时间与内存，同时保持检查范围和诊断集合。
5. 为 test 和 typecheck 建立与工具内部并行相协调的、命令级 Turbo 并发预算。
6. 用自动化结构检查锁定 root task、缓存输入、共享配置依赖与并发预算，避免后续退回到不可缓存或无上限的执行方式。
7. 保持 TypeScript 7 CLI 与 TypeScript 6 compatibility API 的官方双轨结构，不把兼容工具迁移到无 API 的 TS7。
8. 文档化本机与 CI 的调优入口、冷/热缓存测量方式和 Remote Cache 的可选启用条件。

## 非目标

- 不修改业务规则、数据库、网关行为或前端交互。
- 不在本功能中修复现有 ESLint warnings。
- 不迁移 TypeScript project references，也不额外叠加 TypeScript incremental cache 与 Turbo cache。
- 不在本功能中建立全仓共享 tsconfig 包；它与当前超时没有直接因果关系，且 Umi 生成配置需要单独设计。
- 不删除 TypeScript 6 compatibility package。
- 不要求或自动配置 Turborepo Remote Cache 凭据。
- 不全局放宽测试 timeout；真实进程 smoke 可以依据隔离基线、受控并发结果和明确上限做定点调整。

## 设计约束

### ESLint 执行模型

- 默认模型遵循 Turborepo 的 package-level lint：每个 workspace 保留独立 `eslint .` 或等价的显式文件范围，由 `turbo run lint` 调度和缓存。
- 根目录脚本与配置使用独立 `//#lint:root` root task；完整 `pnpm lint` 同时请求 package `lint` 与 `//#lint:root`，不再在 Turbo 完成后追加不可缓存的 ESLint 串行尾部命令。
- 各 workspace 继续保留 `lint`、`lint:fix` 及前端的 `lint:eslint`/`lint:style`，供聚焦开发与验证使用。
- `lint:fix` 不缓存；只读 lint 可缓存。
- package lint 通过内部共享配置包依赖和 `dependsOn: ["^lint"]` 获得正确缓存失效；root task 的 inputs 精确覆盖根脚本、根配置和 workflow 记录。
- ESLint 10 单进程仓库 lint 作为对照原型使用标准配置查找和 `--concurrency=off`，测量冷启动、峰值内存、诊断等价性与缓存损失；只有显著优于标准模型且收益覆盖细粒度缓存损失时，才通过 spec amendment 改为正式入口。

### 共享 ESLint 配置

- 新建单一内部配置包，至少导出 root、backend 和 frontend 配置工厂或 preset。
- Antfu、typescript-eslint 及其插件只能通过受控依赖关系解析，不允许每个 workspace 各自漂移版本。
- 共享配置包本身解决配置一致性和 Turbo 缓存失效，不应被记为启动性能收益；只要继续调用 Antfu 的统一入口，每个 ESLint 进程仍会加载其静态插件图。
- package-local 配置保留必要的 rules/ignores 差异，但公共 stylistic、formatter、TypeScript 和 React 规则只定义一次。
- 前端继续由 Prettier 负责格式化；ESLint 不重新接管前端 formatter。
- 后端是否移除 Antfu formatter 集成必须通过单 workspace lint 输出等价性和耗时对比决定；不得静默改变被检查文件类型或规则结果。

### ESLint 规则加载预算

- 首先为 config import、config compose、首文件 lint、完整 workspace lint 和峰值 RSS 建立分段基线，避免把规则执行时间归因于配置加载。
- 低风险原型显式关闭仓库不需要的 Antfu 子配置，并评估持久 Node compile cache；compile cache 只能作为热启动辅助，不能代替规则图收敛。
- Antfu 精简原型必须逐项审计被关闭的 formatter、Markdown/JSON/YAML/TOML、test、jsdoc、pnpm、e18e、perfectionist、unicorn 等配置；只有未减少本仓库所需检查范围和诊断时才能采用。
- 如果精简 Antfu 仍不能满足启动预算，建立精选 flat config 原型：backend 只直接导入已批准的 ESLint core、typescript-eslint、imports、Node 和 unused-imports 等插件；frontend 独立评估 React 规则，不要求与 backend 同步移除 Antfu。
- 不采用对 Antfu 发布包做二次 bundle/tree-shake 或 patch 的方案；该方案依赖其内部模块布局，升级脆弱且难以审计。
- 最终方案按“诊断等价、维护成本、冷启动、热启动、峰值 RSS”共同决策，不以规则数量或单次最快结果单独决策。

### 并发预算

- 根 `typecheck` 脚本直接使用 `turbo typecheck --concurrency=3`；每个 workspace 仍可直接运行自己的 `tsc --noEmit`。TS7 保持默认 4 个 checker，使正常全仓命令最多同时存在约 12 个 checker，而不是默认 Turbo concurrency 下的数十个 checker。
- 根 `test` 脚本直接使用 `turbo test --concurrency=2`；每个 workspace 的测试运行器配置保持不变，外层最多同时运行两个 Vitest/Bun 测试进程。
- 不在 `turbo.json` 设置全局 `concurrency`，因此 `dev`、`build`、局部 lint 和其他任务不会继承 typecheck/test 的保守预算。
- 更大 runner 需要调优时，维护者直接运行 `pnpm exec turbo <test|typecheck> --concurrency=<N>`；默认 `pnpm test`/`pnpm typecheck` 保持本仓库基线机器验证过的稳定预算，不为覆盖机制增加跨平台 shell wrapper。
- lint 的并发策略以单进程 ESLint 原型结果为准，不把当前 per-package concurrency 3 作为目标方案。
- 命令行应允许维护者在更大 CI runner 上显式覆盖默认预算；仓库默认值优先保证 15 GiB 开发环境稳定。
- 不同时提高 Turbo concurrency、TS7 `--checkers`、project builders 或 Vitest workers；每轮性能调整只改变一个并行层。

### 测试超时策略

- 本功能不修改 Vitest/Bun 的全局 per-test、hook 或 teardown timeout，也不通过普遍放宽单测阈值掩盖资源竞争。
- OIDC entry smoke 会生成 RSA 密钥并通过 `tsx` 启动真实 composition root，属于有独立启动预算的集成 smoke。2026-07-23 隔离复测 5 轮的测试体耗时为 3.83–4.96 秒，当前内部进程就绪等待为 `10_000` 毫秒、外层单测为 `15_000` 毫秒。
- 允许只将该 smoke 的进程就绪等待调整为 `15_000` 毫秒、外层单测总时限调整为 `25_000` 毫秒；两层阈值必须分别保留，服务未就绪仍应先输出已收集的子进程日志并失败。
- 上述定点调整必须与 `turbo test --concurrency=2` 的外层并发治理同时交付，不能用更大的 timeout 支持恢复 concurrency 3 或更高的默认并发。
- 全仓冷测试在本规格的 15 GiB 基线环境使用 `turbo test --force --concurrency=2`，连续两轮均应在 75 秒内完成；该墙钟预算用于发现性能回退，不写入普通测试用例的业务 timeout。
- Playwright 现有 test、expect 和 webServer timeout 不在本功能修改范围；如 E2E 验证失败，应单独诊断，不因工具链性能治理统一上调。

## 验收标准

1. `timeout 10s pnpm lint` 在 workspace/root lint 已预热后连续三次通过。
2. `pnpm lint` 不包含 Turbo 之外的 ESLint 串行尾部命令；根检查作为可观察、可缓存的 Turbo root task 出现在 dry-run 中。
3. 连续两次未改文件的 `pnpm lint` 中，第二次 root lint 命中 Turbo cache。
4. 修改任一共享 ESLint preset 后，所有消费该 preset 的相关 lint task 或仓库级 root lint hash 发生变化；不得为 test/typecheck 增加只服务于 ESLint 配置的特殊任务依赖。共享配置作为正式内部 workspace 依赖时，允许 Turborepo 按其内部包源码哈希语义同时使消费者的 test/typecheck cache 失效。
5. 仓库级单进程 ESLint 只产出对照数据，不直接替换 package-level 模型；如建议采用，必须先证明冷 lint 相对标准模型至少缩短 50%、诊断集合没有减少，并经维护者批准 spec amendment。
6. 所有 workspace 的局部 `lint` 和 `lint:fix` 入口仍存在并使用同一共享配置来源。
7. 采用的配置方案相对当前 backend/frontend 各自基线不减少被检查文件集合、error/warning 诊断键集合或必要 formatter 覆盖；任何有意规则变化必须单独取得规格授权。
8. 每种 ESLint 配置原型至少在相同 workspace 交错运行五轮，记录 config import/compose、完整 lint、最大 RSS 和冷/热缓存结果；Node compile cache 的冷启动回退不得被隐藏在热启动平均值中。
9. `pnpm exec turbo typecheck --force --concurrency=3` 连续两次在 80 秒内完成当前 15/15 workspace；根 `pnpm typecheck` 默认使用同一预算。
10. `pnpm exec turbo test --force --concurrency=2` 连续两次在 75 秒内通过当前 15/15 workspace；只允许 OIDC entry smoke 按设计将就绪/总时限调整为 `15_000`/`25_000` 毫秒，其他测试 timeout 不提高。
11. `pnpm exec tsc --version` 仍为 7.0.2，裸模块 `typescript` 仍解析到官方 TypeScript 6 compatibility package。
12. 仓库不存在新的 ESLint、typescript-eslint 或 TypeScript 非预期版本分叉；Umi 自带旧 lint 工具只能留在其私有依赖树，不能被当前 flat-config lint 入口加载。
13. 新增自动化结构检查能够在 root lint 绕过 Turbo、共享配置未进入依赖图或默认并发预算被移除时失败。
14. 全仓 frozen install、lint、typecheck、test、build、workflow check、docs check 和 whitespace check 通过；若配置文件修改命中 Admin、SSO 或 Gateway 路径，按仓库验证矩阵执行相应 E2E/Gateway 检查，不以本功能名义申请跳过。

## 测试接缝

- 性能反馈环：`timeout 10s pnpm lint`。
- 冷缓存/并发比较：带 `--force` 和固定 `--concurrency` 的 Turbo 命令，记录墙钟时间、CPU 时间和最大 RSS。
- 缓存正确性：Turbo `--dry=json` 输入/hash 对比，以及连续运行的 cache hit 结果。
- 执行模型回归：针对 package scripts、Turbo root task、共享配置依赖和默认并发预算的 Bun 结构测试。
- 诊断等价性：改造前后保存 ESLint 退出码、error/warning 数量和被检查文件集合，比较不得减少覆盖。

## 建议拆票

1. 建立性能与任务图回归接缝，固化当前基线和结构断言。
2. 审计 Antfu 规则加载图，建立精简 Antfu、Node compile cache 和精选 flat config 原型，按诊断等价与分段性能选型。
3. 引入共享 ESLint 配置包，迁移 root/backend/frontend 配置并验证诊断等价。
4. 将根 lint 改为可缓存的 Turbo root task，并用 ESLint 10 单进程原型对照 package-level 模型的冷/热性能。
5. 为 typecheck 和 test 固定经验证的默认并发预算，并保留显式覆盖方式。
6. 完成全仓验证、性能复测、文档和双轴评审。

## 已知流程 Finding

当前 workflow 文档要求在 `G2 Spec Ready` 提交 draft spec 后等待拆票授权，但 workflow checker 同时要求任何 standard feature 目录立即包含至少一张 ticket。由于 ticket 只能在维护者授权后发布，这两个约束在 G2 互相冲突。本功能不伪造提前发布的 ticket，也不使用 `--no-verify`；draft spec 将在拆票授权前保持未提交，待授权后随正式 ticket 集合进入可检查状态。该 finding 不扩大本功能到 workflow checker 修复。

## Amendment 2026-07-23 — 接受内部配置包的保守哈希传播

维护者批准保留各 workspace 对 `@iam/eslint-config` 的直接依赖，不为隔离 test/typecheck cache 而隐藏、提升或绕开这条依赖。Turborepo 2.10.5 会把内部 workspace 依赖源码纳入消费者任务哈希；实测删除 `^test`/`^typecheck` 和添加 task-level 排除 input 均不能阻止共享 preset 源码变化传播到消费者 test/typecheck hash。

因此本规格把验收标准 4 收敛为：lint 与 root lint 必须正确失效，test/typecheck 不新增只服务于 ESLint 的特殊任务边；内部包源码引起的保守 cache miss 属于已接受成本。该选择优先保证依赖所有权、配置解析和缓存正确性。

## Amendment 2026-07-23 — 按连续冷执行实测调整墙钟预算

维护者批准只调整验收标准 9、10 的全仓强制冷执行墙钟预算，不改变正式命令的并发、工具内部 worker/checker、普通测试 timeout 或 OIDC 定点 timeout。配置包加入后当前任务数为 15；typecheck concurrency 3 两组连续实测为 51.92/70.23 秒和 49.09/72.00 秒，test concurrency 2 实测为 42.94/58.47 秒，均无诊断或测试失败。

因此 typecheck 连续两轮预算由 55 秒调整为 80 秒，test 由 60 秒调整为 75 秒。结构测试仍锁定 concurrency 3/2；墙钟上限只用于发现本机性能回退，不进入测试运行器的业务 timeout。
