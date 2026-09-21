---
status: accepted
---

# 将 Employment 建模为不可重开的任职期

Employment 表示一次任职期，不是可反复启停和删除的关系槽。Pause 可恢复，End 不可逆；返聘、重新任职与转岗创建新
Employment。当前 IAM 命令以同一事务观察时刻确定业务时间，不接受调用方预约、回填或改写。

## 理由与代价

Open Employment 包括 Enable 与 Pause，必须引用启用且未删除的 Position 和 Organization。父对象完整性由正式写入
检查与 Profile 发布前的失败关闭守卫承担；下游不能通过静默过滤让坏任职消失，又随父状态变化自动恢复。
Effective Employment 使用 Enable、非墓碑与半开期间 `[startTime, endTime)`。

普通任职变化令 Profile 失效，不自行撤销会话或改变 Token TTL；账号停用和离职的安全作用独立。
未来外部 Authority 可以拥有业务时间与来源，但不能按 last-writer-wins 覆盖同一任职期。

[Admin 写入决定](0025-align-admin-mutation-results-with-committed-facts.md) 已加强现存选中业务行的锁定。
这不把跨表父完整性、后来新增记录或跨记录 Primary 检查提升为线性化保证。接受这些乐观边界；写入规模、外部 Authority
或运行证据改变时再评估统一并发方案，不能用“已有事务/行锁”宣称所有条件强一致。

## 诊断与历史数据

Legacy Employment Tombstone 保留原事实，不推断结束时间，也不由正式路径继续创建。全库只读完整性诊断覆盖未被某次
Profile 构建触及的记录，不能被单个 builder 的守卫替代；异常通过正式业务入口修复。此处承接原维护支持决定中仍有效的
诊断责任，不恢复旧升级步骤。

当前领域语言见[CONTEXT](../../CONTEXT.md)，写入和发布边界见
[后端架构](../architecture/backend-architecture.md#admin-同对象写入规范)，维护与完整校验见
[Profile 手册](../releases/user-profile-maintenance.md)。

历史来源：[ADR-0011 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0011-model-employment-as-an-immutable-tenure-lifecycle.md)、[ADR-0023 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0023-retire-legacy-maintenance-support.md)。原始决定与后续修订按各版本追溯。
