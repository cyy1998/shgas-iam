## 1. 模块与导出

- [x] 1.1 在 `packages/api-core/src/session/kernel/` 创建 core 模块结构和 `index.ts` public export。
- [x] 1.2 在 `packages/api-core/package.json` 增加 `./session/kernel` export，并保持现有 `./session` export 不变。
- [x] 1.3 更新 `packages/api-core/src/session/index.ts`，保留 legacy helper 导出并按需 re-export Kernel public API。
- [x] 1.4 确认 Kernel Core 不 import Hono、Koa、`@iam/db`、Drizzle schema、app-local service、route、middleware、audit writer 或协议库类型。

## 2. 模型、配置与 key builder

- [x] 2.1 定义 PrincipalSession、ClientBinding、IssuedCredential、ProtocolArtifact、RevokedTombstone、CleanupRef、RevocationReason、FreshnessRequirement、ValidationResult 和 RevokeSummary 类型。
- [x] 2.2 为所有 lifecycle object 增加 Zod schema、`version=1` 校验和 JSON parse/stringify helper。
- [x] 2.3 实现 SessionKernelConfig，覆盖 namespace、principal idle/absolute TTL、HMAC keys、tombstone TTL、token prefix 和 clock 配置。
- [x] 2.4 实现配置启动校验，拒绝 HMAC key id 缺失、secret 长度不足和 current/previous key 冲突。
- [x] 2.5 实现 `sess:v2:` key builder，覆盖 active object、lookup、revoked tombstone 和 user/client/principal/binding/protocol zset index。
- [x] 2.6 实现 zset index member 编码/解析和过期 member 懒清理 helper。

## 3. Token、HMAC、TTL 与 freshness

- [x] 3.1 实现 high-entropy opaque token generator，支持 PrincipalSession、custom SSO auth code、custom SSO local sid 和 OIDC return handle 前缀。
- [x] 3.2 实现 external token HMAC lookup，支持 current key 优先、previous key fallback 和 `lookupKeyId` 记录。
- [x] 3.3 确保 Redis key、lookup key、tombstone、index member 和日志中不保存 external bearer token 明文。
- [x] 3.4 实现 PrincipalSession idle/absolute TTL 计算、派生对象 TTL clamp 和 tombstone TTL grace window 计算。
- [x] 3.5 实现 `evaluateFreshness`，覆盖 max age、force reauthentication、required AMR 和 minimum ACR。
- [x] 3.6 实现 renewal policy 判断，只允许 `extend_with_principal` 随 PrincipalSession 续期。

## 4. Redis store 与 lifecycle facade

- [x] 4.1 实现 store 层基础读写、schema invalid fail closed、lookup resolve 和索引写入 helper。
- [x] 4.2 实现 create/resolve PrincipalSession，包含 external token lookup、tombstone-first、schema、TTL 和索引写入。
- [x] 4.3 实现 renew PrincipalSession，原子更新 `lastActiveAt`、`expiresAt`、Redis TTL、索引 score 和可续期派生对象。
- [x] 4.4 实现 create ClientBinding，写入 binding object 及 principal、client、binding、protocol 索引。
- [x] 4.5 实现 issue/resolve IssuedCredential，写入 credential object、lookup key、索引，并在 issue 前检查 lookup tombstone。
- [x] 4.6 实现 create/resolve/consume ProtocolArtifact，consume 时原子删除 active object/lookup 并写 `reason=consumed` tombstone。
- [x] 4.7 实现 result union，覆盖 resolved、revoked、missing_or_expired、schema_invalid、validation_failed、consumed_replay 和 fail_closed。

## 5. Revoke、hooks 与 cleanup

- [x] 5.1 实现 PrincipalSession、ClientBinding、IssuedCredential 和 ProtocolArtifact tombstone 写入、lookup tombstone 写入和 tombstone-first resolve。
- [x] 5.2 实现幂等 revoke API：`revokePrincipalSession`、`revokeBinding`、`revokeCredential` 和 artifact revoke。
- [x] 5.3 实现批量 revoke API：按 user subject、client protocol、client all protocols、principal、binding 和 protocol 索引撤销。
- [x] 5.4 实现级联撤销，确保撤销 PrincipalSession 时处理其 active binding、credential 和 artifact。
- [x] 5.5 实现 RevokeSummary 聚合，区分 revoked、alreadyRevoked、missing、cleanup attempted、cleanup succeeded 和 cleanup failed。
- [x] 5.6 实现 cleanup adapter contract，按 protocol/ref kind 分组执行 cleanup，并保证 cleanup failure 不回滚 tombstone。
- [x] 5.7 实现 validation hooks 编排，支持 principal/client/protocol version 校验失败后的 fail closed 与 lazy revoke。

## 6. 单元测试

- [x] 6.1 扩展或新增 api-core session fake Redis，覆盖 `get/set/del/ttl/expire/pexpireat/zadd/zrange/zrem/zremrangebyscore/eval/multi` 等 Kernel 需要的命令。
- [x] 6.2 覆盖 package export、legacy session helper 兼容和 Kernel 无 app-local import 的架构测试。
- [x] 6.3 覆盖 config、key builder、index member、token generator、HMAC current/previous lookup 和 invalid secret 测试。
- [x] 6.4 覆盖 PrincipalSession create/resolve/renew、ClientBinding create、IssuedCredential issue/resolve/revoke 测试。
- [x] 6.5 覆盖 ProtocolArtifact create/consume/replay、consumed tombstone 和 missing_or_expired 测试。
- [x] 6.6 覆盖 tombstone-first、自然过期不写 tombstone、tombstone TTL grace window、zset 懒清理和 renewal policy 测试。
- [x] 6.7 覆盖 validation hooks lazy revoke、RevokeSummary、cleanup success、cleanup failure 不回滚 tombstone 和 fail closed 测试。

## 7. 验证

- [x] 7.1 运行 `pnpm --filter @iam/api-core test`。
- [x] 7.2 运行 `pnpm --filter @iam/api-core typecheck`。
- [x] 7.3 检查 `openspec status --change session-kernel-core` 显示 apply-ready。
