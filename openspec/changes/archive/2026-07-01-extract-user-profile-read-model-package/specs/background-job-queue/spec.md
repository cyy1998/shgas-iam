## ADDED Requirements

### Requirement: Business producers live in capability packages
系统 SHALL 将业务 job producer 放在对应 capability package 中，而不是放在通用 `@iam/jobs` 基础设施包中。

#### Scenario: Jobs package exposes only generic queue infrastructure
- **WHEN** 后端应用或 worker 从 `@iam/jobs` 导入能力
- **THEN** `@iam/jobs` SHALL 只暴露 BullMQ Queue/Worker 工厂、默认 options、queue prefix 和 deterministic jobId helper 等通用基础设施
- **AND** `@iam/jobs` SHALL NOT export user-profile、notification、directory-sync 或其它业务领域 producer

#### Scenario: User profile producer belongs to read model package
- **WHEN** `apps/api`、`apps/admin-api` 或过渡期 user-profile worker 需要 enqueue user-profile jobs
- **THEN** 它们 SHALL 从 `@iam/user-profile-read-model` 获取 user-profile producer
- **AND** user-profile producer SHALL 使用 `@iam/jobs` 的通用 queue/jobId helper 和 `@iam/contracts` 的 payload schema

#### Scenario: Jobs package does not depend on capability packages
- **WHEN** 新增或修改任意业务 job capability package
- **THEN** `@iam/jobs` SHALL NOT import that capability package
- **AND** capability package SHALL depend on `@iam/jobs` rather than the reverse
