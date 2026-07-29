# 02 — 建立 Valid Principal Session inventory 与 Session Origin

**What to build:** 让所有新建立的用户 Principal Session 携带可选登录来源，并让 Session Kernel 能够通过可重建的全局索引分页枚举 Valid Principal Session，使后续管理端可以查看真实有效状态而无需扫描 Redis 或建立数据库会话副本。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Principal Session 支持可选 Session Origin，旧对象继续解析且无需强制用户重新登录。
- [x] 密码、手机验证码、OA 和微信登录在创建 Principal Session 时记录最终创建请求观测到的 IP 与有界 User-Agent。
- [x] Session Origin 只保存调查提示，不生成设备指纹、持久设备 ID 或可信设备状态，也不参与授权。
- [x] Session Kernel 为用户根 Principal Session 维护全局有效会话有序索引，score 使用会话过期时间。
- [x] Principal Session 创建、续期和撤销与全局索引写入或移除处于同一 Redis 原子边界。
- [x] Inventory 只返回仍存在、未过期、未撤销且 `principalType=user` 的根 Principal Session，不把 binding、credential 或 artifact 作为独立结果。
- [x] Inventory 支持固定按过期时间倒序分页及可选精确 user ID 筛选，并返回请求时刻的分页数量。
- [x] 查询在请求路径清理自然过期或悬空索引成员并补足当前页面，不执行 Redis 全库 `SCAN`。
- [x] `lastActiveAt` 不成为 inventory 的最后活动承诺，也不要求统一各协议 activity touch。
- [x] 本次不回填上线前已有 Principal Session；旧会话只有在后续续期时进入新索引，否则在最长 24 小时内自然过期。
- [x] Inventory 与 Session Origin 只存在于 Redis 实时状态，不新增 PostgreSQL 会话表、历史快照或迁移。
- [x] Session Kernel 的公开行为测试覆盖旧对象兼容、来源写入、索引创建与续期、撤销移除、分页、筛选、过期清理及悬空修复。
- [x] 登录 use-case 测试只验证来源被传入 Principal Session 创建边界，不断言 Redis object 或内部命令排列。
- [x] 原始 Session Kernel 与 Redis 访问继续受既有 runtime owner 和 composition 边界约束，并通过架构检查。
- [x] 受影响的共享模块、API 与文档通过聚焦测试、lint、typecheck、文档检查和 whitespace 检查。
