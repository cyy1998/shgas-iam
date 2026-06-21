## Context

`introduce-session-kernel` 已经把 IAM 会话目标态拆成 umbrella 和 5 个 child changes。`session-kernel-core` 是第 1 个 child，目标分支为 `feature/session-kernel`，它必须先提供 `@iam/api-core/session/kernel` 的稳定公共能力，让后续 custom SSO、OIDC、admin revoke 和 release hardening 只消费 Kernel API，而不是各自复制 Redis lifecycle、HMAC lookup、tombstone 或索引逻辑。

现有 `packages/api-core/src/session/index.ts` 已经包含 `global_session:*`、`local_<client>_session:*`、`local_session_reverse:*` 和 `local_session_set:*` helper。现有 `packages/api-core/src/oidc/token-revocation.ts` 也提供 OIDC access token 反向索引。这些 helper 需要暂时保留，直到 adapter child 完成迁移。本 change 新增 core，不改变现有 route 行为。

## Goals / Non-Goals

**Goals:**

- 在 `packages/api-core/src/session/kernel` 提供协议无关的 Session Kernel core。
- 定义 versioned PrincipalSession、ClientBinding、IssuedCredential、ProtocolArtifact、RevokedTombstone、CleanupRef、RevocationReason、FreshnessRequirement、ValidationResult 和 RevokeSummary 类型。
- 提供统一 `sess:v2:` key builder、lookup key、zset index member、JSON/Zod schema 校验和 namespace 配置。
- 提供 high-entropy opaque token 生成、HMAC lookup、current/previous key 轮换和 secret 启动校验。
- 实现 create/resolve/renew PrincipalSession、create ClientBinding、issue IssuedCredential、create/consume ProtocolArtifact、tombstone-first resolve、幂等 revoke、批量 revoke summary、adapter cleanup contract 和 validation hooks。
- 保留 legacy session helper 导出，并提供稳定 `@iam/api-core/session/kernel` package export。
- 用 `@iam/api-core` 单元测试覆盖核心安全语义。

**Non-Goals:**

- 不迁移 `apps/api` custom SSO 登录态、auth code、local session、`/auth/authz` 或 logout。
- 不迁移 `apps/oidc-provider` resolver、provider session binding、return handle、authorization code 或 access token payload。
- 不接入 `apps/admin-api` afterCommit 主动撤销。
- 不新增 PostgreSQL session 表，不迁移 `client_protocol_config`。
- 不让 Kernel 依赖 Hono、Koa、`@iam/db`、app-local service、route、logger 单例、audit writer 或协议库类型。
- 不在本 change 编写发布 runbook、旧 Redis key 清理脚本或跨 app smoke 记录。

## Decisions

### 1. Kernel 作为 `session/kernel` 子模块发布

新增目录：

```text
packages/api-core/src/session/
├── index.ts
└── kernel/
    ├── cleanup.ts
    ├── config.ts
    ├── facade.ts
    ├── hmac.ts
    ├── index.ts
    ├── keys.ts
    ├── model.ts
    ├── result.ts
    ├── scripts.ts
    ├── store.ts
    ├── time.ts
    └── token.ts
```

`packages/api-core/package.json` 增加 `./session/kernel` export，同时 `packages/api-core/src/session/index.ts` 继续导出现有 helper 并可 re-export Kernel 类型。这样后续 adapter 可以显式依赖 `@iam/api-core/session/kernel`，旧调用方仍可从 `@iam/api-core/session` 使用 legacy helper。

Alternative considered: 将 Kernel 放进新的 workspace package。暂不采用，因为 `apps/api`、`apps/oidc-provider` 和 admin 侧已经依赖 `@iam/api-core`，新增 package 会扩大迁移面。

### 2. 模型与 schema 以 Kernel 为唯一 lifecycle contract

`model.ts` 定义所有 lifecycle object 的 TypeScript 类型和 Zod schema。每个 Redis object 都包含 `version: 1`、内部 ID、关联 principal/client/protocol、时间戳和必要 metadata。PrincipalSession 只保存最小 PrincipalSnapshot，不保存 `UserDetailDto`、OIDC claims、roles、privileges、employments 或协议 payload。

协议 payload 由 adapter 私有 key 或协议库继续管理，Kernel 只保存 lifecycle object 与 `cleanupRefs`。这能避免 Kernel model 被 custom SSO 或 OIDC 的协议细节污染。

Alternative considered: 在 Kernel object 里放 `payload: unknown`。暂不采用，因为它会让 core schema 无法稳定校验，也会诱导 adapter 绕过自己的 payload 边界。

### 3. HMAC lookup 与 external token 解耦

`token.ts` 使用至少 32 bytes 随机数生成 opaque token，可按类型加内部前缀，例如 `iam_ps_`、`iam_ac_`、`iam_ls_`、`iam_or_`。`hmac.ts` 使用独立 lookup HMAC key 计算 lookup hash，配置支持 current/previous key。active object 记录命中的 `lookupKeyId`，读取时先 current 后 previous。

Kernel 不在 Redis object key、lookup key、tombstone、index member 或日志中保存外部 token 明文。协议库生成的 OIDC token 也只以明文入参传给 Kernel 计算 lookup。

Alternative considered: 继续把 token 明文放入 Redis key。暂不采用，因为旧 key 泄露会直接暴露 bearer 值，也无法支持平滑 HMAC key rotation。

### 4. `sess:v2:` Redis layout 由 key builder 统一生成

`keys.ts` 提供唯一 key builder，覆盖 active object、lookup、revoked tombstone 和 zset index。索引 member 使用紧凑编码，例如 `p:{id}`、`b:{id}`、`c:{id}`、`a:{id}`，score 使用 `expiresAt` epoch milliseconds。读取索引和批量撤销前先执行 `ZREMRANGEBYSCORE` 懒清理。

Kernel namespace 默认 `sess:v2:`，但通过 `SessionKernelConfig.namespace` 注入，便于测试和未来隔离。adapter 不允许直接拼接 Kernel lifecycle key；后续 release hardening 会用架构测试防止绕过。

Alternative considered: 复用 `global_session:*` 和 OIDC 旧索引。暂不采用，因为 umbrella 已确认这是不兼容 Redis key 迁移，新 namespace 能避免新旧权威态混用。

### 5. store 负责原子状态转换，facade 负责编排

`store.ts` 封装 Redis 操作和 Lua/transaction，确保 issue、consume、revoke 等安全关键路径 fail closed。`facade.ts` 组合 store、clock、token generator、HMAC provider、validation hooks、cleanup adapters 和 logger，向调用方提供面向业务的 Kernel API。

预期结果使用 result union 表示，例如 `resolved`、`revoked`、`missing_or_expired`、`schema_invalid`、`validation_failed`、`consumed_replay`。Redis command 错误、schema corruption 清理失败或原子写入失败属于异常路径，应抛出或返回 fail closed 结果，不得返回可用 external credential。

Alternative considered: 每个 API 直接调用 Redis multi。暂不采用，因为 consume/revoke/tombstone 需要一致的安全顺序和测试覆盖。

### 6. tombstone-first 是所有 resolve 的固定顺序

所有 external token resolve、object resolve 和 artifact consume 都先查对应 tombstone，再查 active lookup/object，最后执行 schema、TTL、关联对象和 validation hooks。主动撤销和 artifact 成功 consume 写 tombstone；自然 TTL 过期不主动写 tombstone。

tombstone TTL 由 `result.ts` 或专门 helper 统一计算，至少覆盖原对象剩余有效期；credential/artifact 额外加 grace window。重复 revoke 不覆盖已有 tombstone reason。

Alternative considered: 只删除 active object，不写 tombstone。暂不采用，因为 replay、logout 后旧 token 使用和 cleanup failure 都需要运行时拒绝证据。

### 7. TTL、freshness 与 renewal policy 在 core 内计算

PrincipalSession 区分 idle `expiresAt` 和 `absoluteExpiresAt`。前台交互调用 renew 时更新 `lastActiveAt` 并将 `expiresAt` 设置为 `min(now + idleTtl, absoluteExpiresAt)`，不修改 `authTime`。`extend_with_principal` 的 binding/credential 可随 PrincipalSession 续期，`fixed_at_issue` 和 `never_extend` 不续期。

`evaluateFreshness` 只依赖 PrincipalSession 与 `FreshnessRequirement`，返回 satisfied 或需要重认证的原因。强制重认证后的新 PrincipalSession 创建和旧 session revoke 由 adapter 编排，但 core 提供撤销入口。

Alternative considered: 把 freshness 判断留给各协议。暂不采用，因为 OIDC `prompt=login/max_age`、未来 SAML `ForceAuthn` 和高敏 custom SSO client 都应共享同一套判断。

### 8. validation hooks 不引入 DB 依赖

Kernel 接受 `validatePrincipal`、`validateClient` 和 `validateProtocolVersion` hooks。hooks 返回结构化失败类型，例如 `user_disabled`、`client_disabled`、`client_protocol_disabled`、`client_config_changed`、`binding_invalid` 或 `credential_corrupted`。Kernel 根据失败类型触发 lazy revoke 范围。

afterCommit 主动撤销仍是正常路径；lazy revoke 是读取时兜底。hooks 由后续 adapter child 在 app composition 中注入。

Alternative considered: Kernel 直接 import repository 或 Drizzle schema。暂不采用，因为 `api-core` 必须保持 app-agnostic。

### 9. adapter cleanup 是撤销后的 best-effort 阶段

Kernel revoke 先删除/标记 active object、写 tombstone、清理索引，再按 `cleanupRefs` 分组调用注入的 cleanup adapter。cleanup 失败不回滚 tombstone，也不使 revoke 失败；失败信息进入 `RevokeSummary.cleanup.failed`，由 app-local logger 或 system log 消费。

Alternative considered: cleanup 和 tombstone 在同一 transaction 中完成。暂不采用，因为外部 logout notification、OIDC provider payload 删除或 adapter 私有 key 清理都可能失败，不能影响 IAM 权威态拒绝。

### 10. 单元测试使用本地 fake Redis，不新增测试依赖

沿用 `packages/api-core/src/session/__tests__/session.test.ts` 和 `packages/api-core/src/oidc/__tests__/token-revocation.test.ts` 的模式，构造覆盖 `get/set/del/ttl/expire/zadd/zrange/zremrangebyscore/eval/multi` 的 fake Redis。复杂 Lua 语义可通过脚本边界测试和 store 行为测试共同覆盖。

Alternative considered: 引入 `ioredis-mock` 或依赖真实 Redis。暂不采用，因为本 change 是 shared package 单元测试，保持快速、确定、无外部服务依赖更合适。

## Risks / Trade-offs

- [Risk] Kernel public API 过窄，后续 adapter 需要绕过 Redis lifecycle。→ Mitigation: 在 core child 明确 facade 能力和 cleanup contract，后续 child 发现缺口时优先扩展 Kernel API，而不是写 adapter 私有 lifecycle key。
- [Risk] 原子 consume/revoke 的 Lua 脚本复杂，fake Redis 难以完全模拟。→ Mitigation: 将脚本输入输出集中在 `scripts.ts`，用 store 测试覆盖成功和失败路径，并保留少量脚本字符串/参数组装测试。
- [Risk] HMAC previous key 配置错误导致 active token 解析失败。→ Mitigation: config 校验 key id、secret 长度和 current/previous 冲突，测试 current/previous 命中顺序。
- [Risk] tombstone 写放大增加 Redis 占用。→ Mitigation: 不为自然过期写 tombstone，tombstone TTL 有 grace window 和上限配置，索引懒清理过期 member。
- [Risk] result union 过多导致 adapter 使用复杂。→ Mitigation: facade 暴露少量面向场景的 resolve/issue/revoke API，并提供 discriminated union 让调用方穷尽处理。
- [Risk] cleanup failure 被忽略。→ Mitigation: `RevokeSummary` 必须返回 attempted/succeeded/failed 明细，后续 admin/release child 接入 system log。

## Migration Plan

1. 在 `work/session-kernel-core` 上新增 `packages/api-core/src/session/kernel` 模块、package export 和兼容 re-export。
2. 先落模型、config、keys、HMAC/token、result 类型，再实现 store/facade 的 create/resolve/renew/issue/consume/revoke。
3. 保留 `packages/api-core/src/session/index.ts` 中现有 legacy helper 行为和测试。
4. 新增 `@iam/api-core` 单元测试，覆盖 core 成功、拒绝、重放、撤销、TTL、previous HMAC key 和 cleanup failure。
5. 运行 `pnpm --filter @iam/api-core test` 和 `pnpm --filter @iam/api-core typecheck`。
6. 归档本 child 时 squash 回 `feature/session-kernel`；后续 adapter child 从该公共 API 继续实施。

回滚策略：本 change 不改变运行时调用路径；如实现存在问题，回滚 `packages/api-core/src/session/kernel` 新模块、package export 和相关测试即可，legacy session helper 不受影响。

## Open Questions

无阻断性 open question。后续 adapter child 可能根据 custom SSO、OIDC 或 admin revoke 的实际接入体验补充 Kernel facade 方法，但不得绕过本 change 固化的 lifecycle、lookup、tombstone 和索引边界。
