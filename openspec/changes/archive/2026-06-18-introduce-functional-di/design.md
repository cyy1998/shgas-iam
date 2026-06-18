## Context

`apps/api` 与 `apps/admin-api` 目前通过 ES module import 在模块加载时绑定 route、middleware、service、repository、Redis、logger、DB singleton 和 integration client。业务单测需要在动态 import 被测模块前铺设大量 `mock.module`，导致测试顺序敏感，也让 service 间依赖、事务边界和不可回滚副作用不够显式。

本变更是架构迁移，目标是提升可测试性和模块边界清晰度，不改变对外 REST/tRPC/API 行为、数据库 schema 或业务语义。

## Goals / Non-Goals

**Goals:**
- 两个后端 app 全量迁移到函数工厂式 DI。
- 后端业务、handler、adapter、middleware 测试通过 fake 注入替代 app-local `mock.module`。
- route、middleware、service、repository、integration client 的生产实例只在 composition root 中创建。
- 事务边界通过 tx-bound ports 和 `UnitOfWork` 表达，并通过 best-effort `afterCommit` 管理不可回滚副作用。
- 增加架构测试，阻止静态生产依赖回潮。

**Non-Goals:**
- 不引入 decorator、reflect metadata、IoC container 或运行时插件系统。
- 不改变 REST path、OpenAPI schema、tRPC router shape、响应 envelope、数据库表结构或业务 DTO。
- 不把枚举、Zod schema、error class、纯 helper 或业务常量纳入 DI。
- 不在第一期实现可靠 outbox/job；`afterCommit` 先按 best-effort 执行并记录日志。

## Decisions

### 1. 使用函数工厂，不保留生产 singleton 导出

每个可替换模块导出 `createXxx(deps)` 和 `ReturnType` 类型，生产实例只在 app composition root 中创建。

```ts
export function createUserService(deps: UserServiceDeps) {
  return {
    setPassword: async (...) => { ... },
  };
}

export type UserService = ReturnType<typeof createUserService>;
```

替代方案是保留 `export const userService = createUserService(realDeps)` 作为兼容导出。该方案会让新代码继续静态 import 生产实例，削弱 DI 的测试价值，因此不采用。

### 2. `createApp` 保持业务无感，composition root 负责 materialize factories

`packages/api-core/createApp` 继续只接收 materialized routes 和 middlewares。`apps/api/src/composition` 与 `apps/admin-api/src/composition` 负责创建 runtime、repository、service、route 和 middleware 实例。

```text
app.ts
  -> createApiComposition({ env, logger })
  -> createApp(appConfig, { env, logger, routes, middlewares })
```

这样 `api-core` 不依赖 app-specific DI 类型，两个后端 app 可以分别维护自己的依赖图。

### 3. service 层使用消费方显式 Port

每个消费模块在 `*.port.ts` 定义自己需要的 outbound Port。service 不通过 `Pick<Service, "...">` 引用提供方完整 service，也不把枚举、schema、error 或纯 helper 放入 deps。

```ts
export interface AuthUserPort {
  getUserDetailByUsername(username: string): Promise<UserDetailDto>;
  checkPassword(username: string, password: string): Promise<boolean>;
}
```

handler/adapter 层可以依赖 route 需要的 service facade type，因为它们是入口适配层；service-to-service 依赖必须通过消费方 Port 表达。

### 4. repository factory 绑定 `DbClient`

repository 实现改为 `createXRepository(db: DbClient)`。composition root 创建 root repository；`UnitOfWork` 在 transaction 内创建 tx-bound repositories。业务 service 不再在方法调用中传 `tx`。

这避免了业务层认识 Drizzle transaction 类型，也让测试 fake 可以只实现业务方法。

### 5. `UnitOfWork` 返回 tx-bound ports，并支持 best-effort `afterCommit`

事务内 callback 接收 tx-bound ports：

```ts
return deps.uow.transaction(async tx => {
  const created = await tx.clientRepository.create(input);
  await tx.auditLogWriter.record(audit);
  tx.afterCommit("client.cache.refresh", async root => {
    await root.clientCache.set(created);
  });
  return created;
});
```

事务内只访问 tx-bound DB ports、tx-bound audit writer 和必要的 tx operation。Redis/cache/OIDC/SMS/http fetch 等不可回滚副作用不得在 transaction callback 内直接执行；必须放在事务外或注册为 `afterCommit`。第一期 `afterCommit` 全部 best-effort、await 执行、失败只记录结构化日志，不覆盖已提交主操作结果。

### 6. audit event helper 改为纯 builder

`apps/*/src/services/audit/events` 保留集中审计事件拼装，但不再直接调用 `audit.service` 写库。helper 返回审计 payload，由 root/tx `AuditLogWriterPort` 写入。这样 service 测试只断言 audit writer fake，且事务内审计自然走 tx-bound writer。

### 7. integration client 使用 adapter factory 和业务语义 Port

Cap、Wechat、Orcas、SMS、OIDC invalidation、Redis cache 等 integration 由 composition root 创建具体 adapter。业务 service 只依赖语义化 Port，例如 `HumanChallengePort`、`SmsSenderPort`、`ClientCachePort`，不暴露第三方库 API。

### 8. runtime config、hash/random/clock 显式注入

每个 factory 只接收自己需要的 config slice。密码 hash/compare、随机密码、UUID/nonce、时间读取等测试敏感能力作为 runtime Port 注入；纯函数继续静态 import。

### 9. 禁止 lazy deps，循环依赖必须拆 Port 或 use-case

默认不允许 `() => service` 形式隐藏循环依赖。若迁移中出现循环，应拆小 Port、拆 tx operation 或拆 use-case/service facade。只有确有必要的 integration 特例才允许 lazy，并必须在设计文档中记录。

### 10. fake 组织方式

局部 fake builder 放在被测模块旁边的 `__tests__` 下；跨多个测试复用的基础设施 fake 放在 app 级 `src/test/fakes`。测试可以使用 `bun:test` 的 `mock()` 实现 fake 方法断言，但不应再 mock app-local service/repository/db/redis/logger 模块。

## Risks / Trade-offs

- [Risk] 全量迁移改动面大，容易出现遗漏的静态 import → Mitigation: 分 app、分层推进，并用架构测试扫描禁止 import。
- [Risk] tx-bound ports 和 root ports 装配复杂 → Mitigation: composition 目录按 `runtime/repositories/tx/services/routes/middlewares` 拆分，避免单文件膨胀。
- [Risk] `afterCommit` best-effort 失败会造成缓存短暂不一致 → Mitigation: 结构化日志记录任务名和错误；后续如需要可靠投递再引入 outbox/job。
- [Risk] audit helper 从直接写入改为 builder 可能漏写审计 → Mitigation: 服务测试断言 `AuditLogWriterPort.record`，审计事件测试验证 builder payload。
- [Risk] 不保留 singleton 导出会造成大量 import 断裂 → Mitigation: 全量迁移同批完成，并用 typecheck 定位残留调用。

## Migration Plan

1. 创建 `apps/api/src/composition` 与 `apps/admin-api/src/composition` 分层目录，定义 runtime deps、root ports、tx ports、`UnitOfWork` 和 factory materialization helper。
2. 迁移 repository 为 `createXRepository(db)`，并调整内部 Drizzle 子查询避免继续使用 root `db` singleton。
3. 迁移 audit writer 与 audit event helper，先保持 payload 语义和脱敏逻辑不变。
4. 迁移 service/use-case 为 `createXService(deps)`，以消费方 `*.port.ts` 定义 outbound Port。
5. 迁移 integration client 为 adapter factory，并在 service deps 中使用业务语义 Port。
6. 迁移 handler/adapter、route index 和 `_middleware.ts` 为 factory，由 composition root materialize。
7. 同步迁移测试为 fake 注入，并提取 app 级基础设施 fake。
8. 增加架构测试，禁止 app-local 业务模块重新静态 import 生产依赖。
9. 运行后端 typecheck、lint、test 和 focused smoke checks，确认 API/tRPC 行为未改变。

## Open Questions

- 第一阶段是否需要为 `afterCommit` 失败建立补偿命令或手工运维脚本，还是仅依赖日志告警。
- repository 测试是否继续使用当前 query/mock 方式，还是另起后续 change 引入更真实的数据库测试夹具。
