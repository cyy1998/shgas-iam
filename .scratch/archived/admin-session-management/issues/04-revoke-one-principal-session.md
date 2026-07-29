# 04 — 支持单个 Session Revocation

**What to build:** 让管理员能够从有效会话行强制下线一个指定 Principal Session，同时保护当前管理会话、级联终止 IAM 管理的派生访问，并准确呈现幂等无变化、外围清理警告和审计失败后的实际状态。

**Blocked by:** 03 — 在管理端展示 Valid Principal Session

**Status:** resolved

- [x] Admin session management service 的 `revokeSessions` 意图支持 `session` 目标，并由消费方拥有的 control port 调用既有 Kernel 级联撤销。
- [x] REST 会话撤销端点和 `admin.sessionManagement.revokeSessions` tRPC procedure 通过共享 adapter 接受内部 Principal Session ID。
- [x] 管理端有效会话行提供“强制下线本次”操作和确认框。
- [x] 当前管理会话的单会话按钮禁用；直接 API 请求同一目标返回 `409 / ADMIN_SESSION_CURRENT_PROTECTED`，且不改变 Redis。
- [x] 单会话撤销使用 `admin_revoke` 原因，并级联撤销 IAM 管理的 binding、credential 和 artifact。
- [x] 确认文案明确 IAM 不保证第三方自行建立的本地会话退出，且不展示可能不完整的关联应用清单。
- [x] 已过期、已撤销、不存在或已被另一管理员处理的目标返回 HTTP 200、`changed:false` 和无变化提示。
- [x] 成功响应只返回脱敏撤销数量、目标 scope、当前根会话例外状态和 cleanup 计数，不返回 cleanup failure 内容。
- [x] IAM 撤销成功但外围 cleanup 失败时仍返回成功，页面显示“会话已下线，部分关联清理失败”。
- [x] 新增 `admin.session.revoke` 审计动作；success、幂等无变化和当前会话保护 failure 都有审计记录。
- [x] 单会话审计以内部 `principalSessionId` 精确标识目标，但不保存外部 token、lookup/HMAC 信息、目标来源、任意 metadata、cleanup ref 或原始异常。
- [x] Redis 作用先于 PostgreSQL 审计；作用后审计失败返回 `ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT`，页面刷新且不自动重试。
- [x] 被下线用户只在下一次请求进入现有未登录流程，不新增通知、管理员身份披露或撤销原因协议。
- [x] 操作不要求管理员填写自由文本备注，也不新增结构化原因配置。
- [x] Admin API seam 覆盖当前会话保护、级联摘要、无变化、cleanup 警告、审计脱敏和作用后审计失败。
- [x] Playwright 覆盖按钮保护、确认框、成功、无变化、cleanup 警告和作用可能已生效的错误提示。
- [x] 受影响 Admin API、管理前端、审计与文档通过聚焦测试、lint、typecheck、E2E、架构检查、文档检查和 whitespace 检查。
