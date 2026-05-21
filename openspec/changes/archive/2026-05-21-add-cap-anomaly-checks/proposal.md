## Why

当前公开认证入口会在未登录或弱身份状态下处理短信发送、密码登录、手机验证码登录和用户名脱敏信息查询。它们容易被自动化请求用于刷短信、撞库、验证码暴力尝试或用户枚举，需要引入 cap.js 作为异常场景下的人机校验层，降低攻击成本并保护正常登录体验。

## What Changes

- 为 IAM 引入 cap.js 人机挑战能力，用于在高风险或高成本公开认证动作前校验请求是否来自真实用户。
- `/open/code/send` 发送短信验证码前 SHALL 强制要求有效 Cap token。
- `/auth/login/password` 密码登录在触发异常条件时 SHALL 要求有效 Cap token，正常低风险登录不增加额外摩擦。
- `/auth/login/mobile` 手机验证码登录在触发异常条件时 SHALL 要求有效 Cap token，降低短信码暴力猜测风险。
- `/open/users/userInfo` 脱敏用户信息查询在触发异常条件时 SHALL 要求有效 Cap token，降低批量账号枚举风险。
- Cap 校验失败或缺失时，API SHALL 返回可被前端识别的业务错误，前端 SHALL 展示或触发 cap.js 校验后重试原请求。
- 不改变现有短信验证码、密码校验、登录失败计数、账号暂停、SSO session 创建和用户脱敏返回格式的核心语义。

## Capabilities

### New Capabilities

- `human-verification`: 定义 cap.js 人机挑战、token 校验、异常触发策略和前端重试协作行为。

### Modified Capabilities

- `authentication-sessions`: 修改密码登录和手机验证码登录的要求，在异常条件下增加 Cap token 校验。
- `directory-and-self-service`: 修改公开短信验证码发送和公开脱敏用户信息查询的要求，在指定条件下增加 Cap token 校验。

## Impact

- 影响后端 `apps/api` 的 open/auth route schema、handler、service 与 Redis 风控状态。
- 影响前端 `apps/sso` 的登录页、忘记密码页和用户中心绑定手机流程。
- 新增 cap.js 相关依赖，并在 `apps/api` 内嵌 Cap challenge/redeem 服务。
- 可能新增环境变量用于 Cap site key、secret、TTL、异常阈值和功能开关。
- 需要补充 Bun 单元测试覆盖 Cap token 校验、异常触发、失败响应和未触发时的兼容路径。
