## ADDED Requirements

### Requirement: 密码登录加密凭证传输
系统 SHALL 要求 `/auth/login/password` 使用 SM2 + SM4 加密凭证块传输用户名、密码、传输时间戳和 nonce，并在进入既有密码登录业务逻辑前完成解密、完整性校验、时间戳校验和 nonce 防重放。

#### Scenario: 密码登录请求使用 credential
- **WHEN** 客户端调用 `/auth/login/password`
- **THEN** 请求体 SHALL 只接受 `credential` 和可选 `capToken`
- **AND** 请求体 SHALL NOT 接受明文 `username` 或 `password` 字段作为登录输入

#### Scenario: credential 文本块结构有效
- **WHEN** 后端收到 `credential`
- **THEN** 系统 SHALL 解析协议版本、`kid`、算法标识、SM2 加密后的 key material、SM4 IV、SM4 密文和完整性标签
- **AND** 系统 SHALL 根据 `kid` 选择对应 SM2 私钥

#### Scenario: credential 解密成功
- **WHEN** `credential` 使用受支持算法、有效 `kid` 和正确密钥生成，且完整性标签校验通过
- **THEN** 系统 SHALL 使用 SM2 私钥解密 key material
- **AND** 系统 SHALL 使用解出的 key material 验证完整性标签
- **AND** 系统 SHALL 使用 SM4 解密登录凭证明文 JSON
- **AND** 登录凭证明文 JSON SHALL 包含 `v`、`typ=password-login`、`username`、`password`、`ts` 和 `nonce`

#### Scenario: credential 时间戳有效
- **WHEN** 登录凭证明文 JSON 的 `ts` 与服务端当前时间差在配置允许窗口内
- **THEN** 系统 SHALL 允许凭证继续进行 nonce 防重放校验

#### Scenario: credential 时间戳无效
- **WHEN** 登录凭证明文 JSON 的 `ts` 已过期或显著晚于服务端当前时间
- **THEN** 系统 SHALL 拒绝继续执行密码校验和全局会话创建
- **AND** 响应 SHALL 使用统一业务错误表示登录凭证无效

#### Scenario: credential nonce 首次使用
- **WHEN** 登录凭证明文 JSON 的 `nonce` 在当前有效窗口内未被使用
- **THEN** 系统 SHALL 在 Redis 中记录该 nonce 的防重放标记
- **AND** 系统 SHALL 允许凭证继续进入既有密码登录业务逻辑

#### Scenario: credential nonce 重放
- **WHEN** 登录凭证明文 JSON 的 `nonce` 在当前有效窗口内已经存在防重放标记
- **THEN** 系统 SHALL 拒绝继续执行密码校验和全局会话创建
- **AND** 响应 SHALL 使用统一业务错误表示登录凭证无效

#### Scenario: credential 无效
- **WHEN** `credential` 缺失、格式错误、协议版本不支持、算法不支持、`kid` 不存在、SM2 解密失败、完整性标签校验失败、SM4 解密失败或明文 JSON 结构无效
- **THEN** 系统 SHALL 拒绝继续执行密码校验和全局会话创建
- **AND** 响应 SHALL 使用统一业务错误表示登录凭证无效

#### Scenario: credential 校验通过后保持登录语义
- **WHEN** `credential` 解密、完整性校验、时间戳校验和 nonce 防重放均通过
- **THEN** 系统 SHALL 使用解密出的 `username` 与 `password` 执行既有密码登录逻辑
- **AND** 系统 SHALL 保持既有 Cap 人机校验、密码校验、登录失败计数、账号暂停、全局 session 创建、cookie 写入和登录日志行为

## MODIFIED Requirements

### Requirement: 全局登录创建会话
系统 SHALL 在加密凭证密码登录、手机验证码登录或受支持的第三方登录成功后创建 Redis 全局会话，并向调用方返回会话 token 与 `isMobileSet`。

#### Scenario: 密码登录成功
- **WHEN** `/auth/login/password` 请求提供有效 `credential`，该凭证解密出的用户名对应用户详情存在，并且解密出的密码匹配用户密码或输入值等于配置的 `MAGIC_CODE`
- **THEN** 系统 SHALL 创建 `global_session:<token>` Redis 记录
- **AND** 系统 SHALL 返回 `{ token, isMobileSet }`
- **AND** HTTP handler SHALL 写入名为 `global_session` 的 HttpOnly、SameSite=Lax cookie

#### Scenario: 手机验证码登录成功
- **WHEN** 手机号对应的用户详情存在，并且登录用途验证码匹配 Redis 中保存的验证码或输入值等于配置的 `MAGIC_CODE`
- **THEN** 系统 SHALL 创建 `global_session:<token>` Redis 记录
- **AND** 系统 SHALL 返回 `{ token, isMobileSet }`
- **AND** HTTP handler SHALL 写入名为 `global_session` 的 HttpOnly、SameSite=Lax cookie

#### Scenario: 第三方登录成功
- **WHEN** OA 或 WeChat 登录校验通过并解析到用户详情
- **THEN** 系统 SHALL 创建全局会话并记录对应的全局第三方登录日志
