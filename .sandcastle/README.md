# Sandcastle AFK 运维与启动手册

本页供维护者配置、启动和恢复本仓 AFK。任务准入、票级并行与按需 Merger、集中验证与 PR 交付见 [Sandcastle AFK 工作流](../docs/agents/sandcastle-afk.md)。

## 启动与诊断

1. 准备 Linux 环境、仓库锁定的工具链、Git、GitHub CLI、`flock` 与运行中的 Docker（原生 Linux 或 WSL2；WSL2 + Docker Desktop 需 4.34+、开启 host networking 并关闭 Enhanced Container Isolation）。沙箱镜像由 [Dockerfile](Dockerfile) 定义，`pnpm sandcastle:build` 会自动透传当前宿主 UID/GID 作为 `AGENT_UID`/`AGENT_GID`（默认 `1000`），确保容器用户可写宿主绑定的 worktree、pnpm store 与 Turbo 缓存目录。
2. 按[环境模板](.env.example)创建未跟踪的 `.sandcastle/.env`。宿主经 `gh auth login` 登录或在启动进程环境中提供 `GH_TOKEN`（需对 `cyy1998/shgas-iam` 具备 Issues 与 Pull Requests 写权限）。**严禁在 `.sandcastle/.env` 中声明 `GH_TOKEN` 或 `GITHUB_TOKEN`（含空值）**，同时确保 `.git/config` 不含内嵌凭据或 HTTP Authorization header。按下节准备 Codex 认证。
3. 无需切换本地分支或清空当前工作区。启动时 runner 自动 `git fetch <remote> <baseBranch>`（默认 `origin` / `main`，若远端命名为 `github` 则设置 `SANDCASTLE_GIT_REMOTE=github`），不读取也不改动本地当前 checkout。
4. 在仓库根构建镜像并运行预检（镜像标签默认 `iam-sandcastle:local`，可用 `SANDCASTLE_IMAGE` 覆盖）：

```bash
pnpm sandcastle --help
pnpm sandcastle:build
pnpm sandcastle:check
pnpm sandcastle:smoke
pnpm sandcastle
```

- `pnpm sandcastle` 通过 `flock -n .sandcastle/runner.lock node .sandcastle/run.mts` 启动，由内核排他锁保证单实例运行。
- `--build`、`--check`、`--smoke` 每次只选一个：`--check` 核验 Docker daemon、本地镜像、socket、Codex 凭据、`.sandcastle/.env` 与 `.git/config` 凭据边界、远端 push/fetch URL、基线 fetch（会更新远端跟踪 ref）及 GitHub 访问；`--smoke` 从当前 `HEAD` 克隆临时仓库，用本地探测 Provider 经真实 Docker 串行验证 linked worktree 只读评审沙箱与可写实施沙箱（无需 Codex 登录或 `GH_TOKEN`）。
- 正式运行默认按编号最早尝试 1 个 `ready-for-agent` Spec（`--spec <N>` 可显式指定），同一 Spec 内最多并行 4 张子票（`--parallel` / `SANDCASTLE_PARALLEL`），`--iterations` / `SANDCASTLE_ITERATIONS` 限制本次最多尝试的 Spec 数；`--draft` 或 `SANDCASTLE_PR_DRAFT=true`（亦接受 `1`）创建 Draft PR。

### 目录结构

- [`.sandcastle/afk.ts`](afk.ts)：流程编排核心，负责任务图调度、并行实施与按需 Merger、双轴只读评审、集中修复验证与有序交付。
- [`.sandcastle/github.ts`](github.ts)：GitHub 接口层，封装有界懒加载 GraphQL、`linkedBranches` 分支解析、暂停标注、幂等 PR 复用与标签更新。
- [`.sandcastle/git.ts`](git.ts)：Git 与宿主安全辅助层，封装命令执行、凭据预检、远端校验、宿主 worktree 生命周期与合并提交核验。
- [`.sandcastle/session.ts`](session.ts)：本仓装配层，从 [`.codex/agents/`](../.codex/agents/) 加载 6 个角色槽位（显式 `captureSessions: false`），提供单向只读 `auth.json` / `CODEX_API_KEY` 认证、自洽的 `createSession({ worktree, readonly, runId })` 只读/可写 Docker 会话、离线 pnpm store + Turbo 跨次缓存挂载、私有 Docker registry 只读挂载与基于 `docker inspect <sandboxId>` 的测试资源回收。
- [`.sandcastle/run.mts`](run.mts)：薄 CLI 入口，校验参数、加载 `.sandcastle/.env`（跳过 GitHub 凭据）并分派运行。
- [`.sandcastle/smoke.mts`](smoke.mts)：真实 Docker 沙箱冒烟脚本。
- [`.sandcastle/prompts/`](prompts/)：5 阶段 Prompt 模板（`implement`、`merge`、`review-standards`、`review-spec`、`repair-and-verify`）。

### 认证与宿主资源

- **GitHub**：任务图读取、标签更新、暂停评论与 PR 交付均在宿主完成，上下文经 `promptArgs` 注入沙箱。需要衔接设计期 ADR 分支时，建完 Spec 后执行 `gh issue develop <spec> --name feat/<slug>` 将分支关联到 Spec 的 Development 栏（交接前确保外部工作树未占用该分支）。
- **Codex**：显式配置 `captureSessions: false`。默认使用 ChatGPT 文件凭据（`CODEX_AUTH=chatgpt`，需先在宿主 `codex login`，默认读取 `${CODEX_HOME:-$HOME/.codex}/auth.json`，可由 `CODEX_HOME` / `CODEX_AUTH_FILE` 覆盖）。每次沙箱启动单向只读复制到临时目录并挂载，退出即删（token 过期时在宿主重新登录即可）。API 计费使用 `CODEX_AUTH=api-key` 与 `CODEX_API_KEY`。
- **私有镜像**：设置 `SANDCASTLE_DOCKER_CONFIG_FILE`（相对仓库根解析）即可将可读配置文件只读挂载至可写沙箱的 `/home/agent/.docker/config.json`。
- **Docker 与只读隔离**：可写阶段使用原生 `docker()` 挂载 `/var/run/docker.sock`、传入 socket GID 至 `groups`、启用 `network: "host"` 并设 `DOCKER_HOST=unix:///var/run/docker.sock`。只读评审阶段由 `createSession({ worktree, readonly: true })` 直接将工作树与 `.git` 在内的全部挂载设为只读，仅挂单向只读认证，不挂 `docker.sock`、`pnpm-store`、Turbo 缓存与 Docker registry。
- **依赖、Turbo 缓存与提交 Hook**：宿主 pnpm store 默认 `$HOME/.pnpm-store`（可用 `SANDCASTLE_PNPM_STORE_DIR` 覆盖），挂载至 `/home/agent/.pnpm-store`，可写沙箱在 `onSandboxReady` 执行单行 `HUSKY=0 pnpm install --frozen-lockfile --prefer-offline --store-dir /home/agent/.pnpm-store`；`.sandcastle/cache/turbo` 挂载至 `/home/agent/.turbo-cache`（设 `TURBO_CACHE_DIR`）跨次复用缓存；经 `GIT_CONFIG_VALUE_0=.husky` 直接启用仓库 `.husky/pre-commit`，不修改宿主 `.git/config`。

### 暂停处理与恢复

- **单实例互斥**：`flock -n .sandcastle/runner.lock` 由内核在进程退出或被强杀后自动释放；遇锁占用时先核实正在运行的进程，勿手动删除锁文件。
- **`needs-attention` 暂停与续跑**：异常暂停时 runner 保留 worktrees 与本地分支，给 Spec 添加 `needs-attention` 标签并评论原因。解除阻塞并移除 `needs-attention` 后重跑 `pnpm sandcastle` 即可从 Git `Sandcastle-Ticket: #<N>` 合并提交自动续跑；提前软停止正在推进的 Spec 可直接移除其 `ready-for-agent` 或添加 `needs-attention`。
- **测试资源回收**：可写沙箱关闭后，宿主先用 `docker inspect <sandboxId>` 确认容器明确处于停止或已移除状态，再按 `.sandcastle/resources/run-*/registry.jsonl` 回收测试资源并尊重 `keep`；无保留项时同步删除仓库根与 worktree 下的空 `run-*` 目录。模型日志位于 `.sandcastle/logs/`，测试产物与 Compose `run.json` 位于 `test-results/`。
- **强制中断后的手工恢复**：先用 `docker inspect` / `docker ps` 核对并停止残留沙箱，再从 `.sandcastle/resources/run-*/registry.jsonl` 找到需回收的 `run.json`，在仓库根目录执行：

```bash
pnpm test:resources:cleanup --record <repo-relative-run.json>
```

确认容器、网络与数据卷均已回收后再清理对应临时目录。[资源归属与清理](../docs/engineering/testing.md#专用资源与隔离)
