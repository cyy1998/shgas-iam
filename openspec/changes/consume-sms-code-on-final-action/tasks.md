## 1. 提取短信验证码消费能力

- [x] 1.1 在 `apps/api/src/services/mobile/mobile.service.ts` 中新增原子消费函数，支持按 `usage + phone + code` 完成读取和删除
- [x] 1.2 保留现有只读校验函数用于 `/open/code/verify`，并明确区分“预校验”和“最终消费”两类语义
- [x] 1.3 收敛 `apps/api/src/services/session/session.service.ts` 中重复的验证码校验逻辑，改为复用 mobile service 的统一实现

## 2. 接入最终业务动作

- [x] 2.1 调整 `apps/api/src/routes/auth/auth.service.ts` 中手机验证码登录流程，在创建 session 前消费登录用途验证码
- [x] 2.2 调整 `apps/api/src/services/user/user.service.ts` 中找回密码流程，在保存新密码前消费 resetPassword 用途验证码
- [x] 2.3 调整 `apps/api/src/services/user/user-mobile-binding.helper.ts` 中绑定手机号流程，在更新手机号前消费 bindPhone 用途验证码
- [x] 2.4 确认 `apps/api/src/routes/open/open.handlers.ts` 的 `/open/code/verify` 仍然只做只读校验，不消费验证码

## 3. 补充和更新测试

- [x] 3.1 为 `mobile.service.ts` 增加消费成功、重复消费失败和只读校验不删除 key 的单元测试
- [x] 3.2 更新手机验证码登录相关测试，验证同一验证码无法重复登录
- [x] 3.3 更新找回密码和绑定手机号测试，验证最终提交后验证码失效
- [x] 3.4 更新 `/open/code/verify` 相关测试，验证该接口不会消费验证码

## 4. 回归验证

- [x] 4.1 运行 `@iam/api` 相关单元测试，覆盖 auth、user、mobile 和 open 相关用例
- [x] 4.2 复查改动后的接口语义，确认前端找回密码两步流程不受影响
