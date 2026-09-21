---
status: accepted
---

# 共享主体投影并消费已发布 Facts

Custom SSO 与 OIDC 共享协议中性的 Subject Facts 与裁剪能力，各自保留配置、wire 和协议产物。
普通资料与 `iam:authorization` 都消费取得的合法已发布事实，不在交付时检查 Dirty 新鲜度或重新聚合源业务表。
本页合并共享投影、服务端 Catalog 与已发布授权事实的决定，并纳入当前披露规则的后续修订。

## 理由与代价

不直接共享完整 User DTO，不让各协议重复聚合授权，也不在投影失败时回退 Legacy User Detail。
发布事实与在线交付解耦，避免重建是否完成成为每次资料读取的前置屏障；这是一致性取舍，不是已经证明的性能收益。

接受事实落后于源业务状态，包括旧权限持续交付和重建长期失败；不承诺固定期限内撤权传播。
合法缓存命中不查 PostgreSQL，缺失或无效才读取已发布 Profile；事实不可得时明确暂态失败，
不能删除必要授权声明伪装成功。第三方复制后的刷新由第三方负责。

账号可访问性由 Subject Access 独立保护，不把账号 Disable/Delete 混进允许陈旧的 claims。
每次操作许可也不表示其交付的是最新权限，二者不能互相替代。

## Catalog 与披露边界

服务端只维护全局唯一 active Subject Claim Catalog，Client 保存完整声明选择，不协商或持久化 Catalog 代际；
运行时不多代混读或 fallback。接受升级时的全局协调成本，换取单一词汇与投影语义。瞬时 Selection 与协议 wire 版本各自独立，
Catalog 变更不恢复旧配置 epoch 撤销方案。

实际交付按 Client 当前披露范围构造投影，旧 Token 的 UserInfo 也可获得新增披露字段；已签 ID Token 内容固定。
原 Code/续接的授权事实保持原绑定，不因普通配置编辑重新审核原 redirect/scope 允许列表。
这三者分别表示原授权、当前披露和已签内容，不能用旧 Claims Snapshot 统一限制。

## 当前契约与历史

事实读取与交付失败见[Published Facts 契约](../features/sso/published-subject-facts-contract.md)，
独立操作许可见 [ADR-0029](0029-check-subject-access-once-per-business-operation.md)，
发布原子性见[后端架构](../architecture/backend-architecture.md#user-profile-subject-facts-publication)。
协议输出分别见[Custom SSO](../features/sso/custom-sso-contract.md)和[OIDC](../features/oidc/oidc-integration.md)。

历史来源：[ADR-0008 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0008-adopt-client-subject-projection.md)、[ADR-0016 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0016-own-subject-claim-catalog-version-server-side.md)、[ADR-0032 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0032-consume-published-subject-facts-for-authorization.md)、[ADR-0035 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0035-unify-user-and-client-session-lifecycles.md)。原始决定与后续修订按各版本追溯。
