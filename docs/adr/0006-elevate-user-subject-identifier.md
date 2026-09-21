---
status: accepted
---

# Subject Identifier 归属 IAM 身份域

Subject Identifier 是 IAM 用户跨协议的稳定公开身份。复用原有 UUID，保持既有 OIDC `sub` 稳定；Custom SSO、
OIDC、User Profile 与搜索共享这一身份，不各自生成协议专属标识。

这避免协议迁移或投影变化造成主体漂移。数据库 numeric ID 不作为公开主体身份；标识属于用户，不属于会话或某次授权。
旧 Principal Session / Snapshot 的存储安排不再是身份决定的一部分。

当前词汇见[CONTEXT](../../CONTEXT.md)，两类会话如何引用主体见
[Kernel 契约](../features/sso/unified-session-kernel.md)。

历史来源：[ADR-0006 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0006-elevate-user-subject-identifier.md)。原始决定与后续修订按各版本追溯。
