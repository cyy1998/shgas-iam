# Session Kernel 发布 smoke 历史记录

Type: release-record
Status: Historical
Last verified: 2026-07-03
Next review: n/a

本文件是 2026-06-24 在本地 dev Docker 环境执行的 Session Kernel 发布 smoke 证据快照，不代表后续当前状态，也不作为唯一可复用发布流程入口。后续发布应复制本文末尾的“可复用 smoke 模板”，并结合 `docs/releases/oidc-release-runbook.md` 执行。

不要把完整 Redis key、bearer token、authorization code、cookie、client secret、PKCE verifier、ID Token、access token 或私有 payload 粘贴到记录中。

## 发布上下文

| 字段 | 值 |
|---|---|
| 环境 | 本地 dev Docker stack，compose project `shgas-iam` |
| 窗口 | 2026-06-24 Asia/Shanghai |
| 分支 | `work/session-kernel-release-hardening` |
| Gateway | APISIX `http://localhost:30080` |
| 直连端口 | api `http://localhost:30011`，admin-api `http://localhost:30012`，oidc-provider `http://localhost:30015` |
| 依赖 | PostgreSQL `shgas-iam-db-1` healthy，Redis `shgas-iam-redis-1` healthy |
| 操作者 | Codex |

## 验证摘要

| 类别 | 结果 | 证据摘要 |
|---|---|---|
| OIDC provider delta validation | 通过 | `env.test.ts`、`redis-adapter.test.ts` 共 16 个测试通过；`typecheck` 和 `lint` 通过。 |
| Redis legacy cleanup dry-run | 通过 | 初始 dry-run 中 legacy pattern/count 为 0；post-smoke dry-run 只看到 live OIDC runtime index，未执行 apply。 |
| custom SSO gateway 模式 | 通过 | 登录、`/sso/authorize`、`/sso/callback`、`/auth/authz` 和 `/sso/logout` 主路径通过。 |
| custom SSO independent 模式 | 通过 | `/sso/authorize` 到 `/sso/token` 返回兼容 `sid`、`ttl` 和 `userInfo`；auth code replay 被拒绝。 |
| OIDC 主路径 | 通过 | Discovery、JWKS、authorization code flow、token、UserInfo、code replay rejection、RP-Initiated Logout 通过。 |
| admin revoke | 通过 | client 状态切换触发 OIDC protocol revoke；旧 OIDC token 后续被 UserInfo 拒绝。 |
| 系统日志 | 通过 | 观察到 `session_kernel.tombstone_replay.detected`、`oidc.provider.protocol_error`、`admin.session_revoke.client_protocol`。 |
| 脱敏检查 | 通过 | 已检查的 smoke 输出和日志未暴露 code、token、verifier、client secret、cookie 或 private payload。 |

## Redis 清理命令

当时只要求 dry-run，未对 live dev OIDC runtime key 执行 apply：

```bash
IAM_REDIS_HOST=127.0.0.1 IAM_REDIS_PORT=6390 IAM_REDIS_DB=0 pnpm --filter @iam/api-core session:cleanup-legacy-keys -- --dry-run --batch-size 500
```

历史记录中只保留 pattern/count 摘要，不保存完整 Redis key。

## Smoke 期间修复的问题

| 问题 | 修复 | 验证 |
|---|---|---|
| dev Docker 中空的 `IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_ID` / `IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET` 使 env parsing 失败 | 将空 previous HMAC env 视为未设置，同时保留成对和长度校验 | OIDC env tests 通过 |
| 首次 OIDC authorization 保存 AuthorizationCode 时 provider Session mapping 尚未消费 staged binding，导致 fail-closed 500 | OIDC Redis adapter 在 binding read miss 时回退到 `consumeStaged(accountId, sessionUid)` | Redis adapter test 和完整 OIDC smoke 通过 |

## 历史结论

| Gate | 结果 | 说明 |
|---|---|---|
| cleanup dry-run | 接受 | 只执行 dry-run；未清理 live dev OIDC runtime key。 |
| custom SSO | 接受 | Gateway、Independent、replay rejection、authz、logout 通过。 |
| OIDC | 接受 | Discovery、authorize/token、UserInfo、replay rejection、logout、post-logout token rejection 通过。 |
| admin revoke | 接受 | client maintenance 触发 `admin.session_revoke.client_protocol`，client 状态已恢复。 |
| redaction | 接受 | 未发现敏感凭据泄漏。 |
| rollback | 已记录，未 smoke-test | 回滚场景未在 task 6.6 中演练。 |

## 可复用 Smoke 模板

后续 Session Kernel 发布或回滚时，复制以下模板到新的 release record，填入实际环境和证据摘要：

| 字段 | 值 |
|---|---|
| 环境 | `<dev/staging/prod>` |
| 窗口 | `<YYYY-MM-DD HH:mm TZ>` |
| 分支 / Commit | `<branch or commit>` |
| Gateway | `<gateway origin>` |
| 直连端口 | `<api/admin-api/oidc-provider>` |
| 操作者 | `<name>` |

| Gate | 结果 | 证据摘要 |
|---|---|---|
| `@iam/oidc-provider` test/lint/typecheck | `<通过/失败/跳过>` | `<摘要>` |
| Session Kernel legacy cleanup dry-run/apply | `<通过/失败/跳过>` | `<只记录 pattern/count>` |
| custom SSO Gateway smoke | `<通过/失败>` | `login -> /sso/authorize -> /sso/callback -> /auth/authz -> /sso/logout` |
| custom SSO Independent smoke | `<通过/失败>` | `/sso/authorize -> /sso/token -> replay rejection` |
| OIDC smoke | `<通过/失败>` | Discovery、JWKS、authorize/token、UserInfo、replay rejection、logout |
| admin revoke smoke | `<通过/失败>` | user/client revoke 事件、旧 token 拒绝 |
| trace/log evidence | `<通过/失败>` | requestId、traceId、Loki/Grafana 查询摘要 |
| redaction | `<通过/失败>` | 未发现 code/token/verifier/secret/cookie/private payload |
| rollback smoke, if run | `<通过/失败/跳过>` | cleanup 新 namespace、恢复旧版本、重新登录 |

模板证据同样不得包含完整 Redis key、token、code、cookie、secret、verifier 或私有 payload。
