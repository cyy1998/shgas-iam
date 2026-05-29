## Context

当前 public API 的密码登录和登录用途手机验证码登录共享用户维度失败计数，Redis key 为 `login-failures:user:<userId>`，30 分钟窗口内第 5 次失败会调用 `pauseEnabledUser` 将用户状态改为 `UserStatus.Pause`。这会把临时失败策略写入用户主数据，解除限制需要额外管理动作。

SSO 登录页当前通过统一 `request` 工具弹出 `message.error`，密码错误会短暂显示后自动消失。后端错误 message 已包含失败次数与剩余次数，可复用为前端强提示内容。

## Goals / Non-Goals

**Goals:**

- 将连续失败达到阈值后的处理改为 Redis 30 分钟临时黑名单。
- 保持密码登录和登录用途手机验证码登录共享用户维度失败计数。
- 保持既有标准错误类型和业务错误码，不新增 HTTP endpoint 或响应 envelope 结构。
- 让 SSO 密码错误提示必须由用户手动确认，并展示剩余次数或临时限制信息。
- 用单元测试覆盖失败计数、临时黑名单、过期恢复和成功清理。

**Non-Goals:**

- 不改变 `MAGIC_CODE`、Cap 人机校验或登录凭证加密协议。
- 不修改 PostgreSQL schema、Drizzle relation 或用户状态枚举。
- 不为手机验证码错误新增前端强提示交互；本次只要求密码登录错误更强。
- 不引入后台解锁、黑名单查询或审计报表。

## Decisions

1. 使用 Redis 临时黑名单 key，而不是用户状态字段。

   - 方案：新增用户维度 key，例如 `login-blacklist:user:<userId>`，TTL 为 30 分钟。
   - 理由：临时限制属于登录风控状态，不应污染用户生命周期状态；Redis TTL 天然支持自动恢复。
   - 替代方案：继续写 `UserStatus.Pause` 并新增定时任务恢复。该方案需要数据库写入、定时任务和异常恢复逻辑，复杂度更高。

2. 黑名单检查放在解析到具体用户之后、执行密码或验证码校验之前。

   - 密码登录需要先通过 username 找到用户 ID，随后检查黑名单，再执行 `checkPassword`。
   - 手机验证码登录失败路径目前只有 active user 才累计用户维度失败；黑名单检查应在手机号能解析到用户后执行，避免对不存在手机号产生可枚举的新差异。
   - 临时黑名单命中时直接抛出标准登录失败类错误，不再累计新的失败次数。

3. 失败计数和黑名单使用同一 TTL 常量。

   - 继续使用 30 分钟窗口常量作为失败计数窗口和临时黑名单 TTL。
   - 达到阈值时写入黑名单并保留可读错误 message，例如“账号已被临时限制 30 分钟，请稍后再试”。
   - 成功登录时同时删除失败计数 key 和黑名单 key，确保人工或测试场景中已有标记不会残留。

4. 前端强提示在登录页局部处理。

   - 保持 `request` 的默认 `message.error` 行为，避免影响其他页面。
   - `handlePwdLogin` 捕获 `ServiceError` 后，对 `ApiErrorCode.LoginFailed` 或包含失败次数/临时限制信息的密码登录错误使用 Ant Design `Modal.error` 或等价确认弹窗展示。
   - 弹窗内容直接使用后端 message，确保剩余次数与后端规则一致。

## Risks / Trade-offs

- [Risk] 后端 `request` 层已先展示一次 `message.error`，登录页再弹 `Modal.error` 可能出现重复提示。→ Mitigation: 实现时优先为密码登录请求提供可跳过默认 toast 的局部处理，或让登录页只在不会重复提示的情况下弹窗。
- [Risk] Redis 黑名单 key 过期依赖 Redis TTL，系统时钟和 Redis 可用性会影响限制恢复。→ Mitigation: 使用 Redis `set` + `EX` 原子写入，单元测试覆盖 TTL 语义；沿用现有 Redis 作为登录风控状态存储。
- [Risk] 手机号不存在时不检查用户黑名单，可能与存在用户的响应路径不同。→ Mitigation: 保持现有“只有 active user 才累计用户维度失败”的语义，不在本变更中扩大用户枚举面。
- [Risk] 前端通过错误 message 判断失败详情不如结构化 metadata 稳定。→ Mitigation: 本轮不改 envelope 结构；若后续要更强契约，可新增登录失败详情字段或专用错误 data。
