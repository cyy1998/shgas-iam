## 1. SSO 状态契约收敛

- [x] 1.1 将 `apps/sso/src/types/api.d.ts` 中 `/open/client/status` 响应类型改名为不与 `ClientStatus` 枚举冲突的名称，例如 `ClientStatusResult`
- [x] 1.2 将 SSO client status 响应类型的 `status` 字段改为使用 `@iam/contracts` 导出的 `ClientStatus`
- [x] 1.3 更新 `apps/sso/src/services/open.ts` 的 `clientStatus` 返回类型引用，保持请求路径和参数不变

## 2. SSO 维护页重试修复

- [x] 2.1 在 `apps/sso/src/pages/system-maintenance/index.tsx` 中读取当前 URL 的 `client` 查询参数作为 `clientCode`
- [x] 2.2 移除固定 `clientCode: "tender"`，缺少 `client` 时不调用 `/open/client/status`
- [x] 2.3 使用 `ClientStatus.Maintance` 替代数字 `2` 判断维护状态
- [x] 2.4 缺少 `client` 时留在维护页，并向用户提示缺少应用上下文
- [x] 2.5 当前 client 非维护且存在有效 `redirectUrl` 时，继续跳回解码后的 `redirectUrl`

## 3. Admin 状态契约收敛

- [x] 3.1 将 `apps/admin/src/services/employment.ts` 的 `updateEmploymentStatus` 参数改为使用 `AdminEmploymentInputs['updateStatus']['status']`
- [x] 3.2 在 `apps/admin/src/pages/users/index.tsx` 中使用 `UserStatus` 或 tRPC 推断输入类型替代 `1 | 2 | 3`
- [x] 3.3 在 `apps/admin/src/pages/clients/index.tsx` 中使用 `ClientStatus` 或 tRPC 推断输入类型替代 `1 | 2 | 3`
- [x] 3.4 在 `apps/admin/src/pages/employments/index.tsx` 中使用 `EmploymentStatus` 替代 `1 | 2 | 3`、`3` 和 `[1, 2]`
- [x] 3.5 在 `apps/admin/src/pages/users/components/UserDetailDrawer.tsx` 中使用共享状态枚举或 tRPC 推断输入类型替代用户和雇佣状态的 `1 | 2 | 3`

## 4. 验证

- [x] 4.1 运行 `pnpm --filter @iam/sso typecheck`
- [x] 4.2 运行 `pnpm --filter @iam/admin typecheck`
- [x] 4.3 搜索 `apps/admin/src` 与 `apps/sso/src`，确认本轮目标位置不再存在 `status !== 2`、`status === 3`、`as 1 | 2 | 3`、`status: 1 | 2 | 3`、`clientCode: 'tender'` 或 `clientCode: "tender"`
