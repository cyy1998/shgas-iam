## MODIFIED Requirements

### Requirement: Session Kernel 发布配置必须跨 app 一致
系统 SHALL 为 `apps/api`、`apps/admin-api` 和 `apps/oidc-provider` 使用一致的 Session Kernel 配置规则，并 SHALL 在生产环境对无法稳定 lookup 的配置 fail closed。

#### Scenario: app 使用同一配置映射规则
- **WHEN** 后端 app 从 app-prefixed raw env 构造 Session Kernel runtime config
- **THEN** namespace、principal idle TTL、principal absolute TTL、tombstone TTL、tombstone grace、current HMAC key 和 previous HMAC key SHALL 使用同一套映射规则
- **AND** 秒级 env 值 SHALL 在进入 Kernel 前转换为毫秒级 config
- **AND** app composition SHALL NOT 手写与共享映射规则冲突的 TTL 或 HMAC 结构

#### Scenario: Docker 共享 Session 配置 fan-out 到各 app
- **WHEN** Docker compose 为 `api`、`admin-api` 和 `oidc-provider` 注入 Session Kernel 配置
- **THEN** compose SHALL use `IAM_SESSION_*` shared deployment variables as the source for common Session Kernel values
- **AND** compose SHALL map those shared values to `IAM_API_SESSION_*`、`IAM_ADMIN_API_SESSION_*` and `IAM_OIDC_PROVIDER_SESSION_*` raw env keys

#### Scenario: 生产环境缺少 current HMAC secret
- **WHEN** `NODE_ENV=production` 且当前 app 缺少 app-prefixed current HMAC secret raw env
- **THEN** app env validation SHALL fail closed
- **AND** app SHALL NOT 以开发默认 secret 启动

#### Scenario: previous HMAC key 配置不成对
- **WHEN** 只配置 app-prefixed previous HMAC key id 或只配置 app-prefixed previous HMAC key secret
- **THEN** app env validation SHALL fail closed
- **AND** 错误 SHALL 指向缺失的 previous key 配置

#### Scenario: HMAC rotation 配置冲突
- **WHEN** current 与 previous HMAC key id 相同，或 current 与 previous HMAC secret 相同
- **THEN** Session Kernel config creation SHALL fail closed
- **AND** app SHALL NOT 创建可能导致 lookup ambiguity 的 Kernel runtime
