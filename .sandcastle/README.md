# Sandcastle AFK 运维与启动手册

本页供维护者在宿主配置、启动、诊断与恢复 Sandcastle AFK runner。AFK 的交接门禁、分支工作区、评审、验证与 PR 交付契约见
[Sandcastle AFK 工作流](../docs/agents/sandcastle-afk.md)。

## 启动与诊断

宿主准备仓库工具链、Git、GitHub CLI 和运行中的 Docker。首次按[环境模板](.env.example)
创建未跟踪的 `.sandcastle/.env`，填写具有 Issues 与 Pull Requests 写入权限的 `GH_TOKEN`，选择作为 PR 目标分支的调用分支
（如 `main`）。GitHub 仓库固定为 `cyy1998/shgas-iam`，远端 remote 默认自动解析调用分支追踪的 remote（通常为 `github`，
也可用 `SANDCASTLE_GIT_REMOTE` 显式指定）。

```bash
pnpm sandcastle:build
pnpm sandcastle:check
pnpm sandcastle --smoke-docker
pnpm sandcastle:smoke:workflow
pnpm sandcastle:smoke
pnpm sandcastle
pnpm sandcastle --iterations 2 --parallel 2 --model <model> [--draft]
```

- `sandcastle:check` 预检工具、镜像、Codex 认证、指向 `cyy1998/shgas-iam` 的 Git remote 连通性、GitHub PR API 可达性以及
  Projects `Status` 列配置。Registry 配置通过预检后仍需实际拉取确认认证。
- 启动正式运行（新 Spec 或非已建 PR 的恢复）前，runner 只读执行 `git fetch <remote> <branch>` 并核对本地调用分支与远端
  `<remote>/<branch>` 对齐：若本地存在未推送提交或落后于远端，立即阻断并提示先同步，绝不静默改写本地调用分支，也避免无关本地提交混入 PR。
- `--smoke-docker` 用两个 UID 1000 sandbox 验证共享 daemon、Compose/Buildx、host networking、浏览器、文件传输和准确清理。结果保存在 `.sandcastle/resources/docker-smoke-<run-id>/`。
- `sandcastle:smoke:workflow` 仅在宿主执行全部 4 个受控工作流场景（`complete`、`conflict`、`interrupt`、`pr-interrupt`），跳过 Docker 适合快速回归编排与 PR 交付逻辑。
- `sandcastle:smoke` 先执行 Docker smoke，再用临时仓库、本地 bare remote 和受控模型/GitHub 验证编排、真实提交 Hook、资源隔离、并行任务、PR 交付与清理。工作流报告在 `.sandcastle/resources/workflow-smoke-<run-id>/`。Smoke 证明编排和接线，真实模型和 backlog 由实际 Spec 运行观察。
- 默认尝试 1 个 Spec，同一 Spec 最多并行实施 4 张 ticket。`--iterations` / `SANDCASTLE_ITERATIONS` 与
  `--parallel` / `SANDCASTLE_PARALLEL` 接受正整数，CLI 优先，恢复也计一次 Spec 额度。
  `--model` / `SANDCASTLE_MODEL` 只覆盖 Planner 和最终评审协调者，CLI 优先。角色自身的模型和思考程度见 `.codex/agents/`。
  默认创建 **Ready for Review** PR；传入 `--draft` 或设置 `SANDCASTLE_PR_DRAFT=true` 可改为创建 Draft PR。

### 在 GitHub Projects 查看进度

在本机 `.sandcastle/.env` 设置 `SANDCASTLE_PROJECT_URL=https://github.com/users/cyy1998/projects/1`，使用
[Sandcastle AFK](https://github.com/users/cyy1998/projects/1) 看板。看板直接复用系统内置的 `Status` 单选字段作为 Board 分列，
按下表配置选项后，Board 视图天然按列呈现各阶段，并与 GitHub 内置 `Item closed` → `Done` 自动化联动。运行 `pnpm sandcastle:check`
可预检 Project 和 `Status` 列配置。

Projects 使用宿主的 `gh` 登录，可用 `gh auth refresh --hostname github.com --scopes project` 授权。
使用独立令牌时，将有 Projects 写入和源仓库读取权限的 `SANDCASTLE_PROJECT_TOKEN` 注入宿主进程环境。
Projects 凭据留在宿主，`GH_TOKEN` 继续用于 Issues 与 Pull Requests。

| `Status` 列       | 同步时机                                                     |
| ----------------- | ------------------------------------------------------------ |
| `Todo`            | 待开始或人工入队默认状态（由维护者或默认规则使用）           |
| `Implementing`    | Spec 已选定并准备好集成工作树，或 ticket 开始实施            |
| `Integrated`      | ticket 已完成实施并合入 Spec 集成分支                        |
| `Reviewing`       | Spec 进入集中双轴评审、修复、最终验证与 PR 推送准备          |
| `PR Open`         | PR 已创建并核验完成，Spec 与全部子票移入此列等待人工验收合入 |
| `Needs Attention` | ticket 实施或集成失败，或尚未交付 PR 的 Spec 暂停            |
| `Done`            | 人工合入 PR 触发自动关票后，由 GitHub 内置自动化移入         |

Runner 把实际处理的 Spec 和 ticket 加入看板，并在恢复时补报已确认的集成或 PR 进度。任务准入、依赖、恢复和交付仍以 GitHub Issues、
Pull Requests 和 Git 为依据。看板同步失败会输出告警，AFK 继续执行，界面可能保留最近一次成功同步的列。强制结束后，看板也可能保留旧列。
详细模型输出和验证日志仍从本地查看。

### 认证与宿主资源

默认先执行 `codex login` 并使用文件凭据存储。`CODEX_AUTH_FILE` 可指定来源；使用 API 计费时设置 `CODEX_AUTH=api-key`
与 `CODEX_API_KEY`。Runner 将本次 `auth.json` 复制到私有临时目录再挂载，退出前写回刷新结果。来源登录已变化或写回失败时保留来源并报告恢复目录。运行期间保持同一份宿主登录稳定，强制退出后核对启动时打印的恢复目录。

私有 `docker.xuanyuan.run` 镜像使用显式 `SANDCASTLE_DOCKER_CONFIG_FILE`。相对路径从调用仓库根解析。
配置仅接受顶层 `auths`、单一该 registry 以及非空 `auth`、`identitytoken` 或 `registrytoken`，
宿主配置和 credential helper 不参与。每个执行器重验来源，创建私有副本，只读挂载到 `/home/agent/.docker/config.json`。
调用者保管并保持源文件可读，runner 只回收自己的副本。来源路径及认证内容不写入日志、记录或错误。

需要 Linux Docker Engine，或 Docker Desktop 4.34+ 开启 host networking 并关闭 Enhanced Container Isolation。
共享 daemon 和 host network 提供宿主 Docker 管理与网络访问能力，project 名用于资源归属。
运行前以实际执行用户检查 socket、Docker 工具和宿主 loopback，条件不满足时退出。
测试走正式根入口，每条命令独立创建环境、使用动态端口并清理。根 Integration 在单条命令内并发运行所选任务，
并为每个需要 Redis 的任务分配独立 DB。同一宿主上的顶层验证命令仍按顺序执行。资源规则见[专用资源与隔离](../docs/engineering/testing.md#专用资源与隔离)。

每个需要安装依赖的执行器以独占匿名卷保存 Linux root/workspace `node_modules`，同时挂载共享的持久化 Docker named volume
`iam-sandcastle-pnpm-store`（`/home/agent/.pnpm-store`）作为跨容器 pnpm 内容寻址缓存，避免每个容器重复从公网下载全部依赖；
容器退出与恢复清理只回收独占匿名卷，不删除该共享 store 卷。只读阶段（`plan`、`explore`、`spec-review`）跳过依赖卷准备与安装。
宿主从 checkout 外的已知 pnpm 入口读取清单。容器验证卷和 workspace 覆盖后安装锁定依赖；新增 workspace 未覆盖时保留改动并退出，宿主检测到新增依赖目录后自动挂载新匿名卷并有界重建执行器无缝继续（单阶段最多自动重建 2 次），无需人工重启或手工拉起嵌套容器。
容器内变更依赖后执行 `sh scripts/sandcastle/prepare-workspace.sh`。独占 Turbo cache 可写性在启动模型前验证。
容器保留 `HUSKY=0` 安装并通过进程级 Git 配置复用仓库 Hook。浏览器与 [`.sandcastle/Dockerfile`](Dockerfile)
中的 Playwright 版本匹配，升级时重建镜像并复跑 smoke。依赖和 Hook 接线见[安装脚本](../scripts/sandcastle/prepare-workspace.sh)
与 [Hook 启动器](../scripts/sandcastle/enable-git-hooks.sh)。

### 恢复执行器资源

普通失败或 Ctrl+C 先停止并等待准确的创建者 sandbox，再按其 registry 有界清理。无法确认停止时保留挂载、锁、
私有认证副本和恢复记录。强杀或清理失败时使用准确执行器记录：

```bash
pnpm sandcastle --recover-executor .sandcastle/resources/executor-<run-id>/executor.json
```

执行器恢复覆盖 sandbox 及其登记资源，遵守显式 keep。需要清理单个保留环境时按其 `run.json` 执行
`pnpm test:resources:cleanup --record <repo-relative-run.json>`。容器已移除时只按预先登记且核验归属的匿名卷 ID 回收，
在用或归属未知时保留。旧 `run.lock` 仅在确认旧进程结束后移除。

Docker smoke 异常后按对应报告里的准确 `project` 和 `composePath` 执行
`docker compose --project-name <project> --file <composePath> down --volumes --remove-orphans --rmi local`，
随后清理同一报告中的准确 `sandboxName`。按[Spec 交付与清理](../docs/agents/sandcastle-afk.md#spec-交付与清理)另行恢复 Git 与 issue 进度。
