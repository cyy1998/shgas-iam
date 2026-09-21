---
status: accepted
---

# 显式选择回调类型并从落地 origin 推导托管回调

Custom SSO 由管理员显式选择 managed 或 business，不按 URL、路径或历史来源猜测类型。
managed 从首次已接受 redirect URI 的 origin 推导固定 `/sso/callback`，配置中没有独立 callbackEndpoint；
business 使用显式登记的完整 callbackEndpoint，即使路径也叫 `/sso/callback` 仍是 business，并禁止 ORCAS 托管配置。
本页合并显式类型与后续 origin 推导的决定。

## 理由与代价

从 URL 自动分类会把相同路径误当成同一信任边界；允许 managed 任意固定地址又会使业务落地与 IAM 代理入口脱节。
选择显式类型加已接受的落地 origin，不额外维护第二份 managed origin 白名单，接受管理员必须正确部署该 origin 下
IAM 代理路由的责任。

业务落地先按受限 redirect pattern 验证，再固定规范化的实际 URI、回调、兑换用途与可选 state。
拒绝任意 URL/JSON 配置；V1 state 由调用方关联并校验，IAM 不解释或补默认值，不把缺失 state 改为新协议要求。
模式与 query/fragment 的精确规则由协议契约拥有。

## 原授权与实际入口

续接复用首次接受事实，不因普通允许列表编辑重新审核原 redirect；当前 callbackType 必须仍匹配原流程。
类型变化使不兼容的未完成流程拒绝，不能把 business Code 转到托管入口绕过 Secret 认证。
类型切换本身不删除 Secret 或会话，退出不以当前类型重新解释既有 Token。

固定回调是授权绑定，不等于验证实际 HTTP 请求的公网 origin。代理可以改写 Host，IAM 不据此重新推导或额外验证
回调公网来源；管理员必须确保所信任 origin 的代理确实指向正确 IAM 入口。host-only Cookie 不自动跨域同步。
托管回调从 Code 绑定验证原会话关系与用途，不以请求 Host、浏览器根 Cookie 或 IAM 内部读取 Secret 作为托管认证依据。

这些选择避免额外的全局 origin 配置和跨域登录同步机制，但不承诺代理部署正确或所有用户旅程已验收。
托管与业务失败作用继续分开，见 [ADR-0035](0035-unify-user-and-client-session-lifecycles.md#一次消费与失败作用)。

## 当前契约与历史

配置、Secret 与类型变更见[Client 配置](../features/admin/client-sso-configuration.md)，
接入步骤见[第三方指南](../features/sso/third-party-sso-integration.md)，授权和回调规则见
[Custom SSO 契约](../features/sso/custom-sso-contract.md)。

同代转换与跨代升级的源识别、原凭据及非目标数据保护、失败恢复和人工发布责任仍按匹配版本历史流程执行，不能把
任意旧来源套到当前维护。入口见[历史维护命令](../development/commands.md#历史数据维护工具)；
删除升级正文不表示对应工具退役或环境已经升级。

历史来源：[ADR-0007 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0007-separate-versioned-custom-sso-client-configuration.md)、[ADR-0037 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0037-classify-managed-sso-callbacks-by-path.md)、[ADR-0038 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0038-derive-managed-sso-callback-from-redirect-origin.md)。原始决定与后续修订按各版本追溯。
