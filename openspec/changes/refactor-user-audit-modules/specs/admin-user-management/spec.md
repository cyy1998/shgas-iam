## ADDED Requirements

### Requirement: Admin User Audit Event Encapsulation
管理端用户 mutation SHALL 继续写入既有 `admin.user.*` 审计事件，并 SHALL 将用户审计事件 payload 拼装从 `user.service.ts` 主体中移入 admin-api 审计事件 helper。

#### Scenario: Admin user create audit remains unchanged
- **WHEN** 管理员成功创建用户
- **THEN** 系统 SHALL 继续写入 `action = "admin.user.create"` 的审计记录
- **AND** 记录 SHALL 包含管理员 actor、目标用户、请求上下文和脱敏后的用户 details
- **AND** 审计 payload SHALL 由 admin user audit helper 构造

#### Scenario: Admin user update and status audit remain unchanged
- **WHEN** 管理员成功更新用户或变更用户状态
- **THEN** 系统 SHALL 继续写入 `admin.user.update` 或 `admin.user.status_update` 审计记录
- **AND** patch 中的手机号 SHALL 使用统一审计脱敏 helper
- **AND** 审计 payload SHALL 由 admin user audit helper 构造

#### Scenario: Admin user delete and reset password audit remain unchanged
- **WHEN** 管理员成功删除用户或重置用户密码
- **THEN** 系统 SHALL 继续写入 `admin.user.delete` 或 `admin.user.reset_password` 审计记录
- **AND** 密码明文和密码 hash MUST NOT 出现在审计 details 中
- **AND** 审计 payload SHALL 由 admin user audit helper 构造
