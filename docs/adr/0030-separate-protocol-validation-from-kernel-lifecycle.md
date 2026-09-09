---
status: accepted
---

# 分离协议用途匹配、配置校验与会话撤销

[讨论 #139](https://github.com/cyy1998/shgas-iam/issues/139) 记录了合法 Custom SSO 产物进入 OIDC 后引发同 Client 跨用户误撤，以及已读入的旧配置请求迟到后撤销新版本 Credential 的问题。本地调查基线为 `6e10a2f2feb931fc28da4d23500b69d36a6b5a97`；这些证据不表示生产环境已发生事故。

维护者于 2026-09-09 确认下列职责、接口、验证与发布方向。#147–150 已实现协议用途匹配、精确执行、两协议操作快照和 Admin 固定版本撤销；#151 的[最终契约](../features/sso/protocol-validation-contract.md)逐项核对 [Spec #146](https://github.com/cyy1998/shgas-iam/issues/146) 的 56 条故事与组合证据。各候选执行结果由 ticket 记录，父级聚合验收与环境升级仍是独立事实。

## 已确认的决定

OIDC 与 Custom SSO 统一采用相同的职责划分：Session Kernel 拥有协议中性的对象生命周期，并在任何协议校验或消费副作用前检查调用方预期的 protocol/type；各协议模块在 Kernel 外拥有自身配置校验。两协议保留各自的配置、Wire Contract、OIDC Client Binding 和 Custom SSO Authorization Grant 生命周期。

解析与消费入口必须明确预期 protocol/type；调用方已经知道目标 Client 时，同时匹配 Client。用途不符直接拒绝，不能触发 Subject Access 撤销、续期或消费。用途匹配早于主体访问检查及上述可变操作；管理端原始盘点保留独立的中性读取能力，不把在线协议用途要求套入管理查询。

普通请求发现对象配置版本失效时，拒绝本次使用；确需清理时，最多精确撤销已确认失效的目标对象及其从属对象，不隐式扩大为整个 Client 或协议的撤销。批量旧代撤销由显式配置变更或维护操作发起，整 Client 撤销必须有独立业务依据。重放处理继续遵守所属协议明确的撤销规则。

两协议统一执行以下失败处理：已经确认属于本入口的对象，在确认配置版本等永久失效时，拒绝并精确撤销该对象及其从属对象；用途、Client、redirect 或浏览器绑定不符只拒绝。Client Maintenance、配置读取故障等暂态失败保留对象。清理失败仍拒绝本次访问，现有恢复责任继续适用，本决定不把待讨论的异步清理执行器视为已有能力。

对象版本高于本操作配置时，只能判断本次无法接受，不能确认其永久过期；拒绝并保留，下一操作取得匹配配置后仍可使用。此规则同样适用于 Binding、Code、Credential、Return Handle 与 Provider 协议对象，不以版本不等推断旧代。

同一次接口调用所代表的业务操作，对同一 Client 的同一协议配置以及 Client Traffic Gate，分别复用各自首次取得的结果，成功、拒绝和暂态失败均固定到调用结束。两类事实保持各自含义，不合并为一个假定原子的视图。后续校验、消费和签发复用本次已接受的配置；新的调用重新获取。在途调用可以继续，但对象已撤销、消失或消费冲突仍可导致失败。

协议配置变更把版本推进到 `V` 后，Protocol Configuration Revocation 命令固定 canonical Client、协议和本次提交版本 `V`，仅选择版本 `< V` 的对象，不能使用 `!= V`。Client 停用分别固定两个协议的本次版本。迟到或重试命令不得撤销本次版本及后续更高版本的对象。

配置变更、协议启停、Secret 变化、Client 停用或删除均使用本次提交版本限定的撤销。无版本筛选的整 Client/协议撤销能力只保留给明确要求终止该范围全部当前访问的独立管理或维护命令；普通请求不能通过校验失败进入该能力。本次不新增管理端点，退出、重放和 Subject Access 继续使用其各自已有的明确范围。

一次撤销枚举不保证覆盖之后才落库的旧 Snapshot 在途对象；维护者接受该边界，不为配置切换增加排空在途请求的强屏障。极迟写入的旧代对象在后续调用按所取得的协议配置判断失效并精确清理，维护操作可回收残留。该承诺继续受已有 Runtime 传播失败边界约束，不能宣称 PostgreSQL 一提交所有 reader 就必然观察新配置。

由 #139 讨论形成的 Spec #146 拥有本次两协议配置与 Traffic Gate 的操作内复用及误撤修复。[#71](https://github.com/cyy1998/shgas-iam/issues/71) 继续拥有其余对象重复读取、I/O 预算和性能验证；[#121](https://github.com/cyy1998/shgas-iam/issues/121) 的可靠异步清理独立讨论，本次不把它作为已经存在的恢复能力。

显式批量撤销复用已有协议 metadata，由协议层提供同步、只读的旧代对象选择器；Kernel 限定 Client 与协议，拥有枚举、对象比较和撤销，不解释 `oidcConfigVersion` 或 `configVersion`，也不为此新增持久化 `protocolContext`。选择器仅用于明确发起的批量撤销，不进入普通解析、消费或全局配置校验 hooks。

撤销必须仍作用于选择时观察到的对象；选择后该 identity 若已被替换，不能仅凭同一 ID 撤销替换对象。当前普通撤销内部重新读取对象后的 CAS 不能单独证明该保证。版本缺失或损坏的对象归为无法确认代际，跳过此次按版本批量选择并报告有界诊断；在线访问仍按协议校验拒绝，交由精确对象维护处理，不能把无法判断代际转成全 Client 撤销。

这一方向把校验拒绝与批量终止访问的权限分开，避免一个对象的错误决定其他用户或新版本对象的命运。仅在现有 OIDC hook 中增加 protocol 判断不足以解决旧请求误撤新版本的问题。协议配置判断移出 Kernel 后，协议模块需要明确完成这些检查，不能把 Kernel 解析成功视为已通过协议校验。

## 检查与副作用顺序

在线协议路径先按预期用途解析对象，并确认该入口要求的 Client、redirect、浏览器绑定等请求归属。各协议模块拥有 metadata 解析与配置判定，复用本次操作的配置和 Gate 结果；这些协议约束与 Subject Access Permission 都必须先于续期、Grant 预占、Code/Artifact 消费及签发满足。可能导致永久撤销的处理不能越过尚未满足的用途或请求归属检查。

消费仍针对已完成相应协议校验的同一对象，Kernel 在消费处执行预期用途与原子生命周期约束，不以再次读取最新协议配置替代消费并发检查。协议模块保留自己的 Grant 状态机、OIDC Provider 回调与错误映射，移除 Kernel 中全局配置 validation hooks 及其隐式批量撤销路径。主体访问拒绝与重放终止仍由各自 owner 按已经明确的范围发起。

## 验证决定

主要验收采用真实 Redis、实际协议 HTTP 入口及 Admin 变更链，不为本次新增完整系统 E2E；现有相关 E2E 保留。后续实施必须把以下要求落为直接可观察的永久回归，不能只验证错误码而忽略非目标对象的状态：

- 合法 Custom SSO Credential 送入 OIDC UserInfo，以及 Custom SSO Code 送入 OIDC resume 时拒绝；同 Client 其他用户、另一 Client、Principal roots 和原对象保持，错误类型 Artifact 不提前消费。反向跨协议以及已知 Client 不匹配同样保护。
- 已读旧对象的请求迟到时仅精确处理失效目标，新版本对象保留；用途、redirect、浏览器绑定不符只拒绝；Maintenance、配置/Gate 读取故障不续期、不消费、不撤销。
- Admin 配置传播成功后签发新代对象，再恢复迟到撤销命令；以及连续推进两个版本后乱序执行旧命令，均保留边界版本及更高版本。极迟创建旧代对象按已接受的访问时拒绝边界处理。
- 选择旧对象后替换同 identity 的对象，不得撤销替换对象；无法判定版本的对象跳过版本批量撤销并报告，不能扩大范围。
- 同次操作的配置和 Gate 分别复用首次结果，覆盖成功、拒绝、暂态失败与并行回调；新调用重新取得。已接受旧 Snapshot 的在途操作可继续，同时保留对象存在、撤销、消费和并发冲突约束。
- 合法 OIDC、Custom SSO 登录和兑换、Subject Access 许可及拒绝、重放撤销继续成立。替换原 hook 测试时保留仍适用的保护目标；明确证明显式批量撤销与普通拒绝的权限差异。

按仓库工作流执行受影响 owner 的静态、类型与相关行为验证，并在准备交付时完成要求的聚合验证和双轴评审；实际环境切换单独留存人工证据。本文不表示这些行为测试或发布步骤已经执行。

## 发布决定

对于已经满足本次调查基线数据契约的环境，暂停相关协议流量、冻结相关 Client 变更并排空旧进程，统一升级全部受影响消费者，保留仍然有效的在线对象。本方案复用现有 metadata，不要求新增持久化格式迁移或全量登出；放流前验证误投凭据不会误撤，以及合法 OIDC 与 Custom SSO 访问仍然有效。

更早部署若尚未完成既有数据契约迁移，必须按原适用迁移手册另行处理，不能据本决定直接保留不兼容状态。[保留对象升级手册](../releases/protocol-validation-preserving-upgrade.md)拥有进程清单、维护 smoke、失败保持与前修/回退条件；旧全清和 epoch 推进命令不适用于满足当前格式的本次升级。没有执行环境操作。

## 与现有契约的关系

- 延续 [ADR-0010](0010-narrow-client-binding-to-oidc-lifecycle.md) 的协议生命周期分工，不为 Custom SSO 引入 Client Binding。
- 延续 [ADR-0027](0027-own-online-authentication-lifecycle-time-in-redis.md) 的 Redis 时间与取得时有效性；后续对象存在、撤销、消费和并发比较仍可阻止操作。
- 延续 [ADR-0029](0029-check-subject-access-once-per-business-operation.md) 的操作许可与独立撤销编排；协议用途匹配必须早于可能触发该编排的主体访问检查。
- 延续 [ADR-0021](0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md) 与 [ADR-0022](0022-adopt-snapshot-consistency-for-client-traffic-gate.md) 的 Snapshot acquisition、Maintenance 暂态和传播失败边界；本决定进一步统一同次业务操作内协议配置 Snapshot 的复用范围。
- [ADR-0028](0028-extract-session-and-grant-state.md) 记录提取时保持既有 facade 语义，本次是后续职责调整；正式工程文档在实现时随已接受方案更新。

## 确认状态

维护者已确认各分项及整体方案。实现及候选证据沿最终契约和各 ticket 追溯；不重新引入全局配置 hooks、隐式批量撤销或新的协议状态格式。本文记录长期决定，不代替实际回归结果、父级最终验收或环境升级证据。
