# 定义 Internal DSL 的责任搜索语义

Type: grilling

Status: unclaimed

Blocked by: 05 — 定义 User Profile V2 的任职责任快照

## Question

`POST /internal/users/search-dsl` 应公开哪些嵌套责任条件和组合语义，才能让第三方系统可靠地查找承担指定组织责任的用户，
同时保持同一 employment 匹配、当前事实和查询成本边界清晰？

本 ticket 需要决定：

- DSL 字段是否包含 definition code、目标 organization code/type/path、assignment 时间或其他语义字段；
- 组织匹配支持 exact、subtree 还是两者，路径变化如何影响匹配；
- 多个 definition/organization 值使用 any、all 或显式操作符，且所有条件是否必须命中同一 employment/assignment；
- 搜索只基于当前有效责任，还是允许显式历史/未来查询；
- 返回继续使用完整 `UserDetailDto V2`，以及分页/limit、鉴权、错误和查询预算如何定义；
- responsibility search document、索引或专用 query seam 的行为契约，而非提前锁死 SQL 实现。
