---
status: accepted
---

# 引入无应用归属的全局角色

业务应用需要在各自的授权信息里识别同一类任职角色。IAM 提供无 Client 归属的 Global Role，应用可读取任职上的本应用
有效角色与全局有效角色。复用任职、岗位和组织分配，一条分配即可服务现有和未来接入的 Client。逐应用复制角色和分配
会增加维护成本，也会让各副本的启停与撤销进度分离。

## 已确认的边界

- Global Role 由 IAM 统一管理，生命周期独立于各 Client。Admin 创建时选择「全局角色」，表单隐藏所属应用，
  管理员填写编码后缀，表单添加固定的 `global:` 前缀。
- 显式角色类型决定可见范围。服务端验证 Global Role 使用 `global:`，并将该前缀保留给 Global Role。
  角色编码仍用于业务识别。将类型与编码校验分开，可以防止仅凭存量编码把 Client Role 扩大披露给其他应用。
- Custom SSO 和 OIDC UserInfo 按当前披露配置，将任职上的全局有效角色纳入现有授权声明。Internal 用户详情与搜索
  使用认证 Client 的可见范围，搜索匹配和响应采用相同的角色集合。应用负责解释角色对应的业务权限。

## 管理与编码命名空间

- 角色类型、编码和所属应用在创建后固定。将 Client Role 的业务职责推广到所有应用时，创建独立的 Global Role，
  再显式建立所需分配。这样现有 Client Role 的分配只会在原应用的范围内生效。
- 完整管理员可以创建、编辑、启停、删除和分配 Global Role。HR 管理员可在现有授权范围内的用户和任职详情中读取
  角色事实。IAM 管理权限由 [Admin Authorization Policy](0017-centralize-admin-role-policy-with-request-time-scope.md) 决定。
- Admin 角色列表默认展示两类角色，支持按类型筛选。按所属应用筛选时仅匹配归属该 Client 的角色。
- 新建 Client 时拒绝编码 `global` 及以 `global:` 开头的编码，保证应用编码拼出的角色前缀与全局命名空间分离。
  维护者确认现有 Client 和 Role（含软删除记录）均未占用本次保留的编码范围。迁移以该确认为存量前提。

## 已发布事实与切换

新版读取既有 User Document 和 Redis Facts 时，将缺省的全局角色视为空集合。现有角色保持 Client Role 身份，
其已发布事实可以继续使用。全局角色分配及生命周期变更通过现有的可靠失效与发布流程更新受影响用户。

先统一升级读取和发布相关事实的服务，再开放全局角色的创建和分配。此顺序允许按需更新已发布事实，并保留既有有效会话
与凭据。旧版本依赖角色的 Client 归属，且其严格 schema 无法读取带有新增全局角色字段的事实。开放写入后，
回退需要匹配的数据与制品，遵循[部署回退流程](../releases/deployment.md#完成检查与回退)。

本决定扩展 [ADR-0046](0046-unify-user-and-organization-read-documents.md) 的 Internal 角色可见范围，沿用
[ADR-0032](0032-consume-published-subject-facts-for-authorization.md) 的已发布事实与披露边界，以及
[ADR-0002](0002-centralize-role-assignment-resolution.md) 的有效角色解析。领域术语见 [CONTEXT.md](../../CONTEXT.md)。
