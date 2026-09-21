---
status: accepted
---

# 使用规范审计 action 并退出运行时别名

审计 action 表达动作，独立 outcome 表达结果。旧 action 使用显式受控数据规范化后，运行时查询按精确值匹配，
展示只映射当前名称并对未知 action 回退原文，不永久保留旧名称解释。

## 理由与代价

运行时别名免于改写历史存储，却让旧词汇长期进入共享契约、查询和展示。选择保留历史可检索性并退出永久兼容责任，
接受旧数据或备份需要先规范化的维护成本，不通过删除历史日志解决名称问题。

旧数据操作只能采用已确认的固定映射，不能通用裁剪 success/failure 后缀。未知事件保持原事实；
发现旧后缀与 outcome 冲突须中止，不猜测结果。只改变 action，保留其他事实、身份和数量。
该原则不因文档精简而取消，但具体盘点、apply、verify 和恢复流程属于固定版本历史手册。

## 当前契约与历史

当前字段与敏感信息规则见[审计契约](../features/audit/audit-logging.md)。
旧数据工具入口见[历史维护命令](../development/commands.md#历史数据维护工具)，
[规范化与备份恢复流程](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/audit-action-canonicalization.md)
保留在固定 Git 版本。退出运行时别名不等于工具退役，也不说明实际环境已经完成规范化。

历史来源：[ADR-0024 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0024-canonicalize-historical-audit-actions.md)。原始决定与后续修订按各版本追溯。
