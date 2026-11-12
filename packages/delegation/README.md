# @iam/delegation

## 装配与事务

`@iam/delegation` 拥有生命周期、冲突和安全查询，API/Admin API 注入 Client、本人或全局管理范围。
API 在同一观察时点和数据库快照解析，结果独立于 Document 与 Facts。写入按委托人 User 行锁协调，更新预读不可变委托人 ID 后取锁，
在锁内重读委托和范围、校验冲突并提交事实与审计，无 Document Outbox。User、Client、Organization 的删除门禁归各写入口。
[应用委托](../../docs/features/client-delegation.md) · [ADR-0020](../../docs/adr/0020-provide-fail-closed-privilege-delegation-resolution.md)
[服务实现](src/delegation.service.ts) · [公开接口](src/index.ts)

Internal 委托写入由 API 使用独立的详情或 boolean 响应。
[Internal 路由契约](../../apps/api/src/routes/internal/delegation/delegation.routes.ts)
