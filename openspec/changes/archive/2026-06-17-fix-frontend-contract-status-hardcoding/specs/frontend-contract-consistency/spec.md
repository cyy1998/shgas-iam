## ADDED Requirements

### Requirement: 前端复用已有共享状态契约

当 `@iam/contracts` 已经提供业务状态枚举时，前端 SHALL 复用该共享契约表达状态语义，避免用魔法数字、裸 `number` 或重复的数字 union 作为权威状态定义。

#### Scenario: SSO client status 类型复用 ClientStatus

- **WHEN** `apps/sso` 定义 `/open/client/status` 响应中 client status 的前端类型
- **THEN** `status` 字段 SHALL 使用 `@iam/contracts` 导出的 `ClientStatus`
- **AND** SSO 前端 SHALL 使用 `ClientStatus.Maintance` 判断维护状态
- **AND** SSO 前端 SHALL NOT 使用裸 `number` 或数字字面量 `2` 表达 client 维护状态

#### Scenario: Admin user status 操作复用 UserStatus

- **WHEN** `apps/admin` 用户管理页面执行用户状态变更或按用户状态搜索
- **THEN** 前端 SHALL 使用 `@iam/contracts` 导出的 `UserStatus` 或 admin tRPC 推断输入类型表达状态值
- **AND** 前端 SHALL NOT 使用 `1 | 2 | 3` 作为用户状态契约

#### Scenario: Admin client status 操作复用 ClientStatus

- **WHEN** `apps/admin` 应用管理页面执行 client 状态变更或按 client 状态搜索
- **THEN** 前端 SHALL 使用 `@iam/contracts` 导出的 `ClientStatus` 或 admin tRPC 推断输入类型表达状态值
- **AND** 前端 SHALL NOT 使用 `1 | 2 | 3` 作为 client 状态契约

#### Scenario: Admin employment status 操作复用 EmploymentStatus

- **WHEN** `apps/admin` 雇佣关系页面执行雇佣状态变更、按雇佣状态搜索或判断结束状态
- **THEN** 前端 SHALL 使用 `@iam/contracts` 导出的 `EmploymentStatus` 或 admin tRPC 推断输入类型表达状态值
- **AND** 前端 SHALL 使用 `EmploymentStatus.Disable` 表达结束状态
- **AND** 前端 SHALL 使用 `EmploymentStatus.Enable` 与 `EmploymentStatus.Pause` 表达默认活跃状态集合
- **AND** 前端 SHALL NOT 使用 `1 | 2 | 3`、`3` 或 `[1, 2]` 作为雇佣状态契约
