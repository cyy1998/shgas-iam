## 为什么

用户密码、手机号绑定、账号状态和管理端用户生命周期是 IAM 认证与账号治理的核心规则。当前相关服务层单元测试不足，密码强度、验证码、事务写入、账号暂停、删除约束和详情聚合等规则缺少快速回归保护。

## 变更内容

- 为 `apps/api/src/services/user/user.service.ts` 新增聚焦的 Bun 单元测试，覆盖自助改密、找回密码、密码校验、绑定手机号、暂停账号和带权限委托的用户搜索。
- 为 `apps/admin-api/src/services/user/user.service.ts` 新增聚焦的 Bun 单元测试，覆盖管理端创建、更新、状态变更、删除、重置密码、分页搜索和详情聚合。
- 使用 `mock.module` 隔离 repository、`mobileService`、`@iam/db` transaction、`bcrypt-ts` 的 `hash` / `compare`、`generateRandomPassword` 等依赖。
- 不连接真实数据库、Redis、短信服务、bcrypt 计算或网络，测试重点放在业务分支、错误消息、repository 调用参数、DTO 映射和事务行为。
- 本次变更不修改业务实现逻辑；如果测试揭示明确现有 bug，先在任务中记录风险和待确认点，再由后续变更决定是否修复。

## 能力范围

### 新增能力

- 无。

### 修改能力

- `directory-and-self-service`: 为 public API 用户自助密码、手机号和目录用户搜索行为补充服务层验证覆盖要求。
- `authentication-sessions`: 为用户密码校验和账号暂停相关服务行为补充验证覆盖要求。
- `privilege-delegation`: 为用户搜索附带权限委托的查询约束和 DTO 映射补充验证覆盖要求。
- `admin-user-management`: 为管理端用户创建、更新、状态、删除、密码重置、搜索分页和详情聚合补充验证覆盖要求。

## 影响范围

- 受影响代码：`apps/api/src/services/user/__tests__/user.service.test.ts`、`apps/admin-api/src/services/user/__tests__/user.service.test.ts`。
- 参考代码：`apps/api/src/services/user/user.service.ts`、`apps/admin-api/src/services/user/user.service.ts`，以及被 mock 的 repository、mobile、DB、bcrypt 和密码生成模块。
- 验证命令：`bun test apps/api/src/services/user/__tests__/user.service.test.ts`、`bun test apps/admin-api/src/services/user/__tests__/user.service.test.ts` 和全量 `bun test`。
- 预期不涉及数据库 schema、migration、REST/tRPC contract、frontend、Redis、短信服务或网络变更。
- 已知风险：public API `resetPassword` 当前会哈希并保存新密码，但没有复用 `setPassword` 的密码强度校验；本 change 应通过测试锁定当前行为并在实现前确认是否后续单独修复。
