---
status: accepted
---

# 完整退役 Custom SSO 的 ORCAS 集成

Type: decision
Status: Current
Last verified: 2026-09-28
Next review: 2026-10-31

本决定记录维护者已确认的退役边界。作出决定时，托管 Custom SSO 回调会在消费 Code 后按 Client 配置调用 ORCAS，
并将外部身份引用保存到托管 Token；该背景解释本次收缩范围，不表示目标环境已经切换。

## 决定与取舍

IAM 完整退出 ORCAS 专有登录和会话集成，保留通用 managed/business Custom SSO、OA 根认证及 OIDC。
删除 ORCAS 外部登录调用、专用用户读取与装配、Token 和认证上下文中的外部引用、Admin 开关、配置契约及环境依赖。
`/public/orcasId` 直接移除；回调不再交付 `orcasToken` 或 ORCAS Cookie，不保留空结果接口或兼容读取。
已有浏览器 ORCAS Cookie 不再由 IAM 读写或专门清除，交由原期限自然结束；外部应用须停止依赖这些交付。

上线前采用现有全量在线认证状态清理流程，清除所部署 IAM namespace 下的 UserSession、ClientSession、Custom SSO
和 OIDC 协议产物。接受全部 IAM 用户重新登录的代价，以免为旧 ORCAS Token 保留临时解析器、双读或惰性迁移。
采用维护窗口内一次切换，不允许新旧 runtime 混跑；本次全量清理是明确的发布操作，不改变普通配置编辑不撤销会话的规则。

ORCAS 自己负责外部会话的有效期与注销。IAM 全量清理不证明 ORCAS 或其他第三方自建会话、已签离线 ID Token 已失效，
本次不新增外部注销、查询或补偿能力。

## 状态边界与既有维护流程

现有 `online-auth:state --layout unified --owner all` 的 inventory、apply 和独立 verify 覆盖 Kernel、Custom SSO
及 OIDC；它不处理 PostgreSQL Client 配置或 Client Snapshot。执行要求与命令统一引用
[当前会话维护手册](../releases/unified-session-maintenance.md#库存清理与独立核验)，不另造清理脚本。

旧 Token 中的 `orcas` 字段受严格 schema 校验。移除字段前，须使用仍能识别旧记录的固定版本维护工具完成全量清理及独立
核验，再切换到收缩后的 schema；不能先部署新解析器，再把无法识别的旧记录当作已经清除。

数据库迁移移除既存 Custom SSO 配置中的 `orcas`，并收紧配置约束；保留其他 Client 配置、SSO 启用意图和 Secret。
历史 migration 保留，新增迁移承接数据变化。数据库配置完成转换后，在停止 Client mutation、Snapshot acquisition
并排空旧 reader/writer 的条件下，复用
[Snapshot 全量修复与独立核验](../releases/unified-session-maintenance.md#新-snapshot-的定向修复与全量恢复)，
新 reader 随后从转换后的数据库配置回源。

清理不扩展到 Subject Access Barrier、Subject Facts、登录限制、短信码、nonce、队列或审计记录。
停流、排空、非目标保留核验、readiness、受控 smoke 和恢复放流继续由既有维护手册规定；恢复应用必须与当前数据兼容，
不恢复旧登录态备份来撤销已完成的清理。

## 对现有决定的影响

本决定收回 [ADR-0028](0028-extract-session-and-grant-state.md) 中的 ORCAS 外部能力、
[ADR-0035](0035-unify-user-and-client-session-lifecycles.md) 中的 ORCAS 专属失败说明，以及
[ADR-0038](0038-derive-managed-sso-callback-from-redirect-origin.md) 中以 ORCAS 区分回调配置的表述。
其余模块所有权、托管与业务回调边界、一次消费及失败补偿策略继续有效；
[ADR-0021](0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md) 的 Snapshot 恢复责任继续适用。

当前 Custom SSO 与 Client 配置契约、接入指南及架构和维护文档承接退役后的边界。
历史记录不因退役而重写。代码交付与真实环境切换分别验证，本文不记录实施进度或代替部署授权。
