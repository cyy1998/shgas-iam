# Sandcastle AFK 运维与启动手册

本页供维护者配置、启动和恢复本仓 AFK。任务准入、票级集成、集中验证与 PR 交付见 [Sandcastle AFK 工作流](../docs/agents/sandcastle-afk.md)。

## 启动与诊断

1. 准备 Linux 环境、仓库锁定的工具链、Git、GitHub CLI、`flock` 和已启动的 Docker。可使用原生 Linux 或 WSL2；使用 WSL2 与 Docker Desktop 时需要 4.34+、启用 host networking 并关闭 Enhanced Container Isolation。沙箱镜像由 [Dockerfile](Dockerfile) 定义，默认用户为 UID/GID `1000`。确认该用户可写入宿主绑定的 worktree 和 pnpm store。
2. 按[环境模板](.env.example) 创建未跟踪的 `.sandcastle/.env`。宿主通过 `gh auth login` 登录，或在启动进程的环境中提供 `GH_TOKEN`，所用身份须有 `cyy1998/shgas-iam` 的 Issues 与 Pull Requests 写权限。已有 `.sandcastle/.env` 中的 GitHub 凭据须迁出，因为规划沙箱可以读取调用工作树。按下节准备 Codex 认证，再检出作为 PR 目标的调用分支（如 `main`），保持工作区干净。
3. 在仓库根构建镜像并运行预检。镜像标签默认 `iam-sandcastle:local`，可通过 `SANDCASTLE_IMAGE` 修改。

```bash
pnpm sandcastle --help
pnpm sandcastle:build
pnpm sandcastle:check
pnpm sandcastle:smoke
pnpm sandcastle
```

- `sandcastle:build`、`sandcastle:check`、`sandcastle:smoke` 分别对应 `--build`、`--check`、`--smoke`，每次选择一个。构建使用宿主 Docker 的拉取凭据。预检检查 Docker daemon 和镜像、socket、启用的认证适配器、Git 与 GitHub，以及已启用的 Projects 字段和列。私有 registry 的凭据文件通过格式校验后仍须实际拉取确认。
- 预检和正式运行（包括交付恢复）均 fetch 并要求本地调用分支与远端提交完全一致。默认选择调用分支的追踪 remote，其次为 `origin`，再尝试唯一配置的 remote；可用 `SANDCASTLE_GIT_REMOTE` 显式指定。若存在本地未推送提交或落后于远端，先在宿主同步分支，再重新运行。
- `sandcastle:smoke` 从当前 `HEAD` 建立临时 Git 仓库，用本地探测 Provider 串行验证只读与可写 Docker 沙箱，无需 Codex 登录或 `GH_TOKEN`。临时路径须对 Docker daemon 可见。覆盖范围见 [Sandcastle 验证](../docs/engineering/testing.md#sandcastle-验证)。
- 正式运行默认最多尝试 1 个 Spec，同一 Spec 最多并行实施 4 张 ticket，恢复也消耗一次 Spec 额度。`--iterations` / `SANDCASTLE_ITERATIONS` 与 `--parallel` / `SANDCASTLE_PARALLEL` 接受正整数。`--model` / `SANDCASTLE_MODEL` 只覆盖 Planner，默认 `gpt-6-astra`。这些参数由 CLI 优先读取。默认创建 Ready for Review PR，`--draft` 或 `SANDCASTLE_PR_DRAFT=true`（也接受 `1`）创建 Draft PR。

### 仓库配置

[`.sandcastle/config.ts`](config.ts) 通过 [`defineSandcastleConfig()`](../scripts/sandcastle/core/config.ts) 装配本仓镜像、共享的 `mounts` / `env`、仅用于可写阶段的 `sandbox.writable` 配置、生命周期命令和资源钩子。它显式指定 GitHub 仓库，并从 [`.codex/agents/`](../.codex/agents/) 读取 Planner 以外的 AFK 角色配置。配置契约可省略 `repo` 以从 Git remote 推断，可绑定不同的原生 `AgentProvider`、按 Provider 接入认证适配器，以及通过 `promptExtras` 追加或覆盖阶段指引。

`workflow` 支持 `branchPrefix`、`explore` / `review` / `projects` 开关、阶段内 `maxIterations`、Draft 默认值和看板映射。本仓启用探索与评审，设置 Projects URL 时才启用看板。每个阶段的 `maxIterations` 默认 `1`，与 CLI 的 Spec 数量 `--iterations` 分开配置。默认分支为 `sandcastle/spec-<N>` 和 `sandcastle/issue-<N>`，Spec 正文显式声明的集成分支优先。核心默认识别 `Integration-Branch:` 和 `Integration branch:`，本仓通过 `workflow.branchDeclarationKeywords` 增加 `集成分支`、`功能分支` 和 `复用功能/集成分支`。

本仓通过 `promptExtras` 提供 `AGENTS.md`、本地 skills 与验证入口。相同模型和推理档位的角色共享 Codex Provider，`repairer` 和 `repairerDeep` 分别复用标准与深度实施角色。其他仓库可省略 `repairerDeep`，此时高风险修复使用 `repairer`。

### 认证与宿主资源

- **GitHub**。认领、评论和 PR 交付由宿主执行。沙箱通过公开 REST API 匿名读取议题正文、评论和任务关系。
- **Codex**。默认使用 ChatGPT 文件凭据，先执行 `codex login`。文件默认取 `${CODEX_HOME:-$HOME/.codex}/auth.json`，可通过 `CODEX_AUTH_FILE` 覆盖。每轮预检只读取一次共享来源。每个执行器暂存私有副本，收尾时将刷新结果写回仍匹配的来源。若写回失败，错误会指向保留的副本。API 计费使用 `CODEX_AUTH=api-key` 和 `CODEX_API_KEY`。
- **私有镜像**。需要沙箱内拉取私有镜像时，设置 `SANDCASTLE_DOCKER_CONFIG_FILE`，相对路径从调用仓库根解析。文件仅接受顶层 `auths`、允许的 registry 及非空 `auth`、`identitytoken` 或 `registrytoken`。`SANDCASTLE_DOCKER_REGISTRIES` 接受逗号分隔的允许列表，默认 `docker.xuanyuan.run`。写入阶段将每次执行器的私有副本只读挂载至 `/home/agent/.docker/config.json`。
- **Docker**。本仓使用零补丁的 `@ai-hero/sandcastle@0.14.0` 原生 `docker()`。写入阶段绑定 `/var/run/docker.sock`，将宿主 socket GID 传给原生 `groups`，并启用 `network: "host"`，设置 `DOCKER_HOST=unix:///var/run/docker.sock`。容器使用宿主 daemon，测试环境按各自记录区分归属。Planner、探索和评审的工作树及共享缓存为只读，使用执行器专属认证副本，并跳过宿主 socket、依赖与 Hook 安装以及测试资源挂载。
- **依赖与提交**。宿主 pnpm store 默认 `$HOME/.pnpm-store`，可用 `SANDCASTLE_PNPM_STORE_DIR` 指定，容器内挂载到 `/home/agent/.pnpm-store`。原生 `onSandboxReady` 先执行锁定安装，再启用提交 Hook。各 worktree 的 `node_modules` 随 worktree 回收，宿主 store 留作后续缓存。变更依赖或新增 workspace 时，更新清单与锁定文件后在当前执行器执行 `sh scripts/sandcastle/prepare-workspace.sh`。Hook 启动器在 `/tmp/iam-sandcastle-hooks` 创建 wrapper。可写沙箱通过 `GIT_CONFIG_*` 选择该路径，提交时转调仓库 `.husky/pre-commit`。[依赖准备](../scripts/sandcastle/prepare-workspace.sh) · [Hook 启动器](../scripts/sandcastle/enable-git-hooks.sh)

### 在 GitHub Projects 查看进度

在 `.sandcastle/.env` 设置 `SANDCASTLE_PROJECT_URL=https://github.com/users/cyy1998/projects/1` 可启用 [Sandcastle AFK 看板](https://github.com/users/cyy1998/projects/1)。Projects 默认用宿主的 `gh` 登录，可执行 `gh auth refresh --hostname github.com --scopes project` 授权。也可在启动进程的环境中提供有 Projects 写入及源仓库读取权限的 `SANDCASTLE_PROJECT_TOKEN`。该变量从宿主环境读取，Projects 凭据留在宿主。

默认使用 `Status` 单选字段。预检需要 `Implementing`、`Integrated`、`Reviewing`、`PR Open`、`Needs Attention` 与 `Done` 六个映射列。集成阶段更新 Spec 和 ticket 的进度，PR 交付时将 Spec 和全部子票移到 `PR Open`，可由 GitHub 的 `Item closed` 自动化移到 `Done`。仓库配置可用 `workflow.project.fieldName` 和 `stageMap` 覆写字段与映射；未映射的阶段直接跳过。运行中的进度同步失败会告警，交付阶段 `PR Open` 同步失败会暂停收尾，修复权限或列配置后可重试。

### 恢复执行器资源

工作流采用 crash-only 恢复。宿主以 `flock` 独占 `.sandcastle/locks/runner`，进程退出或被强制结束时由内核释放锁。锁文件中的 PID 供诊断，文件可保留供下次启动复用。收到锁占用错误时，先核实占用的 runner。

写入阶段正常返回且沙箱关闭后，宿主通过 `afterExecutor` 按该执行器的 `.sandcastle/resources/executor-*/registry.jsonl` 清理登记的测试资源并尊重 `keep`。沙箱关闭状态未知时保留 registry，使用输出中的执行器 ID 对照日志和 registry 路径。模型输出参考 `.sandcastle/logs/`，测试产物和 Compose `run.json` 位于 `test-results/` 下。

强制结束或清理失败后，先用 Docker 核对相关沙箱的挂载和工作树，确认归属并在必要时停止该沙箱。根据该执行器的 registry 找到需要回收的 `run.json`，从记录所属仓库的根目录按准确记录清理。

```bash
pnpm test:resources:cleanup --record <repo-relative-run.json>
```

Smoke 失败时，先用命令打印的临时路径和 Compose project 定位该次运行。若临时仓库的 `test-results/integration/sandbox-id` 已写入，可用该 ID 核验沙箱。确认沙箱已停止后，从临时仓库根按该次的测试记录执行同一清理命令。在确认容器与资源已回收后再处理其临时 worktree 和目录。[资源归属与清理](../docs/engineering/testing.md#专用资源与隔离)

重启前保留工作树与 `.sandcastle/state/`。Git trailer、缓存及 Open PR 的恢复条件见 [Spec 交付与清理](../docs/agents/sandcastle-afk.md#spec-交付与清理)。
