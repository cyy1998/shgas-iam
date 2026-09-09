# OIDC Provider 发布与回滚手册

Type: runbook
Status: Current
Last verified: 2026-09-09
Next review: 2026-10-31

## 发布前提

Spec #146 对已满足当前数据契约的环境，优先完整遵守[保留对象升级手册](protocol-validation-preserving-upgrade.md)。
该流程不执行本页初始部署的数据库迁移、协议禁用、artifact 清理或全部重新登录步骤；回退与放流同样按其保留边界处理。

在线状态由应用时间切换为 Redis 时间时，先完整执行[专用维护手册](online-auth-redis-time-cutover.md)，
其中的停流、排空、全 owner 清理、统一版本与独立 verify 门禁优先；本页的普通协议发布、轮换和 smoke 说明继续适用。
不能用仅等待 staged TTL 或 per-client artifact cleanup 替代此次全体旧在线状态清理。当前环境切换未执行。

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

旧 Session cleanup 命令已撤销。旧环境及旧备份的首次升级迁移不在当前候选支持范围，必须另行固定适用版本与迁移流程。
本手册仅用于当前 Session Kernel/OIDC 架构，禁止旧 reader/writer 混跑；代码退役不证明环境已经完成迁移。

## JWK Signing Key Rotation

OIDC ID Token 使用 RS256 signing JWK。轮换时按以下顺序执行：

1. 生成新的 RSA private JWK，设置唯一 `kid`，`alg` 必须为 `RS256`，不得提交 private key material。
2. 将旧 current JWK 配置为 previous，将新 JWK 配置为 current。
3. 部署 provider，确认 Discovery 的 `jwks_uri` 不变，JWKS 同时返回 current 和仍需验证未过期 ID Token 的 previous public JWK。
4. 对测试 client 执行 authorize/token，验证新 ID Token protected header 中的 `kid` 为新 current。
5. 等待旧 ID Token 最大 TTL 结束后，移除 previous JWK，再次确认 JWKS 只暴露仍需要的 public key。

如果 current/previous `kid` 冲突、不是可用 RSA private key 或配置缺失，provider 必须启动失败，不得降级为临时内存 key。

## Session Kernel HMAC Lookup Rotation

Session Kernel external token lookup 使用 HMAC hash。轮换顺序是：

1. 将旧 current 配为 `IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_ID` 和
   `IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET`。
2. 配置新的 `IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_ID` 和
   `IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_SECRET`。
3. 部署 provider，确认 current/previous 的 id 和 secret 均不冲突，previous 成对存在。
4. 在旧 PrincipalSession、authorization code、access token 或 lookup 最大 TTL 覆盖窗口内保留 previous。
5. 确认旧 lookup 全部过期或用户已重新登录后，移除 previous HMAC key pair。

生产环境不得使用开发默认 HMAC secret。HMAC rotation 失败时，优先恢复上一组 current/previous 配置；不要清理
`sess:v2:` key，除非明确执行跨版本回滚。

## 逐 Client 启用矩阵

每个生产 client 单独记录启用、smoke 和证据状态。建议发布窗口中使用下表维护：

| clientCode | client type | `oidcEnabled` 前 | 操作 | Smoke | 证据 |
|---|---|---|---|---|---|
| `<client>` | `public` / `confidential` | `false` / `true` | configure / enable / rotate secret | discovery、authorize、token、UserInfo、logout、replay | requestId、traceId、时间窗口 |

启用规则：

- 已配置但禁用的 client 先在管理端确认 redirect URI、post logout redirect URI、allowed scopes 和 secret 状态。
- confidential client secret 只在生成或 rotate 响应中显示一次，不得写入发布记录。
- 每个 client 通过 authorize/token/UserInfo/logout smoke 后，再启用下一个 client。
- configure、enable、disable、remove、rotate secret 等真实 OIDC mutation 会递增 `oidcConfigVersion` 并撤销旧协议对象；Client
  实际进入 Disable 或软删除也会造成全协议永久失效。进入或退出 Maintenance 以及离开 Disable 不推进版本；Maintenance 中保存的
  启用意图在恢复 Enable 后自动生效。

## 分阶段发布

1. 部署数据库、API、管理端 API/UI、SSO Portal 和 Provider 代码，但暂不开放 APISIX `/oidc` 路由。
2. 在维护窗口内停止 login、authorize、callback、token、UserInfo、logout 和 session refresh/renewal 流量。
3. 确认部署与回滚候选均支持当前 Session Kernel 和协议存储；旧环境先完成独立迁移验收。
4. staged Provider Session binding schema 变更时，不得长期混跑旧 reader 与新 writer。选择统一切换全部 OIDC 实例，
   或在停止新 authorization 后等待至少 60 秒，使旧 `oidc:pending-provider-session-binding:*` payload 过期。
5. 如需精确清理协议 artifact，按 [Client Protocol artifact 手册](client-protocol-v2-artifact-cutover.md) 固定 manifest 并完成 dry-run/apply/verify。
   该操作保护 Principal Session 和非目标状态，不是旧 Session 工具的完整等价替代，也不是全量认证状态重置。
6. 启动 Provider，通过内部直连端口验证 `/health`。
7. 配置一个保持禁用的测试 client，检查 redirect URI 和 scope；如为 confidential client，生成 secret，然后只启用该测试 client。
8. 应用 APISIX Provider upstream、service、plugin 和 route，确认 forwarded host/proto 能生成已配置的 issuer。
9. 对 Discovery、JWKS、authorize、token、UserInfo、CORS、`prompt`/`max_age`、authorization code 重放拒绝和 RP-Initiated Logout 执行 smoke。
10. 执行 custom SSO smoke：`/sso/authorize`、`/sso/callback` 或 `/sso/token`、`/auth/authz`、`/sso/logout`。
11. 执行 admin revoke smoke：用户禁用/密码重置、client 禁用或 OIDC 配置变更触发 Session Kernel revoke，并查询 `admin.session_revoke.*` 日志。
12. 由每个 client owner 验证其 authorize/token/UserInfo/logout 与重新登录行为；任一 owner smoke 失败都保持流量冻结并进入已批准的回滚路径。
13. 恢复登录流量并监控 Provider/APISIX/API/admin-api 错误率，日志中不得记录 code、token、secret、verifier、cookie 或完整 Redis key。
14. 每个生产 client 完成各自的 smoke 后，再逐个启用。

## 回滚

1. 首先关闭 APISIX `/oidc` 路由或停止全部 OIDC 流量。
2. 停止 login、authorize、callback、token、UserInfo、logout 和 session refresh/renewal 流量。
3. 确认回滚候选理解当前 Session Kernel 和协议存储；不理解当前存储的旧版本必须另行设计迁移，保持停流。
4. 禁用已配置 client 的 OIDC；该操作会递增配置版本并触发 admin revoke。
5. 停止 Provider 部署，恢复上一版 APISIX manifest 和应用镜像。
6. 回滚后要求所有用户重新登录。
7. 重新开放流量前，验证 custom SSO 的 `/sso/authorize`、`/sso/callback`、`/sso/token`、`/auth/authz`、`/sso/logout` 流程。
8. 重新执行 OIDC Discovery/JWKS、authorize、token、UserInfo、authorization code replay 和 logout smoke。
9. 保留 `user.oidcSubject` 和 client OIDC 数据库字段，不得回滚身份回填或复用旧 subject。

## 验收记录

发布或回滚都必须把命令输出摘要、适用时的精确 artifact dry-run/apply/verify 摘要、custom SSO/OIDC/admin revoke smoke 结果和 Loki/Grafana 查询证据写入 Session Kernel release smoke 记录。

建议记录模板：

| 分类 | 结果 | 证据摘要 |
|---|---|---|
| build/test | 通过/失败 | `@iam/oidc-provider` test、lint、typecheck 摘要。 |
| JWK rotation | 通过/跳过 | current/previous `kid`、JWKS public key 数量、token header `kid`。 |
| HMAC lookup rotation | 通过/跳过 | current/previous id、保留窗口、移除 previous 时间。 |
| client enable matrix | 通过/失败 | 每个 client 的启用状态、smoke 路径和 requestId/traceId。 |
| 协议 artifact 维护 | 通过/跳过 | 适用 manifest 的 dry-run/apply/verify 聚合摘要，不记录完整 key。 |
| protocol smoke | 通过/失败 | Discovery、JWKS、authorize、token、UserInfo、replay、logout。 |
| admin revoke | 通过/失败 | `admin.session_revoke.*` 日志与旧 token 拒绝结果。 |
| redaction | 通过/失败 | 未发现 code、token、verifier、secret、cookie、完整 Redis key 或 private payload。 |
