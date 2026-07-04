## Context

`docs/reviews/SOFTWARE_ENGINEERING_PRINCIPLES_REVIEW_2026-07-03.md` 标记了两个 P1 幂等性问题。`employment` 创建和转岗当前先查重复关系再插入，但表结构只包含普通索引；并发请求可能同时通过检查。`resetPassword` 和 `bindPhone` 当前通过 `consumeVerificationCode` 在业务事务前删除 Redis 验证码；一旦后续 DB 写入或事务失败，用户无法用同一合法验证码重试。

## Goals / Non-Goals

**Goals:**

- active employment 的同一 `userId + orgId + posId` 只能存在一条 Enable 且未软删除记录，并由 PostgreSQL 约束兜底。
- 创建和转岗遇到数据库唯一冲突时映射为既有 `EmploymentAlreadyExistsError`，不泄漏数据库错误。
- resetPassword 和 bindPhone 在业务提交成功后确认消费验证码；业务写入失败时同一验证码仍可重试。
- 保持 mobile login 的一次性消费语义不变。

**Non-Goals:**

- 不引入通用请求级 idempotency-key。
- 不改变验证码发送、校验、手机号格式、密码强度或用户枚举策略。
- 不治理 Pause 状态 employment 是否参与重复关系的既有开放问题。
- 不引入 outbox 或后台补偿任务。

## Decisions

1. Employment 唯一性使用 PostgreSQL partial unique index。
   - 约束字段为 `user_id`、旧列名 `dept_id`、`pos_id`。
   - 谓词为 `is_delete = false AND status = EmploymentStatus.Enable`。
   - 选择 partial unique index 是因为历史表保留结束和软删除记录，普通 unique constraint 会阻止合法历史记录共存。
   - 替代方案：仅在 service 中加事务锁或 advisory lock。该方案无法覆盖所有写入口和未来导入脚本，因此不作为主保护。

2. Repository 捕获唯一冲突并抛出领域错误。
   - service 保留现有重复关系前置检查，用于更早返回业务错误。
   - repository 在 insert 遇到唯一约束冲突时转换为 `EmploymentAlreadyExistsError`，覆盖并发窗口。
   - 替代方案：使用 `onConflictDoNothing` 后检查 returning 空结果。Drizzle 对 partial unique index 的 conflict target 表达更脆弱，显式捕获约束名更直接。

3. 验证码消费拆成 reserve/confirm，并保留现有 `consumeVerificationCode` 给登录使用。
   - `reserveVerificationCode` 校验原验证码匹配后创建短 TTL reserve key，不删除原验证码。
   - `confirmReservedVerificationCode` 在业务事务成功后原子校验 reserve token 并删除原验证码与 reserve key。
   - `releaseReservedVerificationCode` 在业务失败时清理 reserve key；即使 release 失败，reserve TTL 到期后也允许重试。
   - 替代方案：事务完成后再调用旧 `consumeVerificationCode`。该方案存在事务期间验证码可被其它请求消费的问题，也无法区分本次操作持有的凭证。

## Risks / Trade-offs

- [Risk] 已有生产数据若存在重复 active employment，迁移创建唯一索引会失败。→ Mitigation: 迁移前查询重复记录；本变更的迁移保持显式 index 名称，失败时可定位重复组合后清理再重跑。
- [Risk] reserve 阶段不删除原验证码，失败窗口内同一验证码仍可被新的业务尝试 reserve。→ Mitigation: reserve key 使用 token 绑定本次操作，confirm 必须匹配 token；成功 confirm 删除原验证码，重复提交仍失败。
- [Risk] Redis confirm 成功但 HTTP 响应丢失时，用户重试会看到验证码错误。→ Mitigation: 本次目标是“事务失败可恢复”，成功提交后的重放仍按现有单次消费语义处理。
- [Risk] 只覆盖 resetPassword 和 bindPhone，mobile login 仍先消费。→ Mitigation: mobile login 不包含后续 DB 事务写入，本次不改变其安全语义。
