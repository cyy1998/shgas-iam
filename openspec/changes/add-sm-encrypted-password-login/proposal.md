## Why

当前 `/auth/login/password` 直接接收明文 `username` 与 `password` 字段。虽然生产环境应由 HTTPS 保护传输通道，但密码登录仍缺少应用层凭证封装，无法满足国密算法加密传输要求，也不便于在服务端统一校验凭证生成时间和重放风险。

本变更将密码登录请求升级为基于 SM2 + SM4 的单一加密凭证块，前端加密用户名、密码与传输时间戳，后端解密、校验时间戳和防重放后再进入既有登录逻辑。

## What Changes

- **BREAKING** `/auth/login/password` 请求体 SHALL 从 `{ username, password, capToken? }` 改为 `{ credential, capToken? }`。
- **BREAKING** SSO 前端密码登录 SHALL 同步改为生成并提交 `credential`，不再发送明文 `username` 与 `password` 字段。
- 新增密码登录国密凭证协议：前端使用 SM4 加密登录明文 JSON，使用后端 SM2 公钥加密一次性 key material，并将 `kid`、算法标识、密钥密文、IV、载荷密文和完整性标签编码为一个文本块。
- 后端 SHALL 根据 `kid` 选择 SM2 私钥，解密 SM4 key，再使用 SM4 解密登录明文 JSON。
- 后端 SHALL 校验登录明文中的版本、用途、用户名、密码、时间戳和 nonce，并拒绝过期、未来时间过大、重复 nonce、格式错误或解密失败的凭证。
- 解密和凭证校验通过后，系统 SHALL 继续复用既有密码校验、Cap 人机校验、登录失败计数、账号暂停、全局 session 创建和登录日志行为。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `authentication-sessions`: 修改密码登录请求契约，要求密码登录通过 SM2 + SM4 加密凭证块传输，并在进入既有登录逻辑前完成解密、时间戳校验和 nonce 防重放。

## Impact

- 影响 `apps/api/src/routes/auth/auth.routes.ts`、`auth.handlers.ts` 以及新增的登录凭证解密/校验模块。
- 影响 `apps/api/src/env.ts`，需要新增 SM2 密钥、当前 `kid`、时间窗口和 nonce TTL 相关配置。
- 影响 `apps/sso` 密码登录服务和登录页提交逻辑，需要增加 SM2 + SM4 加密工具和前端公钥配置/获取方式。
- 影响 OpenAPI 文档和调用方：所有调用 `/auth/login/password` 的客户端必须同步升级。
- 需要确认 `sm-crypto` 在前后端构建环境中的兼容性；后端已存在该依赖，SSO 前端需要新增依赖或复用 workspace 共享封装。
