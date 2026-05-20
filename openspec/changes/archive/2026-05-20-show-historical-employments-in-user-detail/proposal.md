## Why

管理端用户详情当前只展示正常任职，用户离职或任职暂停后，管理员无法在用户详情中直接看到历史任职关系。与此同时，用户详情里的当前角色和权限仍应代表“当前有效授权”，不能因为展示历史任职而把暂停或结束任职的角色权限计入当前权限。

## What Changes

- 用户详情的 employments 列表 SHALL 展示该用户所有未软删除任职，包括正常、暂停和结束状态。
- 用户详情的 roles 与 privileges 聚合 SHALL 只统计 status 为正常的未软删除任职关系。
- 用户详情前端 SHALL 能在任职 Tab 中展示暂停和结束任职的状态与起止时间，并保持结束任职不可执行转岗、状态变更、删除等编辑操作。
- 不改变用户列表搜索、雇佣关系列表搜索、任职生命周期状态变更、软删除或权限模型本身。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `admin-user-management`: 修改管理端用户详情的任职展示与当前角色/权限聚合口径。

## Impact

- `apps/admin-api/src/services/user/user.service.ts`: 用户详情聚合逻辑需要区分“展示用任职集合”和“当前授权聚合用任职集合”。
- `apps/admin-api/src/services/employment/employment.repository.ts`: 可能需要新增或调整按用户查询未软删除任职的方法，使用户详情能取得正常、暂停、结束任职。
- `apps/admin/src/pages/users/components/UserDetailDrawer.tsx`: 用户详情任职 Tab 需要展示历史任职状态和起止时间，并确认结束任职操作限制符合预期。
- `apps/admin-api/src/services/user/__tests__/user.service.test.ts`: 需要覆盖历史任职展示与当前角色/权限只统计正常任职的规则。
