## 1. 共享审计动作目录

- [x] 1.1 在 `packages/contracts` 新增审计动作目录，定义规范 action、标签、登录 legacy alias 映射和 alias 展开 helper
- [x] 1.2 导出审计动作目录，确保后端和管理端前端都能通过 workspace package 复用
- [x] 1.3 为登录 alias 展开、legacy 到 canonical 映射和 action 选项生成补充单元测试

## 2. 后端登录审计写入

- [x] 2.1 将 `apps/api/src/services/audit/events/auth.audit.ts` 的 password、mobile、local、OA、wechat 登录写入改为规范 action
- [x] 2.2 保留既有 `outcome`、actor、target、request context 和 `details.reason/loginType/clientCode/managementLevel` 语义
- [x] 2.3 更新 `apps/api` 认证与审计事件测试，覆盖成功和失败登录均使用同一规范 action 加不同 outcome

## 3. Admin API 查询兼容

- [x] 3.1 在 `apps/admin-api/src/services/audit` 查询入口对 `conditions.action` 和 `conditions.actions` 做规范 action alias 展开
- [x] 3.2 保持非登录 action 精确筛选语义，并对多个 action 查询去重合并
- [x] 3.3 补充 admin-api 审计查询测试，验证规范登录 action 能查询到规范记录和历史 alias 记录

## 4. 管理端审计展示

- [x] 4.1 将 `apps/admin/src/pages/audit-logs` 的 action 标签和筛选选项改为来自共享审计动作目录
- [x] 4.2 action 筛选项只展示规范 action，并补齐 `admin.client.oidc.*` 标签
- [x] 4.3 历史登录 action 行展示规范动作标签，结果继续由 `outcome` 列展示，明细继续展示原始 action

## 5. 规格一致性与验证

- [x] 5.1 确认本变更不生成修改 `audit_log` 历史数据或表结构的 Drizzle migration
- [x] 5.2 运行 `pnpm --filter @iam/contracts test` 和 `pnpm --filter @iam/contracts typecheck`
- [x] 5.3 运行 `pnpm --filter @iam/api test` 和 `pnpm --filter @iam/api typecheck`
- [x] 5.4 运行 `pnpm --filter @iam/admin-api test` 和 `pnpm --filter @iam/admin-api typecheck`
- [x] 5.5 运行 `pnpm --filter @iam/admin typecheck`
