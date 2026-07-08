## Context

当前 `UserDtoSchema` 在 `packages/domain/src/user/schema.ts` 中直接扩展出 `orcasId`，因此 `UserDetailDto`、user-profile read model、public/internal 用户详情接口都会继承这个字段。实际运行时 `orcasId` 只在 Gateway Custom SSO client 配置 `requireOrcas=true` 时由 ORCAS 登录返回；profile builder 无法从 IAM 写模型获得该值，只能固定写入 `null`。

Session Kernel 规格已经要求 PrincipalSession 不保存 ORCAS 信息，Custom SSO local session payload 才是协议私有 payload 的归属位置。本变更将这个边界贯彻到 DTO 契约：IAM 用户档案不表达 ORCAS 会话身份，Custom SSO session context 表达本次局部会话的 ORCAS 集成上下文。

## Goals / Non-Goals

**Goals:**

- 从 `UserDto` 和 `UserDetailDto` 中移除 `orcasId` 字段。
- Gateway Custom SSO 在 ORCAS 登录成功后，将 ORCAS 用户 ID 与 ORCAS session ID 保存到 local session payload 的协议私有集成上下文。
- 保持 `/public/orcasId` 响应兼容，让客户端仍可按当前 local session 查询 ORCAS ID。
- 让 user-profile read model 只维护 IAM 用户档案属性。

**Non-Goals:**

- 不引入持久化 ORCAS 账号绑定或 external identity 写模型。
- 不改变 ORCAS 登录 HTTP 集成协议。
- 不改变 Session Kernel 公共 lifecycle model。
- 不为 Independent Custom SSO token 响应新增 ORCAS 字段。

## Decisions

1. ORCAS 信息归属 Custom SSO local session payload。

   Gateway callback 需要 ORCAS 时，`sso.service` 仍在创建 local session 前调用 ORCAS；返回值通过 `createLocalSession` 的显式 `orcas` 输入传入 adapter。payload 使用顶层 `orcas` 字段保存 `{ userId, sessionId }`，避免把协议身份混入 `payload.user`。

   Alternative considered: 继续把 `orcasId` 塞入 `UserDetailDto` 兼容旧结构。暂不采用，因为 read model 与 public user-info 会继续暴露一个永远为空或会话相关的伪档案字段。

2. session context 对外提供兼容的 `orcasId`。

   `resolveLocalSessionContext` 从 payload 顶层 ORCAS 集成上下文解析当前 local session 的 ORCAS 用户 ID，并写入 Hono context 的 `customSsoSessionOrcasId`。`/public/orcasId` 继续返回 `{ orcasId }`，不要求调用方读取 `UserDetailDto`。

   Alternative considered: 直接删除 `/public/orcasId`。暂不采用，因为它是明确的兼容接口，且删除会扩大客户端迁移范围。

3. DTO 契约一次性收敛。

   `UserDtoSchema` 不再定义 `orcasId`，`UserDetailDtoSchema` 也不继承该字段。测试 fixture、builder 和 mapper 跟随 schema 收敛，避免以 `orcasId: null` 作为兼容噪音继续扩散。

   Alternative considered: 保留 deprecated nullable 字段一段时间。暂不采用，因为当前代码已经验证 session context 和 user detail 分离，且 profile builder 固定写 `null` 会掩盖边界问题。

## Risks / Trade-offs

- [Risk] 仍有未被测试覆盖的调用方直接读取 `userInfo.orcasId`。
  → Mitigation: 使用 `rg` 清理仓库内引用；保留 `/public/orcasId` 兼容查询；运行相关 API/session/read-model 测试和 typecheck。
- [Risk] Redis 中旧 local session payload 仍把 ORCAS ID 放在 `payload.user.orcasId`。
  → Mitigation: payload parser 在过渡期兼容旧形态读取，但新写入只写顶层 `orcas`；回滚时重新登录即可刷新 payload。
- [Risk] OpenAPI 中 `UserDto`/`UserDetailDto` 字段减少属于契约变化。
  → Mitigation: 在 OpenSpec 中标记 breaking；验证 public ORCAS 查询路径仍可用。
