## Why

两个前端中仍存在状态值魔法数字和局部类型重复定义，导致页面行为与 `@iam/contracts` 中已经存在的状态枚举可能漂移。SSO 维护页还固定检查 `tender` client，实际应围绕当前登录请求的目标 client 判断维护状态。

## What Changes

- 收敛 `apps/sso` 对 client status 的本地类型定义，使其复用 `@iam/contracts` 的 `ClientStatus`。
- 将 SSO 维护页从固定 `clientCode: "tender"` 改为读取当前 URL 中的 `client` 查询参数。
- 将 SSO 维护页的 `status !== 2` 判断改为使用 `ClientStatus.Maintance`。
- 收敛 `apps/admin` 中 user、employment、client 状态处理逻辑，移除 `1 | 2 | 3` 状态类型和魔法数字判断，改用共享状态枚举或 tRPC 推断输入类型。
- 不新增共享契约，不重命名既有 `ClientStatus.Maintance`，不处理登录页固定域名、Grafana、部署 base path、dev proxy 或默认 endpoint 等其他硬编码问题。

## Capabilities

### New Capabilities

- `frontend-contract-consistency`: 描述前端在已有共享契约存在时如何复用 `@iam/contracts`，避免重复定义状态枚举和使用魔法数字。

### Modified Capabilities

- `sso-login-experience`: 明确 SSO 维护页刷新重试必须使用当前登录请求的目标 client，并以共享 `ClientStatus.Maintance` 判断维护状态。

## Impact

- Affected code: `apps/sso/src/types/api.d.ts`, `apps/sso/src/services/open.ts`, `apps/sso/src/pages/system-maintenance/index.tsx`, `apps/admin/src/services/employment.ts`, `apps/admin/src/pages/users/index.tsx`, `apps/admin/src/pages/clients/index.tsx`, `apps/admin/src/pages/employments/index.tsx`, `apps/admin/src/pages/users/components/UserDetailDrawer.tsx`。
- APIs: 不改变 REST 或 tRPC 接口形状；前端继续调用现有 `/open/client/status` 和 admin tRPC 状态更新/搜索接口。
- Dependencies: 继续使用现有 `@iam/contracts`，不新增 package dependency。
- Systems: 影响 `@iam/sso` 维护页重试行为和 `@iam/admin` 状态筛选/状态变更的前端类型一致性。
