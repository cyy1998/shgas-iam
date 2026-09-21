---
status: accepted
---

# 每次业务操作只取得一次 Subject Access 许可

在一次独立业务操作的首次可信主体解析后，取得绑定该主体与代际的 Subject Access Permission。
成功、拒绝与暂态失败都固定为本操作结果，并发消费共用同一次检查；下一次接口调用必须重新取得。
本页按统一会话模型整理原单次检查决定。

## 理由与代价

在 Kernel、Projection 和 handler 中反复查询账号状态会产生不同观察点、重复 I/O 与中途翻转。
选择一次操作许可，接受许可后账号被停用或删除时在途操作仍可完成的窗口；新的操作观察新的访问状态。
这不是允许任意复用一次请求级 boolean，也不是放松账号状态缺失或不确定时的失败关闭。

许可必须来自可信主体与严格 context，持久化的主体/代际记录本身不构成许可，prepared 路径不能自行合成成功上下文。
许可不跨请求、不跨主体或代际，不替代会话期限、撤销、Client 状态和协议用途检查。
Kernel 只判断对象生命周期，不解释 Barrier；投影复用既有许可，不另建第二套访问决定。

会话列表的管理观察不能推导可访问性。重新启用账号也不使旧代或已经撤销的会话复活；账号恢复与发布由独立 owner 负责，
不能把此许可当成可从普通缓存 miss 默认启用的事实。

## 当前契约与历史

操作边界与消费方责任见[Subject Access 契约](../features/sso/subject-access-operation-contract.md)，
存储及 transition 归属见[后端架构](../architecture/backend-architecture.md#subject-access-barrier)，
恢复顺序和调度责任见[Profile 维护](../releases/user-profile-maintenance.md)。

历史来源：[ADR-0029 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0029-check-subject-access-once-per-business-operation.md)、[ADR-0035 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0035-unify-user-and-client-session-lifecycles.md)。原始决定与后续修订按各版本追溯。
