## 1. 后端任职查询

- [x] 1.1 在 `employment.repository.ts` 中新增按 userId 查询所有未软删除任职的方法，返回正常、暂停和结束状态任职及既有关联数据
- [x] 1.2 保留现有正常任职查询方法的语义，避免影响其他当前授权或活跃任职调用方

## 2. 用户详情聚合

- [x] 2.1 调整 `getUserDetailByUsernameForAdmin`，使用全部未软删除任职填充用户详情 employments
- [x] 2.2 在用户级 roles 和 privileges 聚合时仅纳入 `EmploymentStatus.Enable` 任职
- [x] 2.3 确认每条 employment detail 仍包含岗位、组织、公司、状态、起止时间、角色和权限信息

## 3. 管理端展示

- [x] 3.1 调整 `UserDetailDrawer` 任职 Tab，展示暂停和结束任职，并显示起止时间
- [x] 3.2 确认结束任职在用户详情中保持只读操作体验，不暴露转岗、状态变更或删除操作
- [x] 3.3 确认正常和暂停任职的现有操作入口不被误删

## 4. 测试与验证

- [x] 4.1 补充 `user.service` 单元测试，覆盖用户详情返回正常、暂停和结束任职
- [x] 4.2 补充 `user.service` 单元测试，覆盖用户级 roles 和 privileges 只从正常任职聚合并去重
- [x] 4.3 运行 `pnpm --filter @iam/admin-api typecheck`
- [x] 4.4 运行 `pnpm --filter @iam/admin typecheck`
