# 本地 Markdown 议题跟踪

本仓库把 `.scratch/` 用作 Matt skills 的本地 issue tracker。它保存需要跨会话恢复的 feature 资料，不是 workflow
数据库，也不由专用 checker 校验。

## Feature 布局

进入 `/to-tickets` 的 feature 使用以下布局：

```text
.scratch/<feature-slug>/
├── spec.md
├── delivery.md
└── issues/
    ├── 01-<slug>.md
    └── 02-<slug>.md
```

- `/to-spec` 把当前共识发布到 `spec.md`。Spec 不维护 `draft → approved` 状态字段；是否继续拆票以用户确认和当前
  对话为准。
- `/to-tickets` 在用户确认拆分后，从 `01` 开始按依赖顺序一票一文件发布到 `issues/`。
- 已知工作会跨会话时，随 spec 创建 `delivery.md`；否则在发布首批 tickets 时补建。
- 可以在一个上下文中直接完成的小型 `/implement` 工作不创建上述 tracker 产物。

## Ticket 形状

本地 ticket 保留上游模板的最小信息：

```markdown
# NN — <中文标题>

**What to build:** <从用户视角描述可独立工作的端到端行为>

**Blocked by:** <ticket 编号/标题，或 None — can start immediately>

**Status:** ready-for-agent

- [ ] <可观察验收标准>
```

`Status` 是协作提示，只使用 `ready-for-agent`、`claimed`、`resolved`：

- blocker 全部 `resolved` 的 `ready-for-agent` ticket 位于依赖前沿；
- 实现任务开始时改为 `claimed`，无需独立 claim commit；
- 聚焦验证和 Standards/Spec 双轴评审清零后，勾选验收项并改为 `resolved`；
- 不追加固定 `Resolution` 章节、candidate SHA、final merge SHA 或验证证据 schema。

Ticket 标题、交付行为和验收使用自然中文；字段名、状态、命令、路径和代码标识符保持原语言。

## Feature Journal

`delivery.md` 只承担跨会话恢复，使用三个自由格式章节：

```markdown
# <功能名>开发记录

## 当前状态

## 验收与验证计划

## 事件
```

- “当前状态”说明依赖前沿、当前 ticket、功能/目标分支和下一安全动作。
- “验收与验证计划”概述 ticket 级聚焦检查，以及准备 merge 时的一次完整验证。
- “事件”按日期追加重要过程摘要，可以使用 `Decision`、`Authorization`、`Validation`、`Review`、`Reopen` 或
  `Repair` 标签，但不要求固定字段、Gate ID、SHA 或机器可解析格式。
- Journal 链接正式来源而不复制需求。Feature 范围与测试决策以 spec 为准，切片范围与验收以 ticket 为准，稳定领域
  语言与长期决策以 `CONTEXT.md`/ADR 为准。

一次性实施多张 tickets 的批量模式中，每张 ticket 的专用 implementation 子代理从新上下文读取 `AGENTS.md`、当前
分支、spec、ticket、blockers 和 journal。只实施一张 ticket 时由当前会话直接实施，不因同一 tracker 还存在其他
tickets 而启动专用 implementation 子代理。实现通过后，ticket 状态、验收 checkbox 与 journal 摘要进入一个轻量
handoff commit，供后续上下文恢复。

## Skill 操作映射

- “Publish to the issue tracker”表示写入上述 `.scratch/<feature-slug>/` 文件。
- “Fetch the relevant ticket”表示读取指定 ticket，并同时读取同 feature 的 spec、journal 和 blocker tickets。
- Triage label `ready-for-agent` 在本地 implementation ticket 中由同名 `Status` 表达；spec 不把 label 映射为生命周期
  字段。其他默认 triage 标签见 [triage-labels.md](triage-labels.md)。

## Wayfinding operations

`/wayfinder` 继续使用独立的本地 planning 形状：

- Map：`.scratch/<effort>/map.md`，保存 Destination、Notes、Decisions so far、Not yet specified 与 Out of scope。
- Child ticket：`.scratch/<effort>/issues/NN-<slug>.md`，记录 `Type: research | prototype | grilling | task`、
  `Status: claimed | resolved` 和 `Blocked by`。
- 认领时先写 `claimed`；解决时追加 `## Answer`、改为 `resolved`，并把一行摘要和链接加入 map 的
  Decisions so far。
- Wayfinding 是规划记录；只有后续进入 `/to-tickets` 的实现 feature 才按前述规则创建 journal。

## 历史与归档

既有 `.scratch/` 内容是有效历史，保持原路径和原格式；不批量迁移、补写字段或用当前模板校验。Feature tracker 只有在
维护者显式调用仓库归档能力时才移动，归档时由该能力修复仍受版本控制的旧路径引用。
