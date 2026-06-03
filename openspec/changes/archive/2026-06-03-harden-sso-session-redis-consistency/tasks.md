## 1. 测试与现状锁定

- [x] 1.1 为 SSO/session 服务补齐 Redis fake 能力，支持 `getdel` 或 Lua 等价行为、TTL、ZSET、transaction/失败注入和 `fetch` mock。
- [x] 1.2 增加授权码重复兑换测试，验证同一个 `auth_code` 只能创建一次局部会话。
- [x] 1.3 增加授权码引用的全局会话失效测试，验证不会创建可鉴权的 local session。
- [x] 1.4 增加局部会话写入失败测试，验证 local key、reverse key 和 ZSET 不会形成可放行的不一致组合。
- [x] 1.5 增加登出外部 `logoutEndpoint` 失败测试，验证 IAM Redis 清理和 HTTP 登出语义不被阻断。
- [x] 1.6 增加残留 local key 鉴权测试，验证 reverse/global 缺失时拒绝并清理残留数据。

## 2. 授权码一次性消费

- [x] 2.1 在 SSO service 中封装 `consumeAuthCode(code)`，使用 Redis 原子读删语义读取并删除 `auth_code:<code>`。
- [x] 2.2 让 `/sso/callback` 和 `/sso/token` 改用 `consumeAuthCode`，并保持原有错误类型语义。
- [x] 2.3 在兑换局部会话前校验授权码中的 `globalSessionId` 对应全局会话仍存在且 TTL 大于 0。

## 3. 局部会话一致性创建

- [x] 3.1 将 `setLocalSession` 调整为单一 Redis 原子单元，统一写入 local key、reverse key、ZSET member 和 ZSET TTL。
- [x] 3.2 明确 `setLocalSession` 在全局会话不存在、TTL 小于等于 0 或 Redis 写入失败时抛出可被上层映射的登录/授权错误。
- [x] 3.3 保持 `authAudit.recordLocalLoginSuccess` 只在 Redis 局部会话创建成功后记录。

## 4. 局部会话鉴权一致性

- [x] 4.1 增加 session service helper，用于读取并校验 local key、reverse key 和 global key 的一致性。
- [x] 4.2 更新 `/auth/authz` 局部会话校验逻辑，只有 local/reverse/global 均有效时返回用户摘要。
- [x] 4.3 更新共享 authentication middleware 的 local session 路径，拒绝 reverse/global 缺失的残留 local key。
- [x] 4.4 对残留 local key 或 reverse key 执行 best-effort 清理，并保持未登录错误响应。

## 5. 登出清理与 Independent 通知

- [x] 5.1 调整 `removeLocalSession` 或新增内部 helper，使 IAM Redis local key、reverse key 和集合索引清理不依赖外部 `logoutEndpoint` 成功。
- [x] 5.2 调整 `logout` 流程，确保全局会话 key 与 `local_session_set:<globalSessionId>` 最终被清理。
- [x] 5.3 对 Independent `logoutEndpoint` 失败、超时或异常响应记录结构化日志，但不阻断 IAM 登出成功路径。
- [x] 5.4 处理 `local_session_set:<globalSessionId>` 中 local/reverse 已缺失的残留成员，避免残留成员中断全局登出。

## 6. 验证

- [x] 6.1 运行 `pnpm --filter @iam/api test`，确认 SSO/session/auth 相关测试通过。
- [x] 6.2 运行 `pnpm --filter @iam/api typecheck`，确认类型约束通过。
- [x] 6.3 运行 `openspec status --change harden-sso-session-redis-consistency`，确认变更 artifact 与任务状态可被 OpenSpec 识别。
