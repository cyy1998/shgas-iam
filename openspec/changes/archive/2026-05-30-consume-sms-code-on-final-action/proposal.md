## Why

当前短信验证码只在 Redis 中按 `mobile-code:<usage>:<phone>` 保存并校验，但校验成功后不会消费。这样同一验证码在 TTL 内可以被重复使用，和登录、找回密码、绑定手机号这类一次性安全凭证的预期不一致，也扩大了重放风险。

## What Changes

- 调整短信验证码语义：验证码在最终业务动作成功校验后必须被一次性消费。
- 保留 `/open/code/verify` 作为纯预校验接口，不在该接口上消费验证码，避免破坏现有找回密码流程中的“先验真、后提交”交互。
- 让最终业务动作在校验成功时原子地完成“比对 + 删除”，避免验证码被重复提交。
- **BREAKING** 对依赖短信验证码可重复校验的调用方而言，验证码将不再支持在最终动作上重复使用。

## Capabilities

### New Capabilities
- 无

### Modified Capabilities
- `authentication-sessions`: 手机验证码登录 SHALL 在成功使用后消费验证码，避免同一验证码重复登录。
- `directory-and-self-service`: 找回密码与绑定手机号 SHALL 在最终提交时消费验证码；公开验证码预校验接口 SHALL 继续只读返回校验结果。

## Impact

- 受影响代码主要在 `apps/api/src/services/mobile/`、`apps/api/src/services/session/`、`apps/api/src/services/user/`、`apps/api/src/routes/open/` 和 `apps/api/src/routes/auth/`。
- 相关 OpenAPI 行为会保持接口形状不变，但验证码生命周期语义会改变。
- 需要补充或更新单元测试，覆盖验证码首次使用成功、重复使用失败，以及预校验接口不消费验证码的场景。
