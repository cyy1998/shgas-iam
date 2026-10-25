---
status: accepted
---

# 退役 Privilege 权限点体系

2026-10-21 确认退役 IAM 的 Privilege 权限点体系及角色到权限点的派生关系。IAM 保留 Role、Role Assignment、
Effective Role 和 Client Delegation，向应用交付角色事实，由应用解释角色对应的业务操作权限；IAM 不新增权限点的替代物。
本决定定义退役后的模型及协调发布约束；代码候选验证与目标环境发布分别取得证据。
完整范围、测试决定与实施状态见 [Spec #269](https://github.com/cyy1998/shgas-iam/issues/269)。

## 职责与范围

清除现行生产代码、契约、领域词汇和存量业务结构中的 Privilege 能力，包括详情与搜索、主体事实和协议交付中的权限点。
Client Delegation 继续表达独立代办关系，其遗留 Privilege 命名随本次退役清理，不能据旧命名删除委托能力。

Admin Authorization Policy 继续按有效管理角色决定动作和数据范围，Subject Access Permission 继续表达单次操作的账号访问许可。
通用的业务授权、数据库权限和这些既有安全检查不属于被退役的 Privilege 实体。

## 理由与取舍

IAM 提供角色事实，接入应用拥有角色对应业务操作的解释权。删除角色到权限点的派生层，接受接入应用承担细粒度业务授权的责任，
不以另一个名称在 IAM 重建同类权限点体系。角色分配与有效角色解析继续遵循
[ADR-0002](0002-centralize-role-assignment-resolution.md)，管理端授权继续遵循
[ADR-0017](0017-centralize-admin-role-policy-with-request-time-scope.md)。

本决定修订 [ADR-0032](0032-consume-published-subject-facts-for-authorization.md) 中交付派生权限的目标范围，
但不改变其已发布事实的一致性取舍。Client 委托继续遵循
[ADR-0020](0020-provide-fail-closed-privilege-delegation-resolution.md) 的独立代办语义。

## 历史边界

历史 migration 及其快照、冻结的 `openspec/`、历史审计记录和退役决策理由可以保留 Privilege 字样；
这些证据不构成继续提供现行能力的理由。当前领域定义及功能契约随实施更新，不能把历史记录重新解释为现行权限点模型。

## 一次切换与数据收缩

详情、搜索和 Custom SSO/OIDC 输出一次性删除权限点字段及搜索路径，不保留空数组占位、旧字段兼容或运行时双读。
Client Delegation 的错误码使用 `CLIENT_DELEGATION.*`，用户删除门禁使用 `USER.HAS_OPEN_CLIENT_DELEGATION`；
不保留旧错误码别名，调用方须同步升级。
包含已退役权限路径的搜索请求必须明确报错，不能忽略条件后扩大结果范围。

在维护窗口停止并排空受影响读写及旧 publisher，通过新的正式 migration 删除 `privilege`、`role_privilege` 两张表及其数据。
保留发布前备份用于恢复，不另建权限点归档业务；既有 migration 及历史快照不改写。

全量重建用户档案 Detail、Search Document 和 Subject Facts，并独立核验 PostgreSQL 与 Redis 中的派生数据已去除权限点。
单纯删除源表不能清除已发布文档及缓存，不以缓存自然过期、样本成功或队列为空替代全量核验。
重建与核验沿用 [Profile 维护流程](../releases/data-maintenance.md) 的 owner 和完整门禁；
该手册记录 Profile v4 的维护入口和本次切换顺序，命令存在及本地验证不能代替目标环境的完整放流证据。

接受调用方同步升级、维护窗口及源数据删除的成本，以换取单一现行模型；拒绝长期兼容分支和保留空字段的方案。

## 保留有效登录态

不因退役权限点而主动清空 UserSession、ClientSession、Code、Token、认证续接及其他现行协议产物。
当前持久协议记录不保存权限点快照，也不绑定主体投影 wire 或 Catalog 版本；旧 Token 后续读取按新契约交付。
保留仍有效的产物不延长原期限，也不豁免 Client 状态、Subject Access、会话生命周期或原有协议检查。

本次不借权限点退役改变会话与协议记录的存储格式、namespace、身份和访问代际、OIDC issuer 或签名键。
新 Facts 完成全量重建与核验前持续关闭受影响协议访问，避免旧 Code 在未就绪状态下兑换失败并触发既有会话补偿。
实施验收必须覆盖切换前建立的有效会话、Code、Token 和认证续接在新制品中的公开行为；自然过期继续按原规则处理。

## 接入应用责任

接入应用负责清理或停止使用自行保存的旧权限点副本，包括其缓存和本地会话中的授权资料。
完成调用方改造及旧副本处理，是恢复受影响入口的条件；由发布负责人与接入应用取得实际验收证据。
IAM 不代管第三方存储，也不把强制重新登录或 IAM 数据重建视为第三方副本已清理的证明。

仓库交付应提供新契约、配对升级要求和验收步骤；本地实现及测试完成不等于外部应用或目标环境已经切换。
目标环境发布、数据清理及第三方系统操作不由本次讨论自动执行。

## 契约代际

删除字段属于破坏性契约变更，将 User Profile schema 从 v3 升至 v4、Subject Claim Catalog/Selection 从 v2 升至 v3、
Custom SSO 主体 wire 从 v2 升至 v3。三者各自表达存储文档、声明语义与对外报文的边界，分别更新其 owner 及全部消费者；
切换后仅接受各自的新代际，不增加调用方选版、兼容解释或双代运行。

保留 `iam:authorization` claim/scope 和现有角色、任职结构，只移除其中的权限点内容；
Client 现有声明选择无需改名。协议持久记录的版本与上述交付版本独立，本次保持原样以保留有效登录态。
