# 05 — 支持用户级 Session Revocation

**What to build:** 让管理员能够从任一有效会话行下线目标用户在操作开始时已索引的全部 Principal Session，并在管理员处置本人时保留当前管理端根会话但撤销其派生访问。

**Blocked by:** 04 — 支持单个 Session Revocation

**Status:** resolved

- [x] `revokeSessions` 意图扩展 `user` 目标，REST 与 tRPC 继续使用既有共享撤销 adapter 和响应形状。
- [x] 每个有效会话行提供“下线该用户全部”操作，不新增任意多选、跨用户批量或全站下线。
- [x] 对其他用户执行时撤销操作开始时用户索引中的全部根 Principal Session，并级联其 IAM 管理的子对象。
- [x] 对 actor 本人执行时自动保留当前管理端根 Principal Session，同时撤销该根会话的子对象和本人的其他根会话。
- [x] 目标为本人但服务端无法取得当前 `principalSessionId` 时操作 fail closed，不得退化为把当前管理会话一并撤销。
- [x] 本人操作的按钮文案继续使用“下线该用户全部”，确认框明确当前根会话例外和关联 IAM 凭证仍会撤销。
- [x] 全部下线是点式撤销；操作期间或之后建立的新会话允许存在，不新增 session generation、revocation epoch 或登录冻结。
- [x] 确认框说明强制下线不阻止再次登录，凭据疑似泄露时应配合密码重置、账号暂停或结束。
- [x] 用户索引为空、目标会话均已失效或并发处置完成时返回 HTTP 200 和 `changed:false`。
- [x] Cleanup 部分失败、响应脱敏和作用后审计失败沿用单会话撤销的已验证语义。
- [x] 新增 `admin.session.revoke_user` 审计动作，记录目标用户、是否变化、脱敏撤销数量、当前根例外和 cleanup 失败数量。
- [x] Admin API seam 覆盖其他用户全部撤销、本人例外及子对象撤销、缺失当前会话 ID、空索引、并发无变化和审计。
- [x] Playwright 覆盖普通用户与本人两类确认文案、成功、无变化和警告提示。
- [x] 既有 Session Kernel 撤销测试继续作为级联算法事实来源，Admin service 测试不重复断言 Redis 内部遍历顺序。
- [x] 受影响 Admin API、管理前端、审计与文档通过聚焦测试、lint、typecheck、E2E、架构检查、文档检查和 whitespace 检查。
