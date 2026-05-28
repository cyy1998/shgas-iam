## 1. Domain DTO Contract

- [x] 1.1 从 `packages/domain/src/employment/schema.ts` 的 `EmploymentDtoSchema` 移除 username、name、mobile、wxId、posCode、posName、orgCode、orgName、orgType、compCode 和 compName 顶层字段。
- [x] 1.2 更新 `toEmploymentDto`，只返回 employment 自身字段以及 `user`、`position`、`organization` 结构化字段，不再派生或回填 deprecated 扁平字段。
- [x] 1.3 清理不再需要的 deprecated schema helper 和 `OrganizationType` import。
- [x] 1.4 更新 `packages/domain/src/employment/__tests__/schema.test.ts`，验证结构化字段仍存在，并断言 removed 顶层字段不存在。

## 2. Backend API Consumers

- [x] 2.1 更新 `apps/admin-api` 与 `apps/api` 中 Employment DTO mapper 相关测试，移除对 deprecated 扁平字段的断言并加入字段不存在断言。
- [x] 2.2 确认 `EmploymentVoSchema`、`EmploymentDetailVoSchema` 只扩展 admin 展示字段，不重新引入 removed 顶层字段。
- [x] 2.3 检查 admin user detail、public user detail、internal/public directory 返回路径，确保复用更新后的 Employment DTO contract。
- [x] 2.4 保留创建、转岗、查询输入中的 `username`、`posCode`、`orgCode` 等标识符字段，不把输入 contract 误删。

## 3. Frontend Consumers

- [x] 3.1 更新 `apps/admin` employment 列表、详情抽屉、转岗弹窗和用户详情任职列表，改用 `employment.user`、`employment.position`、`employment.organization` 展示用户、岗位、组织路径和公司节点。
- [x] 3.2 更新 `apps/sso` 用户信息页和 API 类型，移除 employment 顶层 `compName`、`orgName` 等兼容字段读取，改用 `organization.fullOrgPath` 与 `organization.companyNodes`。
- [x] 3.3 用 `rg` 搜索 affected frontend 中对 employment removed 顶层字段的读取，确认已迁移或不是 Employment DTO 语境。

## 4. Verification

- [x] 4.1 运行 `pnpm --filter @iam/domain test` 或对应包内测试命令，验证 domain Employment DTO mapper。
- [x] 4.2 运行 `pnpm --filter @iam/api test` 和 `pnpm --filter @iam/admin-api test`，验证 backend mapper 与 user detail 聚合行为。
- [x] 4.3 运行 `pnpm --filter @iam/admin typecheck` 和 `pnpm --filter @iam/sso typecheck`，验证前端消费代码不再依赖 removed 字段。
- [x] 4.4 运行 `pnpm --filter @iam/api typecheck`、`pnpm --filter @iam/admin-api typecheck` 和必要的 workspace typecheck，确认 OpenAPI/tRPC 类型同步。
