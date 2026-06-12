## Why

当前 `/sso/.well-known/authentication-configuration` 根据请求 URL 的 origin 拼接 SSO 端点，无法稳定区分内外网入口，也容易受反向代理和 Host 变化影响。与此同时，`validRedirectUrls` 仍按字符串 `startsWith` 校验，既不能表达受控的多子域/路径树场景，也存在前缀误匹配风险。

## What Changes

- `/sso/.well-known/authentication-configuration` SHALL 根据 APISIX 注入的入口网络类型返回内网或外网 SSO 端点 URL。
- API SHALL 通过必填环境变量配置 `SSO_INTERNAL_ORIGIN` 和 `SSO_EXTERNAL_ORIGIN`，并用相同 endpoint path 拼接内外网 URL。
- APISIX IAM SSO route SHALL 按内外网双域名拆分，并覆盖注入 `X-IAM-Entry-Network: internal | external`。
- API SHALL 在入口网络 header 缺失或非法时拒绝 discovery 请求。
- `validRedirectUrls` SHALL 继续使用 `string[]` 存储，但语义从字符串前缀升级为受限 URL pattern。
- Admin API SHALL 在创建/更新 client 时拒绝非法 redirect URL pattern；SSO 运行时 SHALL 跳过历史脏 pattern 并记录日志。
- **BREAKING**: 依赖纯字符串前缀的历史 redirect 配置将被收紧为结构化 URL 匹配，例如 `/foo` 不再匹配 `/foobar`。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `sso-login-experience`: SSO 端点配置发现 SHALL 按内外网入口返回对应 origin 的 authorize、logout 和第三方 OA URL。
- `client-registry`: client `validRedirectUrls` SHALL 支持受限 URL pattern，并替代现有字符串 `startsWith` 语义。
- `gateway-configuration-management`: IAM SSO APISIX route SHALL 按双域名区分入口网络并注入可信入口网络 header。

## Impact

- Backend API: `apps/api/src/routes/sso/sso.handlers.ts`、`apps/api/src/routes/sso/sso.service.ts`、`apps/api/src/env.ts`、SSO 相关测试。
- Admin API: client 创建/更新 DTO 或 service 校验、client service 测试。
- Shared domain: 新增 redirect URL pattern parser/matcher helper，供 API 与 Admin API 复用。
- Gateway: `gateway/apisix/manifests/dev/iam` 与 `gateway/apisix/manifests/prod/iam` 的 SSO routes 和环境占位符。
- Frontend admin: client 表单的 `validRedirectUrls` 提示文案更新；不复制完整 matcher 逻辑。
- Docs/OpenSpec: 更新 SSO discovery、client registry redirect 校验和 APISIX 入口 header 契约。
