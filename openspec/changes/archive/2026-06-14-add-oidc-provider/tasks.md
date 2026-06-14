## 1. 数据模型与共享契约

- [x] 1.1 在 `packages/contracts` 新增 OIDC client type、scope、token endpoint auth method、OIDC state 和固定协议能力常量，scope 限定为 `openid`、`profile`、`phone`、`iam:authorization`
- [x] 1.2 在 `packages/db/src/schema/core/users.ts` 新增 `oidcSubject UUID`，生成迁移以全量回填随机 UUID 后添加 default、unique 和 not-null 约束
- [x] 1.3 在 `packages/db/src/schema/core/clients.ts` 新增 `oidcEnabled`、`oidcConfig` JSONB、`oidcSecretHash` 和 `oidcConfigVersion`，并添加启用时配置非空的 check constraint
- [x] 1.4 使用 Zod 判别联合定义 public/confidential `oidcConfig`，校验 client type、auth method、allowed scopes 和 secret 状态组合
- [x] 1.5 增加 OIDC redirect URI 校验：仅绝对 HTTP/HTTPS、允许 HTTP 与 query、禁止 fragment/通配符/模板、去重且按原始字符串精确匹配
- [x] 1.6 拆分 custom SSO runtime、client admin list/detail、OIDC runtime 和 OIDC account DTO，确保 `oidcSecretHash` 与 `oidcSubject` 不进入通用 DTO、缓存、日志或审计
- [x] 1.7 修改现有 client create/update 契约，使 `clientCode` 对所有 client 创建后不可修改，并增加旧 REST/tRPC 重命名拒绝测试
- [x] 1.8 生成并检查 Drizzle migration，确认不新增 OIDC client、subject、signing key 或 provider storage 表，且不改变现有 custom SSO 数据

## 2. Global Session Envelope 与共享基础设施

- [x] 2.1 在共享契约中定义 `GlobalSessionEnvelope { version: 1, authTime, user }`，明确 `authTime` 为 Unix seconds 且滑动续期不修改
- [x] 2.2 将 global/local session Redis key、读取、写入、续期、反向关联和清理逻辑提取到 `packages/api-core`
- [x] 2.3 调整 `apps/api` 登录、用户资料刷新、custom SSO authorize/token/callback/logout 和 authentication middleware 使用统一 envelope
- [x] 2.4 保持 custom SSO local session payload 与响应兼容，同时确保 global session 清理继续级联清理 local session
- [x] 2.5 增加 session envelope、authTime 保持、滑动续期、全局清理和无效旧格式拒绝测试
- [x] 2.6 编写发布维护步骤，要求上线时停止登录流量并清空全部旧 global/local session Redis key，不实现旧格式兼容读取

## 3. 现有 Client 模块的 OIDC 管理后端

- [x] 3.1 在 `apps/admin-api/src/services/client` 扩展 repository 和 admin DTO，支持 OIDC 三态、clientType、allowedScopes 查询与筛选
- [x] 3.2 实现 `client.oidc.configure`，首次配置默认禁用；confidential client 原子生成一次性 secret
- [x] 3.3 实现 `client.oidc.enable`、`disable` 和 `remove`，校验状态不变量并在 remove 时清除配置与 secret hash
- [x] 3.4 实现 `client.oidc.rotateSecret`，使用 `crypto.randomBytes(32)`、`iam_oidc_<base64url>` 和共享 bcrypt helper，旧 secret 立即失效
- [x] 3.5 支持 public/confidential 类型切换：public -> confidential 生成 secret，confidential -> public 清除 hash
- [x] 3.6 实现 `oidcConfigVersion` 递增规则，覆盖 OIDC 操作、client status 变化和删除，并排除纯展示字段变化
- [x] 3.7 在配置或状态变化后失效 OIDC runtime cache，并触发该 client Redis 协议对象和 token 的 best-effort 撤销
- [x] 3.8 新增 `admin.client.oidc.configure|enable|disable|remove|rotate_secret` 审计事件，允许记录 redirect URI、scope、类型和版本但禁止记录 secret/hash
- [x] 3.9 增加专用 REST route 与 tRPC operations，继续挂载在现有 client router，不创建第二套 OIDC client CRUD
- [x] 3.10 为配置、启停、移除、类型切换、轮换、不可变 clientCode、版本递增、DTO 脱敏和审计增加 admin-api 测试

## 4. 现有 Client 管理前端

- [x] 4.1 扩展 `apps/admin/src/services/client.ts` 和 tRPC 类型，接入 OIDC 专用管理操作
- [x] 4.2 在现有 client 列表展示 `unconfigured|disabled|enabled`，并增加 OIDC state、clientType 和 allowedScopes 筛选
- [x] 4.3 在现有 client 详情页新增 OIDC 配置分区，维护 client type、redirect URI、post logout URI 和 allowed scopes
- [x] 4.4 首次配置默认保存为禁用，并为 enable、disable、remove 和类型切换增加确认与前置条件提示
- [x] 4.5 实现 confidential secret 首次生成与轮换后的单次展示，后续只显示 `hasOidcSecret`
- [x] 4.6 将 `clientCode` 改为创建后只读，并展示其作为 OIDC `client_id` 的不可变说明
- [x] 4.7 对 `iam:authorization` 标记敏感 scope，提示会返回全部有效任职及当前应用的角色权限
- [x] 4.8 运行 `pnpm --filter @iam/admin typecheck` 和前端格式检查

## 5. Provider 服务与部署脚手架

- [x] 5.1 新增 ESM `apps/oidc-provider`，固定 Node.js 22 LTS，初始精确依赖 `oidc-provider@9.8.4`，配置 lint/typecheck/test scripts
- [x] 5.2 增加 provider env schema：同源 `/oidc` issuer、public origin、port、Redis、DATABASE_URL、cookie、全局 TTL、bcrypt cost 和限流参数
- [x] 5.3 增加 current/previous RS256 private JWK 安全配置校验，要求唯一 `kid`，禁止生成临时生产 key
- [x] 5.4 配置 `oidc-provider` 仅启用 code flow、public subject、PKCE S256、JSON UserInfo、RP-Initiated Logout 和 opaque Access Token，关闭 dev interactions 与未使用 feature
- [x] 5.5 增加 provider logger、错误处理、健康检查和可信代理配置，确保日志不包含 secret、hash、code、token 或 verifier
- [x] 5.6 增加 Node runtime Dockerfile、dev/prod compose、Turborepo pipeline 和 workspace 配置
- [x] 5.7 在 APISIX dev/prod manifests 增加同源 `/oidc` 路由、正确 forwarded headers 与基础 IP rate limit，并执行 gateway validate/diff

## 6. Redis Adapter、Client Resolver 与撤销索引

- [x] 6.1 实现按 model namespace 和 TTL 存储的 Redis adapter，覆盖 AuthorizationCode、Interaction、Grant、provider Session 和 AccessToken
- [x] 6.2 对 Authorization Code 和 login return handle 实现原子消费，覆盖重复消费和并发兑换测试
- [x] 6.3 对 Client model 特殊处理：PostgreSQL 动态解析，Redis 仅缓存不含 secret hash 的 runtime metadata
- [x] 6.4 实现 OIDC secret 专用 repository 与 bcrypt 校验路径，禁止复用 custom SSO secret cache
- [x] 6.5 在所有协议对象保存 `clientId` 和 `oidcConfigVersion`，使用时与当前 PostgreSQL 版本比对
- [x] 6.6 为 Access Token 建立 user、client 和 global session 反向索引，并实现过期成员清理和主动撤销
- [x] 6.7 在用户/client 禁用删除、OIDC 配置变化、secret 轮换和 global logout 时撤销相关 Access Token
- [x] 6.8 为 Redis 丢失、版本不匹配、client cache 失效、索引清理和撤销行为增加 provider 测试

## 7. 登录 Interaction 与 SSO Portal

- [x] 7.1 实现 provider interaction handler，以 shared global session envelope 解析账号与 `authTime`
- [x] 7.2 实现 10 分钟一次性 opaque `oidcReturn` handle，绑定 interaction、client、配置版本和浏览器状态
- [x] 7.3 实现固定 provider resume endpoint，原子消费 handle 并拒绝过期、重放、版本变化或绑定不匹配
- [x] 7.4 扩展 `apps/sso` 登录页识别 `oidcReturn`，不解析任意 return URL、authorize 参数或 client redirect URI
- [x] 7.5 调整密码登录、手机验证码登录和补绑手机号完成后的 OIDC 回跳，同时保持 custom SSO `/sso/authorize` 跳转不变
- [x] 7.6 实现默认 prompt、`prompt=none`、`prompt=login` 和 `max_age`，确保滑动续期不改变原始 `authTime`
- [x] 7.7 实现内部可信 client 自动批准 requested scopes，不展示或持久化 consent
- [x] 7.8 为 OIDC 登录、handle 重放、prompt、max_age 和 custom SSO 兼容补充测试/类型检查

## 8. OIDC 协议、Claims 与退出

- [x] 8.1 实现 `/oidc` Discovery，声明固定 response/grant/subject/signing/PKCE/auth method/scope 能力并确保 issuer 一致
- [x] 8.2 实现 JWKS，仅公开 current/previous RS256 public JWK，并验证 key 轮换覆盖 ID Token 最大生命周期
- [x] 8.3 实现 authorize 的 client/用户可用性、redirect 精确匹配、allowed scopes、state、nonce 和 PKCE S256 校验
- [x] 8.4 实现 token endpoint：再次校验用户可用性，public 使用 PKCE，confidential 同时使用 PKCE 与 `client_secret_basic`，code 原子消费且不支持 refresh token
- [x] 8.5 实现 opaque Access Token 和 RS256 ID Token，TTL 取全局配置与 global session 剩余 TTL 的较小值
- [x] 8.6 实现 `user.oidcSubject` account resolver 和 ID Token claims：iss/sub/aud/exp/iat/auth_time/nonce，以及按 scope 映射 name、preferred_username、phone_number
- [x] 8.7 构造签发时 UserInfo Redis 快照，确保不包含数据库 ID、密码、custom SSO 字段或未授权 claims
- [x] 8.8 实现 `iam:authorization`：返回全部有效 employments，roles 按当前 client 过滤，privileges 由过滤角色派生，并提供稳定排序的分组和聚合值
- [x] 8.9 实现 UserInfo 实时校验 token、用户状态、client 状态、配置版本和 global session，成功时只返回 JSON
- [x] 8.10 实现 CORS：Discovery/JWKS 可公开，Token 仅对 origin 匹配 redirect URI 的 public client 开放，confidential client 拒绝 Token CORS，UserInfo origin 必须匹配 token 所属 client redirect origin
- [x] 8.11 实现 provider 内 `client_id + IP` confidential auth 失败限流，与 APISIX IP 限流配合并返回不泄露细节的 `invalid_client`
- [x] 8.12 实现 RP-Initiated Logout：校验 id_token_hint、post logout URI 和 state，执行 global session、custom SSO local session 与 OIDC token 全局清理

## 9. 安全与兼容测试

- [x] 9.1 覆盖 redirect HTTP/query 允许、fragment/通配符拒绝、原始字符串精确匹配和 post logout URI 匹配测试
- [x] 9.2 覆盖 state/nonce/PKCE 缺失、非 S256、verifier mismatch、public/confidential token exchange 和 code replay 测试
- [x] 9.3 覆盖 disabled/maintenance/deleted client、disabled/deleted user、OIDC disabled 和配置版本变化拒绝测试
- [x] 9.4 覆盖 secret 一次性显示、hash 不泄露、轮换立即失效、类型切换和认证失败限流测试
- [x] 9.5 覆盖 public subject 稳定性、软删除恢复、新用户新 subject 和通用 UserDto 不泄露 subject 测试
- [x] 9.6 覆盖 ID Token issuer/audience/nonce/auth_time/TTL/RS256/JWKS current/previous key 测试
- [x] 9.7 覆盖 `iam:authorization` 全部任职返回、跨 client role 隔离、privilege 派生、精简字段和稳定排序测试
- [x] 9.8 覆盖 UserInfo Redis 快照、主体实时状态检查、global session 绑定、反向索引撤销和 CORS 测试
- [x] 9.9 覆盖 prompt none/login、max_age、opaque handle 重放和无 consent 自动批准测试
- [x] 9.10 覆盖 OIDC 全局退出清理 custom SSO local session，以及现有 `/sso/authorize|callback|token|logout` 无回归测试

## 10. 文档、发布与最终验证

- [x] 10.1 更新本地开发、Docker 和 APISIX 文档，说明如何启动 Node.js `@iam/oidc-provider` 及同源 `/oidc` 路由
- [x] 10.2 新增内部 OIDC 接入文档，包含 Discovery、public/confidential client、PKCE、required state/nonce、Token、UserInfo、`iam:authorization` 和全局 logout
- [x] 10.3 更新环境变量示例，说明 issuer 不可随意变更、RS256 current/previous key、全局 TTL、cookie、bcrypt 和限流要求
- [x] 10.4 记录允许生产 HTTP redirect URI 的风险，并明确 URI 原始字符串精确匹配规则
- [x] 10.5 编写分阶段发布与回滚 runbook，包括暂不开放路由、维护窗口清理全部旧 session、测试 client smoke test 和逐个启用生产 client
- [x] 10.6 运行 `pnpm --filter @iam/db db:generate` 并人工检查 subject 回填、client 新列和 check constraint migration SQL
- [x] 10.7 运行受影响共享包、`@iam/api`、`@iam/admin-api`、`@iam/admin` 和 `@iam/sso` 的 test/typecheck/lint
- [x] 10.8 运行 `@iam/oidc-provider` test/typecheck/lint，以及 Discovery、JWKS、authorize/token/UserInfo/CORS/logout smoke test
- [x] 10.9 运行 APISIX dev/prod provider route validate/diff，并确认 forwarded host/proto 与 issuer 一致
- [x] 10.10 使用标准 OIDC client 完成端到端联调，记录第一版不支持 refresh token、pairwise subject、consent、OIDC-only client 和在线 key 管理
