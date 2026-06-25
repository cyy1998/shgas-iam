# SM 加密密码登录发布检查清单

## 必需配置

后端 `apps/api`：

- `IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID` 与 `apps/sso` 使用的公钥匹配。
- `IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON` 包含当前启用的 `kid` 和 SM2 私钥。
- `IAM_API_LOGIN_CREDENTIAL_MAX_SKEW_MS` 设置为可接受的客户端时钟偏移窗口。
- `IAM_API_LOGIN_CREDENTIAL_NONCE_TTL_SECONDS` 至少不短于以秒计的时间戳偏移窗口。

前端 `apps/sso` 构建：

- `UMI_APP_SSO_LOGIN_CREDENTIAL_KID` 与后端私钥条目匹配。
- `UMI_APP_SSO_LOGIN_CREDENTIAL_PUBLIC_KEY` 是与后端私钥配对的 SM2 公钥。

## 同步发布

1. 从同一变更集构建 `apps/api` 和 `apps/sso`。
2. 使用 SM2 私钥映射和 nonce 配置部署 `apps/api`。
3. 部署使用匹配公钥和 `kid` 构建的 `apps/sso`。
4. 对密码登录成功、密码错误、Cap 重试、凭证过期和凭证重复使用执行冒烟测试。
5. 确认 `/auth/login/password` 拒绝 legacy `{ username, password }` 请求。

## 回滚

这是一次破坏性的请求契约变更。必须同时回滚 `apps/api` 和 `apps/sso`。

- 如果只有密钥材料错误，修正环境变量并重新部署或重启受影响的服务。
- 如果前端已经发布加密凭证，只回滚 `apps/api` 会导致密码登录不可用。
- 如果后端已经发布只接受凭证的登录，只回滚 `apps/sso` 会导致密码登录不可用。
