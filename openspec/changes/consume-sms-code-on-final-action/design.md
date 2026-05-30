## Context

短信验证码目前通过 `apps/api/src/services/mobile/mobile.service.ts` 写入 Redis key `mobile-code:<usage>:<phone>`，TTL 为 180 秒。校验路径有两份只读实现：`mobile.service.ts` 和 `session.service.ts` 都通过 `redis.get()` 读取并比对验证码，没有删除 key。

受影响的最终业务动作包括：

- 手机验证码登录：`apps/api/src/routes/auth/auth.service.ts`
- 找回密码：`apps/api/src/services/user/user.service.ts`
- 绑定手机号：`apps/api/src/services/user/user-mobile-binding.helper.ts`

`/open/code/verify` 当前被 SSO 找回密码页面用于进入下一步的预校验；若在该接口直接消费验证码，会导致后续 `/open/password/reset` 无法继续使用同一验证码。因此本设计保留该接口为只读预校验，把一次性消费放在最终业务动作。

## Goals / Non-Goals

**Goals:**

- 让登录、找回密码、绑定手机号在成功校验短信验证码时一次性消费验证码。
- 使用原子 Redis 操作完成“读取 + 删除”，避免并发请求同时通过校验。
- 保持 `/open/code/verify` 的接口形状和只读预校验语义不变。
- 移除或收敛重复的验证码读取逻辑，避免 `mobile.service.ts` 和 `session.service.ts` 行为漂移。
- 补充单元测试覆盖首次成功、重复使用失败、预校验不消费。

**Non-Goals:**

- 不改造 `/open/code/verify` 为返回短期 verified token。
- 不调整短信验证码 TTL、发送频率限制、短信供应商集成或 Cap 人机校验策略。
- 不治理找回密码用户枚举、密码强度规则或审计日志结构。
- 不改变 `MAGIC_CODE` 的既有绕过语义。

## Decisions

### Decision: 新增原子消费函数，保留只读校验函数

在 `mobile.service.ts` 中保留 `checkVerificationCode(usage, phone, code)` 作为只读预校验函数，并新增类似 `consumeVerificationCode(usage, phone, code)` 的最终动作专用函数。

`consumeVerificationCode` SHALL 使用 Redis 原子语义完成读取和删除。优先实现方式：

- 使用 `GETDEL mobile-code:<usage>:<phone>` 后与输入 code 比对。
- 如果运行环境 Redis 版本或类型支持不确定，则使用 Lua script 原子执行：读取 key，匹配时删除并返回成功，不匹配时保留 key。

选择原子消费而不是 `get()` 后 `del()`，是为了防止两个并发请求同时读到同一个验证码并都继续执行业务副作用。

### Decision: 最终业务动作负责消费，预校验接口不消费

`/open/code/verify` 继续调用只读校验函数并返回 `{ result: boolean }`。它不删除验证码，也不产生 verified token。

最终业务动作改为使用消费函数：

- 手机验证码登录使用 `consumeVerificationCode(VerificationCodeUsage.Login, phoneNumber, code)`。
- 找回密码在用户存在和手机号匹配后，保存新密码前消费 `resetPassword` 用途验证码。
- 绑定手机号在手机号格式和重复手机号检查后，写入手机号前消费 `bindPhone` 用途验证码。

这样现有 SSO 找回密码页面仍可先调用 `/open/code/verify` 进入下一步，再由 `/open/password/reset` 进行最终消费。

### Decision: 消费发生在业务副作用前

验证码消费应发生在创建 session、保存新密码、写入手机号之前。这样并发重复提交时只有一个请求能通过消费检查并继续执行副作用。

该取舍意味着：如果验证码已被消费，但后续数据库写入或 session 创建失败，用户需要重新获取验证码。相比允许并发重复使用验证码，这是更符合安全凭证语义的失败模式。

### Decision: `MAGIC_CODE` 不消费短信验证码

手机验证码登录保留 `MAGIC_CODE` 绕过语义。输入等于 `MAGIC_CODE` 时不读取也不删除 `mobile-code:login:<phone>`，避免调试/运维绕过路径影响真实用户验证码。

找回密码和绑定手机号当前没有 `MAGIC_CODE` 分支，本变更不新增。

## Risks / Trade-offs

- [Risk] Redis 版本不支持 `GETDEL` → 使用 Lua script 或封装实现，保持调用方只依赖 `consumeVerificationCode`。
- [Risk] 消费成功后业务副作用失败会让验证码失效 → 接受该取舍；安全凭证优先保证一次性，用户可重新发送验证码。
- [Risk] 保留 `/open/code/verify` 只读可能让验证码仍可被反复“预校验” → 预校验本身不产生业务副作用；真正的登录、重置密码、绑定手机号仍会一次性消费。
- [Risk] `session.service.ts` 保留重复短信校验逻辑会再次漂移 → 将登录验证码校验迁移到 `mobile.service.ts` 的消费函数，删除或停止使用 `session.service.ts` 中的验证码只读 helper。

## Migration Plan

- 后端无需数据库迁移，也不需要 Redis key 格式迁移。
- 部署后，已有未过期短信验证码仍使用原 key；首次最终业务动作成功校验时被消费。
- 若回滚到旧版本，未被消费的验证码仍按 TTL 过期；已消费验证码无法恢复，用户重新发送即可。

## Open Questions

- 是否需要在未来将 `/open/code/verify` 改造成“消费验证码并返回短期 verified token”的更严格流程？本变更暂不处理。
- 是否需要为短信验证码发送增加按手机号/IP 的限流？本变更暂不处理。
