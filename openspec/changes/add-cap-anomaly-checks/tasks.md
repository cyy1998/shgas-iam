## 1. 后端 Cap 基础设施

- [x] 1.1 为 `apps/api` 增加 cap.js 相关依赖和环境变量校验，包括启用开关、site key、secret、异常阈值和 TTL。
- [x] 1.2 在 `packages/contracts` 中新增可被前端稳定识别的人机校验业务码，并同步前端类型使用。
- [x] 1.3 新增 `apps/api` 人机校验服务模块，封装 Cap token 校验、action 绑定、一次性消费和关闭开关行为。
- [x] 1.4 新增 `apps/api` 风险判定服务模块，基于 Redis 维护 action、subject、IP 和 Client header 的短窗口异常状态。
- [x] 1.5 新增内嵌 Cap challenge/redeem 路由并接入现有 Hono app。

## 2. 后端业务入口接入

- [x] 2.1 为 `/open/code/send` request schema 增加可选 `capToken` 字段，并在发送短信前强制校验 `sendSmsCode` Cap token。
- [x] 2.2 为 `/auth/login/password` request schema 增加可选 `capToken` 字段，并在 `passwordLogin` 异常触发时要求有效 Cap token。
- [x] 2.3 为 `/auth/login/mobile` request schema 增加可选 `capToken` 字段，并在 `mobileLogin` 异常触发时要求有效 Cap token。
- [x] 2.4 为 `/open/users/userInfo` request 增加 Cap token 传递方式，并在 `openUserInfoLookup` 异常触发时要求有效 Cap token。
- [x] 2.5 在密码登录失败、手机验证码登录失败和脱敏用户信息查询时更新对应风险状态，同时保持既有登录失败计数和账号暂停行为。
- [x] 2.6 统一用户中心绑定手机发送验证码链路，确认并修正 `selfMobileSendMsg` 当前调用的 `/open/sendMessage` 与后端实际 `/open/code/send` 不一致问题。

## 3. SSO 前端接入

- [x] 3.1 为 `apps/sso` 增加 cap.js 前端依赖或 custom element 加载方式，并配置 Cap endpoint/site key。
- [x] 3.2 封装通用 Cap 求解与请求重试 helper，识别人机校验业务码后执行 `solve -> retry once`。
- [x] 3.3 在登录页短信发送、密码登录和手机验证码登录流程中接入 Cap helper，并处理按钮 loading 与重复提交。
- [x] 3.4 在忘记密码页的脱敏用户查询和短信发送流程中接入 Cap helper。
- [x] 3.5 在用户中心绑定手机号发送验证码流程中接入统一短信发送与 Cap helper。

## 4. 测试与验证

- [x] 4.1 为后端人机校验服务添加 Bun 单元测试，覆盖 token 有效、缺失、无效、过期、已消费、action 不匹配和关闭开关。
- [x] 4.2 为后端风险判定服务添加 Bun 单元测试，覆盖四个 action 的阈值触发和未触发路径。
- [x] 4.3 为 `/open/code/send` 添加测试，验证缺少 Cap 时不调用短信客户端，Cap 有效时保持原发送行为。
- [x] 4.4 为 `/auth/login/password` 和 `/auth/login/mobile` 添加测试，验证异常触发时要求 Cap，Cap 通过后保持既有成功、失败计数和账号暂停行为。
- [x] 4.5 为 `/open/users/userInfo` 添加测试，验证异常触发时要求 Cap，Cap 通过后返回原脱敏结果。
- [x] 4.6 运行 `pnpm --filter @iam/api typecheck`、`pnpm --filter @iam/sso typecheck`，并按影响范围运行相关测试或 lint。

## 5. 部署与回滚检查

- [x] 5.1 更新 `.env.example`、部署文档或 compose 配置，说明内嵌 Cap 服务相关环境变量。
- [x] 5.2 确认生产网关能提供可信 IP 信息；若不能，风险判定 SHALL 退化为 Client header 和 subject 维度。
- [x] 5.3 上线前以宽松阈值启用日志观察，并记录 Cap 触发、校验失败和短信拦截事件。
- [x] 5.4 准备回滚方式：关闭 `CAP_ENABLED` 或调高异常阈值，确保不需要回滚数据库迁移。
