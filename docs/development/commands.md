# 构建、测试与开发命令

根工具链要求 Node.js 24 与仓库 `packageManager` 声明的 pnpm 版本。优先使用 workspace script 和
`pnpm --filter`，让 Turborepo 与 package-local tooling 负责执行细节。

## 实现内循环

按当前 ticket 的受影响范围选择命令：

```bash
pnpm --filter <workspace> test
pnpm --filter <workspace> typecheck
pnpm check:architecture
pnpm check:docs
git diff --check
```

格式与 lint 由[提交 Hook](#commit-前检查)自动处理；上面的内循环无需手动追加这两类命令。
手动验证与修复后的结果复用见[工作流补充](../agents/workflow.md#验证节奏)，AFK 交接与批后检查见
[AFK 工作流](../agents/sandcastle-afk.md#验证节奏)。

根工具链变化的聚焦 Bun 测试：

```bash
pnpm test:integration --workspace iam-monorepo --file scripts/test-integration/architecture/architecture-guard.integration.test.ts
pnpm test:integration --workspace iam-monorepo --file scripts/test-integration/runner/test-orchestration.integration.test.ts
bun test scripts/tooling/__tests__/tooling-contracts.test.ts
bun test scripts/tooling/__tests__/quality-tooling-ownership.test.ts
```

Canonical collection 与编排变化还应运行：

```bash
pnpm test:unit
pnpm test:integration
```

完整 root Gate 只在准备 merge、release 或用户明确要求时运行；ticket 实现内循环不重复运行。按需要选择基础
`pnpm verify`、全资源 `pnpm verify:ci` 或包含 Full-system E2E 的 `pnpm verify:release`。

统一格式与规则命令的真实 CLI 行为使用临时 Git 仓库，通过根 `pnpm test:integration --workspace iam-monorepo`
收集，不需要数据库或 Redis。

该 root Integration collection 还通过真实 Docker CLI 验证 `.dockerignore` 的构建上下文排除与 Custom SSO Compose
环境传值，需要可用的 Docker CLI、Compose、Buildx 和运行中的 Docker server。构建只使用合成临时上下文，
从 `scratch` 导出本地文件；配置检查显式提供合成 env-file。这些测试不启动 runtime 容器，不加载本地 `.env`，
不进入默认 `pnpm verify`；环境缺失时直接失败。

## Sandcastle AFK

本机 Docker + Codex CLI 执行全仓 `ready-for-agent` backlog；选票、评审、合并和关票权限见
[AFK 工作流](../agents/sandcastle-afk.md)。`pnpm sandcastle` 会调用模型、修改代码和 GitHub issues，
并把通过验收的 ticket 分支普通合并到启动时的调用分支；运行前选定该分支。

首次使用时，按 `.sandcastle/.env.example` 创建未跟踪的 `.sandcastle/.env`，填写 `GH_TOKEN`。
默认认证为 ChatGPT/Codex 账号：先执行 `codex login`，并确保 Codex 使用文件凭据存储；runner 会把本次运行的
`auth.json` 复制到临时目录后挂载进 Docker。退出前把 CLI 刷新后的凭据写回来源文件，再删除暂存目录；
检测到来源登录状态已变化或保存失败时，不覆盖该状态，报错并保留启动时打印的恢复目录。
此同步不提供跨进程登录锁，运行期间避免在宿主同时刷新或重新登录同一份凭据；强制结束进程后也应核对该恢复目录。
需要 API 计费时显式设置 `CODEX_AUTH=api-key` 并填写
`CODEX_API_KEY`；`CODEX_AUTH_FILE` 可指定登录凭据文件。GitHub 固定为 `cyy1998/shgas-iam`。
宿主需要仓库工具链、Git、GitHub CLI 和运行中的 Docker；镜像内版本与依赖以 `.sandcastle/Dockerfile` 为准。

私有 `docker.xuanyuan.run` 镜像需要认证时，在 `.sandcastle/.env` 显式设置 `SANDCASTLE_DOCKER_CONFIG_FILE`。
它指向调用者提供的可读普通 JSON 文件，绝对路径直接使用，相对路径从调用仓库根目录解析。只允许顶层 `auths` 与
单一 `docker.xuanyuan.run`，其中 `auth`、`identitytoken` 或 `registrytoken` 必须为非空字符串；不支持
`credsStore`、`credHelpers`、`credentialHelpers`、多 registry 或其他宿主配置字段。未设置时不读取或复制宿主 Docker 凭据，
也不调用 credential helper。`sandcastle:check` 检查文件与格式，不证明 registry 认证已成功。

每个执行器在模型回调前重新校验来源，复制到仓库外的私有 `tmpdir/iam-sandcastle-docker/executor-<run-id>/config.json`，
只读挂载到 `/home/agent/.docker/config.json`。来源路径与认证内容不写入运行记录、日志或错误，也不透传宿主路径到
Turbo。调用者在需要创建新执行器期间保持源文件可读并自行保管；runner 只回收自己的副本，不改写或删除源文件。
只有确认创建者 sandbox 已停止后才回收副本；无法确认时保留，按下方准确执行器恢复入口清理，不扫描临时目录。

```bash
pnpm sandcastle:build
pnpm sandcastle:check
pnpm sandcastle:smoke
pnpm sandcastle --smoke-docker
pnpm sandcastle
pnpm sandcastle --iterations 2 --parallel 2 --model <model>
```

`sandcastle:build` 构建执行镜像；`sandcastle:check` 只预检工具、镜像和认证配置。
`--smoke-docker` 通过实际 UID 1000 的两个 sandbox 单独验证共享宿主 Docker：专用 socket 的 daemon-side 挂载、
supplementary socket group、Docker CLI/Compose/Buildx、host-network 宿主 loopback HTTP、候选文件传输与构建、
Chromium 双 hostname 的 host-only Cookie、停止容器后的 `docker cp` 和并行 project 的动态端口/准确清理。
构建输入经文件传输交付给 sandbox 内 Docker CLI，不把 sandbox 路径当作 daemon bind source。
此模式需要 Linux Docker Engine，或 Docker Desktop 4.34+ 已启用 host networking 并关闭 Enhanced Container Isolation；
条件不满足时明确失败，不自动切换其他网络、DinD 或代理。共享 daemon 与 host network 提供宿主 Docker 管理和网络访问能力，
project 名称仅用于资源归属，不构成权限隔离。普通文件 mounts 继续执行 SDK 的客户端路径检查。
运行结果、工具版本、receipt 和准确 project/sandbox 标识保存在 `.sandcastle/resources/docker-smoke-<run-id>/`；
成功、失败和可捕获中断均从宿主清理本次资源。强杀或清理失败后，按该记录的每个 `project` 和 `composePath` 执行
`docker compose --project-name <project> --file <composePath> down --volumes --remove-orphans --rmi local`，
再按准确 `sandboxName` 清理 sandbox；不扫描名称前缀或 prune。此聚焦 smoke 不调用模型或写入 GitHub。
既有 `sandcastle:smoke` 先执行上述 Docker 检查，再运行下面的完整工具链 smoke。
`sandcastle:smoke` 创建可销毁的 sandbox，验证工具链、Merger 依赖挂载和共享 Docker，并用本地桩程序
让 Planner、Implementer、Merger 三份真实 prompt 经过 SDK 的参数校验与展开，检查 Codex 生效角色配置；不调用模型或访问 GitHub，
也不证明真实 Codex 模型已执行双轴子代理评审。
Smoke 通过实际根 Integration → Turbo → Bun 连续运行两条资源命令，观察不同 project、动态 URL、空数据起点和宿主记录，
并验证另一执行器异常后按准确记录恢复、并行环境隔离及显式 keep。共享资源 owner 的完整故障矩阵由其专属测试承担。
Smoke 还安装 Linux workspace 依赖，验证 Turbo 缓存写入及再次命中，执行 `pnpm verify:static`，并检查只读缓存会阻止
agent 命令启动。各阶段统一使用容器独占的 `TURBO_CACHE_DIR=/tmp/iam-sandcastle-turbo/cache`；调用模型前以实际
执行用户检查目录创建、文件写入和删除，失败则报错并进入既有容器清理流程。缓存随容器清理，不挂载宿主缓存，也无需 root 权限。
镜像预装与 `.sandcastle/Dockerfile` 中 Playwright 固定版本匹配的 Chromium 和 Linux 系统依赖，浏览器路径为
`PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright`。升级仓库 Playwright 时同步镜像版本并重新运行 `pnpm sandcastle:build`。
Turbo 的 Browser/E2E tasks 窄透传该变量，使正式根命令使用镜像内 Chromium；不自动跳过实际用户的 browser preflight。
Smoke 以实际非 root 用户执行原浏览器预检，并用 workspace 的 Playwright 启动 headless shell 和完整 Chromium、执行页面脚本后关闭；
不设置 `PLAYWRIGHT_E2E_SKIP_PREFLIGHT`。版本、路径、权限或依赖不匹配都会使 smoke 失败。
Implementer 和 Merger 在 Codex CLI 启动前统一执行 `scripts/sandcastle/prepare-workspace.sh`：安装锁定依赖、清理前端生成目录内容、
显式运行 Admin/SSO `setup`。初始化任一步非零退出即停止；不依赖 SDK ready hook 或 `postinstall` 隐式保证成功。
每个执行器独立挂载两个前端的 `src/.umi`、`src/.umi-production`、`src/.umi-test`，结束后清理暂存目录，
保留宿主已有生成文件；Linux 类型不会写回宿主生成目录。Planner 只读选票，不执行这套依赖初始化。
容器内修改依赖、Umi 配置或路由后，再运行 `sh scripts/sandcastle/prepare-workspace.sh` 更新环境；普通业务改动无需重复初始化。
Smoke 覆盖旧宿主生成文件隔离、两个前端类型检查，以及安装或 setup 失败时不启动 agent。
依赖安装保留 `HUSKY=0`，避免标准 Husky 安装改写可写挂载的宿主 Git 元数据。Implementer 与 Merger 在同一执行 shell
中启用容器私有 hook 启动器，通过追加进程级 `core.hooksPath` 复用仓库 `.husky/pre-commit`，保留既有进程级 Git 配置。
必要工具或 hook 初始化失败会阻止 agent 启动；容器不写宿主 local Git 配置或 `.husky/_` 包装文件。
Smoke 分别在两种 checkout 中用真实普通 commit 验证自动修复、错误阻断与宿主配置保持不变。
运行参数默认 10 批、最多 2 张 ticket 并行；`--iterations`、`--parallel` 只调整本次运行。
Merger 每批最多 10 次 SDK 迭代，正常结束但未输出完成标记时继续；这与 `--iterations` 的批次数分别计数，
也不重试初始化或进程异常。失败修复与继续执行规则见 [AFK 工作流](../agents/sandcastle-afk.md#批量实施)。
`--model`（优先）或 `SANDCASTLE_MODEL` 只覆盖 Planner/Merger 的模型，两者默认 `gpt-6-astra`、思考程度 `high`。

Planner 从仓库 `.codex/agents/implementer-{light,standard,deep}.toml` 定义的实施者中选择，
实施者的模型、思考程度与职责以这些角色文件为准。当前 light 为 `gpt-5.6-luna` / `medium`，
standard 为 `gpt-5.6-sol` / `high`，deep 为 `gpt-6-astra` / `xhigh`。
双轴评审使用 `.codex/agents/standards-reviewer.toml` 与 `.codex/agents/spec-reviewer.toml`，
两轴均为 `gpt-6-astra` / `high`，不随实施者档位降低。Runner 为容器内 CLI 提供子代理配置，
不修改用户宿主 Codex 配置；会话内评审和十轮上限见[双轴评审流程](../agents/sandcastle-afk.md#批量实施)。

Codex CLI 0.154 的角色 override 忽略 `sandbox_mode`，因此评审角色的只读要求属于职责约束，不能保证子代理在
操作系统层面只能读取。双轴由实施者执行、Merger 阅读报告核对，runner 不解析评审报告或会话文件，
也不重复实施者的静态和 diff 检查；职责见[AFK 工作流](../agents/sandcastle-afk.md#双轴评审子代理生命周期)。

普通失败和 Ctrl+C 会先停止并等待准确的创建者 sandbox，再用独立有界预算清理该执行器 registry 中的资源记录。
执行器记录与 registry 留在 `.sandcastle/resources/executor-<run-id>/`，正式命令记录与 Compose 环境留在稳定挂载的
`test-results/integration/<run-id>/`；强杀或收尾失败后可执行
`pnpm sandcastle --recover-executor .sandcastle/resources/executor-<run-id>/executor.json`。
恢复复用同一 stop/wait 与 exact-record 清理，尊重显式 keep；需要销毁保留的单个环境时，使用该记录打印的
`pnpm test:resources:cleanup --record <repo-relative run.json>`。不扫描其他执行器或名称前缀。
`run.lock` 记录进程与目标分支，确认旧进程已结束后才移除该文件。
无法确认创建者已停止或宿主同步退出时保留锁；先按执行器记录恢复，核对停止事实后再移除锁。
已有 ticket 分支可重新进入评审和合入交接，包括代码已合入、GitHub 关票尚未完成的情况。
成功批次的本地 ticket 分支由 runner 在合入与关票核对后清理；分支偏移、worktree 占用等清理失败会停止后续批次，按报错恢复。
队列耗尽前还有一次父 Spec 收尾核对。锁定的 Sandcastle 0.12.0 使用 `patches/` 中的 signal 补丁，允许此 runner
通过 AbortSignal 等待清理，避免 SDK 提前 `process.exit`；升级依赖时须重新验证普通与 provisioning 中断路径。

Planner、Implementer 与 Merger 均通过共享宿主 daemon 和 host networking 运行，在模型命令前由实际 UID 1000 检查
socket 权限、Docker CLI/Compose/Buildx 和宿主 loopback 可达。执行器不预建 PostgreSQL/Redis，不注入私网 URL。
资源测试使用根 `pnpm test:integration`（支持 workspace/file 筛选）或 `pnpm test:e2e`，每条命令独立创建和销毁环境。
Linux sandbox 内独立安装 workspace 依赖，不复用 Windows `node_modules`。Windows 的来源 checkout 可以是 worktree；
SDK 固定补丁只挂载目标 worktree 的 Linux Git 指针，Git 长路径配置仅用于具体命令，不改宿主配置。
必需检查缺少运行条件时保留 ticket open，不能以基础 `pnpm verify` 通过代替。

## Workspace 命令

Gateway API：`pnpm --filter @iam/gateway-apisix start`；开发监听使用 `dev`。启动前按
[`apps/gateway/.env.example`](../../apps/gateway/.env.example) 提供 `IAM_GATEWAY_*` 配置。默认独立监听 30004，
`GET /health` 仅证明 HTTP 已启动；`POST /validate`、`/diff`、`/apply` 通过 `apikey` 验证 scope 对应的当前 Client。
三种操作以 JSON 提交 scope、YAML 文本和请求级 variables；apply 另支持 dryRun/prune。
旧 CLI 与根 `gateway:apisix:*` 已退役，HTTP 发布步骤和只读数据库权限见
[Gateway 发布手册](../releases/apisix-gateway-release.md)。
认证 Integration 使用根 `pnpm test:integration --workspace apps/gateway` 准备的
`IAM_GATEWAY_TEST_DATABASE_URL`，不读取开发数据库；请求和配置说明见 [Gateway README](../../apps/gateway/README.md)。

当前会话和 Snapshot 维护入口为 Worker `session:clear:inventory`、`session:clear`、`session:clear:verify`、`client-snapshot:repair`、`client-snapshot:verify`。
同名 scripts 通过 `bun run` 默认读取 `apps/worker/.env`，已有进程环境变量优先。
资源、当前布局、namespace、停流/排空与失败处理见[统一维护手册](../releases/unified-session-maintenance.md)。
Profile 重建及 Subject Access 恢复见[Profile 维护手册](../releases/user-profile-maintenance.md)；
一次性升级工具集中在[历史数据维护工具](#历史数据维护工具)，不用于当前代日常恢复。

- `pnpm dev`
- `pnpm build`
- `pnpm format`
- `pnpm format:check`
- `pnpm lint`
- `pnpm lint:fix`
- `pnpm test`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:e2e`
- `pnpm typecheck`
- `pnpm verify:static`
- `pnpm verify`
- `pnpm verify:ci`
- `pnpm verify:release`
- `pnpm e2e:install`
- `pnpm e2e:install:browsers`
- Full-system runtime lifecycle（workspace-local）：`pnpm --filter @iam/e2e-system runtime:lifecycle`
- Full-system Admin Custom SSO journey（workspace-local）：`pnpm --filter @iam/e2e-system admin:journey`
- Full-system HR Admin User Management journey（workspace-local）：`pnpm --filter @iam/e2e-system hr-admin:journey`
- Full-system OIDC Authorization Code + PKCE journey（workspace-local）：`pnpm --filter @iam/e2e-system oidc:journey`
- Full-system exact-project recovery（workspace-local）：
  `pnpm --filter @iam/e2e-system runtime:cleanup -- --descriptor <run-descriptor.json>` 或
  `pnpm --filter @iam/e2e-system runtime:cleanup -- --project <exact-project>`
- 后端 Architecture Guard（唯一静态架构入口）：`pnpm check:architecture`
- 文档索引与 freshness guard：`pnpm check:docs`
- Env naming guard：`pnpm check:env-names`
- 组织搜索首建：`pnpm --filter @iam/worker organization-search:backfill`。命令使用 `IAM_WORKER_DATABASE_URL` 与
  Worker Redis 配置，只创建组织队列及数据库资源，退出时关闭；按批保存全部组织（含删除组织）的源变化记录并唤醒普通
  `organization-search` consumer，报告中的 `enqueued` 不表示已经发布。消费者由 dev/prod Compose 的
  `worker-organization-search` 服务独立启动；完整维护窗口与放流要求见
  [Organization Filter DSL](../features/organization-search/filter-dsl.md#版本切换与维护)。
- 组织搜索补偿：`pnpm --filter @iam/worker organization-search:repair -- --limit 500 --deadline-ms 30000`。
  两个持久阶段的回收、报告、重复执行和外部周期责任见
  [组织搜索维护](../releases/organization-search-maintenance.md#日常补偿与外部调度)。
- 组织搜索全量只读核验：`pnpm --filter @iam/worker organization-search:verify -- --deadline-ms 30000`。
  只使用 `IAM_WORKER_DATABASE_URL`，同一 `REPEATABLE READ READ ONLY` transaction 完整观察源组织、闭包、文档、
  删除墓碑和两阶段工作；`status: passed` 且退出 0 才通过数据门禁。没有 schema 选择、部分 batch 或入队副作用。
  首次、升级、失败重跑与人工放流见[组织搜索维护](../releases/organization-search-maintenance.md)。

统一格式与规则命令适用于根目录和所有 workspace，例如 `pnpm --filter @iam/admin format:check`：

这些入口供显式调用和聚焦排查；日常提交及聚合验证已经自动执行，无需再逐项手动运行。

| 命令           | 行为                                                  |
| -------------- | ----------------------------------------------------- |
| `format`       | 只排版，不整理 import 或修复代码规则。                |
| `format:check` | 只读检查格式，差异或解析错误非零退出。                |
| `lint`         | 只读检查代码规则及 import 整理要求。                  |
| `lint:fix`     | 应用 Biome 安全修复及 import 整理；剩余错误非零退出。 |

根命令从仓库根目录检查，workspace 命令从自身目录检查，直接调用工具 CLI 并共用根配置。
文件由工具的目录遍历、扩展名 glob 与 ignore 配置选择，包含范围内尚未提交的文件。
公开命令不提供额外的文件筛选参数；聚焦单文件时可使用 `pnpm exec biome`、`pnpm exec prettier` 或
`pnpm exec stylelint` 的原生参数，并遵守上述文件分工。
这些命令直接运行工具，不复用 Turbo 检查缓存，因此配置或依赖变化后不会复用旧通过结果。
在声明的 pnpm 版本与仓库锁文件就绪的环境中，`verifyDepsBeforeRun: error` 使项目依赖未就绪时直接失败，
需先显式执行 `pnpm install`，检查入口不隐式安装项目依赖或运行安装生命周期。
Biome 负责 JS/TS、JSX/TSX、JSON/JSONC、CSS；Prettier 只负责 Less、YAML、Markdown。
Stylelint 只检查 Less，不自动修复。YAML 不执行通用 lint，也不会隐式触发 Gateway 等发布验证。
其他类型（如 SQL、Shell、TOML、HTML 和二进制资产）不由这组命令验证，继续使用各自消费工具与专属检查。

生成目录、依赖锁文件、数据库 migration 快照、vendored API 文档资源、`openspec/`、`.scratch/`、历史审查和
外来 skill 副本不参与格式及规则改写。排除范围由 `biome.jsonc`、`.prettierignore` 和
`stylelint.config.mjs` 维护；支持文件的解析失败不会视为无匹配跳过。
`lint:fix` 保留裸副作用 import 的顺序，不启用 unsafe 修复；格式细节见[编码风格](coding-style.md)。

## 测试与验证通道

日常入口为 `pnpm test:unit`、`pnpm test:integration`、`pnpm test:e2e`；`pnpm test` 代理 Unit。
命名、唯一收集、缓存和并发预算见[测试编排架构](../architecture/testing-architecture.md#root-与-package-commands)。

根 Integration 入口根据 workspace manifest 声明创建本次 PostgreSQL/Redis，等待就绪后通过 Turbo 注入 owner-specific URL；
结束时清理准确 Compose project 的容器、网络和数据卷。未声明这两类服务的集合不创建它们。
内部按 Bun → Vitest → Playwright 执行器顺序调度，Turbo concurrency 为 1、禁用缓存，首错停止。
执行器名称仅服务内部调度，目录按功能组织。

`--workspace` 接受 package name 或仓库相对 workspace 目录；`--workspace` 与 `--file` 均可重复。
文件接受绝对路径、仓库相对路径或 owner 相对路径，必须属于所选 owner 的 canonical collection。
无匹配、范围外文件和未知参数均失败，不自动扩大范围。旧 profile 命令及 `--profile` 不再支持。

```bash
pnpm test:integration
pnpm test:integration --workspace @iam/worker
pnpm test:integration --workspace @iam/worker --file test-integration/session-clear/session-clear-command.integration.test.ts
pnpm test:integration --workspace apps/admin --workspace apps/sso
pnpm test:integration --workspace iam-monorepo --file scripts/test-integration/resources/managed-resources.integration.test.ts
```

每个 owner 在自己的 `package.json` 声明执行器与服务映射，例如 API：

```json
{
  "iamTest": {
    "integration": {
      "bun": {
        "postgres": "IAM_API_TEST_DATABASE_URL",
        "redis": "IAM_API_TEST_REDIS_URL"
      },
      "playwright": {
        "redis": "IAM_API_TEST_REDIS_URL"
      }
    }
  }
}
```

空对象表示该执行器不需要 PostgreSQL/Redis；Bun 与 Vitest 不同时拥有一个 owner 的非浏览器 Integration，Playwright 可并存。
根入口与内部 runner 使用同一解析器，保留既有内部连接变量名。单文件也使用所属 workspace＋执行器声明的完整资源集合，
接受多启动部分服务，不引入逐文件资源标签。浏览器、HTTP server、子进程和临时目录继续由所属 harness 管理。

内部脚本为 `test:integration:bun|vitest|playwright`，root 为 `test:integration:bun:root`；脚本通过
`scripts/run-package-integration.mjs <executor> [--preflight <path>] -- <executor> ...` 消费本次选择和环境。
这些脚本不作为 package-local 资源测试入口；手动和 AFK 均通过根命令选择 owner/file。Unit 支持 package-local 执行：

```bash
pnpm --filter @iam/api-core test:unit
pnpm --filter @iam/admin test:unit
```

每次资源运行的准确 project、Compose 配置、环境文件和产物位置登记在
`test-results/integration/<run-id>/run.json`，其中路径相对于仓库根目录。内部 runner 核对本次 run ID、运行记录状态及
完全相同的 URL，不接受任意外部地址，也不另建正式环境。初始化、测试、进程关闭或清理失败均非零退出；
辅助诊断失败只告警，原始失败和清理失败均保留。

`--timeout-ms` 为整条命令预算，`--cleanup-timeout-ms` 为独立清理预算，默认分别 30 分钟和 30 秒。
运行前加 `--keep-resources` 显式保留环境；清理失败或强杀后按同一准确记录恢复：

```bash
pnpm test:resources:cleanup --record test-results/integration/<run-id>/run.json
```

Root 的资源 owner 测试调用受控独立根命令验证创建、故障、keep 与恢复，外层不另建无用资源；其他 root Integration
按 architecture、docker、quality、runner、sandcastle 等功能组织。
Admin/SSO Playwright 保留 API mocks、package-local `webServer`、base URL 与单 Chromium project，属于 Integration。
完整 OIDC 协议由 OIDC package 与 API 的真实资源集合验证；正式固定套件仍使用下方独立入口。

### Full-system E2E

`pnpm test:e2e` 由 `@iam/e2e-system` 管理完整临时系统：Docker 与浏览器 preflight、迁移、seed、
readiness、同 origin 旅程及独立双 hostname 阶段。完整行为和诊断契约见
[测试编排架构](../architecture/testing-architecture.md#full-system-e2e)与
[双入口验收](../architecture/testing-architecture.md#双入口验收与产物隔离)。

只使用测试生成的数据与凭据，不接入生产端点、生产凭据或真实 PII。产物位于 `e2e/system/test-results/`；
workspace-local 单 journey 命令用于聚焦调试：

```bash
pnpm test:e2e
pnpm --filter @iam/e2e-system runtime:lifecycle
pnpm --filter @iam/e2e-system admin:journey
pnpm --filter @iam/e2e-system hr-admin:journey
pnpm --filter @iam/e2e-system oidc:journey

# 宿主异常后只按一个明确恢复目标清理；不接受 glob/prefix scan
pnpm --filter @iam/e2e-system runtime:cleanup -- --descriptor test-results/<run-id>/run-descriptor.json
pnpm --filter @iam/e2e-system runtime:cleanup -- --project iam-e2e-<run-id>
```

通过 `pnpm --filter` 运行时，相对 descriptor 路径从 `e2e/system/` 解析；也可使用绝对路径。
显式恢复有独立 120 秒 cleanup deadline，只清理给定 descriptor 或 exact project；不接受 glob、prefix 或 prune。
Cleanup 失败会非零退出并保留 descriptor，可使用同一目标重试。生命周期和进程终止规则见
[测试编排架构](../architecture/testing-architecture.md#full-system-e2e)。

### 聚合验证

`pnpm verify` 通过 `scripts/verify.mjs` 按以下顺序 fail-fast：

1. static：`pnpm format:check`、`pnpm lint`、`pnpm check:docs`、`pnpm check:env-names`、`pnpm check:architecture`；
2. typecheck：`pnpm typecheck`；
3. test:unit：`pnpm test:unit`；
4. build：`pnpm build`。

`pnpm verify:static` 使用同一 runner 的 `--static` 参数，仅运行上述 static 阶段；默认 `verify` 复用该阶段，
未知参数、启动失败和子进程异常均非零退出。各单项检查命令保留用于排查。

`pnpm verify:ci` 固定顺序执行 `verify -> test:integration`；`pnpm verify:release` 固定顺序执行
`verify:ci -> test:e2e`。两者都是 provider-neutral 的浅组合：任一 owner command 非零即停止并透传失败，不另行解释资源、
diagnostics 或 cleanup。命令名不表示已经接入 CI provider，也不授予 merge、发布或部署权限。Integration 资源与 Full-system
E2E lifecycle 的详细契约分别由本页后续专用资源说明和 [测试编排架构](../architecture/testing-architecture.md) 持有。

统一 Snapshot 通过 Core Redis、Admin composition 和 Worker CLI 验证；最终 schema/数据门禁分别使用 DB/Worker PostgreSQL。
当前维护步骤见[统一维护手册](../releases/unified-session-maintenance.md)，旧工具操作见[历史数据维护工具](#历史数据维护工具)；测试不提供目标环境操作授权。

聚合验证的证明边界见[默认验证与交付](../architecture/testing-architecture.md#默认验证与交付)。
候选结果和平台验收状态记录在对应 issue 或验收记录中。

真实资源检查不进入 `pnpm verify`，需要时通过根入口选择 owner 或文件：

```bash
# API/OIDC 联合 PG/Redis；由本次命令创建和清理
pnpm test:integration --workspace @iam/api

# Database migration contract
pnpm --filter @iam/db db:check
pnpm test:integration --workspace @iam/db

# Worker 命令、队列、恢复与真实资源接线
pnpm test:integration --workspace @iam/worker

# 共享 PostgreSQL owners
pnpm test:integration --workspace @iam/role-assignment-resolution --workspace @iam/organization-responsibility-resolution
pnpm test:integration --workspace @iam/organization-search-read-model

# Admin 事务和缓存；User Profile 同时声明 PG/Redis
pnpm test:integration --workspace @iam/admin-api --workspace @iam/user-profile-read-model

# 共享 Redis owners；Core 集合仍按其 manifest 提供完整资源需求
pnpm test:integration --workspace @iam/session-kernel --workspace @iam/api-core --workspace @iam/oidc

# 前端浏览器 Integration 不启动 PG/Redis
pnpm test:integration --workspace @iam/admin --workspace @iam/sso

# Gateway HTTP、真实 PG/APISIX 与正式进程的聚焦验证
pnpm test:integration --workspace apps/gateway
```

底层 package runner 消费本次已准备环境，内部 owner URL 继续用于正式 CLI 的 scoped/runtime 配置传递；
不单独准备外部 URL 或调用另一套容器生命周期。资源隔离与停止后重置见
[专用资源与隔离](../architecture/testing-architecture.md#专用资源与隔离)。

Worker targeted/full Snapshot repair 与独立 verify 共用本次 `IAM_WORKER_TEST_REDIS_URL`，不新增 cleanup-specific env，
也不跨其他可见环境推断 Redis identity。Core 的 full restore 使用本次 `IAM_API_CORE_TEST_REDIS_URL`，与 Worker 一样
由受管理独占 DB 和停止后 reset 保证用例干净起点。两者在 reset 前验证 non-owner sentinel 和旧 namespace 的保留、只读 verify 与
生产部分失败重跑；随后停止本例执行者并整体重置独占 Redis DB，不再为 fixture 逐键登记或精确 UNLINK。

旧 Ticket 12 的 V1 rehearsal/backfill/verify 入口已随 strict V2 激活撤销。维护者只使用本页列出的
User Profile maintenance、正式 API/OIDC entry、hermetic process smoke；不得把 URL credential、
Token、Subject、完整 Redis key 或 Secret 写入验收记录。

## 权限点退役的一次性跨制品验收

Owner 为 `@iam/api`；用途是 [Spec #269 / Ticket #274](https://github.com/cyy1998/shgas-iam/issues/274)
的旧协议凭据连续性验收，移除复核日期为 2026-11-21。入口不进入默认 Integration，不构成线上多代兼容能力。
先在来源提交 `99b27c614a668cd66d354d4581ae5166a7275ff8` 的独立 checkout 准备旧 API/Worker、正式 migrations
和公开 owner 测试支持制品，记录构建命令、来源及文件 SHA-256。不得把旧入口链接到当前 workspace，或用当前制品创建的凭据代替旧状态。
本次固定制品与清理记录的证据引用保存在该 ticket；后续复现须重新核对来源及 manifest。

显式配置文件使用绝对路径：

```json
{
  "baselineManifest": "<fixed-old-artifacts>/manifest.json",
  "outputDirectory": "<absolute-task-evidence-directory>",
  "candidate": "<fixed-candidate-sha>"
}
```

通过[一次性 fixture](../../apps/api/test-integration/privilege-retirement/cutover.fixture.ts)执行：

```bash
pnpm --filter @iam/api exec bun --no-env-file run test-integration/privilege-retirement/cutover.fixture.ts <config.json>
```

外层复用正式根资源 owner 创建、登记及销毁本次 PostgreSQL/Redis，内部核对完全相同的受管理 URL。
fixture 固定旧制品来源/hash，建立真实旧 Profile 和协议状态，经正式迁移、新 Worker 全量重建和独立双 gate，
再从同 issuer 新 API 使用旧凭据，并在 smoke 关闭后再次完整核验。退出 0 且完整 report 为 passed 才表示本次演练通过；
阶段部分成功、资源关闭或清理失败均不算通过。证据目录独立于 Browser Integration 的可清理输出。
本地演练不证明目标环境停流、备份、第三方旧副本处理或生产放流；正式维护按[Profile 手册](../releases/user-profile-maintenance.md#权限点退役的协调切换)。

## OIDC 协议套件

正式 fixture 位于 [oidc-suite.fixture.ts](../../apps/api/test-integration/oidc/oidc-suite.fixture.ts)，
独立 RP 位于 [oidc-rp.integration.test.ts](../../apps/api/test-integration/oidc/oidc-rp.integration.test.ts)。
它们不是普通浏览器旅程，也不由基础 verify 自动运行。

### 固定套件与运行配置

复现使用 OpenID conformance-suite release-v5.2.4，固定提交
`ab35a8df4864da35b49eff11483e204e01aa7961`。在对应源码目录应用
[S256 补丁](../features/oidc/conformance-suite-s256.patch)，以 Java 21.0.4、Maven 3.9.11 构建：

```bash
git apply --unidiff-zero <iam-checkout>/docs/features/oidc/conformance-suite-s256.patch
mvn -B -Dmaven.test.skip -Dpmd.skip clean package
```

这些参数跳过套件自身构建测试/PMD，不表示已执行 IAM 协议验证。
补丁仅在 Code Flow 且 iam_s256_required=true 时增加 S256 sequence/verifier，默认关闭；
仓库 suite runner 为本用途显式启用，专用 PKCE 正负用例仍保持原构造，不修改官方断言。

独立 fixture 自动创建并销毁本次 PostgreSQL/Redis，与根资源入口复用同一 owner、运行记录和恢复能力。
调用方准备固定套件及其 MongoDB 6.0.13、Java 原生 HTTPS 与合成 PKCS12、loopback 端口和
fintechlabs.devmode=true。Node/tsx/Playwright 使用仓库锁定依赖。
API 候选由 fixture 启动，TLS 代理不改协议参数，NODE_EXTRA_CA_CERTS 只传给任务 Node 子进程，
不修改机器 trust store。

config.json 示例（填写本次真实路径与候选 SHA）：

```json
{
  "suiteOrigin": "https://localhost:<suite-port>",
  "outputDirectory": "<absolute-task-evidence-directory>",
  "candidate": "<candidate-sha>",
  "issuerMode": "dual",
  "tls": { "keyPath": "<key.pem>", "certPath": "<cert.pem>" }
}
```

issuerMode 默认 dual；需要指定主机时使用 fixture 的 hostnames 配置。
可选 plans/modules 仅用于聚焦重跑，未选择项必须作为未执行记录。
outputDirectory 使用独立任务目录，不放在会被 API Browser 清理的默认产物根。

```bash
pnpm --filter @iam/api exec bun run test-integration/oidc/oidc-suite.fixture.ts <config.json>
pnpm test:integration --workspace @iam/api
```

需要调试保留时，在独立 fixture 命令的配置路径后增加 `--keep`；结束时按打印的准确记录清理，内部 marker 不作为公开运行模式。
fixture 负责候选 API、TLS 代理、随机 PG schema、Redis 和 Node 进程树，driver 负责浏览器与官方模块。
信号/失败仍逐项尝试收尾，再以独立预算清理准确 project；超时不冒称清理完成，原始失败与清理失败均保留。
官方 REVIEW 使自动 driver 非零，必须独立完成图像判读并保留官方结果，不把它改写为套件 PASSED。
不同 loopback 端口只证明两 issuer 协议；hostname/Cookie 隔离须由真实 APISIX/browser 验证，
见[验证归属](../architecture/architecture-verification.md#行为资源与系统验证)。

## 历史数据维护工具

`audit:actions` 仍用于旧审计 action 或旧备份规范化，显式提供 `IAM_WORKER_DATABASE_URL`：

```bash
pnpm --filter @iam/worker audit:actions -- <inventory|apply|verify>
```

apply 要求 `--writers-stopped`；冲突拒绝、事务锁、独立 verify 与未知提交恢复按
[审计规范化手册](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/audit-action-canonicalization.md)执行。

b648、managed-callback 配置升级、`online-auth:state --layout source` 及配套旧版本演练已退役。
历史来源升级须恢复[固定历史版本的工具与流程](https://github.com/cyy1998/shgas-iam/tree/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases)，
不能在当前 checkout 调用这些入口。当前状态维护只接受显式 `--layout unified`，历史结果不构成当前候选通过声明。

## 工具链强制执行

`pnpm test:e2e` 在同 origin 全系统基线之后，再启动独立 exact project 执行两个不同 hostname 的
`dual-entry.spec.ts`；不需要另设环境变量选择第二阶段。workspace-local journey 仍只服务聚焦调试。
双入口协议的命令与资源见[OIDC 协议套件](#oidc-协议套件)。

API Browser 的输出固定到 `test-results/browser`；suite 的 outputDirectory 应选择独立任务目录，不能依赖
其他 runner 的可清理输出根保存跨通道验收材料。

```bash
# 绕过 Turbo task cache 的强制执行
pnpm exec turbo typecheck --force --concurrency=3
pnpm exec turbo test:unit --force --concurrency=2
```

`--force` 不会清空操作系统文件缓存。性能比较应使用相同命令和 runner，记录墙钟、CPU 与最大 RSS，一次只调整一个
并行层。

TypeScript CLI 与兼容 API 的版本检查：

```bash
pnpm exec tsc --version
node -e "const wrapper=require('typescript/package.json'); const api=require('typescript'); console.log(wrapper.name, wrapper.version, api.version)"
```

## Commit 前检查

`pnpm install` 的 `prepare` 生命周期安装版本化 Husky hook。普通 `git commit` 通过 lint-staged 处理本次暂存文件：

```bash
安全 lint 修复与 import 整理 → 自动排版 → git diff --cached --check
```

lint-staged 按扩展名直接调用各工具，并复用公开命令的配置与排除范围；即使配置或依赖变化也不扩大到全仓。Biome 只做安全修复，
Less 规则只检查，剩余错误、解析失败、工具失败及暂存 diff 空白错误都会阻止提交。无适用文件正常跳过工具检查。
typecheck、test、build 与配置专属验证保持各自入口，不加入 pre-commit；不增加 pre-push 或 pre-merge-commit。

lint-staged 自动重新暂存修复结果，并暂时隐藏部分暂存文件的未暂存改动。允许暂存版本的整文件排版变化，
原有未暂存代码仍保持未暂存，无关文件不进入提交。失败时先按终端诊断检查 `git status` 和 diff；恢复冲突会阻止提交，
lint-staged 会尝试还原原始状态。若自动恢复失败，保留其输出的备份 stash 和恢复提示，核对备份内容后再按提示恢复，
不要用全仓 `git add` 或清理 stash 掩盖冲突。

Hook 可以被本地绕过，自动 merge commit 也不保证触发 pre-commit；最终候选仍由 verify 的全仓只读检查覆盖。
真实提交、部分暂存和失败恢复测试通过 `pnpm test:integration --workspace iam-monorepo --file scripts/test-integration/quality/pre-commit.integration.test.ts` 执行。

## Workspace 入口

所有 Integration 均使用根 `pnpm test:integration --workspace <name-or-directory> [--file <path>]`；
下列 package-local 列表只列开发、Unit、类型及运维入口，内部执行器脚本见上文。

- OIDC：`pnpm --filter @iam/oidc <lint|test|test:unit|typecheck>`；真实 Redis 使用根 Integration。
  完整授权 HTTP 组合与浏览器退出回归由 API owner 承担；浏览器使用已安装 Chromium、单 worker、零 retry，
  fixture 启动动态 loopback 候选 API/测试 RP，不使用运行环境。
- Full-system E2E：root `pnpm test:e2e`；workspace-local
  `pnpm --filter @iam/e2e-system <test:e2e|runtime:lifecycle|admin:journey|hr-admin:journey|oidc:journey|runtime:cleanup|lint|test|test:unit|typecheck>`。
- API backend：`pnpm --filter @iam/api <dev|serve|lint|test|test:unit|typecheck>`
- Admin API backend：`pnpm --filter @iam/admin-api <dev|serve|lint|test|test:unit|typecheck>`
- Session Kernel：`pnpm --filter @iam/session-kernel <lint|test|test:unit|typecheck>`
- API Core：`pnpm --filter @iam/api-core <lint|test|test:unit|typecheck>`
- Custom SSO：`pnpm --filter @iam/custom-sso <lint|test|test:unit|typecheck>`；完整 HTTP/Redis 在 API collection。
- Client Subject Projection：`pnpm --filter @iam/client-subject-projection <lint|test|test:unit|typecheck>`
- User Profile Read Model：`pnpm --filter @iam/user-profile-read-model <lint|test|test:unit|typecheck>`
- Filter Engine：`pnpm --filter @iam/filter-engine <lint|test|test:unit|typecheck>`；JSONB 编译的真实 PostgreSQL 行为由 User Profile owner 验证。
- Worker：`pnpm --filter @iam/worker <dev|serve|lint|test|test:unit|typecheck|employment:verify|organization-search:backfill|organization-search:repair|organization-search:verify|user-profile:backfill|user-profile:repair|user-profile:verify-postgres|user-profile:verify-redis|client-snapshot:repair|client-snapshot:verify|session:clear:inventory|session:clear|session:clear:verify>`

- Employment 全库只读诊断：
  `IAM_WORKER_DATABASE_URL=<target-url> pnpm --filter @iam/worker employment:verify`
- Subject Access 恢复：
  `pnpm --filter @iam/worker run user-profile:repair -- --subject-access-only --limit <positive-integer>`。
  该模式依次执行 PostgreSQL stale pending transition intent 回收、Redis transition recovery 与 authority repair，
  不执行 User Profile maintenance。它会更新 PostgreSQL transition intent，不局限于 Redis indexed backlog；所需权限、
  stale threshold、调度与失败恢复见[Profile 维护手册](../releases/user-profile-maintenance.md#subject-access-恢复与外部调度)。
- User Profile 全量重建与版本无关 readiness：先运行
  `pnpm --filter @iam/worker user-profile:backfill` 派发既有 versioned rebuild jobs；批量大小通过
  `IAM_WORKER_USER_PROFILE_BACKFILL_BATCH_SIZE=<positive-integer>` 配置。
  等待 Worker 收敛并按需运行 `user-profile:repair` 后，依次运行
  `pnpm --filter @iam/worker user-profile:verify-postgres -- [--batch-size <positive-integer>]` 和
  `pnpm --filter @iam/worker user-profile:verify-redis -- [--batch-size <positive-integer>]`。Backfill 的 `enqueued`
  只表示已派发，不表示 readiness 已通过；窗口、两 gate 和放流见[Profile 维护手册](../releases/user-profile-maintenance.md#全量重建与恢复)。
- 当前 Snapshot repair/verify 与 unified 状态维护：使用 Worker `client-snapshot:repair`、`client-snapshot:verify`、
  `session:clear:inventory`、`session:clear`、`session:clear:verify`，完整停流/资源/参数/失败重跑边界见[统一维护手册](../releases/unified-session-maintenance.md)。
  旧 `client-runtime:*`、Provider 维护、epoch 和扩展期 Client 升级命令已退役。
- Admin frontend：`pnpm --filter @iam/admin <dev|build|lint|test|test:unit|typecheck|format>`
- SSO frontend：`pnpm --filter @iam/sso <dev|build|lint|test|test:unit|typecheck|format>`
- Database：`pnpm --filter @iam/db <lint|test|test:unit|typecheck|db:push|db:generate|db:migrate|db:check>`
- Role Assignment：`pnpm --filter @iam/role-assignment-resolution <lint|typecheck>`
- Organization Responsibility Resolution：`pnpm --filter @iam/organization-responsibility-resolution <lint|typecheck>`
- Gateway：`pnpm --filter @iam/gateway-apisix <dev|start|lint|test|test:unit|typecheck>`；配置发布通过 HTTP API。

`employment:verify` 只在运维人员显式调用时扫描 Employment，不属于 Worker 启动或请求路径。它在 PostgreSQL
`READ ONLY` transaction 中检查非墓碑未知状态、Open Position/Organization 完整性、Employment Period、Open `endTime`、
Ended `endTime`、未来 Open `startTime`、重复 Open 组合和多个 Open Primary。报告 `passed` 时退出 0；存在任一阻断项时
报告 `failed` 并退出 1，按稳定分类列出全部相关 Employment ID。Legacy Employment Tombstone 单独计数且不因缺少可信
`endTime` 阻断。命令不解释 `updateTime`、不生成修复 SQL，也不修改数据；管理员必须依据真实业务通过正式入口修正后重跑。

共享 packages 使用相同的 filtered 模式，例如：

```bash
pnpm --filter @iam/domain test
pnpm --filter @iam/domain typecheck
```
