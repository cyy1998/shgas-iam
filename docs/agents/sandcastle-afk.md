# Sandcastle AFK 工作流

本页只在运行或维护 Sandcastle AFK 时读取，保持无人值守批量实施的独立授权、分支和逐票评审约定。
维护者运行 `pnpm sandcastle` 或明确要求启动该路径，即授权本次运行处理全仓 `ready-for-agent` backlog、
在调用分支本地合入、评论及关闭已验收 tickets 和完成的父 Spec；配置执行器本身不等于启动它。

## 分支与工作区

AFK 在启动时固定调用分支，每张 ticket 使用由 issue 编号派生的独立分支和
worktree；同批分支从该批调用分支基线开始，批后以普通 `git merge` 合回调用分支。已有 ticket 分支先核对并恢复，
不能覆盖未完成工作。运行期间调用分支由该 runner 独占写入；启动 AFK 的授权已包含这些本地合入，不包含 push、
PR 或部署。

## 双轴评审子代理生命周期

本节适用于 AFK 实施者会话内的评审。

- 每轮双轴评审都新建相互独立、只读的 Standards 与 Spec 子代理；不得复用上一轮、其他 ticket 或其他改动的评审
  子代理。以 ticket 本身及其来源 Spec 为验收依据，Spec 轴不可跳过，无法取得验收依据时报告失败。
- 一轮评审固定使用同一个不可变 review base SHA 和 candidate HEAD SHA。修复 finding 或因其他原因需要重新评审时，
  都开始新一轮，并重新创建本轮适用的全部评审子代理。
- 每轮都向新子代理提供完整 diff、提交列表和本轴依据。第二轮及后续轮次还要提供上一轮 findings 及其处理结果作为
  复查清单，但仍重新审查完整范围，不能只验证旧 findings。
- 原实施会话在各轮之间保持不变，负责接收和修复 findings；评审子代理只服务当前一轮，不修改文件、
  stage 或 commit。

双轴评审由实施者负责执行，AFK runner 不解析评审报告或会话事件来判断是否通过。实施者等待两轴实际完成，
在交接中保留真实最终报告、固定 review base/candidate SHA 和 findings 的处置结果，供 Merger 阅读核对。
报告使用自然语言即可；最终候选两轴均无未解决 findings 才可交付，缺失或失败的评审不能用旧候选的通过结果代替。

## 批量实施

批量路径参考作者自用的
[Sandcastle runner](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/.sandcastle/run.ts)，
由本机 runner 调用 Docker 中的 Codex CLI，无需聊天主会话持续协调。选票和批后合入沿用作者的运行模型，
实施者选择与会话内双轴评审采用本仓库适配。三个阶段如下：

1. **Planner**：每轮读取全仓 open `ready-for-agent` issues、来源 Spec、依赖与交接，选择适合并行的一批切片。
   有子票的父 issue 留给合入阶段核对，不作为实施切片；assignee 用于识别已有工作，不抢占他人正在实施的 ticket。
   优先选择已解阻项；全部候选受阻时，允许按作者策略选择一张受阻 ticket 尝试推进并说明 blocker，未满足依赖或
   验收时仍保持 open。Planner 为每票从仓库定义的 `implementer_light`、`implementer_standard`、
   `implementer_deep` 中选择实施者并说明理由：范围明确的小修改可选 light，常规功能或信息不足选 standard，
   涉及安全边界、并发、一致性或复杂重构选 deep。Runner 校验角色名称并加载对应配置。
2. **Implementer**：每票在独立分支、worktree 和全新会话中读取 `AGENTS.md`、ticket、Spec 与相关评论，恢复
   验收和验证要求，认领后按 skills 的方法实施、运行聚焦验证并创建正常提交。在同一实施者会话内调用
   `/code-review`，按上一节并行启动 Standards 与 Spec 两个只读子代理；实施者接收 findings、修复并验证，
   然后开始新一轮双轴评审。每票每次实施者会话最多十轮，review base 全程固定，每轮固定本轮 candidate SHA 并审查累计完整差异。
   两轴都通过且候选未变化才可交付；子代理不可用、评审缺失、轮数耗尽或必需验证未通过时报告失败并保留 ticket
   为 open。交接包含实施者选择、上一节的评审材料、实际命令及结果、未执行项和剩余问题。
   不另设顶层 Reviewer；评审模型与只读职责由各自角色文件定义，CLI 的权限限制见命令页。
3. **Merger**：等待本批所有 Implementer 结束后，阅读各票真实评审报告与验收记录，确认满足交付条件后以普通 `git merge` 合回
   调用分支，解决合并冲突并按下文的验证节奏在最终合并内容上验证。类型检查或测试失败时先诊断，在本批授权范围内自行修复，
   重跑失效检查后继续。验证通过后记录合入 SHA、
   验收和评审摘要，关闭成功 tickets；父 Spec 的全部切片及最终验收均完成时一并关闭。随后进入下一轮。
   进入下一轮前，runner 核对本批全部候选已合入、tickets 已关闭，再删除对应本地 ticket 分支；只删除仍指向合入候选的分支，
   分支已变化或仍被 worktree 使用时停止清理并报告，不强制删除。失败票的分支继续保留供恢复。
   Planner 没有实施票可派发时，再由 Merger 核对一次待收尾父 Spec，恢复子票已关闭、父 Spec 更新失败的情况。
   Merger 正常结束但未输出完成标记时，SDK 最多执行十次迭代；每次依据 Git 和 issue 恢复记录继续未完成步骤，
   不重复已完成的合入和关票。迭代上限耗尽仍未完成时终止 runner；初始化或进程异常不由此迭代机制重试。

GitHub Issues 保存需求、协作状态与恢复说明，Git 提交保存实现历史；日志和本地分支辅助恢复，不替代 issue 事实。
合并、必需验证或 issue 更新尚未完成时，先恢复当前批次再进入下一批；无法自行解决时报告阻碍和恢复点。
保留分支和工作区现场，不自动 reset 或重复合入。
未完成或缺少必需检查的 ticket 保持 open；正常进程退出、存在提交或 Implementer 宣称完成都不能替代验收结果。

运行环境、命令和当前资源限制见 [Sandcastle AFK 命令](../development/commands.md#sandcastle-afk)。

## 验证节奏

通用的聚焦验证、提交 Hook、修复后的结果复用和基线失败处理按[工作流补充](workflow.md#验证节奏)执行。
AFK 在以下时点执行交接和批后检查：

- 每票首次交接评审前，通过一次 `pnpm verify:static`、当前 ticket 完整受影响范围的 typecheck 与行为测试，
  以及 `git diff --check`；runner 不重复实施者的静态和 diff 检查。
- Merger 在整批合并后的最终内容上运行一次 `pnpm verify`，将本批 tickets 及 Spec 所需的额外
  Integration、E2E、Gateway 检查按覆盖范围去重后执行一次，不能用各实施分支的结果代替合并后的验证。
  最终验证后再有修改时，重跑因此失效的检查。

专用测试资源遵守[资源隔离](../architecture/testing-architecture.md#专用资源与隔离)；
AFK sandbox 通过独占网络访问临时容器时不发布宿主端口。
