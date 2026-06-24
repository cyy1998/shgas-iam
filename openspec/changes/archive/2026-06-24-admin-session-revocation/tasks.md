## 1. Kernel 与撤销端口基础

- [x] 1.1 检查 `@iam/api-core/session/kernel` 是否已支持 user revoke with `exceptPrincipalSessionId`；如缺失，新增最小 API 并覆盖单元测试。
- [x] 1.2 确认 Kernel client protocol 和 client all protocols revoke 会返回完整 RevokeSummary，并补齐 cleanup adapter missing/failure 的测试缺口。
- [x] 1.3 在 admin-api 新增 `AdminSessionRevocationPort` 类型与实现，封装 user、client protocol、client all protocols 和 summary logging。
- [x] 1.4 在 admin-api composition 中创建共享 Session Kernel 实例，让 middleware 使用 resolver，让 services 使用 revocation port。
- [x] 1.5 将旧 `TokenRevocationPort` 和分散的 `OidcInvalidationPort` 调用收束到新的 Session Revocation port，保留 OIDC runtime cache invalidation/publish 语义。

## 2. 用户与密码变更接入

- [x] 2.1 扩展 admin audit/request context 或 operation context，使服务层可获得当前 `principalSessionId` 作为可选排除项。
- [x] 2.2 更新 user service：用户 status 变为非 Enable 时注册 best-effort Session Kernel revoke，reason 为 `user_disabled`。
- [x] 2.3 更新 user service：用户软删除成功后注册 best-effort Session Kernel revoke，reason 为 `user_deleted`。
- [x] 2.4 更新 user service：管理员重置密码成功后注册 best-effort Session Kernel revoke，reason 为 `admin_revoke`，并在目标为当前管理员时保留当前 PrincipalSession 本体。
- [x] 2.5 更新 user service 测试，覆盖状态变更、删除、重置密码、删除约束失败、revoke failure best-effort 和敏感字段不入日志。

## 3. Client 与 custom SSO 变更接入

- [x] 3.1 定义 client 变更对撤销范围的判定 helper，区分 all protocols、custom-sso protocol、oidc protocol 和 no-op。
- [x] 3.2 更新 client status 变更：`Disable` 触发 client all protocols revoke，`Maintance` 不触发 custom-sso revoke。
- [x] 3.3 更新 client soft delete：cache delete 继续 required afterCommit，并新增 best-effort client all protocols revoke。
- [x] 3.4 更新 client update/updateById：`clientSecret` 或 custom SSO 会话相关 `extAttributes` 变化时触发 custom-sso protocol revoke。
- [x] 3.5 保持纯展示字段更新不触发 session revoke，并补齐 client service 单元测试。

## 4. OIDC 配置变更接入

- [x] 4.1 更新 OIDC configure afterCommit：统一执行 runtime cache invalidation/publish 和 `protocol=oidc` Kernel revoke。
- [x] 4.2 更新 OIDC enable/disable/remove afterCommit：触发 OIDC protocol revoke，并为 disable/remove 使用 `client_protocol_disabled`。
- [x] 4.3 更新 OIDC rotate-secret afterCommit：触发 OIDC protocol revoke，确保日志不包含 secret 明文或 hash。
- [x] 4.4 更新 client 全局 status `Disable`、`Maintance` 和 soft delete 对 OIDC protocol 的撤销映射。
- [x] 4.5 补齐 OIDC client service 测试，覆盖 configure、enable、disable、remove、rotate-secret、global status 和 delete 的 revoke/invalidation summary。

## 5. Cleanup 与系统日志

- [x] 5.1 为 admin-api revocation port 配置能处理现有 custom SSO/OIDC cleanupRef contract 的 cleanup adapters，或明确将缺失 adapter 计入 cleanup failure summary。
- [x] 5.2 新增 revoke summary logger，输出 `admin.session_revoke.user`、`admin.session_revoke.client_protocol`、`admin.session_revoke.client_all_protocols` 和 `admin.session_revoke.cleanup_failed`。
- [x] 5.3 确保 summary 日志包含 requestId、traceId、actor、target、reason、protocol 和 counters，并脱敏 token、cookie、password、clientSecret 与 secret hash。
- [x] 5.4 增加 logger 单元测试，覆盖成功 summary、cleanup failure、afterCommit best-effort failure 和敏感字段过滤。
- [x] 5.5 更新 architecture guard，禁止 admin-api user/client services 直接导入 Redis session key builder、app-local protocol adapter singleton 或 legacy OIDC token revocation helper。

## 6. 验证

- [x] 6.1 运行 `pnpm --filter @iam/api-core test` 和 `pnpm --filter @iam/api-core typecheck`，如果修改了 Kernel core。
- [x] 6.2 运行 `pnpm --filter @iam/admin-api test`。
- [x] 6.3 运行 `pnpm --filter @iam/admin-api typecheck`。
- [x] 6.4 运行 `openspec validate admin-session-revocation --strict`。
- [x] 6.5 将实现结果、测试命令和任何 cleanup failure 风险更新到 `introduce-session-kernel` umbrella 的 child smoke check 记录。
