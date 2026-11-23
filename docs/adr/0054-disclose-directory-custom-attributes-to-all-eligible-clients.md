---
status: accepted
---

# 向具备调用资格的应用统一披露目录自定义属性

首版由完整管理员在管理后台定义并填写用户、组织、岗位的[自定义属性](../../GLOSSARY.md#目录自定义属性)。
启用属性的已发布值向所有具备相应入口调用资格的应用开放，沿用 Internal API 的认证与目录范围，以及 SSO 的应用会话与有效任职资料范围。

逐应用授权可以限定某个字段的接收方，需要为各应用配置字段清单。首版采用统一披露范围，维护者只需管理定义和值。
启用属性适用于所有具备入口调用资格的应用，撤回披露也作用于整个范围。

## 读取入口

- Internal 用户与组织的搜索、详情使用各自的已发布文档。用户文档返回用户自身及有效任职的直属组织和岗位属性。组织文档返回组织自身属性。
  首版按属性编码返回已填写的值。搜索可选择属性对象，匹配和排序由既有目录字段决定。
- OIDC UserInfo、Custom SSO 用户信息及业务兑换返回的主体投影交付自定义属性。组织和岗位属性随获准披露的有效任职资料交付。
  Custom SSO 随主体投影升级到 Wire v5，使用严格 Wire v4 校验的调用方协调切换。

Internal 在所属对象上返回 `customAttributes`。Custom SSO 在 `profile.customAttributes` 返回用户自身属性，OIDC UserInfo 使用顶层
`iam:custom_attributes` 声明。两种 SSO 都在有效任职的直属 `organization` 和 `position` 对象上使用 `customAttributes`。
Custom SSO 也在 `profile.employments[].responsibilities[].targetOrganization` 上提供目标组织自身的 `customAttributes`。
省略未填写的属性键，值集合为空时省略整个属性对象。

## 发布时效

Admin 读取当前定义和值。属性值的修改、清空以及定义的启用和停用均随受影响的目录文档异步生效。
停用后、文档重新发布前，Internal 和 SSO 仍可能读到旧文档中的属性值。对外读取按已发布文档提供属性，免去在每次请求时读取定义的开销，
代价是停用的对外效果随文档发布而延迟。定义停用期间保留源记录上的值，重新启用后按重新发布的文档交付。

[目录文档与发布](0046-unify-user-and-organization-read-documents.md) · [主体事实与 SSO 披露](0032-consume-published-subject-facts-for-authorization.md)
