## 1. 数据模型与契约

- [x] 1.1 在 `packages/db/src/schema/core/audit-logs.ts` 新增 `audit_log` Drizzle 表，显式定义 append-only 列、`details jsonb`、Zod select/insert schema 和必要索引。
- [x] 1.2 同步更新 `packages/db/src/schema/core/index.ts`、`packages/db/src/schema/index.ts` 和 schema export typecheck，确保 `audit_log` 可被 workspace 导入。
- [x] 1.3 在 `packages/domain/src/audit` 新增审计 DTO、actor/target/action/outcome schema，并从 `packages/domain/src/index.ts` 导出。
- [x] 1.4 生成并审查 `@iam/db` 迁移文件，确认索引、JSONB 类型和非空约束符合设计。

## 2. 审计写入基础设施

- [x] 2.1 在 `apps/api/src/services/audit` 实现审计 repository/service，支持传入可选 `tx`、写入 `audit_log` 和按事件类型脱敏 `details`。
- [x] 2.2 在 `apps/admin-api/src/services/audit` 实现管理端审计写入入口，复用共享 DTO 并从 Hono context/session/client 中提取 actor 与 request 信息。
- [x] 2.3 实现 actor 规范化 helper，覆盖 `user`、`admin`、`client`、`system`、`anonymous` 五类 actor。
- [x] 2.4 实现敏感字段脱敏 helper，禁止密码、验证码、token、cookie、client secret 明文进入 `details`。
- [x] 2.5 为审计写入、actor 校验和脱敏规则添加单元测试。

## 3. 首批事件接入

- [x] 3.1 将 `apps/api` 现有登录成功写入从 `sessionRepository.loginLog` 切换到 `audit_log`，覆盖密码、手机、OA、微信登录。
- [x] 3.2 为登录失败、验证码发送/校验、公开密码重置、自助改密和绑定手机号补充审计事件。
- [x] 3.3 为 `apps/admin-api` 用户管理 mutation 补充审计事件：创建、更新、状态切换、删除、重置密码。
- [x] 3.4 为 `apps/admin-api` 客户端管理 mutation 补充审计事件：创建、更新、状态切换、删除、client secret 轮换。
- [x] 3.5 为 `apps/admin-api` 组织、岗位、任职管理 mutation 补充审计事件，覆盖任职转岗、设主岗和按用户离职。
- [x] 3.6 为 `apps/api` internal 权限委派、供应商组织注册和供应商联系人注册补充审计事件。
- [x] 3.7 确认 REST 和 tRPC 共用路径不会重复写入同一业务事件。

## 4. 审计查询能力

- [x] 4.1 在 `apps/admin-api` 新增审计日志查询 schema、repository 和 service，支持按 actor、target、action、outcome、时间范围和 requestId 分页查询。
- [x] 4.2 新增 admin REST/tRPC 查询入口，返回脱敏后的审计日志列表 DTO。
- [x] 4.3 为用户详情和任职详情所需的 target 查询场景补充后端测试。

## 5. 管理端页面

- [x] 5.1 在 `apps/admin/src/services/` 新增审计日志 API 封装，复用 admin-api 查询 DTO 并处理分页参数。
- [x] 5.2 在 `apps/admin/src/pages/audit-logs/` 新增审计日志管理页面，提供时间范围、action、outcome、actor、target、requestId 筛选和表格展示。
- [x] 5.3 新增审计日志详情 Drawer，展示结构化字段、脱敏 details、请求上下文和错误摘要。
- [x] 5.4 更新 `apps/admin/.umirc.ts` 路由和菜单，新增“审计日志”入口。
- [x] 5.5 将用户详情 Drawer 的“操作日志” Tab 接入目标用户审计记录查询，替换当前 Empty 占位。
- [x] 5.6 将任职详情 Drawer 的“操作日志” Tab 接入目标任职审计记录查询，替换当前 Empty 占位。
- [x] 5.7 为管理端页面补充必要的 loading、empty、error 和分页状态。

## 6. `login_log` 历史迁移脚本

- [x] 6.1 新增一次性迁移脚本，将 legacy `login_log` 映射为 `audit_log`，保留 `legacyLoginLogId`、`migrationSource`、`loginType` 和原 `loginTime`。
- [x] 6.2 为迁移脚本支持 dry-run、批量大小参数、样例输出、计数校验和重复执行保护。
- [x] 6.3 增加 package script 或文档化执行命令，明确生产运行前必须先执行 dry-run。
- [x] 6.4 为迁移映射和重复执行保护补充测试或可自动验证的脚本检查。

## 7. 验证与收尾

- [x] 7.1 运行 `pnpm --filter @iam/db typecheck` 和相关 `@iam/db` 测试。
- [x] 7.2 运行 `pnpm --filter @iam/api test`、`pnpm --filter @iam/api typecheck`，验证认证、自助和 internal 接入点。
- [x] 7.3 运行 `pnpm --filter @iam/admin-api test`、`pnpm --filter @iam/admin-api typecheck`，验证管理端 mutation 和查询入口。
- [x] 7.4 运行 `pnpm --filter @iam/admin typecheck`，验证审计日志管理页面和详情 Tab 接入。
- [ ] 7.5 使用浏览器 smoke-test 审计日志管理页、用户详情日志 Tab 和任职详情日志 Tab。
- [x] 7.6 执行迁移脚本 dry-run，记录待迁移数量和样例映射结果。
- [x] 7.7 更新相关文档，说明审计日志与普通系统日志的边界、敏感字段禁止项和 `login_log` 退役计划。
