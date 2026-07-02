## 1. DTO Contract

- [x] 1.1 在 `packages/user-profile-read-model/src/user-profile.schema.ts` 的 `UserQueryDtoSchema` 中增加可选 `names` 字段，描述为姓名列表精确匹配。
- [x] 1.2 确认 `apps/api/src/services/user/user.schema.ts` 的 re-export 和 `UserQueryWithPrivilegeDelegationDtoSchema` 自动继承 `names`，无需新增 app 私有 DTO。

## 2. Legacy Query Compilation

- [x] 2.1 在 `compileLegacyUserQueryToProfileFilter()` 中将 `query.names` 编译为 `{ field: "user.name", op: "in", value: names }`。
- [x] 2.2 保持 `names` 与 username、phone、wxId 及 employment 条件的现有 AND 组合语义，保持 employment 条件 nested 在同一个 employment 元素内匹配。
- [x] 2.3 确认实现不新增数据库列、迁移、profile rebuild、运行时配置或 response DTO 字段。

## 3. Tests

- [x] 3.1 更新 `packages/user-profile-read-model/src/__tests__/user-profile-query.service.test.ts`，覆盖 legacy `names` 编译到 `user.name` 精确匹配。
- [x] 3.2 增加或调整测试覆盖 `names` 与 employment 条件组合时的顶层 AND + nested employment 语义。
- [x] 3.3 检查 `apps/api` 现有 user service/handler 测试是否因 DTO 字段扩展需要补充；如需要，覆盖 search-with-delegation 传递 `names` 到 profile 用户搜索。

## 4. Verification

- [x] 4.1 运行 `pnpm --filter @iam/user-profile-read-model test`。
- [x] 4.2 运行 `pnpm --filter @iam/user-profile-read-model typecheck`。
- [x] 4.3 运行 `pnpm --filter @iam/api typecheck`。
- [x] 4.4 视实现触达范围运行 `pnpm --filter @iam/api test` 或更窄的相关 Bun 测试。
