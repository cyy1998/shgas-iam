# 06 — 在管理端管理 Temporary Login Restriction

**What to build:** 在会话管理页面增加 Temporary Login Restriction 实时列表和解除操作，使管理员能够准确理解用户为何暂时不能发起新认证，并原子清除限制及当前失败历史而不影响已有会话或未来安全计数。

**Blocked by:** 01 — 统一 Temporary Login Restriction 生命周期；03 — 在管理端展示 Valid Principal Session

**Status:** resolved

- [x] 会话管理页面增加“临时登录限制”标签页，与“有效会话”共享页面框架和用户筛选体验。
- [x] Admin session management service 提供 `listLoginRestrictions` 和 `releaseLoginRestriction` 两个意图。
- [x] REST 提供限制查询和按 user ID 解除端点，tRPC 提供对应 `admin.sessionManagement` procedures，并复用共享 adapter。
- [x] 限制列表使用现有分页形状、默认每页 20 条、最大 100 条，并支持可选精确 user ID 筛选。
- [x] 每行显示用户 ID、用户名、姓名及正常、暂停、结束、已删除或未知账号状态；缺失用户记录不阻止解除。
- [x] 每行把规范原因显示为“登录失败次数过多”，把密码、手机或未知只显示为最后 Trigger Method。
- [x] 每行显示自动解除时间和剩余时间；前端可以本地推进倒计时，但不增加服务端轮询或实时推送。
- [x] 解除操作原子删除 Temporary Login Restriction、当前失败历史和全局限制索引成员，并返回 `changed` 与失败状态已清理事实。
- [x] 解除没有 allowlist 或宽限期；操作之后发生的新失败立即按现有策略重新计数。
- [x] 解除 Temporary Login Restriction 不撤销、创建、续期或恢复任何已有 Principal Session。
- [x] 限制已自然过期、已解除或被另一管理员处理时返回 HTTP 200、`changed:false` 和无变化提示。
- [x] Redis 限制状态不可用时返回 `ADMIN_LOGIN_STATE_UNAVAILABLE`，页面不得显示空列表或虚假解除成功。
- [x] 新增 `admin.login_restriction.release` 审计动作；success 和幂等无变化都记录目标用户、cause、Trigger Method、`changed` 和失败历史已清理事实。
- [x] 解除作用后审计失败沿用 `ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT`，页面刷新且不自动重试。
- [x] 页面不提供阈值、窗口、限制时长编辑，不要求管理员备注，也不向用户发送解除通知。
- [x] 本次不回填旧 Temporary Login Restriction；新索引上线前的状态允许在最长约 30 分钟内不可见。
- [x] Admin API seam 覆盖列表、用户状态、原因与 Trigger Method、到期时间、原子解除、无变化、503 和审计。
- [x] Playwright 覆盖第二标签页、用户筛选、倒计时展示、解除确认、成功、无变化、503 和作用后审计失败提示。
- [x] 最终 REST/tRPC contract、OpenAPI、port contract、architecture guard 和 production composition smoke 覆盖完整四意图模块。
- [x] 受影响共享模块、Admin API、管理前端、审计与文档通过聚焦测试、lint、typecheck、真实 Redis contract、E2E、架构检查、文档检查和 whitespace 检查。
