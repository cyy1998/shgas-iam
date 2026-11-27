# @iam/admin-api

## 装配与路由

`src/composition/` 按 runtime、repositories、tx、services、use-cases、routes 和 middlewares 装配依赖。
Use case 在 `composition/use-cases/` 实例化，由 root 通过 `useCases` 交给 route。
Admin REST 与 tRPC 共用 `*.adapter.ts` 操作，`*.trpc.ts` 负责薄协议适配。
[Composition 入口](src/composition/index.ts) · [Admin REST](src/routes/admin/) · [tRPC](src/routes/trpc/)

## 审计事件与作用后失败

事件字段和 action 由事件构造器统一定义。会话审计会自动排除 Redis key、原始 Session Origin 和撤销阶段捕获的内部会话标识。
会话管理操作先写入 Redis，再记录审计：只要已有确认生效的变更或存在结果未知（`unknown`）的条目，后续审计失败即按“业务已生效/可能已生效但审计失败”返回；仅当全部目标明确失败（`failed`）、且没有确认变更也没有未知结果时，才按普通审计失败返回。
[事件构造器](src/services/audit/events/) · [会话审计](src/services/audit/events/session-management.audit.ts) ·
[行为测试](src/services/session-management/__tests__/session-management.service.test.ts) ·
[结果与恢复契约](../../docs/engineering/backend-architecture.md#admin-写入结果与失败恢复)

## SSO Secret 读取与审计

管理员仅能通过受权专用接口读取当前 SSO Secret 原文。系统先确认独立审计提交成功，再交付原文；
若审计提交结果未确认则拒绝交付，且错误响应会过滤可能携带敏感参数的数据库异常。
[Client SSO service](src/services/client-sso/client-sso.service.ts) · [管理集成测试](test-integration/client/client-sso-management.integration.test.ts)
