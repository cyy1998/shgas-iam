## Context

`apps/api` 当前同时存在两条内部认证路径：`/internal/*` 通过 `createInternalAuthenticationHandler` 验证 `apikey`，`/auth/internal-authz` 作为 APISIX `forward-auth` endpoint 手写验证逻辑，并额外信任 `IP-Chain` header 中的硬编码内网片段。仓库内没有证据证明 `IP-Chain` 一定由可信边界清洗并注入，gateway manifest 只是把该 header 原样转发给 IAM。

这次变更跨越 `packages/api-core`、`apps/api` 和 `gateway` manifest，目标是收敛 internal client 身份认证策略，同时保持 `/auth/internal-authz` 的 HTTP 路径和成功响应形态稳定。

## Goals / Non-Goals

**Goals:**

- 让 `/auth/internal-authz` 与 `/internal/*` 复用同一个 internal client 校验原语。
- 移除应用层对 `IP-Chain` 的所有准入语义。
- 要求 internal client 必须存在、未软删除且 `status === ClientStatus.Enable`。
- 成功认证后在 Hono context 中提供 `clientCode` 和 `clientDto`。
- 将 tender dev/prod gateway 调用 `/auth/internal-authz` 的 `request_headers` 收窄到 `apikey`。
- 补齐单元测试、manifest 测试或校验，防止旧 bypass 行为回归。

**Non-Goals:**

- 不迁移 `/auth/internal-authz` 路径，也不把它移动到 `/internal` tier。
- 不引入签名 JWT、scope 模型、mTLS、SPIFFE/SPIRE 或新的服务身份体系。
- 不拆分 `Client` 与 internal client 概念；当前 `Client` 即 internal client 身份载体。
- 不重构 client repository/cache 结构，也不改变 public `/auth/authz` 的维护中用户白名单语义。

## Decisions

1. 新增共享 `verifyInternalClient` 原语，而不是让 handler 直接复用 middleware。

   `createInternalAuthenticationHandler` 适合 Hono middleware 流程，`/auth/internal-authz` 则需要作为 gateway 查询端点返回 `resp.ok(true)`。抽出 `verifyInternalClient(c, options)` 后，middleware 和 handler 都调用同一段策略，同时保留各自的 HTTP 控制流。

   备选方案是让 `/auth/internal-authz` 人工调用 middleware 或继续复制校验逻辑。前者会让 endpoint 响应控制变绕，后者保留 DRY 风险。

2. `verifyInternalClient` 放在 `packages/api-core/src/middlewares/auth.ts` 附近，并由 app 注入 `getClientBySecret`。

   api-core 已拥有认证 middleware，也已经依赖 `@iam/contracts`，因此可直接使用 `ClientStatus.Enable` 表达 active client 规则。app 侧继续注入现有 `clientService.getClientBySecret`，不新增 `getInternalClientBySecret`。

3. active client 规则统一为 `!client.isDelete && client.status === ClientStatus.Enable`。

   这是服务身份认证，不继承 public authz 中“维护中但用户在白名单内可访问”的用户访问语义。`ClientStatus.Maintance`、`ClientStatus.Disable` 和软删除 client 都应拒绝。

4. 失败响应保持低信息暴露，失败日志保留低敏诊断信息。

   缺少 `apikey` 继续抛出 `AuthzUnauthorizedError("非法访问")`；secret 查不到、client 非 active 等情况统一抛出 `AuthzUnauthorizedError("无效secret")`。`verifyInternalClient` 可使用 request logger 记录 `reason`、`requestId` 和已知的 `clientCode`，但不得记录 secret。失败日志使用 `warn`，成功路径不额外写业务 `info`。

5. gateway manifest 收窄 `/auth/internal-authz` 的输入契约。

   tender dev/prod 的 internal forward-auth 只转发 `apikey`。`IP-Chain`、`Cookie`、`Authorization` 对该 endpoint 没有新语义，继续转发会扩大凭据暴露面并误导维护者。

6. `/auth/internal-authz` 的 OpenAPI 成功 schema 改为 boolean。

   handler 继续返回 `resp.ok(true)`，不向 gateway 返回 `clientCode` 或 client 详情。schema 使用 `z.boolean()` 与运行时响应保持一致。

## Risks / Trade-offs

- 旧调用方只依赖 `IP-Chain` 而不提供 `apikey` 会被拒绝。→ 这是有意的 breaking change；如确有临时兼容需求，应在 gateway 或更外层边界显式处理，不回退到应用层 header bypass。
- active client 校验依赖 client cache 中的 `status` 与 `isDelete` 同步。→ admin-api 已维护 `cache:client:*` key；测试需覆盖缓存命中后 verifier 仍执行 active 判断。
- 收窄 gateway request headers 可能暴露隐藏依赖。→ `/auth/internal-authz` 设计上只需要 `apikey`，其他 header 不作为该 endpoint 契约；验证阶段运行 gateway manifest 校验和相关测试。

## Migration Plan

1. 在工作分支完成 api-core verifier、apps/api handler、gateway manifest、OpenAPI schema 和测试更新。
2. 运行 `@iam/api-core`、`@iam/api` 和 `@iam/gateway-apisix` 的相关测试、typecheck 与 gateway validate。
3. 发布前确认调用 `/auth/internal-authz` 的上游已配置有效 `apikey`。
4. 如需回滚，回滚本 change 对代码和 manifest 的改动；不得以恢复应用层 `IP-Chain` bypass 作为长期回滚策略。

## Open Questions

- 无。签名 JWT、scope、mTLS 等增强服务身份方案作为后续独立 change 评估。
