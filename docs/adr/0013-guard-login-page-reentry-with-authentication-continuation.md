---
status: accepted
---

# 以认证续接守卫登录页重入

统一登录页只承接有效 Authentication Continuation。浏览器已有有效 UserSession 时跳过表单并继续原授权，普通 query
不能强制换号或重复认证。OIDC 的 `prompt=login` 或不满足的 `max_age` 在已有有效根时以 `login_required` 结束；
没有有效根时允许首次登录。

## 理由与代价

普通页面参数不是协议重认证授权。服务端按 Custom SSO/OIDC 的各自上下文判断续接，SSO 页面只消费统一页面决定；
检查不续期根、不读取主体投影。明确无有效会话才显示表单，未知或暂态故障失败关闭并保留 Cookie。

OIDC 首次登录的短期 HttpOnly 完成证明区分“守卫后刚完成认证”与“守卫时已经登录”，避免已有根借首次登录通道绕过
新鲜认证约束。有效根通过 history replacement 继续，避免浏览器历史反复回到表单。

这是页面加载守卫，不是跨标签页原子仲裁；检查后发生的并发登录仍可能建立多个根。不增加 forceLogin 参数，
账号恢复、可跳过的手机号绑定和身份展示也不进入此守卫。

## 当前契约与历史

现行 owner、请求、Cookie 与首次登录证明见[认证契约](../features/sso/authentication-and-recovery.md#登录页重入)。
旧独立 Provider 与旧根模型的实现安排只作历史追溯。

历史来源：[ADR-0013 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0013-guard-login-page-reentry-with-authentication-continuation.md)。原始决定与后续修订按各版本追溯。
