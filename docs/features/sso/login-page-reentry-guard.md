# 统一登录页重入守卫设计

本文定义用户在浏览器已经持有 IAM 登录态时再次进入 `/portal/login` 的目标行为。目标是避免普通页面重入再次展示凭据表单或创建新的 Principal Session，同时保留 Custom SSO 与 OIDC 原认证请求的续接语义。

本设计采用 [ADR-0013](../../adr/0013-guard-login-page-reentry-with-authentication-continuation.md) 的决策。领域术语以根目录 [CONTEXT.md](../../../CONTEXT.md) 中的 Valid Principal Session、Authentication Continuation、Protocol Reauthentication Requirement 和 Session Revocation 为准。

## 1. 范围与非目标

守卫只作用于带 Custom SSO `client`/`redirectUrl` 或 OIDC `oidcReturn` 的 `/portal/login` 页面加载过程。

本次包括：

- 在渲染凭据表单前验证 Authentication Continuation 和实时 Principal Session；
- 有效会话自动继续原 Custom SSO 或 OIDC 授权；
- 区分无会话、无效请求和系统暂时不可用；
- OIDC 已登录场景下对 Protocol Reauthentication Requirement 返回 `login_required`；
- 协议级检查、前端状态、浏览器历史和维护窗口验收。

本次不包括：

- `/reset-password` Account Recovery 页面；
- 修改密码登录或短信登录提交接口；
- 消除多标签页在守卫检查完成后的并发登录竞态；
- 强制绑定手机号、展示当前用户身份或提供切换账号入口；
- `forceLogin` 等普通 query 绕过参数；
- 新增守卫专用用户审计、结构化日志或指标。

## 2. 决策顺序

守卫必须先验证 Authentication Continuation，再读取登录态。无效请求没有安全续接目标，也不得借此额外探测浏览器是否登录。

| Authentication Continuation | Principal Session 结果 | 页面或协议行为 | Cookie 行为 |
| --- | --- | --- | --- |
| 缺失 | 不检查 | 保持现有“登录地址校验未通过”页面 | 不处理 |
| 无效、过期或永久不可用 | 不检查 | 显示“登录请求已失效，请返回应用重新发起登录” | 不处理 |
| 有效 | Valid Principal Session | 使用 history replacement 自动继续原协议 | 保留 |
| 有效 | 明确不存在 | 显示登录表单 | 无需处理 |
| 有效 | Cookie 对应会话明确过期、撤销或主体禁用 | 清除 Cookie 后显示登录表单 | 清除 `global_session` |
| 有效 | 状态未知或依赖暂时不可用 | 显示“统一身份认证服务暂时不可用，请稍后重试” | 保留 |

无效请求包括永久失效或不可信的 client、redirect、OIDC return handle、browser binding、协议配置及请求绑定。Client Maintenance、Client 状态无法确认、Session Kernel 或 Subject Access 暂时不可用属于系统暂时不可用，不得伪装成无会话或永久请求错误。

## 3. 页面状态

登录页采用以下互斥状态：

| 状态 | 呈现与操作 |
| --- | --- |
| `checking` | 首屏全页加载状态；不渲染、隐藏或短暂闪现登录表单。 |
| `login` | 服务端明确确认没有 Valid Principal Session 后，呈现现有密码与短信登录表单。 |
| `invalid_request` | 显示“登录请求已失效，请返回应用重新发起登录”；不呈现表单，不提供固定落地页。 |
| `unavailable` | 显示“统一身份认证服务暂时不可用，请稍后重试”；只提供手动“重试”，不自动轮询。 |
| `continuing` | 使用 `window.location.replace` 或等价 history replacement 继续协议，不把登录页保留在后退栈。 |

每次检查的前端超时为 10 秒。超时进入 `unavailable`；用户点击“重试”后发起一次新的完整检查。检查本身不续期 Principal Session，真正的 `/sso/authorize` 或 OIDC 授权续接继续使用各协议现有续期规则。

已有 Valid Principal Session 的账号即使未绑定手机号也直接续接。手机号绑定继续是现有可跳过的自助动作，不成为守卫依赖。

## 4. 协议所有权

### 4.1 Custom SSO

API 拥有 Custom SSO 守卫检查，并按以下顺序处理：

1. 验证 client 当前可用于 Custom SSO 流量；
2. 规范化并验证实际 `redirectUrl`，保留可选 opaque `state`；
3. 从 HttpOnly `global_session` Cookie 解析 Principal Session；
4. 返回最小页面决策，不返回姓名、工号、Subject Identifier、主体投影、token 或 session metadata。

检查不得签发 Custom SSO Authorization Grant，也不得续期 Principal Session。前端收到自动续接结果后，使用 history replacement 进入现有 `/sso/authorize`；该端点仍负责重新验证请求、续期会话并签发 Grant。

### 4.2 OIDC

OIDC Provider 拥有 OIDC 守卫检查。它必须验证 opaque `oidcReturn`、browser binding、关联 Interaction、Client 和配置版本，且预检查不得消费 return handle。SSO 前端不解析 OIDC 请求，也不从 query 自行推断 `prompt` 或 `max_age`。

当守卫明确判定需要首次登录时，OIDC Provider 额外签发一个短期、HttpOnly、绑定同一 Interaction 与 browser binding 的登录完成证明。该证明只通过 `/oidc` Cookie 传递，不包含用户身份；`/oidc/resume` 只消费原 return handle 并返回 Interaction，Interaction 在 Principal Session 续期与本次认证绑定暂存成功后才一次性消费该证明。暂存不可用时证明保持可重试。守卫判定已有 Valid Principal Session 时不签发证明，因此普通 query 或旧会话不能借此绕过 `prompt=login` 或未满足的 `max_age`。

OIDC 行为矩阵：

| Principal Session | Protocol Reauthentication Requirement | 行为 |
| --- | --- | --- |
| 不存在或明确失效 | 有或无 | 显示登录表单，允许完成首次登录。 |
| 有效 | 无 | 自动续接 OIDC Interaction。 |
| 有效 | 有，包含 `prompt=login` 或未满足的 `max_age` | 不显示登录表单；由 OIDC Provider 以 `login_required` 终止本次授权。 |
| 无法确认 | 有或无 | 显示系统暂时不可用，保留 Cookie 和 return handle。 |

普通登录页 query、Custom SSO 参数或前端状态不能构造 Protocol Reauthentication Requirement。OIDC 拒绝必须通过原 Interaction 的协议错误路径返回 Client，不能改为 IAM 固定错误页或假装已满足新鲜认证。

## 5. 安全与竞态边界

- 守卫使用服务端 Session Kernel 与 Subject Access 结果判断 Valid Principal Session，不能只判断 Cookie 是否存在。
- Authentication Continuation 无效时优先停止，不读取会话；守卫不能成为跨站会话状态探针。
- 暂态故障、超时和状态未知 fail closed：不显示表单、不清 Cookie、不自动轮询。
- 返回给前端的结果只表达页面决策，不包含用户身份或 bearer material。
- OIDC 登录完成证明只能由守卫在明确无 Valid Principal Session 时签发，绑定原 Interaction、Client 配置版本和 browser binding，并在 Interaction 暂存认证绑定成功后一次性消费。
- 自动续接仍由既有协议端点重新校验全部输入，守卫结果不是 Authorization Grant 或授权凭据。
- 页面加载守卫与表单提交之间存在允许的竞态。若另一个标签页在此期间完成登录，当前登录提交仍可能创建新的 Principal Session；本次不建立提交时幂等或服务端二次守卫。
- 用户需要换账号或重新认证时，必须先走正式 Session Revocation/退出流程；不提供登录页快捷绕过参数。

## 6. 验收

后端与前端测试至少覆盖：

1. 有效 Custom SSO 请求加 Valid Principal Session 自动进入 `/sso/authorize`，不签发预检查 Grant；
2. 有效 OIDC return handle 加 Valid Principal Session 自动续接 Interaction；
3. OIDC 首次登录仍可满足 `prompt=login` 或 `max_age`；
4. OIDC 已登录且仍有 Protocol Reauthentication Requirement 时向 Client 返回 `login_required`，不循环进入登录页；
5. 无会话和明确失效会话显示登录表单，后者清除 Cookie；
6. 请求失效时不检查会话、不显示表单；
7. Client Maintenance、Session Kernel/Subject Access 暂时不可用和 10 秒前端超时进入系统不可用状态，保留 Cookie；
8. 无 Authentication Continuation 的直接入口保持安全提示且不调用守卫；
9. 未绑定手机号的已有会话仍自动续接；
10. 守卫检查不续期会话、不返回用户信息，也不新增守卫专用日志、指标或审计。

真实浏览器验收必须证明：

- 检查期间登录表单不闪现；
- 自动续接使用 history replacement，返回键不会再次进入登录页；
- 系统不可用页面不会自动轮询，点击“重试”只发起一次新检查；
- 请求失效和系统不可用使用不同文案与操作；
- `/reset-password` 行为保持不变。

## 7. 发布与回滚

API、OIDC Provider 和 SSO 前端在同一维护窗口协调切换，不实现旧后端缺少守卫能力时回退展示登录表单的兼容路径。

发布窗口：

1. 暂停新的密码/短信登录、Custom SSO authorize/callback/token 和 OIDC authorization/resume 流量；
2. 保留既有 Valid Principal Session 及其派生访问，不清空 Session Kernel；
3. 部署 API、OIDC Provider 和 SSO 前端；
4. 验证三端守卫契约以及 Custom SSO、OIDC、无效请求、系统不可用和浏览器历史 smoke；
5. 全部通过后恢复认证与授权流量。

暂停窗口不延长任何现有 Authorization Grant、Code、Credential 或 Session 的 TTL。任一组件发布或验证失败时，在恢复流量前整体回滚三端，不允许只回滚前端并重新展示登录表单。
