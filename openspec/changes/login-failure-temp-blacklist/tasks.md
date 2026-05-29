## 1. 后端登录失败临时黑名单

- [x] 1.1 在 `apps/api/src/routes/auth/login-failure.helper.ts` 中新增用户维度临时黑名单 key、30 分钟 TTL 写入、命中检查和清理函数。
- [x] 1.2 将登录失败结果语义从 `shouldSuspend` 调整为 `shouldBlacklist` 或等价命名，并更新错误文案为“距离临时限制还有 N 次”。
- [x] 1.3 在密码登录流程中，解析用户后先检查临时黑名单，命中时拒绝密码校验和会话创建。
- [x] 1.4 在登录用途手机验证码登录流程中，能解析到 active user 时先检查临时黑名单，命中时拒绝验证码校验和会话创建。
- [x] 1.5 达到第 5 次失败时写入 Redis 30 分钟临时黑名单，不再调用 `userService.pauseEnabledUser`。
- [x] 1.6 登录成功后同时清理失败计数和临时黑名单标记。

## 2. 前端密码错误强提示

- [x] 2.1 为 SSO 密码登录请求增加局部错误处理能力，避免默认 toast 与强提示重复展示。
- [x] 2.2 在 `apps/sso/src/pages/login/index.tsx` 中对密码登录失败展示需要手动确认的强提示弹窗。
- [x] 2.3 强提示内容使用后端返回的错误 message，确保包含剩余次数或 30 分钟临时限制说明。
- [x] 2.4 保持手机验证码登录、绑定手机号、Cap 求解失败等其他错误提示交互不变。

## 3. 测试与验证

- [x] 3.1 更新 `apps/api/src/routes/auth/__tests__/auth.service.test.ts` 的 fake Redis，覆盖普通失败、达到阈值写入黑名单、黑名单命中拒绝、成功登录清理和不再暂停用户。
- [x] 3.2 补充或更新 SSO 登录页前端测试；如当前缺少测试框架，至少完成 `@iam/sso` typecheck 并记录未自动化覆盖原因。
- [x] 3.3 运行 `pnpm --filter @iam/api test` 验证后端认证服务测试。
- [x] 3.4 运行 `pnpm --filter @iam/api typecheck` 和 `pnpm --filter @iam/sso typecheck` 验证受影响包类型。
