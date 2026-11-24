# Sandcastle AFK 工作流

本页只在运行或维护 Sandcastle AFK 时读取，保持无人值守实施的独立授权、分支和 Spec 最终评审约定。
维护者运行 `pnpm sandcastle` 或明确要求启动该路径，即授权本次运行处理全仓 `ready-for-agent` backlog、
推送 Spec 集成分支到远端、创建 Pull Request、评论交接、移除已交付 PR 的 `ready-for-agent` 标签并同步 GitHub Projects 看板；
不包含合入调用分支、关闭 issues 或部署。配置执行器本身不等于启动它。

## 启动与诊断

宿主准备仓库工具链、Git、GitHub CLI 和运行中的 Docker。首次按 [环境模板](../../.sandcastle/.env.example)
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
测试走正式根入口，每条命令独立创建环境、使用动态端口并清理。资源规则见[专用资源与隔离](../engineering/testing.md#专用资源与隔离)。

每个需要安装依赖的执行器以独占匿名卷保存 Linux root/workspace `node_modules`，同时挂载共享的持久化 Docker named volume
`iam-sandcastle-pnpm-store`（`/home/agent/.pnpm-store`）作为跨容器 pnpm 内容寻址缓存，避免每个容器重复从公网下载全部依赖；
容器退出与恢复清理只回收独占匿名卷，不删除该共享 store 卷。只读阶段（`plan`、`explore`、`spec-review`）跳过依赖卷准备与安装。
宿主从 checkout 外的已知 pnpm 入口读取清单。容器验证卷和 workspace 覆盖后安装锁定依赖；新增 workspace 未覆盖时保留改动，在新执行器重新准备。
容器内变更依赖后执行 `sh scripts/sandcastle/prepare-workspace.sh`。独占 Turbo cache 可写性在启动模型前验证。
容器保留 `HUSKY=0` 安装并通过进程级 Git 配置复用仓库 Hook。浏览器与 [.sandcastle/Dockerfile](../../.sandcastle/Dockerfile)
中的 Playwright 版本匹配，升级时重建镜像并复跑 smoke。依赖和 Hook 接线见[安装脚本](../../scripts/sandcastle/prepare-workspace.sh)
与 [Hook 启动器](../../scripts/sandcastle/enable-git-hooks.sh)。

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
随后清理同一报告中的准确 `sandboxName`。按[Spec 交付与清理](#spec-交付与清理)另行恢复 Git 与 issue 进度。

## 分支与工作区

AFK 在启动时固定调用分支（如 `main`）并保持本地调用分支**全程只读**。每个 Spec 使用位于 `.sandcastle/worktrees/spec-<N>` 的独立集成工作树
与集成分支（复用正文唯一声明的 `feat/<feature-slug>` 或默认 `codex/sandcastle/spec-<N>`）；若该分支已被 `.sandcastle/worktrees/`
之外的外部 worktree 检出，runner 会直接拒绝启动以防干扰外部工作区。每张 ticket 在自己的分支与 worktree 中，
从当前 Spec 集成内容开始实施，交接前整合最新集成内容，并以普通 `git merge` 进入 Spec 集成分支。
整个 Spec 最终验收通过后，由宿主非强制推送 Spec 集成分支到远端、绑定 upstream 追踪并创建以调用分支为 base 的 PR，随后移除全部临时
worktrees 与本地 ticket 分支，**保留本地 Spec 分支 ref** 供维护者直接 `git switch <branch>` 本地启动服务人工验收。
容器内的模型会话始终禁止写调用分支、push、创建 PR 或部署。

## 双轴评审子代理生命周期

正式双轴评审在整个 Spec 的全部必要 tickets 已完成实施并普通合入集成分支后执行。部分集成、空子票列表、
issue 的 closed 状态或单票成功声明均不能代替完整集成证据。宿主核对每票交接和 Git 祖先关系，固定本次
review base 与集成 candidate SHA；评审期间工作区和候选保持不变。

1. **并行只读评审**。最终评审协调会话按 `.agents/skills/code-review/SKILL.md` 新建相互独立的只读 Standards 与 Spec 子代理，
   通过稀疏上下文指针提供同一固定 base/candidate、diff 命令、提交列表与规范来源。Standards 按仓库规范审查，Spec 对照完整父 Spec、全部必要
   tickets、评论与已确认验收。两轴都实际结束并取得真实报告才完成评审收集，任一报告缺失、失败或候选不符均保持未完成。

2. **集中修复、最终验证与 `$pr` 描述起草**。由一个实施者会话阅读两轴报告，按票级集成索引与 GitHub Issue 评论核对必要上下文，集中处理全部 findings、提交修复，并按[验证节奏](#验证节奏)执行最终验证。
   沿用手动 `implement-spec` 节奏，不默认循环双轴全量复审。涉及 deep 票时使用 deep 档，其余使用 standard 档，
   模型与思考档位由角色文件定义。评审协调者使用调用者配置的模型，两个只读子代理使用各自角色配置。
   全部修复提交与必需验证通过且工作区干净后，该会话读取 `.agents/skills/pr/SKILL.md` 与 `GLOSSARY.md`，基于最终 diff 和真实证据生成 `<pr-body>` 草稿
   （包含 `## Summary`、`## Evidence`、`## Merge Danger`）。

3. **交接记录**。宿主强校验 `<pr-body>` 结构，并将 review base、评审 candidate、修复后最终 candidate、两轴报告、修复验证材料与 `<pr-body>` 草稿一并写入父 Spec 评论。
   最终门禁通过只表示具备推送并创建 PR 的资格，tickets 与父 Spec 在整个 AFK 交付期间保持 open。交付阶段核对真实 Git 与交接。
   恢复依赖 Git、远端分支/PR、普通 issue 记录和已有日志，不新增实施进度 checkpoint 或专用 tracker schema。

整个评审与修复流程只使用一层子代理调用。评审协调者启动两轴子代理，集中修复者作为后续独立根会话运行，不增加嵌套调用层级。
宿主不解析自然语言 findings 或会话事件判断通过。评审协调者保留真实两轴报告，修复者逐项说明处置、实际命令结果
与未执行项，只有 findings 妥善处理且必需检查全部通过才输出其完成标记。会话失败或工作未完成时本轮不重开重试。

## 批量实施

批量路径参考作者自用的
[Sandcastle runner](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/.sandcastle/run.ts)，
由本机 runner 调用 Docker 中的 Codex CLI，无需聊天主会话持续协调。Spec 选择、动态集成和集中最终验收采用本仓库适配，
实施和评审方法复用既有 skills。主要阶段如下：

1. **Planner**：宿主分页读取全仓 open `type:spec` 候选、完整原生子票及 blocking 关系，校验父子类型、准入和认领，
   将可信任务图、当前可执行切片（`ready`）、本轮可解锁切片（`plannable`）与阻塞原因传给 Planner。父 Spec 与待实施子票均需 `ready-for-agent`；
   父子关系决定归属，原生依赖决定先后，正文只提供需求和解释。缺失/冲突类型、关系矛盾、循环依赖或未满足的
   前置条件阻止受影响切片，独立切片仍可选择；全部受阻时不尝试受阻票。assignee 用于保护他人工作，
   经过普通 Git/issue 交接确认的本 runner 工作可恢复。Planner 每次只选择一个 Spec，并一次性为该 Spec 本轮可执行及随前置集成将解锁的全部计划切片选择实施者与理由，
   同时评估是否需要执行一次可选的共享只读代码探索（`explore.needed`：小 Spec ≤ 2 票、模块独立或父 Spec 评论已有代码地图时跳过；
   ≥ 3 票共享同一跨层/复杂模块时启用并指明 `focus`）。
   宿主再次校验计划；父 Spec 不进入实施列表，空子票也不构成已完成的依据。后续前置票集成后，宿主直接按本次计划确定性派发解锁切片，不再重复启动 Planner。
   Planner 为每票从仓库定义的 `implementer_light`、`implementer_standard`、
   `implementer_deep` 中选择实施者并说明理由：范围明确的小修改可选 light，常规功能或信息不足选 standard，
   涉及安全边界、并发、一致性或复杂重构选 deep。Runner 校验角色名称并加载对应配置。
2. **可选 Explorer（共享代码探索）**：仅当 Planner 标记 `explore.needed` 为 `true` 时，在准备好 Spec 集成工作树后、启动首批 Implementer 前运行一次只读
   `code_researcher` 会话（跳过依赖安装，宿主校验集成工作树保持干净且 `HEAD` 未变）。宿主将产出的紧凑 Markdown 笔记写入 repo 外
   `.sandcastle/resources/spec-<N>-exploration-<base>.md` 并以只读挂载提供给所有 Implementer（仅传递稀疏路径指针），同时写入父 Spec 评论供中断恢复复用。
   探索失败时打印告警并安全降级跳过，不阻断实施；Spec 交付完成后清理该本地笔记。
3. **Implementer**：每票在独立分支、worktree 和全新会话中读取 `AGENTS.md`、ticket、父 Spec 与相关评论（有共享探索笔记指针时优先读取），
   认领后按 `tdd` skill 实施、运行完整受影响范围的聚焦验证并创建正常提交，报告完成前将当前最新集成分支 tip 合入本票分支，
   引入新提交时重跑失效的受影响检查并确认工作区干净。
   交接保留独立基线、候选、真实命令与结果、未执行项和剩余问题；不逐票运行正式双轴评审、独立验收会话或固定全仓静态检查。
   必需检查失败或未执行时保持未完成，保留分支和工作树。
4. **Spec 集成与最终验收**：宿主在串行队列中将已完成的候选直接普通 merge 到 Spec 集成分支；无冲突时零额外模型会话完成集成，
   仅在遇真实 Git 合并冲突时先 `git merge --abort` 并按需在本票 worktree 启动一次冲突解决会话（遵循
   `resolving-merge-conflicts` 并重跑受影响验证），完成后再由宿主合入。Spec 内依赖以票已集成为解锁依据，ticket 仍 open。
   单票失败后继续独立切片；所有必要票集成后，按上一节执行一次集中双轴评审、单实施者修复、最终验证与 `$pr` 正文起草。
   通过门禁的最终候选才交给交付阶段，由宿主推送 Spec 分支并创建 Ready for Review PR（可选 `--draft`），在正文确定性拼接
   `Closes #<spec>` 与每张子票的 `Closes #<ticket>`；核验 PR 后记录交付评论、移除 `ready-for-agent` 标签并将看板移入 `PR Open`。
   未通过门禁时保留实际进度，不能用部分成果冒充完整 Spec；默认不循环全量复审或重开失败会话。

GitHub Issues 保存需求、协作状态与恢复说明，Git 提交保存实现历史；日志和本地分支辅助恢复，不替代 issue 事实。
未完成成果保留在 Spec 集成分支；本轮不反复挑回失败项。无法自行解决时报告阻碍和恢复点。
保留分支和工作区现场，不自动 reset 或重复合入。
未完成或缺少必需检查的 ticket 保持 open；正常进程退出、存在提交或 Implementer 宣称完成都不能替代真实验证证据。
按需冲突解决失败时，普通交接记录实际 HEAD、准确分支和路径及待完成验证；
下次启动核对这些事实后继续处理，不沿用旧候选或把失败当作已集成。

## Spec 交付与清理

最终验收交接只授予交付资格。宿主再次核对调用分支、启动基线、评审候选、修复后候选、`<pr-body>` 草稿与各票普通合入的祖先关系，
调用与集成工作树必须干净且创建者已确认停止。调用分支前进、候选变化或交接缺失时保留现场，先整合新基线并更新失效的验证；
影响评审依据时重新评审，不能强行使用旧门禁。

交付由宿主按顺序完成：

1. **非强制推送 Spec 集成分支**：执行 `git ls-remote` 核对远端分支；若远端已有同名分支且不是 `finalCandidate` 的祖先，
   立即报错保留现场，绝不强推。推送成功后二次 `ls-remote` 核验远端 SHA 精确等于 `finalCandidate`，刷新远端跟踪引用并为本地 Spec 分支设置 upstream。
2. **幂等创建并核验 PR**：先查询 `<specBranch> -> <invocationBranch>` 的 Open PR；若已存在且 `headRefOid === finalCandidate` 则复用，
   否则以 `$pr` 正文为主干、确定性追加逐行 `Closes #<number>`、Integrated Tickets 表、折叠的双轴评审与验证详情（超 60,000 字符时自动截断详情并指向父 Spec 评论，始终保留 `Closes #...` 与元数据）以及机器核验注脚，创建 Ready for Review PR（`--draft` 时为 Draft）。创建后再次读取 PR 核验 `state === "OPEN"`、分支与 `headRefOid`。
3. **写交付评论、移出队列并更新看板**：向父 Spec 与全部子票写入包含 PR 编号/链接与完整验证摘要的交付评论，核验移除全部 `ready-for-agent` 标签
   （防止下次 AFK 重复调度），并将 GitHub Project `Status` 统一更新为 `PR Open`。AFK 不关闭 issues，也不修改本地调用分支；
   维护者可在本地直接 `git switch <specBranch>` 启动服务验收，并在 GitHub 审阅后选择 Squash and merge——合并时 GitHub 自动关闭全部关联 issues、
   将看板自动流转到 `Done` 并自动删除远端分支（仓库已启用 `deleteBranchOnMerge`）。
4. **清理临时工作树与 ticket 分支**：再次核对远端分支 SHA 等于 `finalCandidate`、待清理路径全部位于 `.sandcastle/worktrees/` 内且干净未锁后，
   非强制移除所有 ticket worktrees 并 CAS 删除本地 `codex/sandcastle/issue-*` 分支；随后非强制移除 Spec 集成 worktree（`.sandcastle/worktrees/spec-<N>`），
   **保留本地 Spec 分支 ref** 供人工验收调试。

推送、建 PR、写评论、移标签或清理失败均停止后续收尾，保留实际进度与未清理现场并在父 Spec 记录阶段和恢复点。
下次启动时，runner 扫描残留的 `.sandcastle/worktrees/spec-*` 与 Open PR 状态，对已建 PR 且 `headRefOid` 匹配的现场直接跳过模型和建 PR，
幂等补完剩余评论、去标签、看板更新和工作树清理。未知 Git 状态、远端冲突与 GitHub 公共故障会停止整个 runner。

跨 Spec 前置交付支持双路径核验：

- **PR 交付记录（现行）**：读取前置交付评论中的 PR 编号与分支，通过 GitHub API 核验 PR 为 `MERGED`、目标分支与调用分支一致，
  且本地调用分支已包含 `mergeCommit.oid`（`git merge-base --is-ancestor`）；PR 仍 `OPEN` 时保持阻塞，远端已合入但本地未同步时提示先 `git pull`。
- **本地 squash 记录（历史兼容）**：对历史已通过本地 squash 合入的 Spec，保留原有单一 parent、trailers 与祖先关系核验。

`CLOSED` 状态本身仍不构成交付证明。未完成工作的恢复按当前 runner 作者、认领和严格 Git 对象核验保护归属，不因读取他人的交付事实而接管其工作树。

## 验证节奏

通用的聚焦验证、提交 Hook、修复后的结果复用和基线失败处理按[工作流补充](workflow.md#验证节奏)执行。

- **票级实施与冲突解决** 票级实施（以及遇合并冲突时的按需冲突解决）运行完整受影响范围的行为测试、typecheck 和适用文档检查，以及 `git diff --check`。
- **Spec 最终验证** 最终集中修复者以固定 review base 为合入目标，按[验证节奏](workflow.md#验证节奏)为整个 Spec 的最终候选选择基础门禁。
  按父 Spec 与全部 tickets 的风险、验收和已确认测试决策补齐所需 Integration、E2E、Gateway 等检查，重复覆盖按范围去重。
  各票分支结果不替代最终组合验证。
- **Container Smoke 门禁** 集中修复提交后，在候选工作树执行 `pnpm verify:container-smoke --base <review-base-sha>`。
  该命令对比固定 review base 与当前 HEAD，新增、修改、删除或移动命中任意目录的 `Dockerfile`、`nginx.conf`、
  `package.json`、`pnpm-lock.yaml` 或 `e2e/system/docker/` 下的文件时，串行追加一次 `pnpm test:e2e:container-smoke`。
  无命中时记录跳过，Git 比较失败时门禁失败。同一最终候选已通过 `pnpm verify:release` 时复用其中的冒烟结果。
  启动分支提供最终验证 prompt，执行器在候选工作树读取本页和运行门禁，因此本次 Spec 引入的门禁也在本次生效。
- **E2E Runtime 门禁** 集中修复提交后，在候选工作树执行 `pnpm verify:e2e-runtime --base <review-base-sha>`。按[命令入口](../engineering/commands.md#full-system-e2e)的路径规则串行验证 E2E 编排器 Integration。同一最终候选已通过 `pnpm verify:release` 时可复用对应结果。此要求以候选工作树中的本页为准。
- 后续修复重跑失效检查，仍有效的通过证据可复用。普通交接记录实际命令、结果、对应候选与未执行项；必需检查失败或
  未执行、findings 尚未解决时保持未完成。本轮不通过反复新开会话重试，也不以清理成功或进程正常退出代替验收。
