# OIDC Provider 发布与回滚手册

## 发布前提

1. 使用 Node.js 24.x 构建并测试 `@iam/oidc-provider`。
2. 执行数据库迁移，检查 `oidc_subject` 回填、client OIDC 字段和启用/配置 check constraint。
3. 配置以 `/oidc` 结尾且不可随意变更的外部 issuer；后续修改 issuer 会改变 token 身份和校验结果。
4. 提供两个长度至少为 32 个字符的 cookie key，以及一个具有唯一 `kid` 的 current RS256 private JWK。
5. 轮换签名密钥时，previous private JWK 的保留时间不得短于 ID Token 最大 TTL。
6. 配置 Session Kernel：
   - `IAM_OIDC_PROVIDER_SESSION_KERNEL_NAMESPACE`
   - `IAM_OIDC_PROVIDER_SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS`
   - `IAM_OIDC_PROVIDER_SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS`
   - `IAM_OIDC_PROVIDER_SESSION_KERNEL_TOMBSTONE_TTL_SECONDS`
   - `IAM_OIDC_PROVIDER_SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS`
   - `IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_ID`
   - `IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_SECRET`
   - 可选的 previous HMAC key pair
7. 生产环境不得使用开发默认 `IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_SECRET`。previous HMAC key 只用于平滑 lookup rotation，current/previous 的 id 和 secret 不得冲突。
8. 执行任何 APISIX apply 前，必须验证并比较 dev/prod 配置：

```bash
pnpm gateway:apisix:validate -- --env dev:iam
pnpm gateway:apisix:diff -- --env dev:iam
pnpm gateway:apisix:validate -- --env prod:iam --render-env
pnpm gateway:apisix:diff -- --env prod:iam --render-env
```

确保 localhost 或 Admin API 主机不经过 HTTP 代理。

## 分阶段发布

1. 部署数据库、API、管理端 API/UI、SSO Portal 和 Provider 代码，但暂不开放 APISIX `/oidc` 路由。
2. 在维护窗口内停止 login、authorize、callback、token、UserInfo、logout 和 session refresh/renewal 流量。
3. 执行旧 Redis key cleanup dry-run：

```bash
pnpm --filter @iam/api-core session:cleanup-legacy-keys -- --dry-run --batch-size 500
```

4. 审核 dry-run 的 pattern/count 摘要，确认不包含完整 key、token、code、cookie 或 secret。
5. 显式执行 cleanup apply：

```bash
pnpm --filter @iam/api-core session:cleanup-legacy-keys -- --apply --batch-size 500
```

6. 再次执行 dry-run，确认旧 key count 为 `0`。清理范围以 [OIDC Session 迁移说明](../features/oidc/oidc-session-migration.md) 为准。
7. 启动 Provider，通过内部直连端口验证 `/health`。
8. 配置一个保持禁用的测试 client，检查 redirect URI 和 scope；如为 confidential client，生成 secret，然后只启用该测试 client。
9. 应用 APISIX Provider upstream、service、plugin 和 route，确认 forwarded host/proto 能生成已配置的 issuer。
10. 对 Discovery、JWKS、authorize、token、UserInfo、CORS、`prompt`/`max_age`、authorization code 重放拒绝和 RP-Initiated Logout 执行 smoke。
11. 执行 custom SSO smoke：`/sso/authorize`、`/sso/callback` 或 `/sso/token`、`/auth/authz`、`/sso/logout`。
12. 执行 admin revoke smoke：用户禁用/密码重置、client 禁用或 OIDC 配置变更触发 Session Kernel revoke，并查询 `admin.session_revoke.*` 日志。
13. 恢复登录流量并监控 Provider/APISIX/API/admin-api 错误率，日志中不得记录 code、token、secret、verifier、cookie 或完整 Redis key。
14. 每个生产 client 完成各自的 smoke 后，再逐个启用。

## 回滚

1. 首先关闭 APISIX `/oidc` 路由或停止全部 OIDC 流量。
2. 停止 login、authorize、callback、token、UserInfo、logout 和 session refresh/renewal 流量。
3. 如需回滚到不理解 Session Kernel 的旧版本，先清理新版本 key：
   - `sess:v2:active:*`
   - `sess:v2:lookup:*`
   - `sess:v2:revoked:*`
   - `sess:v2:revoked_lookup:*`
   - `sess:v2:index:*`
   - `custom-sso:local-session-payload:*`
   - OIDC adapter 私有 payload/mapping key，例如 `oidc:model:*`、`oidc:consumed:*` 和 `oidc:provider-session-binding*`
4. 禁用已配置 client 的 OIDC；该操作会递增配置版本并触发 admin revoke。
5. 停止 Provider 部署，恢复上一版 APISIX manifest 和应用镜像。
6. 回滚后要求所有用户重新登录。
7. 重新开放流量前，验证 custom SSO 的 `/sso/authorize`、`/sso/callback`、`/sso/token`、`/auth/authz`、`/sso/logout` 流程。
8. 重新执行 OIDC Discovery/JWKS、authorize、token、UserInfo、authorization code replay 和 logout smoke。
9. 保留 `user.oidcSubject` 和 client OIDC 数据库字段，不得回滚身份回填或复用旧 subject。

## 验收记录

发布或回滚都必须把命令输出摘要、Redis cleanup dry-run/apply 摘要、custom SSO/OIDC/admin revoke smoke 结果和 Loki/Grafana 查询证据写入 Session Kernel release smoke 记录。
