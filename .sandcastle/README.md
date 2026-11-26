# Sandcastle AFK 运维与启动手册

本页供维护者配置、启动和恢复本仓 AFK。任务准入、票级集成、集中验证与 PR 交付见 [Sandcastle AFK 工作流](../docs/agents/sandcastle-afk.md)。

## 启动与诊断

1. 准备 Linux 环境、仓库锁定的工具链、Git、GitHub CLI、`flock` 和已启动的 Docker。可使用原生 Linux 或 WSL2；使用 WSL2 与 Docker Desktop 时需要 4.34+、启用 host networking 并关闭 Enhanced Container Isolation。沙箱镜像由 [Dockerfile](Dockerfile) 定义，默认用户为 UID/GID `1000`。确认该用户可写入宿主绑定的 worktree 和 pnpm store。
2. 按[环境模板](.env.example)创建未跟踪的 `.sandcastle/.env`。宿主通过 `gh auth login` 登录，或在启动进程的环境中提供 `GH_TOKEN`，所用身份须有 `cyy1998/shgas-iam` 的 Issues 与 Pull Requests 写权限。**严禁在 `.sandcastle/.env` 中写入 `GH_TOKEN` 或 `GITHUB_TOKEN`（即使空值也不允许）**，因为 SDK 的 `resolveEnv()` 会将 `.sandcastle/.env` 声明的 key 解析进沙箱，核心预检也会直接拒绝。同时确保 `.git/config` 中的 remote URL 不含内嵌凭据。按下节准备 Codex 认证。
3. 无需切换本地分支或清空当前工作区。启动时 runner 会自动执行 `git fetch <remote> <baseBranch>`（默认 `origin` / `main`），不读取也不改动本地当前 checkout。若本仓远端命名为 `github`，在 `.sandcastle/.env` 中设置 `SANDCASTLE_GIT_REMOTE=github`。
4. 在仓库根构建镜像并运行预检。镜像标签默认 `iam-sandcastle:local`，可通过 `SANDCASTLE_IMAGE` 修改。

```bash
pnpm sandcastle --help
pnpm sandcastle:build
pnpm sandcastle:check
pnpm sandcastle:smoke
pnpm sandcastle
```

- `pnpm sandcastle` 通过外层 `flock -n .sandcastle/runner.lock node .sandcastle/run.mts` 启动，由内核排他锁保证单实例运行。
- `sandcastle:build`、`sandcastle:check`、`sandcastle:smoke` 分别对应 `--build`、`--check`、`--smoke`，每次只选择一个。构建使用宿主 Docker 的拉取凭据；预检检查 Docker daemon、本地镜像、socket、Codex 凭据、`.sandcastle/.env` 与 `.git/config` 凭据边界、远端基线 fetch 以及 GitHub 访问。
- `sandcastle:smoke` 从当前 `HEAD` 克隆临时 Git 仓库，用本地探测 Provider 经真实 Docker 串行验证只读评审沙箱与可写实施沙箱，无需 Codex 登录或 `GH_TOKEN`。临时路径须对 Docker daemon 可见。覆盖范围见 [Sandcastle 验证](../docs/engineering/testing.md#sandcastle-验证)。
- 正式运行默认最多尝试 1 个 Spec，同一 Spec 内最多并行实施 4 张 ticket。`--iterations` / `SANDCASTLE_ITERATIONS` 与 `--parallel` / `SANDCASTLE_PARALLEL` 接受正整数，CLI 参数优先于环境变量。默认创建 Ready for Review PR，`--draft` 或 `SANDCASTLE_PR_DRAFT=true`（也接受 `1`）创建 Draft PR。

### 本仓装配结构

核心编排库位于 [`scripts/sandcastle/core/`](../scripts/sandcastle/core/index.ts)（导出 `runAfk`、`checkAfk`、`readonlySandbox` 与 `readSpecGraph`，零仓库耦合）。本仓在 `.sandcastle/` 下以极薄装配层接入：

- [`.sandcastle/run.mts`](run.mts)：解析最小 CLI 参数（`--check`、`--build`、`--smoke`、`--iterations`、`--parallel`、`--draft`），加载 `.sandcastle/.env`（跳过 GitHub 凭据），装配 6 个 Codex 角色槽位与按阶段切换只读/可写的 `sandbox` 工厂，调用 `checkAfk` / `runAfk`。
- [`.sandcastle/codex.ts`](codex.ts)：从 [`.codex/agents/`](../.codex/agents/) 读取三档实施者（`implementer_light`、`implementer_standard`、`implementer_deep`，修复固定复用 `implementer_deep`）和双轴只读评审角色（`standards_reviewer`、`spec_reviewer`），提供 Codex 认证检查、私有副本暂存回写与私有 Docker registry 配置只读挂载。
- [`.sandcastle/test-resources.ts`](test-resources.ts)：为可写阶段包装原生 bind-mount 沙箱，预建 worktree 内绑定目标并注入 `IAM_TEST_RESOURCE_REGISTRY`，退出后清理登记的测试资源并删除空的 `executor-*` 目录。
- [`.sandcastle/prompts/`](prompts/)：按 `<phase>.md` 覆写核心内置模板，由宿主通过原生 `promptFile` + `promptArgs` 注入 Spec、ticket、评论与角色指令。
- [`.sandcastle/hooks/`](hooks/)：可写阶段 `onSandboxReady` 执行的[依赖准备](hooks/prepare-workspace.sh)与[Hook 启动器](hooks/enable-git-hooks.sh)。
- [`.sandcastle/smoke.mts`](smoke.mts)：真实 Docker 沙箱冒烟脚本。

### 认证与宿主资源

- **GitHub**。任务图读取、标签更新、暂停评论与 PR 交付均在宿主执行。父 Spec、tickets、评论与阻塞关系由宿主经 `promptArgs` 直接注入沙箱，容器内 Agent 无需请求 GitHub API。
- **Codex**。默认使用 ChatGPT 文件凭据（`CODEX_AUTH=chatgpt`），先在宿主执行 `codex login`。文件默认取 `${CODEX_HOME:-$HOME/.codex}/auth.json`，可通过 `CODEX_HOME` 或 `CODEX_AUTH_FILE` 覆盖。每个执行器获得私有暂存副本，退出时写回仍匹配的来源；若并发会话已刷新源文件，则记录告警并保留暂存副本，不会令已完成的票失败。API 计费使用 `CODEX_AUTH=api-key` 与 `CODEX_API_KEY`。
- **私有镜像**。需要沙箱内拉取私有镜像时，设置 `SANDCASTLE_DOCKER_CONFIG_FILE`（相对路径从仓库根解析），该可读文件会只读挂载至 `/home/agent/.docker/config.json`。
- **Docker**。本仓使用零补丁 `@ai-hero/sandcastle@0.14.0` 原生 `docker()`。可写阶段绑定 `/var/run/docker.sock`、将宿主 socket GID 传入原生 `groups`、启用 `network: "host"` 并设置 `DOCKER_HOST=unix:///var/run/docker.sock`。只读评审阶段由核心 `readonlySandbox()` 将挂载统一设为 `readonly: true`，跳过 `docker.sock`、可写 hooks 与测试资源挂载。
- **依赖与提交**。宿主 pnpm store 默认 `$HOME/.pnpm-store`，可用 `SANDCASTLE_PNPM_STORE_DIR` 指定，容器内挂载到 `/home/agent/.pnpm-store`（只读阶段为只读挂载）。可写阶段原生 `onSandboxReady` 执行 `sh .sandcastle/hooks/prepare-workspace.sh` 进行锁定安装，再执行 `sh .sandcastle/hooks/enable-git-hooks.sh` 在 `/tmp/iam-sandcastle-hooks` 生成提交 wrapper 并通过 `GIT_CONFIG_*` 启用 `.husky/pre-commit`，不修改宿主 `.git/config`。各 worktree 的 `node_modules` 随 worktree 销毁，宿主 store 留作后续缓存。

### 暂停处理与恢复

- **单实例排他锁**。`pnpm sandcastle` 由 `flock -n .sandcastle/runner.lock` 保证同仓库仅一个 runner 运行；进程退出或被强杀后内核自动释放锁。遇锁占用错误时先核实正在运行的进程，勿手动删除正在使用的锁文件。
- **`needs-attention` 暂停**。本仓不使用 GitHub Projects 看板。Spec 遇到配置冲突、票实施失败、评审/验证未通过或交付异常时，runner 会保留现场（worktrees 与本地分支），给 Spec 添加 `needs-attention` 标签并评论失败阶段与原因。修复阻塞点后移除 `needs-attention` 即可重新运行 `pnpm sandcastle` 续跑；若想提前中止正在推进的 Spec，直接移除其 `ready-for-agent` 或添加 `needs-attention`，runner 会在下次派发新票前软停止。
- **执行器测试资源回收**。可写阶段沙箱关闭后，宿主自动按 `.sandcastle/resources/executor-*/registry.jsonl` 清理登记的测试资源并尊重 `keep`；全部回收且无保留项时自动删除空的 `executor-*` 目录。模型日志位于 `.sandcastle/logs/`，双轴评审 SHA 缓存位于 `.sandcastle/state/review-cache.json`，测试产物与 Compose `run.json` 位于 `test-results/`。
- **强杀或清理失败后的手工恢复**。先用 Docker 核对残留沙箱的挂载与工作树，确认归属并在必要时停止该沙箱；再根据对应 `.sandcastle/resources/executor-*/registry.jsonl` 找到需要回收的 `run.json`，从仓库根目录按准确记录清理：

```bash
pnpm test:resources:cleanup --record <repo-relative-run.json>
```

确认容器、网络与数据卷均已回收后再清理对应临时目录。[资源归属与清理](../docs/engineering/testing.md#专用资源与隔离)

重启前保留 `.sandcastle/worktrees/` 与 `.sandcastle/state/review-cache.json`。Git trailer 恢复、评审缓存复用与有序幂等交付细节见 [Spec 交付与清理](../docs/agents/sandcastle-afk.md#spec-交付与清理)。
