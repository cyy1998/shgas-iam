## Why

当前系统只有临时的 `login_log` 表记录部分登录成功事件，无法覆盖管理员 mutation、权限委派、密码/手机号变更、验证码和 client secret 轮换等安全敏感操作。安全整改文档已经要求所有 P0/P1 敏感操作可审计，且前端用户/任职详情页已预留“操作日志”入口，因此需要建立统一的审计日志能力。

## What Changes

- 新增通用 `audit_log` 存储模型，用结构化字段保存 actor、target、action、outcome、request/source 上下文，用 `details jsonb` 保存事件差异化详情。
- 定义审计事件命名、actor/target 语义、敏感字段脱敏规则和 append-only 写入约束。
- 新增后端审计日志写入服务，支持 `apps/api` 与 `apps/admin-api` 在业务事务成功后记录审计事件。
- 将现有登录日志写入迁移到通用审计日志事件，并提供 `login_log` 历史数据迁移脚本。
- 为管理员 mutation、认证/会话、验证码、用户自助变更、internal 权限委派和供应商注册类变更建立首批审计覆盖范围。
- 提供审计日志查询能力，并在 `apps/admin` 实现审计日志管理页面。
- 接入用户详情和任职详情中的“操作日志” Tab，展示目标对象相关审计记录。

## Capabilities

### New Capabilities

- `audit-logging`: 统一审计日志模型、事件写入、查询、管理端页面和 `login_log` 历史迁移。

### Modified Capabilities

- 无。

## Impact

- 影响 `packages/db`：新增 Drizzle schema、关系/导出、迁移和索引设计。
- 影响 `apps/api`：登录、验证码、密码重置、自助改密/绑手机、SSO/OA/微信登录、internal 权限委派、供应商组织/联系人注册等审计写入。
- 影响 `apps/admin-api`：用户、组织、岗位、任职、客户端管理 mutation 审计写入。
- 影响 `apps/admin`：新增审计日志管理页面，更新路由/菜单和服务封装，并接入用户详情、任职详情“操作日志” Tab。
- 影响运维流程：新增 `login_log` 到 `audit_log` 的一次性迁移脚本和迁移验证步骤。
