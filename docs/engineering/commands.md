# 构建、测试与开发命令

从仓库根目录执行命令。使用 Node.js 24 与根 [package.json](../../package.json) 的 `packageManager` 版本，
先显式执行 `pnpm install`。检查命令遇依赖未就绪会失败。

## Workspace 命令

```bash
pnpm dev
pnpm build
pnpm --filter @iam/admin dev
pnpm --filter @iam/sso dev
pnpm --filter @iam/api typecheck
```

Admin 和 SSO 各自按 app 的 `.env.example` 准备 `.env.local`。默认入口为
`http://localhost:8001/iam-admin/` 与 `http://localhost:8000/portal/`。
公开变量和构建缓存输入见[前端构建输入](../releases/deployment.md#前端构建输入)。

使用 `pnpm --filter <package-name> <script>` 选择 workspace。包名和源码入口见[仓库地图](repository-map.md)，
可用脚本查该 workspace 的 `package.json`。

- **Gateway API** 使用 `pnpm --filter @iam/gateway-apisix dev` 或 `start`，配置见 [Gateway README](../../apps/gateway/README.md)。
- **数据库迁移与 schema** 使用 `pnpm --filter @iam/db <script>`。常用入口为 `db:generate`、`db:check`、`db:migrate` 和 `db:push`。
  目标环境的迁移与回退见[部署手册](../releases/deployment.md)。
- **人工维护 CLI** 人工维护命令见 [Ops README](../../apps/ops/README.md)，按目标选择[运维手册](../releases/README.md)。
- **Sandcastle AFK** 见 [AFK 运维与启动手册](../../.sandcastle/README.md#启动与诊断)。

## 日常检查

```bash
pnpm --filter <workspace> typecheck
pnpm check:architecture
pnpm check:docs
pnpm check:env-names
git diff --check
```

格式和 lint 可在根目录运行，也可用 `pnpm --filter <workspace> <script>` 聚焦 workspace。文件分工见[编码风格](coding-style.md#formatter-边界)。

| 命令           | 行为                                     |
| -------------- | ---------------------------------------- |
| `format`       | 自动排版                                 |
| `format:check` | 只读检查排版                             |
| `lint`         | 只读检查规则与 import 整理               |
| `lint:fix`     | 应用安全修复与 import 整理，检查剩余错误 |

聚焦单文件可使用 `pnpm exec biome`、`pnpm exec prettier` 或 `pnpm exec stylelint` 的原生参数。
这些检查直接执行工具 CLI，使用根配置和排除规则，包含作用范围内尚未提交的文件。日常提交会自动处理暂存文件，见[提交 Hook](#commit-前检查)。

## 测试与验证通道

按[验证选择](testing.md#验证选择)确定层级。`pnpm test` 是 `pnpm test:unit` 的入口，Unit 支持 workspace-local 执行。
真实资源测试通过根入口选择 owner，收集和资源契约见[测试编排](testing.md#收集与编排)。

```bash
pnpm test:unit
pnpm --filter @iam/api-core test:unit
pnpm test:integration
```

`--workspace` 接受 package name 或仓库相对 workspace 目录。`--workspace` 与 `--file` 均可重复。
`--file` 接受绝对路径、仓库相对路径或 owner 相对路径，须属于所选 owner 的 collection。
无匹配、越界文件或未知参数均失败。根 `iam-monorepo` 负责聚合，测试 owner 是实际 workspace。

同一候选的同一轮 Integration 检查按所需范围合并。根入口为整轮准备所需的 PostgreSQL 模板库和 Redis，
按 `workspace:executor` 分配 Redis DB，并以同一并发池调度所选任务。默认并发上限为 3，首个失败会取消其他在途任务。
`--concurrency <n>` 或 `IAM_TEST_INTEGRATION_CONCURRENCY` 可调整上限，两者接受正整数，命令行参数优先。

- **多个文件**。重复传 `--file`，使用仓库相对路径区分不同 workspace 的文件。

  ```bash
  pnpm test:integration \
    --file apps/worker/test-integration/user-document/user-document-repair-schedule.integration.test.ts \
    --file apps/ops/test-integration/session-clear/session-clear-command.integration.test.ts
  ```

- **多个 workspace 全量**。重复传 `--workspace`，运行各 workspace 的完整 Integration collection。

  ```bash
  pnpm test:integration --workspace @iam/worker --workspace @iam/ops --concurrency 2
  ```

- **全量与定向混用**。`--file` 对整条命令生效。用一条命令跑全量 workspace，再用一条命令跑定向文件。

  ```bash
  pnpm test:integration --workspace @iam/worker
  pnpm test:integration --workspace @iam/ops --file test-integration/session-clear/session-clear-command.integration.test.ts
  ```

Integration 的 `--timeout-ms` 默认 30 分钟，`--cleanup-timeout-ms` 默认 30 秒。
Admin 和 SSO 的浏览器集成测试默认使用 `.cache/integration-frontend/` 中的静态构建。源码、workspace 传递依赖、锁定文件或公开构建环境变更时重新构建。
设置 `IAM_PW_DEV_SERVER=1` 可切换到 Vite dev server。无资源的 Playwright 集合可通过 `--browser-workers <1–16>` 或 `IAM_TEST_BROWSER_WORKERS` 调整并发，命令行参数优先。
选择带资源或 resource provider 的 Playwright 集合时须省略这两个覆盖项。

`--keep-resources` 显式保留本次环境并采集容器诊断。准确 project、配置与产物登记在 `test-results/integration/<run-id>/run.json`。
同目录的 `logs/<package>-<executor>.log` 保存各任务的完整输出。终端列出逐任务耗时、日志路径和总墙钟。
清理失败、进程被强制结束或用完保留环境后，按记录清理：

```bash
pnpm test:resources:cleanup --record test-results/integration/<run-id>/run.json
```

### Full-system E2E

E2E 编排器的 Integration 集合独立于日常 `pnpm test:integration` 与 `pnpm verify:ci`。它验证临时中间件、数据库模板、宿主进程、前端托管和恢复，按单并发执行并在首个失败后停止。

```bash
pnpm --filter @iam/e2e-system test:integration
pnpm verify:e2e-runtime --base <target-commit-sha>
```

路径门禁比较固定基线与候选 HEAD。差异命中 `e2e/system/**`、`packages/runtime/**`、`scripts/test-resources/**`、门禁脚本、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.npmrc`、`turbo.json`、`**/vite.config.*`，或命中 Hybrid E2E 运行时闭包内（及根）`package.json` 的运行时/构建敏感字段（前端闭包另含 `devDependencies`、`scripts.build` 与 `scripts.dev`，后端闭包另含 `scripts.db:migrate`，根清单另含 `test:e2e*` 与 `verify:e2e-runtime`）时，门禁运行一次编排器 Integration；仅修改应用生产 `Dockerfile`、测试脚本、`iamTest` 或非闭包 `package.json` 时跳过。无匹配时打印跳过信息，基线非法或 Git 比较失败时以非零状态退出。

完整系统入口为 `pnpm test:e2e`。需要 Chromium 时按环境选择 `pnpm e2e:install`（含系统依赖）或
`pnpm e2e:install:browsers`。就绪、文件复位和报告目录见[完整系统测试](testing.md#full-system-e2e)。

```bash
pnpm test:e2e
pnpm test:e2e hr-admin-user-management.spec.ts
pnpm test:e2e dual-entry.spec.ts -g "Discovery" -x
pnpm test:e2e --last-failed
pnpm test:e2e --ui
pnpm test:e2e --dev-frontend
pnpm test:e2e --fresh --keep
pnpm test:e2e:down
```

`--fresh`、`--dev-frontend`、`--keep` 由运行时入口解析，可和 Playwright 参数一起传入。遇到 `--` 后，余下参数直接交给 Playwright。CI 和 AFK 默认走独占模式。在 AFK 验证常驻模式，可设置 `IAM_E2E_LIFECYCLE=resident`，并在运行和 `test:e2e:down` 时使用同一个 `IAM_E2E_RESIDENT_DIRECTORY`。托管环境另走[托管验收入口](../releases/initial-installation.md#托管环境验收)。

保留现场或异常中断后，按输出的资源记录或准确 project 清理。既有 E2E descriptor 也可用于恢复。

```bash
pnpm test:resources:cleanup --record test-results/integration/<resource-id>/run.json
pnpm --filter @iam/e2e-system runtime:cleanup --project iam-e2e-<resource-id>
pnpm --filter @iam/e2e-system runtime:cleanup --descriptor test-results/<run-id>/run-descriptor.json
```

相对 descriptor 从 `e2e/system/` 解析，也可提供绝对路径。显式恢复使用 120 秒清理预算。清理失败时保留记录，可对同一目标重试。

### Container Smoke

```bash
pnpm test:e2e:container-smoke
pnpm verify:container-smoke --base <target-commit-sha>
```

第一条命令需 Docker、Compose 和本机 Chromium，可独立验证六个生产 Dockerfile、Nginx、`pnpm deploy` 依赖闭包和真实 APISIX 浏览器链路。镜像构建默认使用 2 路有界并发，可通过 `IAM_CONTAINER_SMOKE_BUILD_CONCURRENCY`（1–4）调整；各镜像完整构建日志保存在运行目录的 `build-<service>.log`。诊断目录和资源记录路径由命令输出。异常终止后可通过上方的 `test:resources:cleanup --record` 命令清理这一个 project。

第二条命令对比固定合入基线与候选 HEAD。差异命中任意目录的 `Dockerfile`、`nginx.conf`、`pnpm-lock.yaml`，或命中 `pnpm-workspace.yaml`、`.npmrc`、`.husky/install.mjs`、`patches/`、`e2e/system/docker/`、Container Smoke 编排/spec、门禁脚本，或命中 6 个冒烟生产镜像依赖闭包内（及根）`package.json` 的打包敏感字段变更时执行一次冒烟；仅修改测试脚本、`iamTest`、非生产闭包 `package.json` 或纯后端包的 `devDependencies` 时跳过。手动交付和 AFK 最终验证使用该入口，`pnpm verify:release` 每次运行冒烟。日常 `pnpm test:e2e` 只运行 Hybrid 业务 spec。[容器冒烟契约](testing.md#container-smoke)

### 聚合验证

| 命令                  | 顺序                                                                          |
| --------------------- | ----------------------------------------------------------------------------- |
| `pnpm verify:static`  | `format:check`、`lint`、`check:docs`、`check:env-names`、`check:architecture` |
| `pnpm verify`         | 静态检查 → typecheck → Unit → build                                           |
| `pnpm verify:ci`      | verify → Integration                                                          |
| `pnpm verify:release` | verify:ci → E2E 编排器 Integration → Full-system E2E → Container Smoke        |

组合入口首错停止。何时执行见[验证节奏](../agents/workflow.md#验证节奏)，结果能证明的范围见[验证结果与交付](testing.md#验证结果与交付)。

### 纯文档验证

```bash
pnpm verify:docs --base <target-commit>
```

在干净的候选工作树中执行，传入本次合入目标的固定提交。候选须包含目标提交，且差异仅限 `docs/` 下的普通 Markdown 文件（含 `docs/agents/`）以及根目录 `README.md`、`AGENTS.md`、`GLOSSARY.md`。
文件类型或权限变化以及范围外的改动（如 `.agents/`、`.codex/`、脚本或源码）走 `pnpm verify`。轻量入口检查提交范围的
`git diff --check`、变动后仍存在的 Markdown 排版和整个文档索引。范围不符或任一检查失败时非零退出。

## 工具链排查

对比工具链性能时可以用 `pnpm exec turbo typecheck --force --concurrency=3` 或
`pnpm exec turbo test:unit --force --concurrency=2` 绕过 Turbo task cache。操作系统文件缓存仍生效。
对比使用相同命令和 runner，记录墙钟、CPU 和最大 RSS，一次只调整一个并行层。
TypeScript CLI 与兼容 API 可分别查询：

```bash
pnpm exec tsc --version
node -p "require('typescript').version"
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

Hook 可以被本地绕过，自动 merge commit 也不保证触发 pre-commit。最终候选仍按[验证节奏](../agents/workflow.md#验证节奏)执行只读检查。
提交工具链变化时，在独立临时 Git 仓库中按[一次性验证约定](testing.md#root-工具链的一次性验证)
检查涉及的真实提交、部分暂存和失败恢复行为。

## OIDC 协议套件

正式 fixture 位于 [oidc-suite.fixture.ts](../../apps/api/test-integration/oidc/oidc-suite.fixture.ts)，
独立 RP 位于 [oidc-rp.integration.test.ts](../../apps/api/test-integration/oidc/oidc-rp.integration.test.ts)。
它们不是普通浏览器旅程，也不由基础 verify 自动运行。

### 固定套件与运行配置

复现使用 OpenID conformance-suite release-v5.2.4，固定提交
`ab35a8df4864da35b49eff11483e204e01aa7961`。在对应源码目录应用
[S256 补丁](../../apps/api/test-integration/oidc/patches/conformance-suite-s256.patch)，以 Java 21.0.4、Maven 3.9.11 构建。
补丁作为 API OIDC Integration 的测试资产，与 fixture、runner 一同维护：

```bash
git apply --unidiff-zero <iam-checkout>/apps/api/test-integration/oidc/patches/conformance-suite-s256.patch
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
独立入口先迁移并封存本次 PostgreSQL 模板库。fixture 负责候选 API、TLS 代理、独立 PostgreSQL 克隆库、Redis 和 Node 进程树，driver 负责浏览器与官方模块。
信号/失败仍逐项尝试收尾，再以独立预算清理准确 project；超时不冒称清理完成，原始失败与清理失败均保留。
官方 REVIEW 使自动 driver 非零，必须独立完成图像判读并保留官方结果，不把它改写为套件 PASSED。
不同 loopback 端口只证明两 issuer 协议；hostname/Cookie 隔离须由真实 APISIX/browser 验证，
见[验证选择](testing.md#验证选择)。
