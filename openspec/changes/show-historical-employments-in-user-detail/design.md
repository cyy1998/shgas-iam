## Context

当前用户详情由 `getUserDetailByUsernameForAdmin` 聚合用户、任职、角色和权限。它通过 `employmentRepository.getEmploymentsByUserId` 只取 `EmploymentStatus.Enable` 且未软删除的任职，因此用户详情的任职 Tab 看不到暂停或结束任职。

用户提出的新语义有两个层次：

- 展示层：用户详情应呈现该用户所有未软删除任职，包含正常、暂停和结束状态，方便管理员查看历史任职。
- 当前授权层：用户详情的 roles 与 privileges 仍表示当前有效授权，只能从正常任职聚合，不能把暂停或结束任职的角色权限算入当前权限。

这两个层次需要在服务层显式拆开，避免 UI 为了展示历史任职而意外扩大当前权限展示。

## Goals / Non-Goals

**Goals:**

- 用户详情 employments 返回所有未软删除任职。
- 用户详情 roles 与 privileges 只从 status 为 `EmploymentStatus.Enable` 的未软删除任职聚合。
- 任职明细仍保留每条任职自身的 roles 与 privileges，便于查看该任职关联授权来源。
- 用户详情前端能展示暂停和结束任职的状态、起止时间，并对结束任职保持只读操作体验。
- 为服务层聚合口径补充单元测试。

**Non-Goals:**

- 不改变雇佣关系列表默认筛选逻辑。
- 不改变用户列表搜索逻辑。
- 不改变任职状态机、转岗、离职、软删除或权限模型。
- 不新增数据库表、字段或迁移。

## Decisions

### Decision: 在服务层拆分展示任职与当前授权任职

`getUserDetailByUsernameForAdmin` 应先取得该用户所有未软删除任职作为 `userDto.employments` 的来源，再基于其中 status 为 `EmploymentStatus.Enable` 的任职计算用户级 roles 与 privileges。

替代方案是前端拿到历史任职后自行过滤当前角色权限，但 roles/privileges 是后端返回的聚合字段，聚合口径属于 API 契约，应放在 admin-api 服务层保证一致性。

### Decision: 新增语义明确的 repository 查询方法

保留现有 `getEmploymentsByUserId` 的“正常任职”语义，新增类似 `getAllEmploymentsByUserIdForAdmin` 的方法查询该用户所有 `isDelete=false` 任职。这样可以降低影响面，避免其他依赖 `getEmploymentsByUserId` 的当前授权逻辑被悄悄改变。

替代方案是直接放宽 `getEmploymentsByUserId` 的 status 条件，但该方法名和当前使用方语义已经偏向“当前有效任职”，直接修改容易影响调用者预期。

### Decision: 任职级 roles/privileges 继续按每条任职计算

用户详情中的每条 employment detail 可以继续包含该任职关联的 roles 与 privileges，即使该任职是暂停或结束状态。用户级 roles/privileges 则只聚合正常任职的结果。

这样能同时满足“历史可见”和“当前权限准确”。前端需要避免把任职行内的历史授权误读为当前总权限。

### Decision: 前端以现有状态标签和操作限制承接

`UserDetailDrawer` 已有 `StatusTag`，且对 `status === 3` 的任职不展示操作。实现时补充起止时间列，并确认暂停、结束状态都可见；结束状态保持不可编辑，暂停状态沿用现有可操作规则。

## Risks / Trade-offs

- [Risk] 用户详情返回的 employments 数量可能比以前更多，历史任职多的用户详情响应会变大。→ Mitigation: 该接口是单用户详情查询，先保持无分页；如未来出现性能问题，再为任职 Tab 单独分页。
- [Risk] 用户级 roles/privileges 与任职行内 roles/privileges 的语义不同，管理员可能误解。→ Mitigation: 保持总览字段代表“当前”，任职 Tab 通过状态和起止时间清晰标识历史状态。
- [Risk] 直接修改现有 repository 方法可能影响其他业务。→ Mitigation: 新增 all-status 查询方法，服务层仅在用户详情中使用。
