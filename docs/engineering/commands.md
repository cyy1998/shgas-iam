# 构建、测试与开发命令

从仓库根目录执行命令。使用 Linux 环境、Node.js 24、Bun 1.4.4 与根 [package.json](../../package.json) 的 `packageManager` 版本，运行前先执行 `pnpm install`。

## 核心根命令

日常开发与本地验证使用以下 6 个核心根命令：

| 命令                    | 作用                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`            | 7 步只读静态与契约检查：`format:check` → `lint` → `typecheck` → `@iam/db db:check` → `check:architecture` → `check:docs` → `check:env-names` |
| `pnpm fix`              | 自动排版与安全 lint 修复（`pnpm format && pnpm lint:fix`）                                                                                   |
| `pnpm test:unit`        | L1 进程内单测（`pnpm test` 别名）：先跑 `pnpm test:unit:sandcastle`，再用 Turbo 跑全仓 Unit（`--concurrency=2`）                             |
| `pnpm test:integration` | L2 全仓集成测试（消费专用端点，支持定向筛选）                                                                                                |
| `pnpm test:e2e`         | L3 生产容器 Full-system E2E（独占 Docker Compose 生产容器栈 + 9 个跨服务业务旅程，支持 `--skip-build` / `--keep`）                           |
| `pnpm verify`           | 本地一键全量 L1 + L2 验证：`check` → `test:unit` → `test:integration` → `build`                                                              |

## Workspace 命令

```bash
pnpm dev
pnpm build
pnpm --filter @iam/admin dev
pnpm --filter @iam/sso dev
pnpm --filter @iam/auth-api typecheck
pnpm --filter @iam/sso-api typecheck
pnpm --filter @iam/integration-api typecheck
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
- **Sandcastle AFK** 用 `pnpm sandcastle --help` 查看 CLI，`pnpm sandcastle:build` 构建无特权沙箱镜像，`pnpm sandcastle:check` 预检，`pnpm sandcastle:smoke` 运行真实 Docker 无特权冒烟，`pnpm sandcastle` 启动（外层由 `flock -n .sandcastle/runner.lock` 保证单实例互斥）。配置、凭据和恢复见 [AFK 运维与启动手册](../../.sandcastle/README.md#启动与诊断)。

## 日常检查

```bash
pnpm check
pnpm fix
pnpm --filter <workspace> typecheck
pnpm typecheck:root
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

Sandcastle 编排回归可独立执行 `pnpm test:unit:sandcastle`，根 `pnpm test:unit` 已包含此集合。
无特权沙箱接线用 `pnpm sandcastle:smoke` 验证。各入口覆盖范围见 [Sandcastle 验证](testing.md#sandcastle-验证)。

```bash
pnpm test:unit
pnpm --filter @iam/api-core test:unit
pnpm test:infra:up
pnpm test:integration
pnpm test:infra:down
```

`--workspace` 接受 package name 或仓库相对 workspace 目录。`--workspace` 与 `--file` 均可重复。
`--file` 接受绝对路径、仓库相对路径或 owner 相对路径，须属于所选 owner 的 collection。
无匹配、越界文件或未知参数均失败。根 `iam-monorepo` 负责聚合，测试 owner 是实际 workspace。

本地使用 `pnpm test:infra:up` 启动专用 PostgreSQL、Redis 和 APISIX/etcd。服务可供后续命令复用，结束后执行 `pnpm test:infra:down` 回收容器、网络和数据卷。自备服务时设置所需端点。默认端口为 PostgreSQL `55432`、Redis `56379`、APISIX Admin `59180`，均绑定 `127.0.0.1`。同一套端点上的顶层 Integration 命令须串行执行。
默认并发上限为 3，首个失败会取消其他在途任务。`--concurrency <n>` 或 `IAM_TEST_INTEGRATION_CONCURRENCY` 可调整上限，两者接受正整数，命令行参数优先。

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

- **使用自备专用服务**。设置 `IAM_TEST_POSTGRES_URL` 和 `IAM_TEST_REDIS_URL`。真实 Gateway APISIX 测试需要配对设置 `IAM_TEST_APISIX_ADMIN_URL` 与 `IAM_TEST_APISIX_ADMIN_KEY`。

  ```bash
  IAM_TEST_POSTGRES_URL=postgresql://iam_test:iam_test@127.0.0.1:5432/iam_test \
    IAM_TEST_REDIS_URL=redis://127.0.0.1:6379/0 \
    pnpm test:integration --workspace @iam/auth-api
  ```

Integration 的 `--timeout-ms` 默认 30 分钟，`--cleanup-timeout-ms` 默认 30 秒。
L2 runner 使用 Bun。Admin 与 SSO 的前端行为测试随 `pnpm test:unit` 运行，也可通过 `pnpm --filter @iam/admin test:unit` 或 `pnpm --filter @iam/sso test:unit` 单独执行。

各任务的完整输出位于 `test-results/integration/<run-id>/logs/<package>-<executor>.log`。终端显示逐任务耗时、日志路径和总墙钟。若命令被强制结束或资源预检发现 APISIX 有残留，确认任务进程树已退出后，用 `pnpm test:infra:down` 再执行 `pnpm test:infra:up` 清理本地专用服务。外置环境由对应调用方恢复。

### Full-system E2E

完整系统入口为 `pnpm test:e2e`，在独占生产容器 Docker Compose 栈上运行全部 9 个跨服务业务旅程，同步覆盖生产 Dockerfile、Nginx 与 `pnpm deploy` 依赖闭包。需要本机 Chromium 时按环境选择 `pnpm e2e:install`（含系统依赖）或 `pnpm e2e:install:browsers`。就绪、快照复位、四合一 `e2e-stubs` 与诊断目录见[完整系统测试](testing.md#full-system-e2e)。

```bash
pnpm test:e2e
pnpm test:e2e hr-admin-user-management.spec.ts
pnpm test:e2e dual-entry.spec.ts -g "Discovery" -x
pnpm test:e2e --last-failed
pnpm test:e2e --ui
pnpm test:e2e --skip-build hr-admin-user-management.spec.ts
pnpm test:e2e --keep dual-entry.spec.ts
```

`--skip-build` 与 `--keep` 由运行时入口在 `--` 前解析，可和 Playwright 参数一起传入；遇到 `--` 后余下参数直接交给 Playwright：

- `--skip-build`：校验并复用本地已构建的 `iam-e2e-*:local` 镜像（适合仅修改 `.spec.ts` 时跳过构建直接运行；若缺少任意镜像会显式报错提示先不带开关构建一次）。
- `--keep`：测试结束后保留容器栈并输出精确清理命令，便于排障。
- `IAM_E2E_BUILD_CONCURRENCY` 设置 Compose 构建并发上限（默认 `2`，允许 `1`–`4`）。`IAM_E2E_BUILDX_CACHE` 可设为 `gha` / `none` / `off`。变量未设置时，仅当 `CI=true` 且提供 `ACTIONS_CACHE_URL` 或 `ACTIONS_RESULTS_URL` 才会启用 GHA 缓存。

针对已完成初始化和网关发布的独立托管环境，使用 `pnpm test:e2e:managed`，配置见[托管环境验收](../releases/initial-installation.md#托管环境验收)。

保留现场或异常中断后，可用准确的 project 名称清理。清理失败时保留记录，可用同一命令重试。

```bash
pnpm --filter @iam/e2e-system runtime:cleanup -- --project iam-e2e-<resource-id>
```

### 聚合验证

`pnpm check` 与 `pnpm verify`（执行顺序见[核心根命令](#核心根命令)）均在首错时停止。本地运行 `pnpm verify` 前先执行 `pnpm test:infra:up`。何时执行见[验证节奏](../agents/workflow.md#验证节奏)，结果能证明的范围见[验证结果与交付](testing.md#验证结果与交付)。

## GitHub Actions CI

仓库在 [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) 运行合入门禁，触发事件为 `pull_request`（`opened`、`reopened`、`synchronize`、`ready_for_review`）与 `push` 到 `main`。所有 Job 均在 GitHub-hosted `ubuntu-latest` 上使用 `pnpm install --frozen-lockfile` 执行，顶层锁定 `permissions: { contents: read }`、PR 不依赖外部 Secret、失败日志保留 7 天，并按 PR 编号开启 `cancel-in-progress: true`。

| Job           | 触发条件                                                                        | 职责与关键配置                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detect`      | 每次触发                                                                        | 计算 `base_sha` 并运行 `node scripts/verify-docs.mjs --classify --base "$BASE_SHA"`，输出 `docs_only`（异常时默认 `false`）。                                                                                        |
| `doc-check`   | `docs_only == 'true'`                                                           | 运行 `node scripts/verify-docs.mjs --base "$BASE_SHA"`，校验 `git diff --check`、变动文档 Prettier 排版与 `pnpm check:docs`。                                                                                        |
| `fast`        | `docs_only == 'false'`                                                          | 启用 `.turbo/cache`，顺序执行 `pnpm check`、`pnpm test:unit`、`pnpm build`。                                                                                                                                         |
| `integration` | `docs_only == 'false'`（与 `fast` 并行）                                        | 用 `pnpm test:infra:up` 启动 PostgreSQL、Redis 和 APISIX/etcd，使用默认端点及并发上限 2 运行全量 `pnpm test:integration`，失败时上传 `test-results/integration/**/logs/*.log`，始终尝试执行 `pnpm test:infra:down`。 |
| `e2e`         | `docs_only == 'false'` 且 `fast`、`integration` 通过，且为 `push` 或非 Draft PR | 启用 Docker Buildx + `IAM_E2E_BUILDX_CACHE=gha`，运行 `pnpm test:e2e`（生产容器栈 + 9 specs），失败时上传 `test-results/e2e/**/*.log`。                                                                              |
| `ci-gate`     | `if: always()`，`needs` 全部 5 个上游 Job                                       | 唯一 Required Check，按严格真值表汇总：纯文档须 `doc-check=success` 且其余 3 项 `skipped`；代码变更拒绝 Draft PR，且须 `doc-check=skipped` 与 `fast`/`integration`/`e2e` 全部 `success`。                            |

### 纯文档验证

```bash
node scripts/verify-docs.mjs --base <target-commit>
```

供 CI `detect`（加 `--classify`）与 `doc-check` 使用的底层脚本，也可在本地干净工作树中手动调用。传入本次合入目标的固定提交：候选须包含目标提交，且差异仅限 `docs/` 下的普通 Markdown 文件（含 `docs/agents/`）、根目录 `README.md`、`AGENTS.md`、`GLOSSARY.md`、`.sandcastle/README.md`，以及 `apps/*/README.md` 与 `packages/*/README.md`。文件类型或权限变化以及范围外的改动（如 `.agents/`、`.codex/`、`.sandcastle/` 下其他文件、脚本或源码）都会被归类为非纯文档，须走完整代码路径。日常本地仅修改文档时运行 `pnpm check:docs` 与 `git diff --check`（或 `pnpm check`）即可。

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

`lint-staged` 按扩展名复用公开命令的配置与排除规则：Biome 仅应用安全修复，Less 只读检查；剩余错误、解析失败或暂存 diff 空白错误都会阻止提交。typecheck、test、build 与配置专属验证保留各自入口，不纳入 pre-commit。

`lint-staged` 自动重新暂存修复结果，并暂时隐藏部分暂存文件的未暂存改动。若恢复冲突导致提交中止且自动还原失败，请保留其输出的备份 stash 和恢复提示，核对备份内容后再按提示恢复，不要用全仓 `git add` 或清理 stash 掩盖冲突。

提交前 hook 可被绕过，merge commit 也不保证触发，最终候选仍须按[验证节奏](../agents/workflow.md#验证节奏)运行 `pnpm check` 等只读检查。修改提交工具链时，在独立临时 Git 仓库中按[一次性验证约定](testing.md#root-工具链的一次性验证)检查真实提交、部分暂存和失败恢复行为。
