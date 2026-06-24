## Context

`apps/sso/src/pages/login/index.tsx` 当前由单个 `LoginPage` 同时处理登录模式、URL query、密码登录、手机登录、手机号补绑、短信验证码倒计时、人机校验、登录后跳转和无 client 安全提示 UI。页面仍可阅读，但多个流程共享表单、验证码、人机校验和 redirect，继续新增认证方式时容易扩大单文件复杂度。

SSO 前端还在 `login`、`reset-password`、`user-info` 三个页面各自维护短信验证码倒计时定时器，生命周期逻辑重复。该变更应主动拆分登录页并统一倒计时实现，但不改变用户可见行为、API 合约或后端认证语义。

## Goals / Non-Goals

**Goals:**

- 降低 `apps/sso/src/pages/login/index.tsx` 的 UI 和副作用密度，让登录页保留清晰的流程编排。
- 将短信验证码倒计时生命周期抽成 SSO 前端共享 hook，并迁移三处现有页面使用。
- 保持密码登录、手机登录、手机号补绑、OIDC/custom SSO 回跳、无 client 安全提示、人机校验和错误展示行为不变。
- 保持现有登录页样式命名和视觉表现，避免无意义样式搬运。

**Non-Goals:**

- 不新增认证方式。
- 不修改后端 API、请求路径、请求体、`HumanVerificationAction` 或 `SmsUsage`。
- 不统一具体短信发送业务逻辑；各页面继续自行处理手机号校验、发送前置条件和使用的服务函数。
- 不拆分 `apps/sso/src/pages/login/index.less`。
- 不新增前端单元测试体系。

## Decisions

### 登录页私有结构

在 `apps/sso/src/pages/login/` 下新增私有目录：

- `_components/PasswordLoginForm.tsx`
- `_components/SmsLoginForm.tsx`
- `_components/UnsafeEntryNotice.tsx`
- `_hooks/useLoginRedirect.ts`

这些文件只服务登录页，避免把登录页专用语义扩散到全局目录。现有 `index.less` 保持为登录页整体样式入口，拆出的组件沿用现有 className。

替代方案是把所有组件放到 `apps/sso/src/components/`，但这些组件包含登录页文案、布局和跳转语义，暂不具备跨页面复用价值。

### 共享短信倒计时 hook

新增 `apps/sso/src/hooks/useSmsCodeCountdown.ts`，只负责倒计时生命周期：

- `countdown`
- `isCounting`
- `startCountdown(seconds?)`
- `resetCountdown()`

`startCountdown()` 在启动前清理旧 timer，支持倒计时未结束时重新开始；组件卸载时自动清理 timer。hook 不负责按钮文案、不调用短信发送接口，也不处理手机号校验或人机校验。

替代方案是提供 `useSendSmsCode` 同时封装发送请求和倒计时，但三处页面的发送条件不同：登录页校验手机号格式，重置密码页需要判断“暂未绑定手机号”，个人信息页使用 `selfMobileSendMsg`。统一发送业务会把页面差异隐藏到 hook 内，降低可读性。

### 登录 redirect hook

`useLoginRedirect` 负责登录页的查询参数和跳转上下文：

- 读取 `client`、`oidcReturn`、`redirectUrl`。
- 计算 `clientLabel`。
- 暴露 `isUnsafeEntry`。
- 暴露 `redirectAfterLogin()`，保持 OIDC resume 和 custom SSO authorize 跳转逻辑。

该 hook 先保持登录页私有，因为 `oidcReturn` 的格式检查、无 client 判断和 resume endpoint 都是登录页专用行为。

### 表单组件边界

`PasswordLoginForm` 和 `SmsLoginForm` 做偏哑组件，只负责表单 UI、字段校验、提交事件和按钮 loading/countdown 展示。登录接口调用、人机校验、手机号补绑模式切换和登录后跳转继续留在 `LoginPage` 中，确保三条登录流程在父页面仍然可见。

主提交按钮下沉到表单组件，使用 Ant Design 的原生 submit 流程。父页面不再通过统一 `handleSubmit()` 手动分发 `validateFields()`。

密码表单由父页面保留 `Form.useForm()`，用于“忘记密码”时读取 username 并带入 `/reset-password` query。短信表单由 `SmsLoginForm` 内部管理，父页面通过回调接收提交值和发送验证码时的手机号。`BMN` 通过 `key={mode}` 切换重置短信表单。

### BMN 与安全提示

`BMN` 继续复用 `SmsLoginForm`，通过 props 控制提交文案、按钮图标和发送验证码回调。`BMN` 的说明提示和“跳过”按钮保留在父页面。

`UnsafeEntryNotice` 内聚无 client 安全提示页和基于 `window.location.origin` 的示例链接选择。父页面只根据 `isUnsafeEntry` 决定是否渲染该组件。

### 行为保持

- `loginType=SMS/PWD` 只用于初始化登录模式，用户切换 tab 不回写 URL。
- `BMN` 是流程内状态，不写入 URL。
- 密码登录、手机登录、手机号补绑的错误处理策略保持现状。
- `withHumanVerification` 调用时机和 action 保持现状。
- 三个页面迁移倒计时 hook 后保留各自按钮文案和 loading 状态。

## Risks / Trade-offs

- [Risk] 倒计时 hook 迁移可能改变按钮文案或 disabled 条件。→ Mitigation：hook 只返回状态，按钮文案和 disabled 逻辑继续留在各页面，迁移时逐页对照原逻辑。
- [Risk] 短信表单内聚后父页面不再直接持有 `smsForm`，可能影响 `BMN` 进入时重置字段。→ Mitigation：使用 `key={mode}` 在 `SMS` 与 `BMN` 切换时重建短信表单。
- [Risk] redirect 逻辑抽到 hook 后副作用入口变隐蔽。→ Mitigation：hook 只暴露命名清晰的 `redirectAfterLogin()`，父页面仍显式在成功分支调用。
- [Risk] 不新增组件测试可能漏掉交互细节。→ Mitigation：至少运行 `pnpm --filter @iam/sso typecheck`，必要时运行 `pnpm --filter @iam/sso build`，并在实现阶段进行登录页关键路径 smoke check。

## Migration Plan

1. 新增共享倒计时 hook，并迁移 `login`、`reset-password`、`user-info` 三处倒计时逻辑。
2. 新增登录页私有 hook 和组件。
3. 精简 `apps/sso/src/pages/login/index.tsx`，保留登录流程编排与模式切换。
4. 运行 SSO 前端类型检查，必要时运行构建验证。

回滚策略为还原本次前端文件变更；该变更不包含数据迁移、配置迁移或 API 合约变更。

## Open Questions

- 无。
