## 1. Employment active uniqueness

- [x] 1.1 补 `packages/db` schema 测试，证明 `employment` 暴露 active relationship partial unique index。
- [x] 1.2 在 `packages/db/src/schema/core/employments.ts` 增加 active relationship partial unique index，并生成迁移。
- [x] 1.3 补 `apps/admin-api` employment repository/service 测试，证明 insert 唯一冲突映射为 `EmploymentAlreadyExistsError`。
- [x] 1.4 在 employment repository 写入路径捕获唯一冲突并映射为 centralized employment already exists error。

## 2. Verification code reserve/confirm

- [x] 2.1 补 `apps/api` mobile service 测试，证明 reserve 不删除原验证码、confirm 后删除、release 后可重试。
- [x] 2.2 在 mobile service 增加 `reserveVerificationCode`、`confirmReservedVerificationCode` 和 `releaseReservedVerificationCode`。
- [x] 2.3 补 public user service/helper 测试，证明 resetPassword 和 bindPhone 事务失败后不确认消费，成功后确认消费。
- [x] 2.4 将 resetPassword 和 bindPhone 改为 reserve/confirm 编排，并保留 mobile login 的 `consumeVerificationCode` 行为。

## 3. Validation

- [x] 3.1 运行 OpenSpec strict validation。
- [x] 3.2 运行聚焦 Bun 测试、`@iam/db db:check`、受影响 package typecheck。
