---
status: accepted
---

# 退役 Privilege 权限点体系

2026-10-21 决定退役 IAM 的 Privilege 权限点及角色派生关系。
IAM 提供 Role、Role Assignment 与 Effective Role 事实，接入应用解释这些角色对应的业务操作权限。
删除派生层简化角色模型，代价是调用方承担细粒度业务授权和原权限副本的迁移责任。
[角色与授权规则](../features/roles-and-authorization.md) · [应用信息共享](../features/application-integration.md#用户信息共享)

Admin Authorization Policy、Subject Access Permission 与 Client Delegation 各自保留原职责。
[Admin 授权决定](0017-centralize-admin-role-policy-with-request-time-scope.md) · [已发布事实决定](0032-consume-published-subject-facts-for-authorization.md) · [Client 委托决定](0020-provide-fail-closed-privilege-delegation-resolution.md)

## 退役切换的取舍

选择一次性收缩契约与源数据，拒绝权限点占位字段、兼容路径和双代运行。
从发布文档和缓存清理派生权限需要完整重建与独立核验，单独删除源表无法处理已有副本。
接受维护窗口、应用配对升级、源数据删除和发布前备份的成本，保留历史 migration 与审计记录。

切换保留仍有效的会话、Code、Token 和认证续接。协议记录独立于投影代际和权限点事实，原期限与安全检查继续适用。
新 Facts 就绪前暂停受影响的协议访问，避免旧 Code 在尚未发布时兑换失败并触发补偿。
接入应用负责停止使用或清理自身保存的权限点资料，包括本地缓存与会话。
仓库候选和目标环境切换分别核验。

Profile v4、Catalog 与 wire 的原代际切换保留在[历史运维入口](../releases/README.md#一次性迁移与旧版本)。
现行目录文档代际见 [ADR-0046](0046-unify-user-and-organization-read-documents.md)。
[原实施与验收 Spec #269](https://github.com/cyy1998/shgas-iam/issues/269)

固定历史版本：[整理前 ADR-0045](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/adr/0045-retire-privilege-permission-points.md)。
