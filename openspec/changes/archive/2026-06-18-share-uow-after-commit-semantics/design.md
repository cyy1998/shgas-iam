## Context

`apps/api` 与 `apps/admin-api` 当前各自有一份几乎相同的 `createUnitOfWork`。该实现已经支持 `afterCommit` 队列，但 `createMappedUnitOfWork` 在把 app-wide tx ports 映射给 service 时只保留了 `transaction` 和映射后的 tx ports，服务拿不到 `afterCommit`。

结果是事务后副作用散落在 service 的事务外手写执行中：admin client cache 同步会影响请求结果，OIDC client invalidation 被局部 helper 包成 best-effort，admin user token revoke 也在事务后直接 await。它们都发生在 DB commit 之后，但语义没有统一表达。

## Goals / Non-Goals

**Goals:**

- 让 `api` 和 `admin-api` 复用同一个 app-agnostic UnitOfWork 基础设施。
- 让 mapped UnitOfWork 保留 `afterCommit` 能力，使 service 在 transaction callback 内注册提交后副作用。
- 显式区分 `required` 与 `bestEffort` after-commit 任务。
- 统一 after-commit 的执行顺序、失败处理、结构化日志和测试 fake。
- 保持现有外部 REST/tRPC API、DTO 和 DB schema 不变。

**Non-Goals:**

- 不实现 durable outbox、retry worker、任务调度或告警闭环。
- 不改变 reset password 后是否 revoke token 的安全策略。
- 不把没有 DB transaction 的纯 Redis session 清理纳入 UoW afterCommit。
- 不重构业务 repository、audit helper 或路由层结构。

## Decisions

### 1. 共享 UoW 放在 `@iam/api-core/uow`

新增 `packages/api-core/src/uow/`，并通过 `@iam/api-core/uow` 暴露 UoW 类型、factory、mapping helper、错误类型和测试 fake。共享包只接受泛型 transaction executor，不直接依赖 `@iam/db` 或 app-local repository/runtime 类型。

备选方案是放到 `packages/db` 或继续 app-local 复制。放到 `packages/db` 会把 service-side after-commit 语义塞进 DB 包；继续复制不能解决两个 app 的行为漂移。

### 2. UoW callback 不再接收 `rootPorts`

after-commit task 使用 no-arg callback，并通过闭包捕获 service 已显式声明的 deps：

```ts
tx.afterCommit.required("admin.client.cache.sync", async () => {
  await deps.clientCache.syncUpdatedClient(oldClient, updatedClient);
});
```

这样不会把 runtime integrations 塞进 UoW 的 `rootPorts` 大容器里，service deps 仍然是可测试、可审查的 consumer-owned ports。

### 3. API 形状使用 `tx.afterCommit.required(...)` / `tx.afterCommit.bestEffort(...)`

`afterCommit` 是 transaction context 的一部分：

```ts
interface AfterCommitPort {
  afterCommit: {
    required(name: string, task: () => Promise<void> | void): void;
    bestEffort(name: string, task: () => Promise<void> | void): void;
  };
}
```

注册函数返回 `void`。如果业务需要拿到执行结果，该行为就不应建模为 after-commit best-effort task。

### 4. 任务按注册顺序 await，并全部尝试

commit 成功后，UoW 按注册顺序逐个 `await` task。`required` 与 `bestEffort` 混排时不重排；调用者写下的顺序就是执行顺序。

当 task 失败时，UoW 继续尝试后续 task。所有 task 尝试结束后，如果存在 required failure，再抛出聚合错误。best-effort failure 只影响日志，不影响结果。

### 5. Required failure 是“提交后请求失败”，不是 DB rollback

`required` task 失败发生在 DB commit 之后，因此不能回滚已提交数据。它的语义是：主事务已经提交，但必需的提交后维护动作失败，请求结果应返回失败并记录可排查日志。

UoW 抛出的错误实现 API runtime error 形状，使用 `ApiErrorCode.InternalError` 与 HTTP 500。错误对象保留 task name 和原始 error 供日志与测试使用，但响应消息只暴露通用文案，不暴露 Redis key、token、client secret 或内部堆栈。

### 6. 日志由共享 UoW 负责

service 不再为 after-commit failure 写局部 try/catch。共享 UoW 注入 logger port：

```ts
{
  warn(obj, msg): void;
  error(obj, msg): void;
}
```

`bestEffort` failure 使用 `warn`，`required` failure 使用 `error`。日志字段至少包含 task name、mode 和原始 error。

### 7. `mapUnitOfWork` 进入共享包并保留 `afterCommit`

共享 helper 负责从 app-wide tx ports 映射到 service-owned tx ports：

```ts
mapUnitOfWork(unitOfWork, tx => ({
  clientRepository: tx.repositories.client,
  auditService: tx.auditService,
}));
```

映射后的 context 必须包含 mapped tx ports 与同一个 `afterCommit` port。服务端口可以使用共享 `UnitOfWorkPort<TxPorts>` / `TransactionContext<TxPorts>` 类型别名，减少重复类型声明。

### 8. 事务后副作用分类

初始迁移只覆盖已经与 DB transaction 紧密相关、且当前位于事务后手写执行的 admin-api 副作用：

| 副作用 | 分类 | 原因 |
| --- | --- | --- |
| admin client cache set/sync/delete | required | public API client cache 当前无 TTL，旧缓存可能长期脏读；现有代码失败会影响请求结果 |
| admin client OIDC runtime invalidation | bestEffort | 当前已有 `bestEffortInvalidateOidcClient` 语义；OIDC runtime cache 有 TTL，subscriber 侧也已吞错记录 |
| admin user disable/delete token revoke | required | 当前代码失败会影响请求结果；禁用/删除用户后保留 token 更敏感 |

reset password 后是否 revoke token 作为后续安全策略问题记录，不在本次改动里改变行为。`api` 的 `removeGlobalSession` 是 Redis session 清理加 token revoke，没有 DB transaction owner，不纳入 afterCommit。

### 9. 不支持 nested UoW

第一版明确不支持在一个业务 workflow 的 UoW callback 内再启动独立 `uow.transaction(...)`。嵌套事务会让内层 afterCommit 可能早于外层 rollback 执行，破坏“commit 后才执行副作用”的直觉。

如果未来出现真实嵌套需求，应先重构 service 边界或引入显式 transaction context 传递，再讨论保存点或 outbox。

### 10. 测试 fake 模拟 after-commit 语义

共享测试 fake 保持 `createImmediateUnitOfWork(txPorts)` 用法，但 callback 成功后执行注册的 after-commit tasks。它应与生产语义一致：required failure 最后抛出，best-effort failure 被记录或通过测试 hook 暴露。

## Risks / Trade-offs

- [Risk] `required` 失败后 DB 已提交，调用方看到失败但数据不会自动回滚。  
  Mitigation: 错误命名和设计文档明确该语义；结构化日志记录 task name 和 cause；未来需要更强保证时引入 durable outbox。

- [Risk] OIDC invalidation 继续 best-effort，短时间内可能存在 runtime cache 或协议对象 stale。  
  Mitigation: 保持现有 TTL、版本校验和 subscriber 侧 cleanup；失败由 UoW 统一 warn，后续可根据告警信号升级为 durable effect。

- [Risk] mapped UoW 类型迁移会触碰多个 service port 和测试 fake。  
  Mitigation: 先替换共享基础设施，再迁移 admin client/user 副作用；使用 package-level typecheck 和 focused service tests 验证。

- [Risk] 任务顺序从个别 `Promise.all` 并发变为顺序执行。  
  Mitigation: 当前 after-commit 副作用数量少、耗时低；顺序执行可读性和确定性优先。若以后出现耗时任务，另行设计 queue/worker。

## Migration Plan

1. 在 `packages/api-core/src/uow/` 增加共享 UoW、mapped UoW、after-commit 类型、required failure error 和测试 fake，并增加 `@iam/api-core/uow` export。
2. 将 `apps/api` 与 `apps/admin-api` app-local `composition/tx` 改为使用共享 UoW，保留 app-local `createApiUnitOfWork` / `createAdminApiUnitOfWork` 作为 composition adapter。
3. 将 `createMappedUnitOfWork` 调用迁移到共享 `mapUnitOfWork`，并更新 service UnitOfWork port 类型，使 mapped context 保留 `afterCommit`。
4. 迁移 admin client service 的 cache/OIDC 副作用注册，并移除仅用于 best-effort invalidation 日志的 service logger 依赖。
5. 迁移 admin user service 的 disable/delete token revoke 注册，保持 reset password 行为不变。
6. 更新 service tests 使用共享 immediate UoW fake，并覆盖 required/best-effort after-commit 行为。
7. 运行 focused tests、`@iam/api-core` typecheck，以及受影响 app/package typecheck。

## Open Questions

- 无。durable outbox/retry、reset password revoke 策略和 pure Redis session 清理均已明确排除在本次范围外。
