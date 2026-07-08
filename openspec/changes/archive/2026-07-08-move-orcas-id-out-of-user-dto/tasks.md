## 1. DTO 与 Read Model 收敛

- [x] 1.1 从 `UserDtoSchema`/`UserDetailDtoSchema` 中移除 `orcasId`，并更新依赖该字段的测试 fixture。
- [x] 1.2 调整 user-profile builder 与 query 测试，使 profile detail 不再写入或断言 `orcasId`。
- [x] 1.3 使用仓库检索确认 `UserDto`/`UserDetailDto` 的剩余 `orcasId` 引用只存在于兼容 payload 或 session context。

## 2. Custom SSO ORCAS 上下文

- [x] 2.1 为 Custom SSO local session payload 增加顶层 ORCAS 集成上下文，并兼容读取旧 payload 中的 `user.orcasId`。
- [x] 2.2 调整 Gateway callback，使 ORCAS 登录返回值通过显式 `orcas` 输入传给 `createLocalSession`，不再改写 `userDetail`。
- [x] 2.3 调整 `resolveLocalSessionContext` 和 `/public/orcasId` 路径，从 local session ORCAS 上下文返回兼容 `orcasId`。

## 3. 验证

- [x] 3.1 更新或新增 Custom SSO/session 测试，覆盖 Gateway ORCAS ID 来自 payload context 且 `userDetail` 不含 `orcasId`。
- [x] 3.2 运行相关 read-model、public route、SSO/session 测试。
- [x] 3.3 运行最窄可行 typecheck 或 package check，确认公共 DTO 契约变更没有残留类型错误。
