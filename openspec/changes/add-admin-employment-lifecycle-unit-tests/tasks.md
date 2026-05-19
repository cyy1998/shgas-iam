## 1. 测试框架准备

- [x] 1.1 创建 `apps/admin-api/src/services/employment/__tests__/employment.service.test.ts`，遵循现有 Bun 测试风格。
- [x] 1.2 Mock `@iam/db` transaction，使 callback 接收稳定共享的 `tx` 对象。
- [x] 1.3 在 import `employment.service.ts` 之前 mock employment、user、organization 和 position repository 模块。
- [x] 1.4 添加 `beforeEach` reset 逻辑，重置 transaction 和 repository mock，并准备用户、组织、岗位、任职和创建结果的最小 fixture。

## 2. 创建与更新覆盖

- [x] 2.1 为 `createEmploymentForAdmin` 添加用户、部门、公司、岗位缺失，以及有效重复任职关系的错误测试。
- [x] 2.2 为 `createEmploymentForAdmin` 添加主岗清理、缺省 `isPrimary=false`、创建记录字段、transaction 传递和 `{ id: created.id }` 响应测试。
- [x] 2.3 为 `updateEmployment` 添加任职不存在和已禁用任职不可编辑的错误测试。
- [x] 2.4 为 `updateEmployment` 添加仅在非主岗变主岗时清理主岗、当前已是主岗时不重复清理、update payload 仅限 isPrimary/startTime/description，以及成功返回 true 的测试。

## 3. 生命周期操作覆盖

- [x] 3.1 为 `updateEmploymentStatus` 添加任职不存在、Disable 写入 Date endTime、从 Disable 恢复时清空 endTime 为 null、非 Disable 普通状态变更不写入 endTime，以及成功返回 true 的测试。
- [x] 3.2 为 `deleteEmployment` 添加任职不存在、调用 `softDeleteEmployment(id, tx)` 和成功返回 true 的测试。
- [x] 3.3 为 `transferEmployment` 添加原任职不存在、原任职已禁用，以及新部门、新公司、新岗位不存在的错误测试。
- [x] 3.4 为 `transferEmployment` 添加先结束旧任职、缺省继承主岗、`inheritPrimary=false` 强制非主岗、新任职为主岗时清理其他主岗、创建新 Enable 任职字段和 startTime 行为，以及 `{ newEmploymentId: created.id }` 响应测试。
- [x] 3.5 为 `setPrimaryEmployment` 添加任职不存在、已禁用任职不可编辑、先 unset 再 update 的调用顺序、update payload、transaction 传递和成功返回 true 的测试。
- [x] 3.6 为 `resignUser` 添加用户不存在、先结束活跃任职再禁用用户、transaction 传递和成功返回 true 的测试。

## 4. 验证

- [x] 4.1 运行 `bun test apps/admin-api/src/services/employment/__tests__/employment.service.test.ts`，如有测试框架问题，在不改变业务逻辑的前提下修复。
- [x] 4.2 运行全量 `bun test`；如果出现无关既有失败，单独记录。
- [x] 4.3 如果测试揭示疑似现有 service bug，先停止行为修改，并在变更材料中记录为需确认风险。
