## Why

SSO 登录页目前集中承载登录模式状态、URL query、密码登录、手机登录、手机号补绑、短信验证码倒计时、人机校验、登录跳转和无 client 安全提示 UI，后续新增认证方式时容易继续膨胀。短信倒计时逻辑也已在登录、重置密码和个人信息页面重复实现，需要在不改变用户可见行为的前提下统一生命周期管理。

## What Changes

- 主动拆分 SSO 登录页，将密码登录表单、手机验证码表单和无 client 安全提示页拆为登录页私有组件。
- 将登录页的 `client` / `oidcReturn` / `redirectUrl` 解析、应用标签、无安全上下文判断和登录后跳转收敛到登录页私有 hook。
- 新增 SSO 前端共享短信验证码倒计时 hook，并迁移登录页、重置密码页和个人信息页使用统一倒计时生命周期。
- 保持现有登录语义不变：`loginType` 只初始化登录模式，tab 切换不回写 URL；密码登录、手机登录、手机号补绑、人机校验、错误展示和登录后跳转行为保持现状。
- 不新增认证能力，不修改 API 合约，不改变短信发送请求、人机校验 action 或后端行为。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `sso-login-experience`: 明确 SSO 登录页在结构拆分后仍需保持现有登录模式、无安全上下文提示、OIDC/custom SSO 回跳和短信验证码倒计时体验。

## Impact

- 影响 `apps/sso/src/pages/login/index.tsx` 及其新增私有组件和 hook。
- 影响 `apps/sso/src/pages/reset-password/index.tsx` 与 `apps/sso/src/pages/user-info/index.tsx` 的短信验证码倒计时实现。
- 新增 `apps/sso/src/hooks/useSmsCodeCountdown.ts` 作为 SSO 前端共享 hook。
- 预计验证命令为 `pnpm --filter @iam/sso typecheck`，必要时补充 `pnpm --filter @iam/sso build`。
