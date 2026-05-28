## 1. 协议与配置

- [x] 1.1 确认 `sm-crypto` 在 Bun 后端和 Umi Max 前端的 SM2、SM4、SM3 API 用法，并固化密钥、IV、明文、envelope 和 tag 的测试向量
- [x] 1.2 在 `apps/api/src/env.ts` 增加 `LOGIN_CREDENTIAL_ACTIVE_KID`、`LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON`、`LOGIN_CREDENTIAL_MAX_SKEW_MS` 和 `LOGIN_CREDENTIAL_NONCE_TTL_SECONDS` 配置校验
- [x] 1.3 在 `apps/sso/src/types/env.d.ts` 和配置常量中增加 `UMI_APP_LOGIN_CREDENTIAL_KID`、`UMI_APP_LOGIN_CREDENTIAL_PUBLIC_KEY` 和 `UMI_APP_LOGIN_CREDENTIAL_ALG`
- [x] 1.4 决定并记录 SM2 key material、SM4 key、MAC key、IV、tag 和 base64url 的编码细节，确保前后端完全一致

## 2. 后端加密凭证解析

- [x] 2.1 在 `apps/api/src/routes/auth/` 下新增登录凭证 schema、envelope 解析、base64url 编解码和统一错误处理工具
- [x] 2.2 实现根据 `kid` 从配置私钥集合选择 SM2 私钥，并拒绝未知 `kid` 或不支持算法
- [x] 2.3 实现 SM2 解密 key material、tag 完整性校验和 SM4 解密登录凭证明文 JSON
- [x] 2.4 实现登录凭证明文 Zod 校验，要求 `v=1`、`typ=password-login`、非空 `username/password`、毫秒 `ts` 和 nonce
- [x] 2.5 实现时间戳窗口校验和 Redis nonce 防重放，nonce key 使用不暴露 username 或 credential 的哈希值
- [x] 2.6 确保所有凭证格式、解密、完整性、时间戳和 nonce 错误对外统一返回“登录凭证无效”类业务错误，内部日志不记录敏感材料

## 3. 后端登录接口改造

- [x] 3.1 修改 `apps/api/src/routes/auth/auth.routes.ts` 中 `/auth/login/password` request schema，仅接受 `credential` 和可选 `capToken`
- [x] 3.2 修改 `apps/api/src/routes/auth/auth.handlers.ts`，先解析 credential 得到 `username/password`，再调用既有 `authService.loginPassword`
- [x] 3.3 保持 `getVerificationContext(c, username)` 使用解密出的 username，确保 Cap 风险维度和既有登录失败记录语义不变
- [x] 3.4 确认 `/auth/login/mobile`、SSO 授权、局部 session 和内部鉴权不受本变更影响

## 4. SSO 前端改造

- [x] 4.1 为 `apps/sso` 增加 `sm-crypto` 依赖或等价共享封装，并确认构建产物可正常打包
- [x] 4.2 新增登录凭证生成工具：生成随机 key material、IV、`ts`、`nonce`，SM4 加密登录 JSON，SM2 加密 key material，并输出 `iam-login-v1.<base64url-envelope>`
- [x] 4.3 修改 `apps/sso/src/services/auth.ts` 的密码登录请求，使其提交 `{ credential, capToken? }` 而不是明文 `username/password`
- [x] 4.4 保持登录页调用形态和 `withHumanVerification` 重试体验，确保每次初始请求和 Cap 重试都会重新生成新的 `credential`
- [x] 4.5 确认前端不会把密码、key material、完整 credential 或私钥相关内容输出到日志、错误提示或 URL

## 5. 测试与验证

- [x] 5.1 为后端登录凭证解析模块添加 Bun 单元测试，覆盖测试向量、成功解密、未知 `kid`、不支持算法、tag 错误、SM2/SM4 解密失败和 JSON 结构错误
- [x] 5.2 为后端时间戳和 nonce 校验添加单元测试，覆盖有效时间、过期时间、未来时间过大、首次 nonce 和重复 nonce
- [x] 5.3 更新或新增 `/auth/login/password` handler/service 测试，验证有效 credential 成功进入既有登录逻辑，旧明文字段请求被拒绝
- [x] 5.4 增加前端登录凭证工具测试或最小可验证用例，使用同一测试向量确认输出可被后端解密
- [x] 5.5 运行 `pnpm --filter @iam/api test`、`pnpm --filter @iam/api typecheck` 和 `pnpm --filter @iam/sso typecheck`
- [x] 5.6 在本地或测试环境 smoke-test 密码登录成功、密码错误、触发 Cap 后重试、过期 credential 和重复 credential

## 6. 发布准备

- [x] 6.1 更新环境变量示例或部署说明，列出后端 SM2 私钥集合、当前 `kid`、前端 SM2 公钥、算法标识、时间窗口和 nonce TTL
- [x] 6.2 更新 OpenAPI 展示或接口说明，标注 `/auth/login/password` 的 breaking request body 变更
- [x] 6.3 制定同步发布和同步回滚检查清单，明确 `apps/api` 与 `apps/sso` 必须同批上线或同批回滚
