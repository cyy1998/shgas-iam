# @iam/subject-access

## 单次操作许可

- **操作级许可范围**：`@iam/subject-access` 负责账号的实时访问屏障。每次业务操作首次获取可信主体后，校验并固定一次许可结果，由本次操作的各分支与资料投影共享；后续新请求重新检查，已通过许可的在途请求可继续完成。
- **许可绑定约束**：许可严格绑定主体、账号代际与当前活跃操作，不得跨主体、跨操作或传递给后台任务。持久化 context 仅记录身份，缺失或损坏时不得补发许可。
- **明确拒绝与暂态失败**：账号明确失效时直接拒绝并按原上下文精确撤销关联会话，旧代际清理不影响重新启用后的新代际。遇到 blocking、屏障缺失、数据损坏或基础设施故障时报告暂态失败，并保留可恢复的 Cookie。
- **模块职责边界**：管理端会话查询仅作只读观察。会话 adapter 单向调用 Session Kernel；核心层定义已确认撤销计数与未完成目标捕获；HTTP adapter 负责错误映射与 Cookie 处理，底层写入异常须脱敏。
  [HTTP adapter](../../packages/api-core/src/http/subject-access.ts)

## 账号生命周期

账号状态变更遵循三步生命周期（登记意图 → 预拦截 → 提交收尾或回滚恢复）：

1. **登记意图与预拦截（intent → pre-block）**：先在数据库中独立持久化状态切换意图（transition intent），再在 Redis 中原子将账号置为预拦截（pre-block）状态。
2. **主业务事务**：业务事务锁定精确的 intent 记录并写入提交结果；已被回收的旧 owner 不得继续写入。
3. **收尾或回滚恢复（commit/finalize 或 rollback/restore）**：
   - 若事务确认回滚，或属于无状态变化的重复更新（同态更新），则恢复原访问屏障。
   - 若禁用、删除等阻断类操作提交成功，则将屏障最终定格为 `disabled`，再尽力精确撤销关联会话。
   - 离职场景会优先撤销操作前已捕获的原有会话，并结合回调清理前代会话；若初始捕获失败，则退回为按前代清理，遗漏的会话由后续重试或实时访问检查处理。合法的重复离职操作仍会尝试完成屏障恢复与会话撤销。

## 恢复与重新启用

从禁用或暂停重新启用账号时，访问屏障先保持 blocking 状态，必须全部满足以下条件后才解除：

- 源账号当前处于允许访问状态，且该用户的直接 Outbox 已处理完成。
- 当前已发布的 User Document 与最新完成的重建版本一致，完整 Facts 已发布成功，且待执行的缓存与访问屏障任务满足恢复条件。
- 判定时必须纳入 Redis 中保留的更新版本状态（尤其是删除墓碑）：不得在屏障缺失时直接创建 `enabled`，删除屏障始终保持 `disabled`，重新启用也不恢复旧代际会话。

User Document 提供 PostgreSQL 中的 transition intent 和发布依据。Worker 与 Ops 会先按 PostgreSQL 服务端时间回收过期的待处理 intent（跳过活跃行锁），回收失败则立即停止，随后再处理 Redis 状态切换与账号修复。修复任务的领取、lease 和确认与新的状态切换原子协调，旧 worker 不得删除或延迟新任务。
积压时长统计始终保留最早可恢复任务的发现时间。专用 repair（`--subject-access-only`）同样需要数据库写权限，且文档侧的 stale 参数不会改变 intent 的过期阈值。
[数据维护](../../docs/releases/data-maintenance.md#subject-access-恢复) · [许可测试](test-integration/subject-access/subject-access-operation-kernel.integration.test.ts)
