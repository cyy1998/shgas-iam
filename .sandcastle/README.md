# Sandcastle AFK 运维与启动手册

本页供维护者配置、启动和恢复本仓 AFK。任务准入、票级集成、按需 Merger、集中验证与 PR 交付见 [Sandcastle AFK 工作流](../docs/agents/sandcastle-afk.md)。

## 启动与诊断

1. 准备 Linux 环境、仓库锁定的工具链、Git、GitHub CLI、`flock` 和已启动的 Docker。可使用原生 Linux 或 WSL2；使用 WSL2 与 Docker Desktop 时需要 4.34+、启用 host networking 并关闭 Enhanced Container Isolation。沙箱镜像由 [Dockerfile](Dockerfile) 定义，默认用户为 UID/GID `1000`。确认该用户可写入宿主绑定的 worktree、pnpm store 与 Turbo 缓存目录。
2. 按[环境模板](.env.example)创建未跟踪的 `.sandcastle/.env`。宿主通过 `gh auth login` 登录，或在启动进程的环境中提供 `GH_TOKEN`，所用身份须有 `cyy1998/shgas-iam` 的 Issues 与 Pull Requests 写权限。**严禁在 `.sandcastle/.env` 中写入 `GH_TOKEN` 或 `GITHUB_TOKEN`（即使空值也不允许）**，因为 SDK 的 `resolveEnv()` 会将 `.sandcastle/.env` 声明的 key 解析进沙箱，预检也会直接拒绝。同时确保 `.git/config` 不含内嵌凭据或 HTTP Authorization header。按下节准备 Codex 认证。
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
- `sandcastle:build`、`sandcastle:check`、`sandcastle:smoke` 分别对应 `--build`、`--check`、`--smoke`，每次只选择一个。构建使用宿主 Docker 的拉取凭据；预检检查 Docker daemon、本地镜像、socket、Codex 凭据、`.sandcastle/.env` 与 `.git/config` 凭据边界、远端 `--push --all` 校验、基线 fetch 以及 GitHub 访问。
- `sandcastle:smoke` 从当前 `HEAD` 克隆临时 Git 仓库，用本地探测 Provider 经真实 Docker 串行验证只读评审沙箱与可写实施沙箱，无需 Codex 登录或 `GH_TOKEN`。临时路径须对 Docker daemon 可见。覆盖范围见 [Sandcastle 验证](../docs/engineering/testing.md#sandcastle-验证)。
- 正式运行默认按编号最早尝试 1 个 `ready-for-agent` Spec（可通过 `--spec <N>` 显式指定），同一 Spec 内最多并行实施 4 张 ticket（`--parallel` / `SANDCASTLE_PARALLEL`），`--iterations` / `SANDCASTLE_ITERATIONS` 控制最多尝试 Spec 数，CLI 参数优先于环境变量。默认创建 Ready for Review PR，`--draft` 或 `SANDCASTLE_PR_DRAFT=true`（也接受 `1`）创建 Draft PR。

### 本仓目录结构

全部 AFK 编排代码统一收拢在 `.sandcastle/`：

- [`.sandcastle/afk.ts`](afk.ts)：纯流程编排核心（仅依赖 `node:*` 与 `@ai-hero/sandcastle`，无仓库耦合），包含有界懒加载 GraphQL、`linkedBranches` 分支发现、宿主 worktree 生命周期、票级并行与按需 Merger、独立只读双轴评审、单次修复验证与有序幂等 PR 交付。
- [`.sandcastle/session.ts`](session.ts)：本仓装配层，从 [`.codex/agents/`](../.codex/agents/) 读取 6 个角色槽位，提供单向只读 `auth.json` / `CODEX_API_KEY` 认证、离线 pnpm store + Turbo 跨次缓存挂载、私有 Docker registry 只读挂载与基于 `docker inspect <sandboxId>` 停机核验的测试资源回收。
- [`.sandcastle/run.mts`](run.mts)：极薄 CLI 入口，解析参数、安全加载 `.sandcastle/.env`（跳过 GitHub 凭据）并调用 `checkAfk` / `runAfk` / `smoke`。
- [`.sandcastle/smoke.mts`](smoke.mts)：真实 Docker 沙箱冒烟脚本（复用 `session.ts` 与 `afk.ts`，无循环导入）。
- [`.sandcastle/prompts/`](prompts/)：唯一一套 5 阶段 Prompt 模板（`implement`、`merge`、`review-standards`、`review-spec`、`repair-and-verify`）。
- [`.sandcastle/hooks/`](hooks/)：可写阶段 `onSandboxReady` 执行的[依赖准备](hooks/prepare-workspace.sh)（`--frozen-lockfile --prefer-offline`）与[Hook 启动器](hooks/enable-git-hooks.sh)。

### 认证与宿主资源

- **GitHub**。任务图读取、标签更新、暂停评论与 PR 交付均在宿主执行。父 Spec、tickets、评论与阻塞关系由宿主经 `promptArgs` 直接注入沙箱，容器内 Agent 无需请求 GitHub API。需要衔接设计期 ADR 分支时，在创建 Spec 后执行 `gh issue develop <spec> --name feat/<slug> --checkout` 将分支原生关联到 Spec 的 Development 栏。
- **Codex**。默认使用 ChatGPT 文件凭据（`CODEX_AUTH=chatgpt`），先在宿主执行 `codex login`。文件默认取 `${CODEX_HOME:-$HOME/.codex}/auth.json`，可通过 `CODEX_HOME` 或 `CODEX_AUTH_FILE` 覆盖。每次沙箱启动将该文件**单向只读复制**到临时目录并挂载至容器，退出即删，不回写宿主文件（token 过期时在宿主重新登录即可）。API 计费使用 `CODEX_AUTH=api-key` 与 `CODEX_API_KEY`。
- **私有镜像**。需要可写沙箱内拉取私有镜像时，设置 `SANDCASTLE_DOCKER_CONFIG_FILE`（相对路径从仓库根解析），该可读文件会只读挂载至 `/home/agent/.docker/config.json`。
- **Docker**。本仓使用零补丁 `@ai-hero/sandcastle@0.14.0` 原生 `docker()`。可写阶段绑定 `/var/run/docker.sock`、将宿主 socket GID 传入原生 `groups`、启用 `network: "host"` 并设置 `DOCKER_HOST=unix:///var/run/docker.sock`。只读评审阶段由 `readonlySandbox()` 将工作树与 `.git` 置为只读，仅挂单向只读认证，不挂 `docker.sock`、`pnpm-store`、Turbo 缓存与 Docker registry。
- **依赖、Turbo 缓存与提交 Hook**。宿主 pnpm store 默认 `$HOME/.pnpm-store`（可用 `SANDCASTLE_PNPM_STORE_DIR` 覆盖），挂载到 `/home/agent/.pnpm-store` 供 `prepare-workspace.sh` 离线秒装；同时挂载 `.sandcastle/cache/turbo` 到 `/home/agent/.turbo-cache`（设 `TURBO_CACHE_DIR`）跨次复用 `typecheck` / `test:unit` / `build` 缓存。`enable-git-hooks.sh` 在 `/tmp/iam-sandcastle-hooks` 生成提交 wrapper 并通过 `GIT_CONFIG_*` 启用 `.husky/pre-commit`，不修改宿主 `.git/config`。

### 暂停处理与恢复

- **单实例排他锁**。`pnpm sandcastle` 由 `flock -n .sandcastle/runner.lock` 保证同仓库仅一个 runner 运行；进程退出或被强杀后内核自动释放锁。遇锁占用错误时先核实正在运行的进程，勿手动删除正在使用的锁文件。
- **`needs-attention` 暂停**。本仓不使用 GitHub Projects 看板，也不维护本地状态文件。Spec 遇分支冲突、票实施/合并失败、评审验证未通过或交付异常时，runner 会保留现场（worktrees 与本地分支），给 Spec 添加 `needs-attention` 标签并评论失败原因。修复阻塞点后移除 `needs-attention` 即可重新运行 `pnpm sandcastle` 续跑（已集成票自动从 Git `Sandcastle-Ticket: #<N>` 合并提交推导）；若想提前中止正在推进的 Spec，直接移除其 `ready-for-agent` 或添加 `needs-attention`，runner 会在下次派发新票或交付前软停止。
- **执行器测试资源回收**。可写阶段沙箱关闭后，宿主先经 `docker inspect <sandboxId>` 精确确认容器已停止/移除，再按 `.sandcastle/resources/run-*/registry.jsonl` 清理登记的测试资源并尊重 `keep`；全部回收且无保留项时自动删除空的 `run-*` 目录。模型日志位于 `.sandcastle/logs/`，测试产物与 Compose `run.json` 位于 `test-results/`。
- **强杀或清理失败后的手工恢复**。先用 `docker inspect` / `docker ps` 核对残留沙箱并在必要时停止该沙箱；再根据对应 `.sandcastle/resources/run-*/registry.jsonl` 找到需要回收的 `run.json`，从仓库根目录按准确记录清理：

```bash
pnpm test:resources:cleanup --record <repo-relative-run.json>
```

确认容器、网络与数据卷均已回收后再清理对应临时目录。[资源归属与清理](../docs/engineering/testing.md#专用资源与隔离)
