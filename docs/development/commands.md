# 构建、测试与开发命令

尽量使用 workspace package scripts 和 `pnpm --filter`，让 Turborepo 与 package-local tooling 负责执行细节。

## Workspace 命令

- `pnpm dev`
- `pnpm build`
- `pnpm lint`（包含无参数的全局 workflow 记录格式检查）
- `pnpm test`（运行可缓存的普通测试，不包含 process smoke、外部资源测试或 workflow CLI 专项测试）
- `pnpm test:smoke`（以单 package 并发运行真实进程/端口 smoke；当前只由 `@iam/oidc-provider` 接入）
- `pnpm verify`（按 static → typecheck → test → smoke → build 顺序执行环境无关的完整本地基线）
- `pnpm e2e`（显式浏览器通道，不属于 `pnpm verify`）
- `pnpm typecheck`
- 文档索引与 freshness guard：`pnpm check:docs`
- Env naming guard：`pnpm check:env-names`
- Workflow 记录格式 guard：`pnpm check:workflow`
- Workflow CLI 聚焦测试：`pnpm test:workflow`（仅在修改 workflow checker 或 CLI 测试时显式运行）

根开发工具链要求 Node 24。具体功能在提交前运行受影响 package 的测试、lint 和 typecheck；feature/merge candidate
运行 `pnpm verify`，再按改动类型追加外部资源检查。
ticket 生命周期、验证层级和提交授权见 [Engineering workflow](../agents/workflow.md)。

## 测试通道与完整本地验证

`pnpm test` 通过 Turbo 只调度各 workspace 的普通 `test`，适用于单元、组件、契约、架构和纯内存集成测试。它不会启动
OIDC 真实 entry，也不隐式连接 PostgreSQL、启动浏览器或校验 Gateway。开发内循环优先使用 package-local 命令，例如：

```bash
pnpm --filter @iam/oidc-provider test
pnpm --filter @iam/api test
```

`pnpm test:smoke` 只调度声明同名 script 的 package，禁用任务缓存，并以 Turbo concurrency 1 运行。当前只有
`@iam/oidc-provider` 接入该通道；其 package-local Vitest smoke config 使用单 worker，收集
`src/**/*.smoke.test.ts`。定向验证 OIDC runtime entry 时运行：

```bash
pnpm --filter @iam/oidc-provider test:smoke
```

`pnpm verify` 是 feature/merge candidate 的环境无关基线。跨平台 Node.js 编排器按以下顺序 fail-fast：

1. static：`pnpm lint`、`pnpm check:docs`、`pnpm check:env-names`；
2. typecheck：`pnpm typecheck`；
3. test：`pnpm test`；
4. smoke：`pnpm test:smoke`；
5. build：`pnpm build`。

`pnpm lint` 已包含全局 workflow 记录格式检查；Validation Plan 仍可显式追加聚焦的
`pnpm check:workflow -- --feature <feature-slug>`。`pnpm verify` 不代替外部资源通道；调用方先准备专用环境，再按改动类型追加：

```bash
# 数据库 schema 或查询行为
pnpm --filter @iam/db db:check
pnpm --filter @iam/role-assignment-resolution test:postgres

# 前端浏览器行为
pnpm --filter @iam/admin e2e
pnpm --filter @iam/sso e2e

# APISIX manifest（按目标环境提供已声明参数）
pnpm gateway:apisix:validate -- <environment-arguments>
```

PostgreSQL、浏览器和 Gateway 检查不会由 `pnpm verify` 自动准备或启动外部服务。所需环境缺失时应明确失败，并按
[Engineering workflow](../agents/workflow.md) 处理；不得静默 skip 或回退到开发环境。

## 工具链性能与缓存

### Lint 执行与配置所有权

默认 lint 保持 package-level 模型：每个 workspace 的 `lint` 脚本负责自己的文件范围，根 `pnpm lint` 在同一次
Turbo 调度中请求 package `lint` 和 `//#lint:root`。root task 检查根配置、`scripts/` 与 workflow 记录，并和
workspace task 一样按输入缓存；不要把根 ESLint 重新追加到 Turbo 之后，也不要用单进程全仓 ESLint 替换默认入口。

`packages/eslint-config` 是唯一共享 ESLint 配置所有者。root 与各消费 workspace 必须以 `workspace:*` 直接依赖它，
并只从公开的 root、backend 或 frontend preset 入口组合 package-local 差异。共享 preset 源码进入 Turbo 依赖图；
它变化时 lint 必须失效，也可能按内部 workspace 哈希语义保守地使消费者的 test/typecheck cache 失效。不要在消费端
重新声明 Antfu、typescript-eslint 或 React 插件图来规避这种 cache miss。

### 冷、热路径复测

性能比较使用相同命令连续执行，记录墙钟、user/system CPU 时间和最大 RSS；`--force` 表示绕过 Turbo task cache，
并不清空操作系统文件缓存。

```bash
# warm lint：先预热，再确认 10 秒反馈环连续三次通过
pnpm lint
timeout 10s pnpm lint
timeout 10s pnpm lint
timeout 10s pnpm lint

# 强制执行的全仓预算：各自连续运行两次
/usr/bin/time -f 'elapsed_seconds=%e user_cpu_seconds=%U system_cpu_seconds=%S max_rss_kib=%M' pnpm exec turbo typecheck --force --concurrency=3
/usr/bin/time -f 'elapsed_seconds=%e user_cpu_seconds=%U system_cpu_seconds=%S max_rss_kib=%M' pnpm exec turbo test --force --concurrency=2

# ESLint 配置 import/compose、首文件 lint、完整 workspace lint 与 RSS：backend/frontend 各五轮交错采样
node scripts/benchmark-eslint-config.mjs --rounds 5
```

基准脚本把每个 profile 的第一次文件系统观察与后续 warm observations 分开报告。评估 Node compile cache 时使用临时、
按 profile 与阶段隔离的 `--compile-cache-dir`；不得把首次写 cache 的样本混入热启动结论。

### Test、typecheck 与 TypeScript 双轨

根 `pnpm test` 使用 Turbo concurrency 2，package-local Vitest 普通测试使用 `maxWorkers: 25%`，Bun 普通测试显式使用
`--max-concurrency=2`；根 `pnpm test:smoke` 与 OIDC smoke runner 都使用 concurrency 1。根 `pnpm typecheck` 使用
concurrency 3。更大的 runner 可以显式覆盖普通测试或 typecheck 的外层预算：

```bash
pnpm exec turbo test --concurrency=<N>
pnpm exec turbo typecheck --concurrency=<N>
```

将 `<N>` 替换为该 runner 上单独复测过的值。
一次调优只改变一个并行层；不要同时提高 Turbo concurrency、测试 worker 与 TypeScript checker，也不要在
`turbo.json` 设置全局 concurrency。Vitest 普通测试统一使用 10 秒 timeout，Bun 普通测试保留 5 秒默认值；只有明确标注并
具备独立基线的 hermetic integration 才可在自身用例或 suite 使用 15 秒定点阈值。Process smoke 拥有独立 readiness 与
cleanup deadline，不得通过继续放宽普通 runner 的全局 timeout 处理抖动。

`pnpm exec tsc` 是 TypeScript 7.0.2 CLI；裸模块 `typescript` 是供 ESLint 等 API 消费方使用的官方 TypeScript 6
compatibility package。TS7 当前不提供等价 JavaScript API，不要让 API 消费方直接加载 TS7 CLI 包，也不要删除这条
双轨：

```bash
pnpm exec tsc --version
node -e "const wrapper=require('typescript/package.json'); const api=require('typescript'); console.log(wrapper.name, wrapper.version, api.version)"
```

### Remote Cache 边界

本仓库的正确性与本机预算不依赖 Remote Cache。团队或 CI 可以在平台侧按 Turborepo 的认证机制选择启用，用于复用
相同输入的 task 产物；凭据只放在 CI secret 或开发者本机，不提交 token、team 标识或生成的认证文件。性能基线须注明
Remote Cache 是否启用；强制执行数据继续使用 `--force`，避免把远端命中误记为本机执行性能。

## Commit 前检查

`pnpm install` 的 `prepare` 生命周期会安装版本化 Husky hook。pre-commit 只执行以下两项 guard：

```bash
git diff --cached --check
bun scripts/check-workflow.ts
```

前者检查 staged whitespace；后者在只包含 index 中 checker 与 `.scratch/` 的临时快照内运行，检查实际待提交 v2 记录的 Markdown 格式完整性，并在退出时删除快照。直接使用无第三方运行时依赖的 checker，避免临时快照触发依赖安装；工作树中的未暂存版本不会替代或干扰 staged 记录。Hook 不运行全仓
lint、typecheck、test 或 build，不分类 staged diff，也不检查当前分支、提交历史、ticket 状态转换或目标分支策略。
Checker 通过不等于 workflow gate、实际验证、评审或人工授权已经通过；这些责任继续由
[Engineering workflow](../agents/workflow.md)、agent preflight、实际命令结果和双轴评审承担。

维护者可在紧急情况下显式使用 `git commit --no-verify`，但这不是 agent 的常规路径，也不构成任何阶段授权。
Hook 未安装或损坏时运行 `pnpm prepare` 恢复；也可分别运行 `git diff --cached --check` 和
`pnpm check:workflow` 定位 whitespace 或当前工作树记录问题；若只有 hook 失败，还应检查 staged 记录与工作树是否不同。按改动范围仍需显式运行检查并在 ticket 的 `Resolution` 中记录结果：文档改动至少运行
`pnpm check:docs`，依赖改动增加冻结锁文件安装验证。

## 后端 Apps

- API backend：`pnpm --filter @iam/api <dev|serve|lint|test|typecheck>`
- Admin API backend：`pnpm --filter @iam/admin-api <dev|serve|lint|test|typecheck>`
- OIDC provider：`pnpm --filter @iam/oidc-provider <dev|serve|lint|test|test:smoke|typecheck>`
- Worker app：`pnpm --filter @iam/worker <dev|serve|lint|test|typecheck|user-profile:backfill|user-profile:repair>`

## 共享 Packages

使用相同的 filtered `lint`、`test` 和 `typecheck` 模式，例如：

```bash
pnpm --filter @iam/domain typecheck
```

角色分配解析的默认测试不依赖外部服务。真实 PostgreSQL 规则矩阵要求
`IAM_ROLE_ASSIGNMENT_TEST_DATABASE_URL` 指向专用非系统测试库，并显式运行：

```bash
pnpm --filter @iam/role-assignment-resolution test:postgres
```

该命令只在随机隔离 schema 中应用当前 migrations 并在结束后清理；不回退 `DATABASE_URL`，也不自行启动容器。

## 数据库

- `pnpm --filter @iam/db <db:push|db:generate|db:migrate|db:check>`
- `@iam/api` 保留 `db:push`、`db:generate` 和 `db:migrate` 的 compatibility wrapper。

## 前端 Apps

- Admin frontend：`pnpm --filter @iam/admin <dev|build|lint|test|e2e|typecheck|format>`
- SSO frontend：`pnpm --filter @iam/sso <dev|build|lint|test|e2e|typecheck|format>`

## Gateway 命令

使用 root shortcut `pnpm gateway:apisix:<validate|diff|apply>`，或：

```bash
pnpm --filter @iam/gateway-apisix <validate|diff|apply|lint|test|typecheck>
```
