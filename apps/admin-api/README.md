# @iam/admin-api

## 装配与路由

`src/composition/` 按 runtime、repositories、tx、services、use-cases、routes 和 middlewares 装配依赖。
Use case 在 `composition/use-cases/` 实例化，由 root 通过 `useCases` 交给 route。
Admin REST 与 tRPC 共用 `*.adapter.ts` 操作，`*.trpc.ts` 负责薄协议适配。
[Composition 入口](src/composition/index.ts) · [Admin REST](src/routes/admin/) · [tRPC](src/routes/trpc/)

## 审计事件与作用后失败

事件字段和 action 由事件构造器定义。会话审计排除 Redis key、原始 Session Origin 和撤销捕获 identity。
会话操作先作用于 Redis，再写审计。确认有变化或存在 unknown 时，审计失败按作用后失败返回。
只有 failed，且没有确认变化、也没有 unknown 时，按普通审计失败返回。
[事件构造器](src/services/audit/events/) · [会话审计](src/services/audit/events/session-management.audit.ts) ·
[行为测试](src/services/session-management/__tests__/session-management.service.test.ts) ·
[结果与恢复契约](../../docs/engineering/backend-architecture.md#admin-写入结果与失败恢复)

## SSO Secret 读取与审计

管理员经授权的窄读取取得当前 SSO Secret 原文。先确认独立审计提交，再交付原文。
审计未确认时拒绝交付，错误响应排除可能含参数的数据库异常。
[Client SSO service](src/services/client-sso/client-sso.service.ts) · [管理集成测试](test-integration/client/client-sso-management.integration.test.ts)
