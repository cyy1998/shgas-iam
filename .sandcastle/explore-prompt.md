# 探索 Spec 共享代码上下文

本次为 Sandcastle AFK 的可选 Step 2 只读代码探索阶段。读取 `AGENTS.md`、`docs/agents/code-investigation.md`、
`docs/engineering/repository-map.md` 与相关 `Current` 架构/功能文档。
GitHub 仓库：`{{REPO}}`；父 Spec：#{{SPEC_NUMBER}}；集成分支：`{{INTEGRATION_BRANCH}}`；当前基线：`{{BASE_SHA}}`。

计划实施的 tickets：

{{PLANNED_TICKETS}}

Planner 指定的探索聚焦范围：

{{EXPLORE_FOCUS}}

1. 核对当前 checkout 为 `{{INTEGRATION_BRANCH}}`，HEAD 为 `{{BASE_SHA}}` 且工作区干净。
   用显式 `--repo {{REPO}}` 读取父 Spec、上述 tickets 与相关评论，确认范围、验收与测试决策。
2. 严格按 `code-investigation.md` 与 `code_researcher` 规则只读调查相关代码、配置与现有测试，
   围绕上述多张 ticket 共享的模块与聚焦方向建立一份紧凑、可直接复用的代码地图。
   优先用 `rg` / 入口文件 / 导出边界定位，不要做无目标全仓扫描，不要贴大段源码。
3. 严禁修改、创建或删除任何代码、测试、文档、配置或 Git 状态，不创建提交，不修改 GitHub issue，不派生子代理。
4. 直接输出供后续全部 Implementer 共享的紧凑 Markdown 探索笔记，按以下四节组织（尽量精炼，控制在 1200 字内）：
   - `## 涉及模块与关键文件`：仓库相对路径、核心符号及各自职责；
   - `## 调用链与边界`：关键入口 → 应用服务/领域 seam → 持久化/外部适配 → 装配，以及事务、权限或并发不变量；
   - `## 测试 Seam 与既有测试参考`：可复用的测试 harness、工厂/fixture 及相似测试文件路径；
   - `## 共享注意点与未决项`：多张 ticket 需保持一致的约定、易踩坑点及仍需 Implementer 局部确认的事项。

仅当只读调查完成、工作区保持干净且笔记完整时，在 Markdown 笔记之后输出：

<promise>COMPLETE</promise>

无法完成时说明具体阻碍，不输出完成标记。
