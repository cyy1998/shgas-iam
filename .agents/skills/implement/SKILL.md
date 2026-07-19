---
name: implement
description: 按 approved spec、tickets 或已批准快速范围实施工作，并服从仓库的验证、提交与评审生命周期。用户要求开始实现、继续获批 tickets 或完成快速改动时使用。
---

# 实施

实施用户已批准的 spec、tickets 或快速改动范围。

开始前必须读取仓库 `AGENTS.md`、Engineering workflow、当前 feature 的 `delivery.md`、来源 spec 和相关 tickets。仓库 workflow 决定分支、授权有效期、ticket 状态、Validation Plan、提交、评审、merge 与恢复；本 skill 不复制或覆盖这些规则。

1. 验证当前分支、ledger、实施授权和声明范围一致。标准路径只认领 blocker 已解决的依赖前沿 ticket；快速路径使用 ledger 中的范围与验收项。
2. 按仓库 workflow 创建 claim checkpoint，并固定 ticket base。没有有效实施授权时停止并给出 resume/implementation brief。
3. 在预先约定的最高层测试接缝尽可能使用 TDD。实施过程中定期运行聚焦测试和受影响 package 的 typecheck；实际 ticket/feature 命令以 ledger 的 `Validation Plan` 为准。
4. 验收工作完成后，先运行 ticket 聚焦验证，再创建 focused candidate content commit；立即完成 `Content-Head` 同步，然后才调用 `code-review`。
5. 把用户或调用 workflow 固定的 ticket base/feature target tip 传给 `code-review`。评审 finding 经过相关验证后使用额外 focused commits 修复，每次同步 content HEAD，并对同一 fixed point 到新 HEAD 的完整范围重新评审；不要自动 amend 或 rebase。
6. 两轴 findings 清零后，按仓库 tracker 契约写 Resolution 并创建独立 tracker-only checkpoint。已授权范围内的下一张无阻塞 ticket 可以自动推进。
7. 全部工作完成后运行 `Validation Plan` 的 feature 命令和最终双轴评审。只有仓库 workflow 的 merge-ready gate 通过后才能给出 merge brief；本 skill 不自动 merge、push 或删除远端分支。

Agent 新建或实质修改的 Markdown 正文使用项目规定的中文；机器字段、命令、路径、API/skill 名称和引用原文保持原语言。
