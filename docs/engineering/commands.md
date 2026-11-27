# 构建、测试与开发命令

从仓库根目录执行命令。使用 Linux 环境、Node.js 24、Bun 1.4.4 与根 [package.json](../../package.json) 的 `packageManager` 版本，先显式执行 `pnpm install`。检查命令遇依赖未就绪会失败。

## 核心根命令

面向日常开发与本地验证的根命令收敛为 6 个核心入口：

| 命令                    | 作用                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`            | 7 步只读静态与契约检查：`format:check` → `lint` → `typecheck` → `@iam/db db:check` → `check:architecture` → `check:docs` → `check:env-names` |
| `pnpm fix`              | 自动排版与安全 lint 修复（`pnpm format && pnpm lint:fix`）                                                                                   |
| `pnpm test:unit`        | L1 进程内单测（`pnpm test` 别名）：先跑 `pnpm test:unit:sandcastle`，再用 Turbo 跑全仓 Unit（`--concurrency=2`）                             |
| `pnpm test:integration` | L2 全仓集成测试（覆盖全部 197 个集成测试文件，支持 `IAM_TEST_RESOURCE_PROVIDER=docker\|native\|external` 与定向筛选）                        |
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
- **Sandcastle AFK** 用 `pnpm sandcastle --help` 查看 CLI，`pnpm sandcastle:build` 构建方案 X 沙箱镜像，`pnpm sandcastle:check` 预检，`pnpm sandcastle:smoke` 运行真实 Docker 无特权冒烟，`pnpm sandcastle` 启动（外层由 `flock -n .sandcastle/runner.lock` 保证单实例互斥）。配置、凭据和恢复见 [AFK 运维与启动手册](../../.sandcastle/README.md#启动与诊断)。

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
pnpm test:integration
```

`--workspace` 接受 package name 或仓库相对 workspace 目录。`--workspace` 与 `--file` 均可重复。
`--file` 接受绝对路径、仓库相对路径或 owner 相对路径，须属于所选 owner 的 collection。
无匹配、越界文件或未知参数均失败。根 `iam-monorepo` 负责聚合，测试 owner 是实际 workspace。

同一候选的同一轮 Integration 检查按所需范围合并。根入口通过 `IAM_TEST_RESOURCE_PROVIDER=docker|native|external` 选择资源供给（本地默认 `docker`，方案 X 沙箱默认注入 `native`，GitHub Actions CI 固定注入 `external`），在所有并发任务开始前为整轮准备所需的 PostgreSQL 模板库、Redis（预检 `/31`）及按最终选中文件按需启动的 Gateway APISIX/etcd（仅当命中 Gateway 五个真实 APISIX 文件时准备），按 `workspace:executor` 分配独占 Redis DB（`/1`–`/31`），并以同一并发池调度所选任务；所有任务进程树退出后再由对应 Provider 统一回收，确保并发执行期间 Docker 网络完全静止。
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

- **指定资源 Provider**。在方案 X 沙箱或已安装四件套的 Linux 环境可用 `native`；在外部自备服务的环境（如 CI）须显式设为 `external` 并提供所选任务需要的全部端点变量（`IAM_TEST_POSTGRES_URL`、`IAM_TEST_REDIS_URL`，命中 Gateway 真实 APISIX 文件时另须 `IAM_TEST_APISIX_ADMIN_URL` 与 `IAM_TEST_APISIX_ADMIN_KEY`）：

  ```bash
  IAM_TEST_RESOURCE_PROVIDER=native pnpm test:integration --workspace @iam/db
  IAM_TEST_RESOURCE_PROVIDER=external \
    IAM_TEST_POSTGRES_URL=postgresql://iam_test:iam_test@127.0.0.1:5432/iam_test \
    IAM_TEST_REDIS_URL=redis://127.0.0.1:6379/0 \
    pnpm test:integration --workspace @iam/auth-api
  ```

Integration 的 `--timeout-ms` 默认 30 分钟，`--cleanup-timeout-ms` 默认 30 秒。
Admin 和 SSO 的浏览器集成测试默认经 Turbo 缓存执行 `build:test`（输出到 `dist-test/`），再通过 `vite preview` 监听动态 loopback 端口提供静态产物；设置 `IAM_PW_DEV_SERVER=1` 可切换到 Vite dev server。无资源的 Playwright 集合可通过 `--browser-workers <1–16>` 或 `IAM_TEST_BROWSER_WORKERS` 调整并发，命令行参数优先；选择带资源的 Playwright 集合时须省略这两个覆盖项。

`--keep-resources` 显式保留本次环境并采集诊断日志。扁平记录位于 `test-results/integration/<run-id>/run.json`（`docker` 模式的 APISIX stack 直接记在同文件 `apisix` 字段；`native` 模式的进程元数据记在同目录 `native-runtime.json`）。同目录的 `logs/<package>-<executor>.log` 保存各任务的完整输出，终端列出逐任务耗时、日志路径和总墙钟。清理失败、进程被强制结束或用完保留环境后，按准确记录清理（自动按 `provider` 分派 Docker / Native / External 清理）：

```bash
pnpm test:resources:cleanup --record test-results/integration/<run-id>/run.json
```

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

- `--skip-build`：校验并复用本地已构建的 `iam-e2e-*:local` 镜像（适合仅修改 `.spec.ts` 时零构建直跑；若缺少任意镜像会显式报错提示先不带开关构建一次）。
- `--keep`：测试结束后保留容器栈并输出精确清理命令，便于排障。
- `IAM_E2E_BUILD_CONCURRENCY` 设置 Compose 构建并发上限（默认 `2`，允许 `1`–`4`）。`IAM_E2E_BUILDX_CACHE` 可设为 `gha` / `none` / `off`。变量未设置时，仅当 `CI=true` 且提供 `ACTIONS_CACHE_URL` 或 `ACTIONS_RESULTS_URL` 才会启用 GHA 缓存。

针对已完成初始化和网关发布的独立托管环境，使用 `pnpm test:e2e:managed`，配置见[托管环境验收](../releases/initial-installation.md#托管环境验收)。

保留现场或异常中断后，可按输出的资源记录或准确 project 清理。清理失败时保留记录，可用同一命令重试。

```bash
pnpm test:resources:cleanup --record test-results/e2e/<project>/run.json
pnpm --filter @iam/e2e-system runtime:cleanup -- --project iam-e2e-<resource-id>
```

### 聚合验证

| 命令          | 顺序                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`  | `format:check` → `lint` → `typecheck` → `@iam/db db:check` → `check:architecture` → `check:docs` → `check:env-names` |
| `pnpm verify` | `check` → `test:unit` → `test:integration` → `build`                                                                 |

组合入口首错停止。何时执行见[验证节奏](../agents/workflow.md#验证节奏)，结果能证明的范围见[验证结果与交付](testing.md#验证结果与交付)。

## GitHub Actions CI

仓库在 [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) 运行权威合入门禁，覆盖 `pull_request`（`opened`、`reopened`、`synchronize`、`ready_for_review`）与 `push` 到 `main`。全部 Job 运行于 GitHub-hosted `ubuntu-latest`，顶层锁定 `permissions: { contents: read }`、固定 `pnpm install --frozen-lockfile`、PR 零外部 Secret、脱敏失败产物保留 7 天，并按 PR 编号开启 `cancel-in-progress: true`。

| Job           | 触发条件                                                                        | 职责与关键配置                                                                                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detect`      | 每次触发                                                                        | 计算 `base_sha` 并运行 `node scripts/verify-docs.mjs --classify --base "$BASE_SHA"`，输出 `docs_only`（异常时默认 `false`）。                                                                                                                                                                        |
| `doc-check`   | `docs_only == 'true'`                                                           | 运行 `node scripts/verify-docs.mjs --base "$BASE_SHA"`，校验 `git diff --check`、变动文档 Prettier 排版与 `pnpm check:docs`。                                                                                                                                                                        |
| `fast`        | `docs_only == 'false'`                                                          | 启用 `.turbo/cache`，顺序执行 `pnpm check`、`pnpm test:unit`、`pnpm build`。                                                                                                                                                                                                                         |
| `integration` | `docs_only == 'false'`（与 `fast` 并行）                                        | 启动 PostgreSQL 18.4（`services:` + `tmpfs: 1g`）、Redis 8.8.0（`--databases 32`）与 APISIX 3.16 + etcd 3.5（`if: always()` 拆除），以 `IAM_TEST_RESOURCE_PROVIDER=external` 运行全量 `pnpm test:integration`（197 文件）；失败时将任务日志脱敏后上传 `test-results/integration-redacted/**/*.log`。 |
| `e2e`         | `docs_only == 'false'` 且 `fast`、`integration` 通过，且为 `push` 或非 Draft PR | 启用 Docker Buildx + `IAM_E2E_BUILDX_CACHE=gha`，运行 `pnpm test:e2e`（生产容器栈 + 9 specs）；失败时上传脱敏后的 `test-results/e2e-redacted/**/*.log`。                                                                                                                                             |
| `ci-gate`     | `if: always()`，`needs` 全部 5 个上游 Job                                       | 唯一 Required Check，按严格真值表汇总：纯文档须 `doc-check=success` 且其余 3 项 `skipped`；代码变更拒绝 Draft PR，且须 `doc-check=skipped` 与 `fast`/`integration`/`e2e` 全部 `success`。                                                                                                            |

### 纯文档验证

```bash
node scripts/verify-docs.mjs --base <target-commit>
```

供 CI `detect`（加 `--classify`）与 `doc-check` 使用的底层脚本，也可在本地干净工作树中手动调用。传入本次合入目标的固定提交：候选须包含目标提交，且差异仅限 `docs/` 下的普通 Markdown 文件（含 `docs/agents/`）以及根目录 `README.md`、`AGENTS.md`、`GLOSSARY.md`。文件类型或权限变化以及范围外的改动（如 `.agents/`、`.codex/`、`.sandcastle/`、脚本或源码）都会被归类为非纯文档，须走完整代码路径。日常本地仅修改文档时运行 `pnpm check:docs` 与 `git diff --check`（或 `pnpm check`）即可。

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

正式手动协议套件 fixture 位于 [oidc-suite.fixture.ts](../../apps/sso-api/test-integration/oidc/oidc-suite.fixture.ts)，
独立 RP 集成测试位于 [oidc-rp.integration.test.ts](../../apps/sso-api/test-integration/oidc/oidc-rp.integration.test.ts)（已纳入日常 `pnpm test:integration`）。
官方一致性套件不是普通浏览器旅程，也不由 `pnpm verify` 或 CI 自动运行。

### 固定套件与运行配置

复现使用 OpenID conformance-suite release-v5.2.4，固定提交
`ab35a8df4864da35b49eff11483e204e01aa7961`。在对应源码目录应用
[S256 补丁](../../apps/sso-api/test-integration/oidc/patches/conformance-suite-s256.patch)，以 Java 21.0.4、Maven 3.9.11 构建。
补丁作为 API OIDC Integration 的测试资产，与 fixture、runner 一同维护：

```bash
git apply --unidiff-zero <iam-checkout>/apps/sso-api/test-integration/oidc/patches/conformance-suite-s256.patch
mvn -B -Dmaven.test.skip -Dpmd.skip clean package
```

这些参数跳过套件自身构建测试/PMD，不表示已执行 IAM 协议验证。
补丁仅在 Code Flow 且 `iam_s256_required=true` 时增加 S256 sequence/verifier，默认关闭；
仓库 suite runner 为本用途显式启用，专用 PKCE 正负用例仍保持原构造，不修改官方断言。

独立 fixture 通过 [`prepareManagedTestResources()`](../../scripts/test-resources/resource-provider.mjs) 自动准备并销毁本次 PostgreSQL/Redis（遵循同一 `IAM_TEST_RESOURCE_PROVIDER` 边界、扁平 `run.json` 记录和恢复能力）。
调用方准备固定套件及其 MongoDB 6.0.13、Java 原生 HTTPS 与合成 PKCS12、loopback 端口和
`fintechlabs.devmode=true`。Node/tsx/Playwright 使用仓库锁定依赖。
fixture 启动 SSO API 候选，经 loopback TLS 代理转发协议请求。测试代理仅为本次生成的合成用户准备根会话。
`NODE_EXTRA_CA_CERTS` 只传给任务 Node 子进程。

`config.json` 示例（填写本次真实路径与候选 SHA）：

```json
{
  "suiteOrigin": "https://localhost:<suite-port>",
  "outputDirectory": "<absolute-task-evidence-directory>",
  "candidate": "<candidate-sha>",
  "issuerMode": "dual",
  "tls": { "keyPath": "<key.pem>", "certPath": "<cert.pem>" }
}
```

`issuerMode` 默认 `dual`；需要指定主机时使用 fixture 的 `hostnames` 配置。
可选 `plans`/`modules` 仅用于聚焦重跑，未选择项必须作为未执行记录。
`outputDirectory` 使用独立任务目录，不放在会被 API Browser 清理的默认产物根。

```bash
pnpm --filter @iam/sso-api exec bun run test-integration/oidc/oidc-suite.fixture.ts <config.json>
pnpm test:integration --workspace @iam/sso-api
```

需要调试保留时，在独立 fixture 命令的配置路径后增加 `--keep`；结束时按打印的准确 `run.json` 执行 `pnpm test:resources:cleanup --record <path>` 清理，内部 marker 不作为公开运行模式。
独立入口先迁移并封存本次 PostgreSQL 模板库。fixture 负责候选 API、TLS 代理、独立 PostgreSQL 克隆库、Redis 和 Node 进程树，driver 负责浏览器与官方模块。
信号/失败仍逐项尝试收尾，再以独立预算清理资源；超时不冒称清理完成，原始失败与清理失败均保留。
官方 `REVIEW` 使自动 driver 非零，必须独立完成图像判读并保留官方结果，不把它改写为套件 `PASSED`。
不同 loopback 端口只证明两 issuer 协议；hostname/Cookie 隔离须由真实 APISIX/browser 验证，
见[验证选择](testing.md#验证选择)。
