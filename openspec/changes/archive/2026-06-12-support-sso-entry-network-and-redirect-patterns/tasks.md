## 1. Shared Redirect Pattern Rules

- [x] 1.1 在 `packages/domain` 新增 redirect URL pattern parser/matcher helper，保持 `validRedirectUrls: string[]` 存储结构不变。
- [x] 1.2 实现 pattern 格式校验：仅允许 `http`/`https`、最左侧一级 host wildcard、path 末尾 `/*`，禁止 query/hash、协议通配、端口通配、host/path 中间通配和裸 `*`。
- [x] 1.3 实现结构化匹配：protocol、hostname、port 严格匹配，origin-only 放行该 origin 下所有 path，普通 path 按 segment 边界匹配子树，`/*` 不匹配不带尾斜杠的基路径。
- [x] 1.4 为 matcher 添加单元测试，覆盖精确 URL、一级子域、根域不匹配、多级子域不匹配、path 边界、`/*`、query/hash、HTTP、IDN/IPv6 和非法 pattern。

## 2. Admin Client Validation

- [x] 2.1 在 `apps/admin-api` client 创建/更新输入路径接入共享 pattern 校验，非法 pattern 返回可诊断的 BadRequest 类错误。
- [x] 2.2 更新 admin-api client service/schema 测试，验证合法 pattern 可写入、非法 pattern 被拒绝且不刷新 client 缓存。
- [x] 2.3 更新 `apps/admin` client 表单中 `validRedirectUrls` 的 placeholder/help 文案，说明支持 origin、`https://*.example.com` 和 path 末尾 `/*`。

## 3. API SSO Discovery

- [x] 3.1 在 `apps/api/src/env.ts` 新增必填 `SSO_INTERNAL_ORIGIN` 和 `SSO_EXTERNAL_ORIGIN` 校验，并规范化 origin 拼接行为。
- [x] 3.2 修改 `/sso/.well-known/authentication-configuration` handler，按 `X-IAM-Entry-Network: internal | external` 选择对应 origin。
- [x] 3.3 在 discovery handler 中对缺失或非法入口网络返回 HTTP 400，并记录结构化 warn 日志。
- [x] 3.4 添加 SSO handler 测试，验证内网、外网、非法 header、缺失 header、origin 尾斜杠和响应不包含 `entryNetwork`。

## 4. API Redirect Validation

- [x] 4.1 将 `apps/api/src/routes/sso/sso.service.ts` 中 authorize/callback 的 `startsWith` 校验替换为共享 redirect pattern matcher。
- [x] 4.2 运行时遇到非法历史 pattern 时跳过该 pattern 并记录 warn；仅当没有合法 pattern 命中时返回现有非法重定向地址错误。
- [x] 4.3 添加 SSO service 测试，覆盖合法 pattern 命中、非法 pattern 跳过、无匹配报错、`/foo` 不匹配 `/foobar`、`*.example.com` 不匹配根域。

## 5. APISIX Gateway Manifest

- [x] 5.1 在 dev/prod IAM APISIX manifest 中将 `/sso/*` route 拆分为内网 host route 和外网 host route，均转发到 IAM API service。
- [x] 5.2 为两条 SSO route 分别覆盖注入 `X-IAM-Entry-Network: internal` 和 `X-IAM-Entry-Network: external`，并移除无 host 限制的 `/sso/*` 兜底 route。
- [x] 5.3 保留 SSO CORS、real-ip 和 limit-req 语义，确保拆分后的 routes 继续引用 SSO 专用 `plugin_config_id`。
- [x] 5.4 更新 APISIX manifest 环境变量示例和校验测试，覆盖内外网 host 占位符与 entry network header 枚举。

## 6. Configuration and Documentation

- [x] 6.1 更新 `docker/docker-compose-dev.yml`、`docker/docker-compose-prod.yml` 和 README/env 文档，加入 `SSO_INTERNAL_ORIGIN`、`SSO_EXTERNAL_ORIGIN` 以及 APISIX 内外网 SSO host 配置。
- [x] 6.2 更新第三方 SSO 接入文档，说明 discovery 会按入口网络返回 URL，并记录新的 `validRedirectUrls` pattern 语义。
- [x] 6.3 更新 OpenAPI schema/示例中 SSO endpoint configuration 和 redirect URL pattern 相关描述。

## 7. Verification

- [x] 7.1 运行 `pnpm --filter @iam/domain test` 和 `pnpm --filter @iam/domain typecheck`。
- [x] 7.2 运行 `pnpm --filter @iam/api test` 和 `pnpm --filter @iam/api typecheck`。
- [x] 7.3 运行 `pnpm --filter @iam/admin-api test` 和 `pnpm --filter @iam/admin-api typecheck`。
- [x] 7.4 运行 `pnpm --filter @iam/admin typecheck`。
- [x] 7.5 运行 `pnpm gateway:apisix:validate -- --env dev:iam` 和 `pnpm gateway:apisix:validate -- --env prod:iam --env-file .env.prod`。
- [x] 7.6 对 `/sso/.well-known/authentication-configuration` 做内外网 host/API smoke test，确认返回 URL、400 错误和 APISIX route 匹配行为符合 spec。
