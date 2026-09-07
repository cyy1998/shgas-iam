---
status: accepted
---

# 一次性规范化历史审计 action 后退役运行时别名

维护者于 2026-09-07 选择保留历史审计按规范事件名检索和中文展示的能力，同时退出旧事件别名兼容。为此将已知旧 action 一次性转换为当前 action，再删除查询扩展和展示 canonicalization；不删除历史日志。独立迁移工具与无别名代码候选已实现，隔离 PostgreSQL 的迁移后 Admin 查询及中文展示已验证；目标环境迁移尚未执行。操作门禁见[规范化与恢复手册](../releases/audit-action-canonicalization.md)。

当前 action 表示动作，独立 `outcome` 表示成功或失败。运行时永久保留别名虽然无需改写存储，却让旧词汇长期进入共享契约、查询和展示；本决定接受受控数据规范化的成本，以保留历史可检索性并消除这项永久兼容责任。

## 迁移边界

迁移使用固定显式映射，仅处理[操作手册](../releases/audit-action-canonicalization.md#迁移范围)列出的八个旧登录 action，固定映射由 Worker 工具独立拥有。禁止通用地截掉 `.success` 或 `.failure`：未知事件仍是原始审计事实，不自动解释或拒绝全部未知 action。

只更新 `action`。保留行 identity、eventTime、actor、target、outcome、details 和请求追踪字段。转换前核对旧后缀与 outcome 一致；存在冲突时中止并报告有界定位信息，不猜测结果、不自动改写 outcome。迁移不能顺带清洗或重建其他审计内容。

采用独立一次性维护工具，固定映射留在工具内部，不从将被删除的运行时 alias export 取得。工具提供只读盘点、显式 apply 和独立 verify；apply 必须在受控窗口阻止并发旧写入，先完成全量前置校验，再在事务中更新。重复执行无变化，失败回滚，verify 证明八种旧 action 均为零。实际数据量与锁时长须由目标环境盘点评估；本地设计不承诺生产耗时。

## 发布顺序与恢复

先交付可盘点和迁移的工具，固定可恢复备份与候选，确认旧 writer 已退出；执行盘点、迁移、独立 verify，并验证按规范 action/outcome 筛选与总数保留。通过后才部署删除运行时别名的候选。数据本已规范时允许零更新通过；仓库没有查询目标数据库，不假定现有旧记录数为零。

从迁移前备份恢复时，重新执行同样的规范化与 verify 后才能开放无别名版本的审计查询。迁移失败时保留兼容版本并修复数据问题，不能越过门禁直接删除兼容。代码交付与真实环境 apply 分开；本设计不执行数据库操作。

## 代码与验证范围

代码候选已删除 catalog 的 `legacyAliases`、旧别名类型/映射和 `canonicalizeAuditAction`、`expandAuditActionAliases`。Admin API 保留单 action/多 actions 输入的合并去重，按精确值查询；Admin 展示保留当前标签映射和未知 action 原文回退，不保留旧名称解释。当前 writer 继续使用规范 action 与独立 outcome。

迁移测试以真实 PostgreSQL 验证八项映射、success/failure 保持、其他字段不变、未知事件不变、冲突零写入、回滚、幂等重跑及独立零残留验证。共享 catalog、Admin API 查询和 Admin 展示测试转向当前契约；以迁移后的混合数据验证规范筛选、outcome 筛选与数量一致。不要求数据库修改历史 migration 或增加 action enum 约束。

一次性迁移工具的退役另行依据受支持备份与环境范围决定，不能在删除运行时别名时一并删除尚需使用的迁移路径。稳定领域词汇未改变，无需修改 `CONTEXT.md`。
