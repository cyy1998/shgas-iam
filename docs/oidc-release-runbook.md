# OIDC Provider 发布与回滚手册

## 发布前提

1. 使用 Node.js 22 LTS 构建并测试 `@iam/oidc-provider`。
2. 执行数据库迁移，检查 `oidc_subject` 回填、client OIDC 字段和启用/配置 check constraint。
3. 配置以 `/oidc` 结尾且不可随意变更的外部 issuer；后续修改 issuer 会改变 token 身份和校验结果。
4. 提供两个长度至少为 32 个字符的 cookie key，以及一个具有唯一 `kid` 的 current RS256 private JWK。
5. 轮换密钥时，previous private JWK 的保留时间不得短于 ID Token 最大 TTL。
6. 执行任何 apply 前，必须验证并比较 APISIX dev/prod 配置：

```bash
pnpm gateway:apisix:validate -- --env dev:iam
pnpm gateway:apisix:diff -- --env dev:iam
pnpm gateway:apisix:validate -- --env prod:iam --render-env
pnpm gateway:apisix:diff -- --env prod:iam --render-env
```

确保 localhost 或 Admin API 主机不经过 HTTP 代理。

## 分阶段发布

1. 部署数据库、API、管理端 API/UI、SSO Portal 和 Provider 代码，但暂不开放 APISIX `/oidc` 路由。
2. 在维护窗口内停止 login、authorize、callback、token 和 session refresh 流量。
3. 按照 [OIDC Session 迁移说明](oidc-session-migration.md) 删除全部旧 global/local session key。
4. 启动 Provider，通过内部直连端口验证 `/health`。
5. 配置一个保持禁用的测试 client，检查 redirect URI 和 scope；如为 confidential client，生成 secret，
   然后只启用该测试 client。
6. 应用 APISIX Provider upstream、service、plugin 和 route，确认 forwarded host/proto 能生成已配置的 issuer。
7. 对 Discovery、JWKS、authorize、token、UserInfo、CORS、`prompt`/`max_age`、authorization code 重放拒绝和
   logout 执行冒烟测试。
8. 恢复登录流量并监控 Provider/APISIX 错误率，日志中不得记录 code、token、secret 或 verifier。
9. 每个生产 client 完成各自的冒烟测试后，再逐个启用。

## 回滚

1. 首先关闭 APISIX `/oidc` 路由。
2. 禁用已配置 client 的 OIDC；该操作会递增配置版本并撤销反向索引中的 token。
3. 停止 Provider 部署；如需立即全量失效，删除剩余的 `oidc:*` 协议对象和 token key。
4. 如果回滚跨越 global session envelope 版本边界，必须停止登录流量，并在旧版本提供服务前再次清空
   所有 global/local session namespace。
5. 保留 `user.oidcSubject` 和 client OIDC 数据库字段，不得回滚身份回填或复用旧 subject。
6. 恢复上一版 APISIX manifest 和应用镜像。在重新开放流量前，验证现有 custom SSO 的
   `/sso/authorize`、`/sso/callback`、`/sso/token` 和 `/sso/logout` 流程。
