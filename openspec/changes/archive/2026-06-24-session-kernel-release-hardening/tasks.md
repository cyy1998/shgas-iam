## 1. Session Kernel 配置统一

- [x] 1.1 在 `packages/api-core/src/session/kernel` 增加共享 env-to-config helper，统一 namespace、TTL、tombstone、current/previous HMAC key 映射。
- [x] 1.2 为共享配置 helper 补充单元测试，覆盖秒到毫秒转换、production current secret 必填、previous key 成对、id 冲突、secret 冲突和 absolute TTL 小于 idle TTL。
- [x] 1.3 将 `apps/api` 的 Session Kernel composition 改为使用共享配置 helper，并保留 app-local env schema 的字段解析。
- [x] 1.4 将 `apps/admin-api` 的 Session Kernel composition 改为使用共享配置 helper，并补齐生产 HMAC 默认值拒绝测试。
- [x] 1.5 将 `apps/oidc-provider` 的 Session Kernel composition 改为使用共享配置 helper，并补齐 previous key 成对与冲突配置测试。

## 2. 旧 Redis key 清理

- [x] 2.1 复核 custom SSO、legacy global session 和 OIDC provider 历史 Redis key namespace，确定 cleanup allowlist pattern。
- [x] 2.2 新增旧 Redis session key cleanup 工具或 package script，支持 `--dry-run`、`--apply`、`--batch-size` 和受限 allowlist pattern。
- [x] 2.3 为 cleanup 工具补充测试，验证 dry-run/apply 计数、禁止任意外部 pattern、失败摘要和不输出完整 key/token。
- [x] 2.4 在 cleanup 工具中输出 `session_kernel.cleanup_legacy_keys.completed` 与 `session_kernel.cleanup_legacy_keys.failed` 结构化日志。

## 3. 系统日志硬化

- [x] 3.1 在 `SystemLogEvent` 中补齐 Session Kernel release hardening 事件名。
- [x] 3.2 在 Session Kernel resolve/consume/revoke 或 adapter 边界记录 schema corrupted、tombstone replay 和 cleanup failure 摘要日志。
- [x] 3.3 补充 API/custom SSO legacy bearer source 日志测试，验证 Authorization/query token 来源可观测且不泄露 bearer。
- [x] 3.4 补充 OIDC provider tombstone replay、UserInfo tombstone 或 cleanup failure 日志测试，验证不泄露 code、token、verifier、clientSecret 或 cookie。
- [x] 3.5 补充 admin-api revoke summary/cleanup failure 日志测试，验证 counters、actor、target、clientCode、protocol 和 reason 字段。

## 4. 架构守卫

- [x] 4.1 加强 `apps/api` 架构测试，禁止 custom SSO runtime、route handler 和 adapter 重新使用 legacy Redis authority key。
- [x] 4.2 加强 `apps/oidc-provider` 架构测试，禁止 runtime、adapter、storage 和 interaction code 直接拼接 `sess:v2:` lifecycle key。
- [x] 4.3 加强 `apps/admin-api` 架构测试，确保 user/client service 只通过 Session Revocation port 请求会话撤销。
- [x] 4.4 为 cleanup tooling、文档、Kernel key builder 和测试 fixture 配置明确 allowlist，避免架构测试误伤发布工具。

## 5. 发布文档与 smoke 记录

- [x] 5.1 更新 `docs/features/oidc/oidc-session-migration.md`，覆盖 `sess:v2:`、custom SSO legacy key、OIDC runtime/index key、HMAC rotation 和强制重新登录。
- [x] 5.2 更新 `docs/releases/oidc-release-runbook.md`，补齐维护窗口、cleanup dry-run/apply、回滚清理新 key、gateway 关闭和 OIDC smoke 验收。
- [x] 5.3 更新 custom SSO 接入或发布文档，说明 opaque token、legacy bearer source 风险、旧 key 清理和回滚前置条件。
- [x] 5.4 新增或更新 Session Kernel release smoke 记录模板，覆盖 custom SSO、OIDC、admin revoke、Redis cleanup 和系统日志查询证据。

## 6. 验证

- [x] 6.1 运行 `pnpm --filter @iam/api-core test` 和 `pnpm --filter @iam/api-core typecheck`。
- [x] 6.2 运行 `pnpm --filter @iam/api test`、`pnpm --filter @iam/api typecheck` 和 `pnpm --filter @iam/api lint`。
- [x] 6.3 运行 `pnpm --filter @iam/admin-api test`、`pnpm --filter @iam/admin-api typecheck` 和 `pnpm --filter @iam/admin-api lint`。
- [x] 6.4 运行 `pnpm --filter @iam/oidc-provider test`、`pnpm --filter @iam/oidc-provider typecheck` 和 `pnpm --filter @iam/oidc-provider lint`。
- [x] 6.5 如文档或 smoke 涉及前端登录流，运行 `pnpm --filter @iam/sso typecheck` 和 `pnpm --filter @iam/admin typecheck`。
- [x] 6.6 在开发环境执行 cleanup dry-run 和 custom SSO/OIDC/admin revoke smoke，并把结果写入 smoke 记录。
- [x] 6.7 运行 `openspec status --change session-kernel-release-hardening` 和 OpenSpec 全量校验，确认 change apply-ready。
