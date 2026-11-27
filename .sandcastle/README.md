# Sandcastle AFK 运维与启动手册

本页供维护者配置、启动和恢复本仓 AFK。任务准入、票级并行与按需 Merger、推前轻量验证、PR 交付及远端 `ci-gate` 自动修红闭环见 [Sandcastle AFK 工作流](../docs/agents/sandcastle-afk.md)。

## 启动与诊断

1. 准备 Linux 环境、仓库锁定的工具链、Git、GitHub CLI、`flock` 与运行中的 Docker（原生 Linux 或 WSL2；方案 X 为无特权单容器，**不再需要**挂载宿主机 Docker socket，也不需要 Docker Desktop 开启 host networking）。沙箱镜像由 [Dockerfile](Dockerfile)（基于 `node:24.22.3-bookworm`）定义，除 Node 24、pnpm、Bun 1.4.4、Codex 外，精准预装方案 X 四件套——**PostgreSQL 18.4**、**Redis 8.8.0**、**etcd 3.5.11** 与 **Apache APISIX 3.16.0**（移除 Docker CLI / Compose 插件，且镜像内不启任何常驻服务）。`pnpm sandcastle:build` 会自动透传当前宿主 UID/GID 作为 `AGENT_UID`/`AGENT_GID`（默认 `1000`），确保容器用户可写宿主绑定的 worktree、pnpm store 与 Turbo 缓存目录。
2. 按[环境模板](.env.example)创建未跟踪的 `.sandcastle/.env`。宿主经 `gh auth login` 登录或在启动进程环境中提供 `GH_TOKEN`（需对 `cyy1998/shgas-iam` 具备 Issues 与 Pull Requests 写权限，且具备读取 Actions / Check Runs 与日志权限）。**严禁在 `.sandcastle/.env` 中声明 `GH_TOKEN` 或 `GITHUB_TOKEN`（含空值）**，同时确保 `.git/config` 不含内嵌凭据或 HTTP Authorization header。按下节准备 Codex 认证。
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
- `--build`、`--check`、`--smoke` 每次只选一个：`--check` 核验 Docker daemon、本地镜像、Codex 凭据、`.sandcastle/.env` 与 `.git/config` 凭据边界、远端 push/fetch URL、基线 fetch（会更新远端跟踪 ref）及 GitHub 访问；`--smoke` 从当前 `HEAD` 克隆临时仓库，用本地探测 Provider 经真实 Docker 串行验证方案 X 无特权只读评审沙箱与可写实施沙箱（含零 Docker socket / 零 `docker` CLI / 零 `--network=host` 隔离、实跑原生 PG + Redis + etcd + APISIX 集成测试并验证服务可复用），无需 Codex 登录或 `GH_TOKEN`。
- 正式运行默认按编号最早尝试 1 个 `ready-for-agent` Spec（`--spec <N>` 可显式指定），同一 Spec 内最多并行 4 张子票（`--parallel` / `SANDCASTLE_PARALLEL`），`--iterations` / `SANDCASTLE_ITERATIONS` 限制本次最多尝试的 Spec 数；`--draft` 或 `SANDCASTLE_PR_DRAFT=true`（亦接受 `1`）创建 Draft PR 并立即交付，不进入远端 `ci-gate` 轮询。
- Ready PR 的远端 `ci-gate` 等绿与自动修红参数可在 `.sandcastle/.env` 覆盖：`SANDCASTLE_CI_POLL_INTERVAL_MS`（默认 `30000`，即 30 秒）、`SANDCASTLE_CI_TIMEOUT_MS`（默认 `2700000`，即 45 分钟）、`SANDCASTLE_CI_MAX_REPAIRS`（默认 `2`，支持 `0` 表示仅等绿不自动修红）。

### 目录结构

- [`.sandcastle/afk.ts`](afk.ts)：流程编排核心，负责任务图调度、并行实施与按需 Merger、双轴只读评审、集中修复、PR 交付、远端 `ci-gate` 等绿、限次自动修红与断线续接。
- [`.sandcastle/github.ts`](github.ts)：GitHub 接口层，封装有界懒加载 GraphQL、`linkedBranches` 分支解析、暂停标注、幂等 PR 复用与状态读取、`check-runs` / `actions/runs` 查询、失败日志脱敏截断及标签更新。
- [`.sandcastle/git.ts`](git.ts)：Git 与宿主安全辅助层，封装命令执行、凭据预检、远端校验、宿主 worktree 生命周期与合并提交核验。
- [`.sandcastle/session.ts`](session.ts)：本仓装配层，从 [`.codex/agents/`](../.codex/agents/) 加载 6 个角色槽位（显式 `captureSessions: false`），提供单向只读 `auth.json` / `CODEX_API_KEY` 认证与自洽的 `createSession({ worktree, readonly, runId })` 方案 X 无特权单容器 Docker 会话（可写阶段注入专用测试端点、挂载离线 pnpm store 与 Turbo 跨次缓存）。
- [`.sandcastle/run.mts`](run.mts)：薄 CLI 入口，校验参数、加载 `.sandcastle/.env`（跳过 GitHub 凭据）并分派运行。
- [`.sandcastle/smoke.mts`](smoke.mts)：方案 X 真实 Docker 无特权沙箱冒烟脚本。
- [`.sandcastle/prompts/`](prompts/)：6 阶段 Prompt 模板（`implement`、`merge`、`review-standards`、`review-spec`、`repair-and-verify`、`repair-ci`）。

### 认证与宿主资源

- **GitHub**：任务图读取、标签更新、暂停评论、PR 交付以及远端 `ci-gate` 轮询与失败日志读取均在宿主完成，上下文经 `promptArgs` 注入沙箱。需要衔接设计期 ADR 分支时，建完 Spec 后执行 `gh issue develop <spec> --name feat/<slug>` 将分支关联到 Spec 的 Development 栏（交接前确保外部工作树未占用该分支）。
- **Codex**：显式配置 `captureSessions: false`。默认使用 ChatGPT 文件凭据（`CODEX_AUTH=chatgpt`，需先在宿主 `codex login`，默认读取 `${CODEX_HOME:-$HOME/.codex}/auth.json`，可由 `CODEX_HOME` / `CODEX_AUTH_FILE` 覆盖）。每次沙箱启动单向只读复制到临时目录并挂载，退出即删（token 过期时在宿主重新登录即可）。API 计费使用 `CODEX_AUTH=api-key` 与 `CODEX_API_KEY`。
- **方案 X 无特权单容器与只读隔离**：可写阶段使用原生 `docker()`，**零 `docker.sock`、零 `--network=host`、零额外 `groups`、容器内无 Docker CLI**，在 `onSandboxReady` 执行 [启动脚本](start-test-infra.sh)，于 `/tmp/iam-test-infra` 启动非 root 测试服务并注入专用 loopback 端点。只读评审阶段由 `createSession({ worktree, readonly: true })` 直接将工作树与 `.git` 在内的全部挂载设为只读，仅挂单向只读认证，不挂 `pnpm-store`、Turbo 缓存，也不注入专用测试端点。
- **依赖、Turbo 缓存与提交 Hook**：宿主 pnpm store 默认共用 `${XDG_DATA_HOME:-$HOME/.local/share}/pnpm/store`（可用 `SANDCASTLE_PNPM_STORE_DIR` 覆盖），挂载至 `/home/agent/.pnpm-store`，可写沙箱在 `onSandboxReady` 依次执行 `HUSKY=0 pnpm install --frozen-lockfile --prefer-offline --store-dir /home/agent/.pnpm-store` 与 `bash .sandcastle/start-test-infra.sh`；`.sandcastle/cache/turbo` 挂载至 `/home/agent/.turbo-cache`（设 `TURBO_CACHE_DIR`）跨次复用缓存；经 `GIT_CONFIG_VALUE_0=.husky` 直接启用仓库 `.husky/pre-commit`，不修改宿主 `.git/config`。

### 暂停处理与恢复

- **单实例互斥**：`flock -n .sandcastle/runner.lock` 由内核在进程退出或被强杀后自动释放；遇锁占用时先核实正在运行的进程，勿手动删除锁文件。
- **`needs-attention` 暂停、远端 `ci-gate` 续跑与软停止**：异常暂停时 runner 保留 worktrees 与本地分支，给 Spec 添加 `needs-attention` 标签并评论原因。解除阻塞并移除 `needs-attention` 后重跑 `pnpm sandcastle` 即可从 Git `Sandcastle-Ticket: #<N>` 合并提交自动续跑；若全部子票已集成且同仓库 Open Ready PR 已存在（且远端 SHA 精确等于本地 `HEAD`），重启后直接续接当前 `head_sha` 的远端 `ci-gate` 等绿与修红闭环，不重复评审或重推。提前软停止正在推进或等待 CI 的 Spec 可直接移除其 `ready-for-agent` 或添加 `needs-attention`。
- **日志与强杀后清理**：测试进程与 `/tmp/iam-test-infra` 随沙箱容器回收。启动失败时查看该目录下的服务日志。模型日志位于 `.sandcastle/logs/`，测试任务日志位于各工作树的 `test-results/integration/`。若宿主进程被强杀导致沙箱容器滞留，确认容器归属后清理该容器并核对 `.sandcastle/worktrees/`。

[资源归属与清理](../docs/engineering/testing.md#专用资源与隔离)
