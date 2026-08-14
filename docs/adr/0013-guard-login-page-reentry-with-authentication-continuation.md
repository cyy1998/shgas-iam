---
status: accepted
---

# 以认证续接守卫统一登录页重入

统一登录页只承接有效的 Authentication Continuation，不是允许用户随时重新认证的通用入口。登录页确认浏览器持有 Valid Principal Session 后，必须跳过登录表单并继续原 Custom SSO 或 OIDC 授权；普通 query 参数不能绕过该行为。OIDC Client 在已有 Valid Principal Session 时提出 `prompt=login` 或未满足的 `max_age`，IAM 不创建第二个 Principal Session，而以 `login_required` 终止本次授权；没有有效会话时仍允许完成首次登录。

守卫状态按协议所有权解析：API 拥有 Custom SSO client、redirect 与 Principal Session 检查，OIDC Provider 拥有 opaque return handle、browser binding、OIDC 请求和 Principal Session 检查，SSO 前端只消费统一的页面决策。检查只读取 Session Kernel 的实时状态，不续期会话、不加载主体投影或用户资料；无法确认状态时 fail closed，保留 Cookie 并显示系统暂时不可用。

## Consequences

- 登录页加载期间先显示全页检查状态，只有服务端明确确认没有有效会话时才显示登录表单；有效会话使用 history replacement 继续协议流程。
- 明确失效的 `global_session` Cookie 可以清除；暂态故障和状态未知不得清除 Cookie，也不得降级为登录表单。
- OIDC 首次登录使用短期 HttpOnly 登录完成证明区分“守卫后刚完成认证”和“守卫时已存在会话”，避免后者绕过协议重认证要求。
- 本决策只建立页面加载守卫，不修改密码或短信登录提交接口；多标签页在检查后产生的竞态仍可能创建多个 Principal Session。
- `/reset-password`、可跳过的手机号绑定和用户身份展示不进入守卫职责，也不提供 `forceLogin` 或换号快捷参数。
- API、OIDC Provider 与 SSO 前端通过暂停新认证和授权流量的维护窗口协调切换；既有 Valid Principal Session 不清空，失败时整体回滚。
