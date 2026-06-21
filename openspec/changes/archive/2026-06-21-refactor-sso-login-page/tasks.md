## 1. 共享短信倒计时

- [x] 1.1 新增 `apps/sso/src/hooks/useSmsCodeCountdown.ts`，提供 `countdown`、`isCounting`、`startCountdown(seconds?)` 和 `resetCountdown()`，并在重启和卸载时清理旧 timer。
- [x] 1.2 迁移 `apps/sso/src/pages/reset-password/index.tsx` 使用 `useSmsCodeCountdown`，保持原有发送前置条件、按钮文案和返回上一步清零行为。
- [x] 1.3 迁移 `apps/sso/src/pages/user-info/index.tsx` 使用 `useSmsCodeCountdown`，保持原有发送前置条件、按钮文案和 `smsSending` 状态。

## 2. 登录页私有 hook 与组件

- [x] 2.1 新增 `apps/sso/src/pages/login/_hooks/useLoginRedirect.ts`，收敛 `client`、`oidcReturn`、`redirectUrl`、`clientLabel`、`isUnsafeEntry` 和 `redirectAfterLogin()`。
- [x] 2.2 新增 `apps/sso/src/pages/login/_components/PasswordLoginForm.tsx`，承载密码登录字段、忘记密码入口和主提交按钮，并允许父页面传入 `Form` 实例。
- [x] 2.3 新增 `apps/sso/src/pages/login/_components/SmsLoginForm.tsx`，承载手机号、验证码、发送验证码按钮和主提交按钮，并通过回调向父页面传递提交值和发送验证码手机号。
- [x] 2.4 新增 `apps/sso/src/pages/login/_components/UnsafeEntryNotice.tsx`，内聚无 client 安全提示页和 origin 示例链接选择逻辑。

## 3. 登录页重构

- [x] 3.1 精简 `apps/sso/src/pages/login/index.tsx`，保留 `loginType` 初始化、`PWD` / `SMS` / `BMN` 模式切换和三条登录流程编排。
- [x] 3.2 将密码登录、手机登录和手机号补绑流程接入拆出的表单组件，保持 `withHumanVerification` action、错误处理和登录后跳转行为不变。
- [x] 3.3 登录页接入 `useSmsCodeCountdown`，保持手机号校验、`sendMessage` 请求体、`SmsUsage` 和发送按钮 loading/disabled 语义不变。
- [x] 3.4 使用 `UnsafeEntryNotice` 渲染无 client 且无 `oidcReturn` 的安全提示页，正常登录页继续沿用 `index.less` 的现有 className。

## 4. 验证

- [x] 4.1 运行 `pnpm --filter @iam/sso typecheck`，确认 SSO 前端类型检查通过。
- [x] 4.2 运行 `pnpm --filter @iam/sso build`，或在环境无法构建时记录具体阻塞原因。
