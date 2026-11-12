# @iam/subject-access

## 单次操作许可

`@iam/subject-access` 拥有账号实时屏障。每个业务操作首次取得可信主体后固定一次许可结果，分支与投影共享。后续请求重新检查，
在途已许可请求可继续。许可绑定主体、代际及活跃操作，不能跨主体、操作或后台传递。持久 context 仅记录身份，缺失或损坏时不得补发许可。

明确失效时拒绝并按原上下文精确撤销，旧代清理不影响新代。Blocking、屏障缺失、损坏或基础设施故障报告暂态失败，保留可恢复 Cookie。
管理会话查询只观察。会话 adapter 单向使用 Kernel，核心定义确认计数与未完成捕获，HTTP adapter 映射错误并处理 Cookie，底层写异常须脱敏。
[HTTP adapter](../../packages/api-core/src/http/subject-access.ts)

## 账号生命周期

1. 独立持久化 transition intent，再原子 pre-block。
2. 业务事务锁定精确 intent 并记录提交结果，被回收的旧 owner 不得写入。
3. 确认回滚或同态更新后恢复原屏障。禁用类提交后 finalize disabled，再尽力精确撤销。离职按原捕获与 callback 前代清理，捕获失败退回前代，遗漏由后续重试或访问检查处理。合法重复离职仍尝试恢复与撤销。

## 恢复与重新启用

真正重新启用保持 blocking。解除前须确认源账号允许、直接用户 Outbox 已完成、当前 Document 与已完成重建一致、完整 Facts 已成功发布且后续义务满足恢复条件。
Redis retained-newer 状态须纳入判定，尤其是墓碑。恢复不从缺失屏障直接创建 enabled，删除屏障保持 disabled，重新启用不恢复旧代。

User Document 提供 PostgreSQL intent 和发布依据。Worker/Ops 先按 PostgreSQL 服务端时间回收 stale pending intent 并跳过活跃行锁，
失败则停止，随后处理 Redis transition 与账号修复。修复领取、lease 和确认与新 transition 原子协调，旧 worker 不得删除或延迟新工作。
积压年龄保留最早可恢复观察。专用 repair 也需要 DB 写权限，文档 stale 参数不改变 intent 阈值。
[数据维护](../../docs/releases/data-maintenance.md#subject-access-恢复) · [许可测试](test-integration/subject-access/subject-access-operation-kernel.integration.test.ts)
