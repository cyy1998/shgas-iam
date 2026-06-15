## 1. 共享 internal client 校验

- [x] 1.1 在 `packages/api-core` 中新增 `verifyInternalClient`，统一读取 `apikey`、查询 client、校验 `!isDelete && status === ClientStatus.Enable`，并在失败时记录低敏 `warn` 日志。
- [x] 1.2 更新 `createInternalAuthenticationHandler` 复用 `verifyInternalClient`，认证成功后向 Hono context 写入 `clientCode` 与 `clientDto`。
- [x] 1.3 补充 `InternalBindings<TClient>` 或等价类型导出，覆盖 internal route 使用认证 client context 的类型边界。
- [x] 1.4 为 api-core internal authentication 增加 Bun 单元测试，覆盖缺少 `apikey`、secret 查不到、软删除、`ClientStatus.Maintance`、`ClientStatus.Disable`、active client 通过和 context 写入。

## 2. `/auth/internal-authz` 收敛

- [x] 2.1 更新 `apps/api/src/routes/auth/auth.handlers.ts`，删除 `IP-Chain` 读取、硬编码白名单、`logger.info(sourceIp)` 和手写 secret 校验，改为调用共享 `verifyInternalClient` 后返回 `resp.ok(true)`。
- [x] 2.2 更新 `/auth/internal-authz` 的 OpenAPI route 成功响应 schema 为 `createSuccessResponseSchema(z.boolean())`。
- [x] 2.3 补充 `apps/api` handler 测试，验证伪造 `IP-Chain` 且无有效 `apikey` 不再通过，active client `apikey` 返回 `resp.ok(true)`。

## 3. Gateway manifest 收窄

- [x] 3.1 更新 `gateway/manifests/dev/tender/routes.yaml` 和 `gateway/manifests/prod/tender/routes.yaml`，使指向 `/auth/internal-authz` 的 `forward-auth.request_headers` 只包含 `apikey`。
- [x] 3.2 补充或更新 gateway manifest 测试，验证 tender dev/prod internal authz route 不再转发 `IP-Chain`、`Cookie` 或 `Authorization`。

## 4. 验证

- [x] 4.1 运行 `pnpm --filter @iam/api-core test` 和 `pnpm --filter @iam/api-core typecheck`。
- [x] 4.2 运行 `pnpm --filter @iam/api test` 和 `pnpm --filter @iam/api typecheck`。
- [x] 4.3 运行 `pnpm --filter @iam/gateway-apisix test`、`pnpm --filter @iam/gateway-apisix typecheck`、`pnpm gateway:apisix:validate -- --env dev:tender` 和 `pnpm gateway:apisix:validate -- --env prod:tender`。
- [x] 4.4 运行 `openspec status --change consolidate-internal-authz-policy`，确认 artifacts complete 且 tasks 可用于实施。
