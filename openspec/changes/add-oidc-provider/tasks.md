## 1. 数据模型与共享契约

- [ ] 1.1 在 `packages/contracts` 中新增 OIDC client type、status、scope、grant type、response type 和 token endpoint auth method 枚举或常量
- [ ] 1.2 在 `packages/db/src/schema/core` 中新增 OIDC client、OIDC subject、OIDC signing key metadata 和必要 provider storage 表
- [ ] 1.3 为 OIDC schema 增加唯一约束、外键、索引和显式软删除/status 字段
- [ ] 1.4 在 `packages/db/src/relations/core` 注册 OIDC 相关 relations 并同步 core index exports
- [ ] 1.5 使用 `drizzle-orm/zod` 为 OIDC 表生成 select/insert/update schema，并补充 redirect URI、scope 和 secret 输入校验
- [ ] 1.6 生成 Drizzle migration 并确认 migration SQL 不影响现有 `client` 和 session 表

## 2. OIDC Client Registry 后端

- [ ] 2.1 在 `apps/admin-api/src/services/oidc-client` 增加 repository、schema、type 和 service
- [ ] 2.2 实现 OIDC client 搜索、详情、创建、更新、状态变更、软删除和 secret 轮换服务
- [ ] 2.3 实现 client secret 生成、摘要存储、校验和只显示一次响应逻辑
- [ ] 2.4 为 OIDC client 变更接入 admin audit，确保审计日志不包含明文 secret
- [ ] 2.5 新增 admin REST route 和 tRPC router，并接入 `apps/admin-api/src/trpc` router composition
- [ ] 2.6 为 create/update/rotate/disable/delete 和 runtime resolve 增加 admin-api 单元测试

## 3. OIDC Client Registry 前端

- [ ] 3.1 在 `apps/admin/src/services` 增加 OIDC client tRPC/API wrapper
- [ ] 3.2 新增 OIDC client 管理页面，支持列表、搜索、状态筛选和 clientType 筛选
- [ ] 3.3 新增创建/编辑表单，支持 redirect URI、post logout redirect URI、scope、grant type 和 token endpoint auth method 配置
- [ ] 3.4 新增 secret 创建结果展示与轮换确认流程，并明确 secret 只显示一次
- [ ] 3.5 将 OIDC client 管理入口接入 admin 导航或现有 client 管理分区
- [ ] 3.6 运行 `pnpm --filter @iam/admin typecheck` 验证前端类型

## 4. Provider 服务脚手架

- [ ] 4.1 新增 `apps/oidc-provider` workspace app，配置 package scripts、TypeScript、ESLint、env schema、logger 和入口文件
- [ ] 4.2 为 provider 增加 Node runtime Dockerfile、dev/serve scripts，并接入 Turborepo 与 workspace 依赖
- [ ] 4.3 增加 provider env：issuer、public origin、port、Redis、DATABASE_URL、token TTL、cookie 设置和 signing key 配置
- [ ] 4.4 接入成熟 OIDC Provider 库并配置基础 routes、features、ttl、claims、client lookup 和 cookies
- [ ] 4.5 实现 Redis-backed provider adapter，覆盖 authorization code、interaction、access token 和短期 grant model
- [ ] 4.6 实现 OIDC client runtime adapter，从 PostgreSQL 读取启用 client 并转换为 provider metadata

## 5. 登录态桥接与 SSO Portal

- [ ] 5.1 提取或新增共享全局 session helper，使 `apps/api` 和 `apps/oidc-provider` 可以一致读取、刷新和清理 `global_session`
- [ ] 5.2 在 provider authorize interaction 中校验 `global_session`，未登录时生成短期 OIDC login return nonce 或签名 return token
- [ ] 5.3 扩展 `apps/sso` 登录页识别 OIDC 登录模式和受控 `returnTo`
- [ ] 5.4 在 `apps/sso` 中实现 returnTo allowed origin、nonce 或签名校验失败时的安全提示
- [ ] 5.5 调整密码登录、手机验证码登录和补绑手机号成功后的跳转逻辑，OIDC 模式回到 `returnTo`，custom SSO 模式保持 `/sso/authorize`
- [ ] 5.6 为 SSO 登录页 OIDC returnTo 行为补充前端类型检查或轻量测试

## 6. OIDC 协议实现

- [ ] 6.1 实现 Discovery metadata，确保 issuer、endpoint、scope、grant、response type 和 PKCE metadata 完整
- [ ] 6.2 实现 JWKS 输出，公开 active/previous public signing keys 且不泄露 private key material
- [ ] 6.3 实现 authorize 流程的 redirect URI 精确匹配、scope 校验、response type 限制和 PKCE 要求
- [ ] 6.4 实现 token endpoint 的 POST code exchange、client authentication、PKCE verifier 校验和 code 一次性消费
- [ ] 6.5 实现 OIDC subject 生成/读取，确保 `sub` 稳定且不暴露 user id、username、手机号或员工号
- [ ] 6.6 实现 ID Token claims 映射，覆盖 `iss`、`sub`、`aud`、`exp`、`iat`、`auth_time` 和可选 `nonce`
- [ ] 6.7 实现 UserInfo endpoint，按 scope 和 client claim policy 返回当前用户 claims
- [ ] 6.8 实现 end session endpoint，清理 `global_session` 和相关 custom SSO local sessions，并校验 `post_logout_redirect_uri`

## 7. 安全与兼容验证

- [ ] 7.1 为 OIDC redirect URI 精确匹配、前缀不命中和 post logout redirect URI 精确匹配增加测试
- [ ] 7.2 为 PKCE 缺失、PKCE mismatch、confidential client auth 失败和 public client code exchange 增加测试
- [ ] 7.3 为 authorization code 重复兑换失败增加测试
- [ ] 7.4 为 disabled/deleted OIDC client 被 provider 拒绝增加测试
- [ ] 7.5 为 ID Token issuer/audience/nonce/subject claims 增加测试
- [ ] 7.6 为 UserInfo 无效 token、过期 token 和用户不可用场景增加测试
- [ ] 7.7 验证现有 `/sso/authorize`、`/sso/token`、`/sso/logout` 行为不因 OIDC 变更回归

## 8. 文档、部署与最终验证

- [ ] 8.1 更新本地开发文档和 docker compose，说明如何启动 `@iam/oidc-provider`
- [ ] 8.2 新增 OIDC 第三方接入文档，包含 Discovery、client 注册、Authorization Code + PKCE、token exchange、UserInfo 和 logout 示例
- [ ] 8.3 更新环境变量示例，标注 issuer、signing key、cookie domain 和 token TTL 的生产要求
- [ ] 8.4 运行 `pnpm --filter @iam/db db:generate` 并检查 migration
- [ ] 8.5 运行 `pnpm --filter @iam/admin-api test`、`pnpm --filter @iam/admin-api typecheck` 和 `pnpm --filter @iam/admin typecheck`
- [ ] 8.6 运行 `pnpm --filter @iam/oidc-provider test`、`pnpm --filter @iam/oidc-provider typecheck` 和 provider smoke test
- [ ] 8.7 运行相关 workspace lint/typecheck，并记录未覆盖或需后续变更处理的 OIDC conformance 项
