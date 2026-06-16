## MODIFIED Requirements

### Requirement: OIDC 管理操作记录独立审计
系统 SHALL 对 OIDC 配置操作记录专用 client 审计事件，并 SHALL 使用统一审计动作目录中的规范 action 名称。

#### Scenario: 记录 OIDC 配置事件
- **WHEN** 管理员配置、启用、禁用、移除或轮换 OIDC secret
- **THEN** 系统 SHALL 分别记录 `admin.client.oidc.configure`、`admin.client.oidc.enable`、`admin.client.oidc.disable`、`admin.client.oidc.remove` 或 `admin.client.oidc.rotate_secret`
- **AND** 记录 SHALL 使用 `outcome = "success"` 表达操作成功
- **AND** MAY 记录完整 redirect URI、clientType、allowedScopes、配置版本和状态变化
- **AND** SHALL NOT 记录 secret 明文或摘要
