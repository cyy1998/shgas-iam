---
status: accepted
---

# 提供失败关闭的直接权限委托解析

Internal Client 需要按一组 username、一个 Organization 与一个 Privilege，在同一当前观察点取得每个 User 的直接 Delegatee；既有 Delegation 搜索只返回未对齐的记录集合，不能让 null 明确表示“已识别 User 没有当前委托”。因此新增 `POST /internal/delegations/resolve`，由 app-local resolver 在同一服务端观察时刻和数据库快照中解析 Current Privilege Delegation，保持输入顺序返回 `{ username, delegateeUsername }`，且不递归委托链、不重新验证委托人当前是否拥有该 Privilege。

## Consequences

- 请求固定使用必填的 `usernames`、`orgCode` 与 `privilegeCode`；username 必须精确、唯一且为 1 到 100 项。任何格式或预算错误整体返回 `422 COMMON.VALIDATION_FAILED`，任一输入对象不存在或已删除整体返回 `404 PRIVILEGE.DELEGATION_RESOLUTION_INPUT_NOT_FOUND`。
- 没有 Current Privilege Delegation 时 `delegateeUsername` 为 null。Pause 或 Disable 不影响输入识别或委托解析；委托自身必须未删除、为 Enable，且同一服务端观察时刻位于闭区间 `[startTime, endTime]`。
- 任一 User 匹配多条 Current Privilege Delegation，即使 Delegatee 相同，或者匹配记录自委托、引用缺失或已删除对象，都属于 Privilege Delegation Resolution Integrity Violation。解析与数据库不可用或超时一并向调用方收敛为 sanitized `503 PRIVILEGE.DELEGATION_RESOLUTION_UNAVAILABLE`，不选择、折叠或返回部分结果。
- Organization scope 等于请求 Organization 或是其祖先时生效。双向直接委托可以分别解析，不因形成环而递归。
- 所有合法且 Enable 的 Internal Client 共享该能力。resolver 暂留 `apps/api`，使用 2 秒 PostgreSQL statement timeout 与 5 秒 handler budget，不缓存或自动重试。
- 本决定不修改 `/internal/users/search-with-delegation`，该旧接口之后统一退役；当时未处理的写路径并发与重叠约束现已由 [ADR-0026](0026-serialize-privilege-delegation-writes-by-delegator.md) 治理，读取端仍须继续防守已有及新增异常数据。
