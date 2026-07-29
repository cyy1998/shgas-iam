# 01 — 统一 Temporary Login Restriction 生命周期

**What to build:** 将密码和手机验证码登录的失败统计、临时限制、状态检查与清理收口为一个共享登录保护能力，使用户继续获得现有 5 次/30 分钟保护，同时让限制原因、最后触发方式、并发原子性和基础设施故障都具有可供后续管理端安全消费的明确语义。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 密码和手机验证码登录共同使用一个共享 Temporary Login Restriction 能力，不再各自拥有 Redis key、阈值或清理规则。
- [x] 30 分钟滚动窗口内前 4 次失败不创建限制，第 5 次失败原子地创建限制并进入全局限制索引。
- [x] 密码与手机失败继续共享用户级计数；混合失败的规范原因为 `too_many_login_failures`，Trigger Method 只表示最后跨过阈值的方式。
- [x] Temporary Login Restriction 继续只阻止新的认证，不触发或恢复任何已有 Principal Session。
- [x] 限制状态、失败历史和全局索引可以由一个原子清理操作同时删除，成功登录复用同一清理语义。
- [x] 清理之后发生的新失败立即重新计数，不产生宽限期、allowlist 或免限状态。
- [x] 限制自然过期后不再阻止登录，过期或悬空的全局索引成员可以安全清理。
- [x] Redis 无法确认限制状态时登录 fail closed，并返回 `LOGIN_PROTECTION_UNAVAILABLE`；审计不得把基础设施故障记录为凭据错误或真实受限。
- [x] 现有 5 次阈值、30 分钟失败窗口和 30 分钟限制时长保持不变，且不新增管理配置入口。
- [x] 普通测试通过共享公开接口覆盖混合失败、自然过期、异常 Trigger Method、成功清理及并发可观察行为。
- [x] 新增显式真实 Redis 测试通道，以随机 namespace 验证限制与索引原子出现、并发失败不丢计数及解除与失败的执行顺序；测试不自行启动或清空 Redis。
- [x] 真实 Redis 测试通道不进入默认测试或完整环境无关验证，并在测试架构与开发命令文档中登记。
- [x] 受影响的 API、共享模块和文档通过聚焦测试、lint、typecheck、架构检查、文档检查与 whitespace 检查。
