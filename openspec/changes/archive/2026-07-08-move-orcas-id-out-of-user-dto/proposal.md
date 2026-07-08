## Why

`orcasId` 目前挂在 `UserDto`/`UserDetailDto` 上，但它不是 IAM 用户档案的稳定属性，而是 Gateway Custom SSO 在要求 ORCAS 登录时由外部 ORCAS 返回的会话关联身份。继续把它放在用户 DTO 中会让 user-profile read model 只能固定写入 `null`，也会模糊用户档案与协议私有 session payload 的边界。

## What Changes

- **BREAKING**: 从 `UserDto` 和 `UserDetailDto` 契约中移除 `orcasId`。
- Gateway Custom SSO 在 `requireOrcas=true` 时继续执行 ORCAS 登录，但将返回的 ORCAS 用户 ID 和 ORCAS session ID 保存为 local session 的协议私有集成上下文，而不是写入 `userInfo`。
- `/public/orcasId` 继续从当前 Custom SSO local session 返回兼容的 `{ orcasId }` 响应。
- user-profile read model 构建与查询不再产生或依赖 `orcasId` 字段。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `domain-dto-type-contracts`: 用户 DTO 契约不再包含 ORCAS 会话关联身份字段。
- `authentication-sessions`: Custom SSO local session payload 明确保存 ORCAS 集成上下文，并由 session context 对外提供当前 ORCAS ID。
- `user-profile-read-model`: 用户画像 detail 不再包含 ORCAS 字段，builder/query 只维护 IAM 用户档案属性。

## Impact

- 影响 `packages/domain/src/user` 中用户 DTO schema 与推导 type。
- 影响 `@iam/user-profile-read-model` builder、fixture 和查询测试。
- 影响 `apps/api` Custom SSO callback、local session payload schema、public authentication context 和相关测试。
- 影响依赖 `UserDto`/`UserDetailDto.orcasId` 的现有调用方；`/public/orcasId` 作为兼容接口保留。
