---
status: accepted
---

# 从本次业务落地地址的 origin 推导托管回调

维护者于 2026-09-16 在 `grill-with-docs` 讨论中提出：Custom SSO 托管回调不再使用配置的完整回调地址，
改为本次 `redirectUrl` 的 origin 加上 `/sso/callback`，让同一个 Client 的内外网入口分别承接登录回调。
维护者随后调用 `to-spec`，确认将完整设计和已给出的验证范围发布为 Spec。
本文记录已接受的修改目标。#202–#205 已实现授权、严格配置、同代保留维护与 b648 数据库阶段；
#206 的真实跨代与正式 Gateway 验证记录在[70故事账本](../features/sso/managed-callback-origin-acceptance.md)。
环境尚未迁移或部署；以下讨论时证据不作为当前代码说明。

## 修改目标与既有决定

托管回调的目标基础地址为 `new URL(redirectUrl).origin + '/sso/callback'`。例如业务落地地址
`https://app.internal.example.com:8443/work/orders` 对应
`https://app.internal.example.com:8443/sso/callback`；业务路径不成为回调路径前缀。
基础地址与回调携带的协议参数是两个层次，最终落地地址仍表达登录完成后访问的业务页面。

这将局部修订 [ADR-0036 Q6](0036-bind-oidc-to-internal-and-external-issuers.md#q6custom-sso-回调按实际配置执行)
以及 [ADR-0037](0037-classify-managed-sso-callbacks-by-path.md) 中托管回调使用配置完整地址、允许任意回调路径的决定。
本次目标只指向托管回调；现有显式回调类型继续区分 IAM 托管与业务处理，业务回调和 OIDC 不因本目标自动改变。

当前行为见[授权契约](../features/sso/custom-authorization-candidate.md)与[托管消费契约](../features/sso/custom-managed-candidate.md)，
执行流程分别见[同代手册](../releases/managed-callback-origin-preserving-upgrade.md)和[跨代手册](../releases/b648-managed-callback-upgrade.md)。

## 已确认的决定

### Q1：托管回调继承业务落地地址的 origin 信任

维护者已确认：先按现有 `validRedirectUrls` 验证本次实际业务落地地址，接受后从规范化地址的 origin
推导 `/sso/callback`，不增加独立的回调 origin 允许列表。即使落地规则只允许 `/work/*`，同 origin
的 `/sso/callback` 也获准承接回调；一级子域通配命中的每个实际 origin 同样适用。
管理员负责让这些 origin 的 `/sso/callback` 具备代理到 IAM 的能力。

协议和非默认端口来自实际地址，业务路径和 query 不成为回调基础地址的一部分；原完整落地地址仍用于最终跳转。
现有落地 URL 的协议、主机、端口、路径与格式校验继续生效。

### Q2：托管配置移除完整回调地址

维护者已确认：托管类型不再展示、要求或保存 `callbackEndpoint`，存量托管配置通过迁移删除旧值；
业务类型继续要求固定完整回调地址。旧托管地址的路径及自定义 query 不复制到推导出的新基础地址。
显式 `callbackType` 保留，仍由管理员选择，不从落地地址或路径推断类型。

### Q3：固定首次接受的回调事实

维护者已确认：首次接受合法落地地址后推导回调，将完整回调、原落地地址、用途及可选 state 一并保存。
认证续接和 Code 兑换沿用这组事实，不因之后编辑落地白名单重新匹配原地址或选择另一回调。
当前 Client 通行状态、协议启用及适用的回调类型等检查继续生效；本决定不允许通过修改 query 改写原授权事实。

### Q4：旧的未完成托管流程重新授权，保留已登录会话

维护者已确认：升级时使受影响托管 Client 的旧 Code 与认证续接失效，用户重新发起授权；
已有 UserSession、ClientSession 和 Token 保留，不重置期限，不因本次迁移要求已登录用户全部重新登录。
本条针对已经采用统一会话、单协议配置的来源；维护者随后追加的旧 Gateway/Independent 直升路径跨越模型边界，
其在线状态切换另行确定，不能直接套用本条保留承诺。
业务回调 Client 与 OIDC 的状态不属于本次清理范围。实现和维护流程须提供定向失效与非目标保留的直接证据，
不能用清空全部 Custom SSO 状态代替；具体命令能力和协调切换顺序仍待设计。

清理目标按迁移时明确捕获的托管 Client 集合限定，处理这些 Client 的全部旧 Code/续接；
“业务回调 Client 不清理”指不在该集合中的业务配置 Client，不表示在目标 Client 内按旧产物用途再保留一部分。

### Q5：沿用现有代理契约

维护者已确认：本次不新增浏览器实际回调 origin 的传递与校验；代理可继续改写 Host。
管理员把各允许 origin 的 `/sso/callback` 代理到 IAM，host-only Cookie 仍属于浏览器实际访问的回调主机。
Code 中保存的回调与原落地事实绑定，不代表 IAM 已验证实际 HTTP origin，也不提供跨主机 Cookie 同步。

### Q6：回调类型切换后拒绝未完成的原类型流程

维护者已确认：续接或兑换时，当前回调类型与首次接受的类型不一致就拒绝，让调用方重新授权。
原 Code/续接不被改写用途，不以新的托管方式兑换旧业务 Code，也不反向转换旧托管 Code。
普通类型切换不主动清空已有会话，不删除已有 Secret；其余适用的当前访问规则继续生效。

### Q7：维护窗口统一切换

维护者已确认：暂停受影响协议流量及配置写入，排空旧实例；迁移配置和数据库约束，统一更新读取、写入与管理消费者，
按来源版本执行适用的在线状态处理，再完成 Snapshot 清理与独立核验，通过受控 smoke 后恢复。
新 managed 配置严格禁止 `callbackEndpoint`，business 继续必填，不提供新旧 managed 形状的在线兼容或混跑。
Snapshot 清理后由新 reader 回源，不把清缓存描述为已经预建了全部配置 payload。

### Q8：旧模式跨代直升全部重新登录

维护者已确认：旧 Gateway/Independent 来源跨越旧会话模型进入最新目标时，沿用全体 IAM 用户重新登录方案。
清理适用的根、应用关系及两协议在线认证状态，不把旧会话或 Token 转换成最新对象；账号、业务数据及 Internal API 凭据保留。
本条与 Q4 分别约束跨代与同代路径，不能用本条扩大同代升级的清理范围。

### Q9：旧 Independent 使用新 SSO Secret

维护者已确认：沿用现有迁移策略生成新 SSO Secret，并把业务接入方切换完成列为放流条件。
旧哈希不用于恢复原文；Gateway 转 managed 不新增 Secret 要求，Internal API 凭据不变。
同一迁移重跑须保持已生成的凭据身份，不因重试再次轮换。所选 confidential OIDC 沿用同一既有迁移策略。

### Q10：固定旧版来源

维护者明确指定 `b6481f2de5c2930fc381d99e70520e0783091e9d`，即会话模型重构前的版本。
本地 Git 已确认该对象存在；旧版直升的设计与整链演练以此为源，不泛化为所有历史 Gateway/Independent 版本。
实际部署的 schema/journal、配置和认证状态仍须在升级预检中与该来源核对。

## 讨论时实现证据（历史）

只读调查基于上述讨论基线；以下是当前行为，不是新目标已经实施的证明：

- [授权接受](../../packages/custom-sso/src/unified/authorization.ts)当前从配置读取完整 callback，
  将地址、用途、规范化落地地址和 state 固定到续接及 Code；恢复续接不重匹配允许列表。
- [托管兑换](../../packages/custom-sso/src/unified/operations.ts)当前要求原 Code 的用途为 managed、
  当前类型仍为 managed、Code 回调等于当前配置回调，以及请求落地地址与 Code 逐字一致。
  只修改授权跳转不足以完成本次目标，配置回调比较必须相应调整。
- [HTTP 回调](../../apps/api/src/routes/sso/unified-callback.handler.ts)没有向协议操作提供实际 HTTP origin。
  [浏览器代理 fixture](../../apps/api/test-integration/browser/custom-sso-server.fixture.ts)允许外部回调地址代理到另一
  origin 的 IAM 端点，不转发外部 Host；因此不能把当前 Code 绑定解释为实际浏览器回调 origin 校验。
- 修改配置回调后，旧续接仍保留旧地址，但由此签出的 Code 不一定可以兑换；当前兑换还比较配置回调。
  旧流程兼容不能仅凭状态中保留地址而宣称成立。

配置消费者的只读调查进一步确认：

- [共享配置 schema](../../packages/contracts/src/client-sso.ts)目前两类回调共用严格对象，均必填地址；
  [Domain 规范化](../../packages/domain/src/client/sso-configuration.ts)也无条件复制该字段。
  [Admin 页面](../../apps/admin/src/pages/clients/ClientSsoPage.tsx)对两类均回填、展示和提交地址，
  只隐藏控件不能完成 Q2，保存对象须按类型构造。
- [数据库约束](../../packages/db/src/schema/core/clients.ts)要求该字段存在；Admin DTO 与
  [Snapshot schema](../../packages/api-core/src/client-snapshot/contract.ts)共同消费严格配置。
  新旧 managed 形状不能被对方当前读取端接受，不能声称可直接混跑。
- 旧单协议显式类型迁移（工具已退役）只补类型和处理旧业务 ORCAS，
  不删除地址；[Worker 旧配置升级](../../apps/worker/scripts/b648-upgrade/upgrade-plan.ts)服务旧双协议来源，
  不能替代本次单协议迁移。Q2 需要新的迁移能力，并处理旧工具依赖在线 schema 形状的问题。
- [统一维护流程](../releases/unified-session-maintenance.md)可以提供协调切换框架。
  当前 Snapshot full repair 实际清理当前缓存族，独立 verify 检查库存为空，随后 reader 回源；
  不能将其写为预先重建了所有 Client payload。
- [Custom SSO maintenance](../../packages/custom-sso/src/unified-maintenance.ts)和
  [Worker CLI 参数](../../apps/worker/src/commands/online-state/arguments.ts)当前可按 Client 清理，
  但会同时删除 Code、续接、Token 及其反向索引，不能原样执行来满足 Q4。
  需由 Custom SSO owner 增加 Code/续接的精确筛选及同范围 inventory/apply/verify，Worker 仅负责组合调用。
  Code/续接没有 per-Client 索引，必须扫描所属 namespace 并校验记录归属，不能按 Client 名称猜测 key。
  Token 和 Token 反向索引完整保留；无法解析或不能确定归属的记录应保留并阻止宣称清理完成。

## 追加范围：旧 Gateway/Independent 版本直升

维护者在确认 Q6/Q7 时要求一并考虑旧 Gateway/Independent 版本直接升级到最新流程。
该范围包括旧双协议 Client 配置到最新单协议配置，以及跨代在线状态和配套读取端的协调处理；
不能只提供已迁为单协议版本的增量迁移，也不能把“直接升级”写成任意历史 schema 都可以跳过数据门禁。

已明确的目标映射是 Gateway → managed，Independent → business；前者最终不保存完整回调地址，
后者保留业务登记地址。Q8–Q10 已固定跨代状态、Secret 策略和精确来源，迁移顺序见下列升级设计。

[升级设计](../features/sso/managed-callback-origin-upgrade-design.md)记录来源分类、转换表、离线阶段和工具缺口。
现有证据支持在一个维护窗口执行必要离线阶段、最后只启动最新业务 runtime；
不证明最新无地址 managed 的完整直升链已经实现或验证。

精确源版本的 `apps/api/src/routes/sso/sso.handlers.ts` 已按业务落地地址推导 Gateway 的 `/sso/callback`；
Independent 使用配置地址。本次保留这两种接入的目标含义，并由最新显式 `callbackType` 表达。
旧 Gateway 配置没有完整回调字段，因此不存在可直接读取的固定旧地址。

保持历史 SQL 与 journal 不变时，原 CHECK 要求迁移中间配置带地址。离线工具应生成受控的临时中间值，
只用于冻结的过渡形状，通过有序历史迁移后删除，最终严格 verify 须证明无残留。
不要求管理员新增 `gatewayCallback`，不启动中间业务 runtime，也不让该中间值成为可用登录回调。

## 讨论时实施交付边界（历史）

- Q4 需要补齐 Custom SSO owner 与 Worker 的定向维护能力，现有整 Client 清理命令不能直接用于同代增量升级。
- 旧版直升需要补齐有明确迁移截止点的离线编排、冻结来源/中间 schema、最新无地址转换与完整来源演练。
- Q1–Q10、升级步骤及下列验证范围作为已接受设计进入 Spec，尚未交付实现。

设计发布不代表升级工具已经具备这些能力，也不代表已执行目标环境操作。

## 验证范围

- 配置契约及 Admin 行为：managed 不提交或保存地址、business 必填，类型切换按目标形状提交，
  保留已有 Secret 和 ORCAS 类型约束；服务端严格解析、持久化及公开输出一致。
- 授权与兑换：同一 Client 的内外网 origin、非默认端口、HTTP localhost、路径子树和一级子域通配；
  拒绝非法落地地址，首次接受后回调固定，原落地地址与用途不可篡改，业务回调继续使用配置地址。
  query 继续采用现有允许规则，只有合法落地 query 得到保留，不复制为新回调基础地址的自定义 query。
- 真实 HTTP/Redis：登录续接、Code 单次消费、原 state 和最终落地行为、当前 Client 门禁、
  managed/business 用途隔离、失败补偿，以及 Q6 确定的类型切换后拒绝原流程。
- 真实 PostgreSQL 与维护入口：配置迁移、约束、重复执行、异常中止，凭据与非目标配置保留；
  Snapshot 清理、独立核验和新读取端回源使用新形状。
- 升级演练：实际旧写入端产生受影响 Code/续接及需保留的 Token/会话，经正式迁移和定向处理后，
  旧流程失效、新授权成功，原 Token/会话身份和期限保留，业务 Client 与 OIDC 状态不被清理。
  旧 Gateway/Independent 直升另设固定来源演练，按最终确定的跨代策略验证，不复用同代保留结论。
- 真实浏览器和代理：两个不同 hostname 分别使用本次落地 origin 下的 `/sso/callback`，
  验证 host-only Cookie、原完整落地和既有 state 交付；代理可改写 Host。
  保留正式 Gateway 的相关旅程回归，不以本地自动化结果宣称目标环境代理已经部署。

实现阶段按仓库流程执行受影响 typecheck、静态检查、行为验证和双轴评审；最终合入候选另执行全仓 `pnpm verify`。
讨论阶段仅运行文档检查；后续实施的实际结果以[验收账本](../features/sso/managed-callback-origin-acceptance.md)和固定候选 issue 评论为准。

## 恢复点

目标分支 `main`，讨论基线 `7825b22384ac823c8b5c0db905c0141ced264abd`，功能分支
`codex/custom-sso-managed-callback-origin`。Q1–Q10 已确认，旧版来源固定为 `b6481f2de5c2930fc381d99e70520e0783091e9d`。
维护者已调用 `to-spec` 发布整体设计；先创建独立设计文档提交，再发布 Spec，由 Spec 保存提交 SHA。
上述恢复点属于设计发布时；实施沿同一分支，固定候选由 Spec #201 / Ticket #206 交接评论记录。
实际环境迁移与部署尚未执行。
