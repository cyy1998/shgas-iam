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
可用脚本查该 workspace 的 `package.json`。Gateway API 使用 `pnpm --filter @iam/gateway-apisix dev` 或 `start`，
配置见 [Gateway README](../../apps/gateway/README.md)。数据库脚本使用 `pnpm --filter @iam/db <script>`，
常用入口为 `db:generate`、`db:check`、`db:migrate` 和 `db:push`。目标环境的迁移与回退见[部署手册](../releases/deployment.md)。

人工维护命令见 [Ops README](../../apps/ops/README.md)，按目标选择[运维手册](../releases/README.md)。
运行 Sandcastle 见 [AFK 启动与诊断](../agents/sandcastle-afk.md#启动与诊断)。

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
pnpm test:integration --workspace @iam/worker
pnpm test:integration --workspace apps/admin --workspace apps/sso
pnpm test:integration --workspace @iam/ops --file test-integration/session-clear/session-clear-command.integration.test.ts
```

`--workspace` 接受 package name 或仓库相对 workspace 目录。`--workspace` 与 `--file` 均可重复。
`--file` 接受绝对路径、仓库相对路径或 owner 相对路径，须属于所选 owner 的 collection。
无匹配、越界文件或未知参数均失败。根 `iam-monorepo` 负责聚合，测试 owner 是实际 workspace。

Integration 的 `--timeout-ms` 默认 30 分钟，`--cleanup-timeout-ms` 默认 30 秒。
`--keep-resources` 显式保留本次环境。准确 project、配置与产物登记在 `test-results/integration/<run-id>/run.json`。
清理失败、进程被强制结束或用完保留环境后，按记录清理：

```bash
pnpm test:resources:cleanup --record test-results/integration/<run-id>/run.json
```

### Full-system E2E

完整系统入口为 `pnpm test:e2e`，产物位于 `e2e/system/test-results/`。需要 Chromium 时按环境选择
`pnpm e2e:install`（含系统依赖）或 `pnpm e2e:install:browsers`。运行与就绪契约见[完整系统测试](testing.md#full-system-e2e)。

```bash
pnpm test:e2e
pnpm --filter @iam/e2e-system runtime:lifecycle
pnpm --filter @iam/e2e-system admin:journey
pnpm --filter @iam/e2e-system hr-admin:journey
pnpm --filter @iam/e2e-system oidc:journey
```

workspace-local 旅程用于聚焦调试。宿主异常后，使用一个准确的 descriptor 或 project：

```bash
pnpm --filter @iam/e2e-system runtime:cleanup -- --descriptor test-results/<run-id>/run-descriptor.json
pnpm --filter @iam/e2e-system runtime:cleanup -- --project iam-e2e-<run-id>
```

相对 descriptor 从 `e2e/system/` 解析，也可提供绝对路径。显式恢复使用独立的 120 秒清理预算。
清理失败非零退出并保留 descriptor，可对同一目标重试。

### 聚合验证

| 命令                  | 顺序                                                                          |
| --------------------- | ----------------------------------------------------------------------------- |
| `pnpm verify:static`  | `format:check`、`lint`、`check:docs`、`check:env-names`、`check:architecture` |
| `pnpm verify`         | 静态检查 → typecheck → Unit → build                                           |
| `pnpm verify:ci`      | verify → Integration                                                          |
| `pnpm verify:release` | verify:ci → Full-system E2E                                                   |

组合入口首错停止。何时执行见[验证节奏](../agents/workflow.md#验证节奏)，结果能证明的范围见[验证结果与交付](testing.md#验证结果与交付)。

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

Hook 可以被本地绕过，自动 merge commit 也不保证触发 pre-commit；最终候选仍由 verify 的全仓只读检查覆盖。
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
fixture 负责候选 API、TLS 代理、随机 PG schema、Redis 和 Node 进程树，driver 负责浏览器与官方模块。
信号/失败仍逐项尝试收尾，再以独立预算清理准确 project；超时不冒称清理完成，原始失败与清理失败均保留。
官方 REVIEW 使自动 driver 非零，必须独立完成图像判读并保留官方结果，不把它改写为套件 PASSED。
不同 loopback 端口只证明两 issuer 协议；hostname/Cookie 隔离须由真实 APISIX/browser 验证，
见[验证选择](testing.md#验证选择)。
