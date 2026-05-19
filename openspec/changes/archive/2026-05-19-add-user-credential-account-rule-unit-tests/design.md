## 背景

`apps/api/src/services/user/user.service.ts` 和 `apps/admin-api/src/services/user/user.service.ts` 承载用户密码、手机号、账号状态、权限委托查询和管理端用户生命周期规则。现有测试主要覆盖认证失败计数和少量 admin service 分支，用户服务缺少对错误消息、repository 调用参数、事务上下文、DTO 映射和密码相关依赖的快速回归验证。

最接近的现有测试模式是 `apps/api/src/routes/auth/__tests__/auth.service.test.ts` 与 `apps/admin-api/src/services/position/__tests__/position.service.test.ts`：它们使用 `bun:test`、`mock.module`，在导入被测模块前安装 mock，并通过 mock 依赖保持测试不触碰真实外部系统。

## 目标 / 非目标

**目标：**

- 为 public API 用户服务补充 `setPassword`、`resetPassword`、`checkPassword`、`setMobile`、`pauseEnabledUser`、`searchUsersWithPrivilegeDelegation` 的单元测试。
- 为 admin API 用户管理服务补充 `setUserForAdmin`、`updateUser`、`updateUserStatus`、`deleteUser`、`resetPasswordByUsername`、`searchUsersFuzzyForAdmin`、`getUserDetailByUsernameForAdmin` 的单元测试。
- Mock `@iam/db`，使 `db.transaction` callback 使用同一个稳定 `tx` 对象执行，并断言事务内 repository 调用收到该对象。
- Mock repository、`mobileService`、`bcrypt-ts` 的 `hash` / `compare`、`generateRandomPassword` 等依赖，让测试确定、快速、无网络和无真实 DB。
- 覆盖错误消息、密码强度分支、验证码分支、手机号校验顺序、账号暂停透传、分页 pages 计算、角色权限去重和详情聚合映射。

**非目标：**

- 不修改业务实现逻辑、schema、migration、REST/tRPC contract、frontend、Redis、短信服务或网络行为。
- 不引入新的测试框架或测试运行器；本次只使用 Bun + `bun:test`。
- 不把 service 单元测试扩展成 repository 集成测试或端到端 API 测试。
- 不在本 change 中修复 `resetPassword` 密码强度校验等潜在业务问题，除非后续确认需要单独调整实现。

## 决策

- 使用 `bun:test` 与 `mock.module`，并在所有 mock 注册之后再动态 import 被测 service。
  - 理由：这与现有测试风格一致，能让 ESM import alias 被稳定替换。
  - 备选方案：重构 service 为显式依赖注入。拒绝原因：本次范围只补测试，重构 wiring 会扩大行为变更风险。

- 将 `@iam/db` transaction mock 为 `callback(tx)`，`tx` 使用命名稳定对象。
  - 理由：两个 user service 都依赖事务内 repository 调用；稳定对象能验证 transaction callback 被执行，且写操作使用同一事务上下文。
  - 备选方案：只断言 transaction 被调用。拒绝原因：无法证明 repository 调用确实拿到了事务对象。

- 对 `bcrypt-ts` 的 `hash` / `compare` 和 `generateRandomPassword` 使用确定性 mock。
  - 理由：避免真实 bcrypt 计算耗时和随机密码导致测试不稳定，同时可以断言 `PASSWORD_HASH_ROUNDS` 传参。
  - 备选方案：使用真实 bcrypt。拒绝原因：单元测试只需验证服务编排，不需要覆盖第三方库行为。

- 使用最小但 schema-compatible 的 fixture。
  - 理由：`UserDtoSchema`、`UserDetailDtoSchema`、`EmploymentDetailDtoSchema` 和权限委托 DTO 映射会解析对象；fixture 需要包含被 schema 读取的字段，但不应引入无关噪声。
  - 备选方案：完全 mock 掉 schema parse。拒绝原因：本次需要锁定 DTO 映射正确性，尤其是 search/detail 聚合结果。

- 将调用顺序作为 `setMobile` 的显式测试目标。
  - 理由：手机号格式、重复检查、验证码检查、写入手机号的顺序会影响外部依赖调用和错误暴露。
  - 备选方案：只断言最终错误。拒绝原因：无法捕捉验证码在无效手机号或重复手机号情况下被提前调用的回归。

- 对 `resetPassword` 当前不执行密码强度校验的行为使用测试记录现状，并在任务中标注风险。
  - 理由：用户明确要求“如果当前代码未校验，标记为潜在风险而不是直接改实现”。测试应避免偷偷改变运行时语义。
  - 备选方案：直接让测试期望弱密码被拒绝并修改实现。拒绝原因：这会超出“只补测试”的范围。

## 风险 / 取舍

- Mock module 路径和 service import specifier 不一致 -> 按实际 import 路径设置 mock，并通过聚焦 `bun test` 验证。
- DTO fixture 缺字段导致 schema parse 失败 -> 先让 fixture 满足现有 schema，并保持字段最小化，避免测试变成完整 DB fixture 维护。
- 测试固化当前安全存疑行为，例如 `resetPassword` 不校验新密码强度 -> 在测试名称和任务中明确这是现状锁定与待确认风险，不把它表达成目标安全态。
- 全量 `bun test` 可能暴露仓库既有失败 -> 记录失败范围和输出摘要，保持本 change 聚焦新增 user service 单元测试。
- 单元测试无法发现 repository SQL 或 Drizzle schema 问题 -> 本次覆盖 service 业务编排，repository 集成测试不在范围内。

## 待确认问题

- public API `resetPassword` 是否应复用 `setPassword` 的密码强度规则；当前实现未校验，本 change 先不改变实现。
- `checkPassword` 在非 production 且用户无密码时允许 `DEFAULT_USER_PASSWORD` 是否仍是目标行为；本 change 按当前实现补测试。
- 管理端详情聚合只按 employment 查 roles，再按 role ids 查 privileges；是否需要额外覆盖组织/岗位直接角色来源由现有 service 行为决定，本 change 不新增业务语义。
