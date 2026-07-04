## Why

2026-07-03 软件工程原则审查发现两个 P1 幂等性缺口：任职创建/转岗只靠服务层先查再写，验证码在业务事务提交前被删除。两者都会在并发、重试或事务失败时产生重复数据或不可恢复的用户失败路径，需要用持久化约束和可恢复消费语义补上护栏。

## What Changes

- 为 active employment 的同一用户、实际任职组织和岗位组合增加数据库唯一保护，并将创建/转岗写入冲突映射为稳定的“相同任职关系已存在”业务错误。
- 将 resetPassword 和 bindPhone 验证码从“先删除再执行业务事务”调整为 reserve/confirm 语义：业务事务成功后才确认消费，事务失败或后续写入失败时允许合法重试。
- 保持成功业务提交后的验证码单次消费语义，重复提交仍被视为验证码错误。
- 增加覆盖并发/冲突、事务失败可重试和成功后不可重放的聚焦测试。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `employment-management`: active employment 唯一性必须由数据库约束兜底，创建/转岗遇到约束冲突时返回既有业务错误。
- `directory-and-self-service`: resetPassword 与 bindPhone 验证码必须在业务写入成功后确认消费，业务事务失败不得提前消耗验证码。

## Impact

- 影响 `packages/db/src/schema/core/employments.ts` 及对应迁移。
- 影响 `apps/admin-api/src/services/employment` 的 repository/service 冲突处理与测试。
- 影响 `apps/api/src/services/mobile`、`apps/api/src/services/user` 的验证码消费端口、用户自助/找回密码编排和测试。
- 不改变 REST/tRPC 路由路径、请求字段或成功响应结构。
