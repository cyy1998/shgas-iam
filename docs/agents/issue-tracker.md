# GitHub 议题跟踪

本仓库新建的 spec、implementation ticket 和 wayfinding 记录统一存放在
[`cyy1998/shgas-iam`](https://github.com/cyy1998/shgas-iam) 的 GitHub Issues 中。仓库统一使用 GitHub，远端
remote 通常命名为 `github`；所有 `gh` 命令显式传入 `--repo cyy1998/shgas-iam`。

## T3 Code 工具与 Remote 约定

- **Issue 创建与任务图维护** 涉及 GitHub 原生父子关系（`--parent`）、阻塞边（`--blocked-by` / `--add-blocked-by`）及依赖 REST API 的操作统一通过 `gh` CLI 执行。
- **T3 线程绑定** 在 T3 Code 会话中接手或新建 issue 后（包括经 `gh` CLI 操作），补调 `link_issue` 将其关联到当前线程。
- **PR 操作** 涉及 PR 读取、创建、评审、评论、合入或 CI 日志排查时，在 T3 Code 环境下优先使用 `pull_request_*`、`ci_logs`、
  `ci_rerun` 等内置工具。
- **Worktree Remote 基线** 调用 `t3_worktree_handoff` 或 `t3_thread_launch` 创建 worktree 时，显式传入
  `baseRef: "github/main"`，或基于本地分支设 `startFromOrigin: false`。

## 常用操作

- 创建 issue：`gh issue create --repo cyy1998/shgas-iam --title "..." --body "..."`。多行正文优先使用
  `--body-file <path>`，避免 shell quoting 改写 Markdown。
- 读取 issue：`gh issue view <number> --repo cyy1998/shgas-iam --comments`。需要结构化读取时同时请求
  `number,title,body,state,labels,comments,assignees`。
- 列出 issue：
  `gh issue list --repo cyy1998/shgas-iam --state open --json number,title,body,labels,comments,assignees`，再按任务需要使用
  `--label`、`--state` 或 `--jq` 过滤。
- 评论：`gh issue comment <number> --repo cyy1998/shgas-iam --body "..."`。
- 添加或移除标签：
  `gh issue edit <number> --repo cyy1998/shgas-iam --add-label "..."` /
  `gh issue edit <number> --repo cyy1998/shgas-iam --remove-label "..."`。
- 认领：`gh issue edit <number> --repo cyy1998/shgas-iam --add-assignee '@me'`。
- 关闭：`gh issue close <number> --repo cyy1998/shgas-iam --comment "..."`。

实际标签名称由 [triage-labels.md](triage-labels.md) 定义，不得因远端暂时缺少标签而静默改用其他名称。

## Pull request 是否进入 triage

**PRs as a request surface: no.** 如果以后要把外部 PR 当作 feature request，可把此标志改为 `yes`；`/triage` 会读取它。

标志为 `yes` 时，PR 使用相同标签和状态，并改用 `gh pr` 对应操作：

- 读取：`gh pr view <number> --repo cyy1998/shgas-iam --comments`，代码差异使用 `gh pr diff`。
- 列出外部 PR：读取 `authorAssociation`，只保留 `CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR` 或 `NONE`，排除
  `OWNER`、`MEMBER` 和 `COLLABORATOR`。
- 评论、标签和关闭：分别使用 `gh pr comment`、`gh pr edit` 和 `gh pr close`。

GitHub Issues 与 PR 共用编号空间。遇到裸 `#42` 时，先运行
`gh pr view 42 --repo cyy1998/shgas-iam`；若不是 PR，再运行
`gh issue view 42 --repo cyy1998/shgas-iam --comments`。

## 当 skill 要求“publish to the issue tracker”

创建 GitHub issue：

- `/to-spec` 把 spec 发布为一个 issue，应用 `type:spec` 与 `ready-for-agent`；
- `/to-tickets` 按 blockers-first 顺序为每张 implementation ticket 创建独立 issue，并用 GitHub 原生关系或正文中的
  issue 引用表达来源与阻塞边；有父 Spec 的实施票按下文类型与关系规则发布；
- `/wayfinder` 按下文的 map/child issue 结构发布决策记录。

需要跨会话恢复时，GitHub issue 自身就是外置记忆：

- spec issue 正文保存 feature 范围、设计和测试决策；跨会话恢复时记录目标分支、功能分支、起始基线及必要上下文链接；
- ticket 正文保存独立切片、验收条件和 blockers；
- assignee 表达认领，open/closed 表达是否完成，triage label 表达当前处理角色；
- 评论只追加重要决策、验证摘要、评审结果和下一安全动作，并链接正式来源，不复制整份 spec 或 ticket。

手动工作流与 Sandcastle AFK 均通过 Pull Request 交付（规则见[完成与 PR 交付](workflow.md#完成与-pr-交付)与[Spec 交付与清理](sandcastle-afk.md#spec-交付与清理)）：
交付时保持关联 tickets 与父 Spec 为 open，PR 正文逐行附加 `Closes #<number>` 并在创建 PR 后移除 `ready-for-agent` 标签，待维护者在 GitHub 合并 PR 时自动关票。

### Spec 任务图

Spec 与 implementation ticket 使用[互斥类型标签](triage-labels.md#spec-与实施票类型)，AFK 实施档位与异常暂停使用[执行档位与暂停标签](triage-labels.md#afk-执行档位与暂停标签)。
`/to-tickets` 为每张有父 Spec 的票应用 `type:ticket` 与 `ready-for-agent`（并在设计期按需打 `agent:light` 或 `agent:deep`，缺省为 standard，两者互斥），
通过 GitHub 原生父子关系关联到父 Spec，通过原生 blocking 关系登记前置条件。
正文中的 Parent 或依赖解释用于阅读，不替代这两种关系，也不授权自动推断或修正关系。

当前 GitHub CLI 支持创建时传 `--parent <spec-number>` 与 `--blocked-by <numbers>`，
修改已有子票时可用 `--parent`、`--add-blocked-by`；仍须显式指定仓库。
Sandcastle AFK 通过有界两段 `first:100` GraphQL 查询读取全部 open Spec 编号及各 Spec 的子票、评论与阻塞边（规避 GitHub 50 万节点上限，检测 `pageInfo.hasNextPage` 溢出即显式报错，并经有限退避重试应对瞬断）。
关系或必要 API 不可用时报告阻塞，AFK 不降级到正文猜测归属或依赖。

AFK 不要求使用 assignee 认领（assignee 仅用于人工开发与 wayfinding 认领）。父 Spec 与待实施子票按 `OPEN ∧ 类型标签正确 ∧ ready-for-agent ∧ !needs-attention`、原生父子匹配与阻塞关系判定就绪（Spec 内前置看 Git 合并提交 trailer，Spec 外前置直接信任 `CLOSED`）。子票缺少准入、依赖矛盾或循环时，受影响切片保持阻塞，独立切片仍可推进；未准入的必要子票仍属于完整 Spec 范围，运行中新增子票不会暂停整个 Spec。
空子票列表和 issue 的 closed 状态本身不构成 Spec 已验收、代码已集成或已交付的证明。

## Sandcastle AFK 交接

AFK 使用上述类型、原生任务图与 `agent:light` / `agent:deep` / `needs-attention` 标签，不依赖 assignee 认领与 GitHub Projects 看板，也不另建 tracker schema。票级验证交接写入 Spec 合并提交正文而非子票评论；失败暂停时由 runner 为 Spec 添加 `needs-attention` 标签并评论原因。设计产物落在候选集成分支并在
Spec 正文唯一声明 `Integration branch: <branch>` 或 `集成分支：<branch>`；标为 `ready-for-agent` 前的轻量门禁、分支契约及有序幂等 PR 交付恢复见
[Sandcastle AFK 工作流](sandcastle-afk.md#设计与执行交接)。

## 当 skill 要求“fetch the relevant ticket”

运行 `gh issue view <number> --repo cyy1998/shgas-iam --comments`，并读取该 ticket 引用的 spec、blocker issues 及相关标签。

## Wayfinding operations

`/wayfinder` 使用一个 map issue 和多个 child issues：

- **Map**：带 `wayfinder:map` 标签的单个 issue，正文保存 Notes、Decisions so far 和 Fog：
  `gh issue create --repo cyy1998/shgas-iam --label wayfinder:map ...`。
- **Child ticket**：使用 GitHub sub-issue 关联到 map，并添加 `wayfinder:<type>` 标签，其中 `<type>` 为
  `research`、`prototype`、`grilling` 或 `task`。若仓库未启用 sub-issues，则把 child 加入 map 的 task list，并在 child
  正文首行写 `Part of #<map>`。
- **Blocking**：优先使用 GitHub 原生 issue dependencies。通过
  `gh api --method POST repos/cyy1998/shgas-iam/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`
  添加阻塞边；`<blocker-db-id>` 必须是
  `gh api repos/cyy1998/shgas-iam/issues/<number> --jq .id` 返回的数据库 ID，而不是 issue number 或 `node_id`。若原生
  dependencies 不可用，在 child 正文首部写 `Blocked by: #<n>, #<n>`。全部 blocker 关闭后才视为解阻。
- **Frontier**：按 map 顺序查看 open children，排除仍有 open blocker 或已有 assignee 的 issue，第一个候选即为前沿。
- **Claim**：用 `gh issue edit <number> --repo cyy1998/shgas-iam --add-assignee '@me'` 认领；这是会话的第一次写操作。
- **Resolve**：先评论答案，再关闭 child，最后在 map 的 Decisions so far 中追加摘要和上下文链接。

## 历史兼容

`.scratch/archived/**` 是旧本地 tracker 的有效历史，保持原路径和原格式。不得为切换 GitHub 而批量迁移、删除、补写或
重新校验其中的 spec、tickets、maps、prototypes 和 `delivery.md`；现有 release 文档对这些历史文件的链接继续有效。

只有维护者明确点名某个旧 tracker 及其归档操作时，才适用仓库的历史 `archive-feature` 流程。新建 GitHub issues 不进入
该归档流程，完成后直接按 issue 工作流关闭。
