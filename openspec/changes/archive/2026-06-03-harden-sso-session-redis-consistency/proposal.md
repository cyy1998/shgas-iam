## Why

当前 SSO 独立应用登录流程会在 Redis 中维护授权码、全局会话、局部会话、反向映射和局部会话集合，但这些数据的创建与清理存在非原子写入、授权码可重复兑换、登出被外部回调失败阻断等一致性风险。需要收紧会话契约，避免出现局部会话漏删、索引残留、重复兑换和 IAM 与独立应用登录态不一致。

## What Changes

- 将 SSO 授权码兑换改为一次性消费，防止同一个 `auth_code` 重复创建多个局部会话。
- 在创建局部会话前校验全局会话仍有效，并确保局部会话实体、反向映射和集合索引作为一个一致单元写入 Redis。
- 调整 SSO 登出清理语义，保证 IAM Redis 会话清理不因 Independent 客户端 `logoutEndpoint` 失败而中断。
- 明确局部会话清理需要处理集合索引、实体 key 和反向映射 key 的一致性，并对异常场景提供测试覆盖。
- 保持现有 `/sso/authorize`、`/sso/callback`、`/sso/token`、`/sso/logout` API 形态不变；不引入数据库迁移或新的外部依赖。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `authentication-sessions`: 收紧 SSO 授权码、局部会话创建和 SSO 登出清理的一致性要求。

## Impact

- 影响代码：`apps/api/src/routes/sso/sso.service.ts`、`apps/api/src/services/session/session.service.ts`，以及相关 SSO/session 单元测试。
- 影响 Redis key：`auth_code:<code>`、`global_session:<token>`、`local_<client>_session:<sid>`、`local_session_reverse:<sid>`、`local_session_set:<globalSessionId>`。
- 影响业务系统：Independent 客户端在全局登出时仍会收到 `logoutEndpoint` 通知，但通知失败不应阻断 IAM 自身会话清理。
- 不影响前端页面、Drizzle schema、PostgreSQL migration 或现有客户端注册字段。
