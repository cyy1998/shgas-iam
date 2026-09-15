---
status: accepted
---

# 以 UserSession 与 ClientSession 收敛协议和配置生命周期

> 2026-09-14 Q34–Q39 分项已确认并整合：适用认证及定位通过后失败在本请求内有界尝试撤销；Custom 业务
> Code 采用三段格式，Public 沿用原定位门槛，托管回调不纳入本轮讨论。Q40 已完成修订整体确认并要求同步 #177。
> 下文 Q11/Q16 的普通失败保留实例规则已被修订，以 Q34–Q39 和完整设计最新矩阵为准。

[讨论 #177](https://github.com/cyy1998/shgas-iam/issues/177) 已确定两类会话、协议独占 Code/Token、单协议 Client、
配置维护与显式撤销分离的总体方向。维护者于 2026-09-13 完成 Q33 整体确认，并授权更新 #177；本文记录已接受分项，
不构成实施或环境切换记录。原 D1–D10 已按完整设计收敛，V1–V4 保留为后续交付的验证责任。

[完整收敛设计](../features/sso/unified-session-lifecycle-design.md)把本轮决定连接到模型、接口、操作顺序及验收矩阵，
字段、接口和缓存布局已随 Q33 整体确认；Q32 已明确 Secret 重读权限中的“超级管理员”映射为现有 `iam:admin`。

## 实施边界

#194 将 API、Admin API、Worker 与前端接入本模型并删除旧 OIDC app；环境切换尚未执行。
Q34–Q39 保留兑换失败对原 ClientSession 的有界作用；#190 的取消退出只消费确认，保留 Cookie/根/应用关系/Token。
确认退出仍处理本次请求的根，不冻结旧根，不增加多标签页保护。
旧 Credential 不复查父、配置版本撤销和 Claims Snapshot 决策被本 ADR 的两类会话与当前披露规则取代。
首次迁移必须固定旧工具先完成 Client apply/verify，再执行最终收缩，见[统一维护手册](../releases/unified-session-maintenance.md)。

## 已确认的分项

### Q1：保留独立 SSO 启用意图

单协议 Client 保留统一的 `ssoEnabled`，独立于 Client 整体状态、Internal API 能力和业务归属。关闭时保留协议配置，
只暂停 SSO 流量；重新开启后，原期限内且未撤销的访问可以恢复，不延长期限。永久终止既有访问仍由显式撤销表达。
这使仅关闭 SSO 不必连带停止 Internal API，也不必删除配置后重建。

本决定取代 ADR-0007 中协议启停推进版本并使旧产物失效的规则；#194 将其接入默认生产图。

### Q2：首次升级要求全体重新登录

首次架构升级采用停流并排空旧进程、清理旧在线认证状态、迁移 Client 配置、核验后启用新版本的路径。
不转换旧 Provider、Kernel 与 Cookie 之间的登录关系来保留登录；账号、角色等业务数据保留。
这以一次重新登录换取不维护两代会话转换与兼容读取。

具体源/目标库存、清理与核验 owner、旧双协议 Client 选择、Secret 存量、Cookie、故障和回退流程仍属 D6，
不能由此推导已经授权执行环境操作或已经完成迁移。

### Q3：取消 Secret 重叠期

维护者明确不需要 Secret 重叠期限，本轮按不保留上一份 Secret 的认证宽限期收敛：只维护当前有效 Secret，
不设计 current/previous 的并存窗口或上一份提前撤销操作。轮换不撤销 UserSession、ClientSession、Code 或 Token，
但之后需要 Client 认证的操作须使用该次认证观察所认可的 Secret。

本分项修订 #177 §4.3 及 V3 原先的固定重叠期目标。Secret 认证读取采用下述 Q4 的缓存优先策略；
失效失败和在途认证按 Q7 处理，取消重叠期不表示跨进程即时切换。
仅超级管理员重读当前 Secret 及读取审计的方向继续沿用；Q12 已选择明文持久化，权限隔离与失败细节仍需落实。

### Q4：Secret 认证缓存优先，轮换时失效缓存

Secret 认证优先读取缓存，不强制每次认证访问 PostgreSQL；轮换在数据库提交后使对应缓存失效，之后需要回源的认证
读取当前凭据。取消重叠期表示不主动保留可并存的上一份 Secret，不消除缓存传播与在途操作的观察边界。

缓存布局和读取故障仍属 D10；失效失败与晚到回填保护按 Q7 冻结，不能由普通 `DEL` 自动满足，
也不能将 Secret 放进协议调用方普遍可见的 Runtime payload。是否与 Client Snapshot 共享 control
及失效/repair 入口，结合 Q6/Q7 继续细化。

### Q5：UserSession 期限由 env 配置

根登录期限由统一认证的服务端 env 配置，不作为每个 Client 的设置或请求参数。延续 #177 已确认的固定根期限和
两协议不续根方向；改变 env 只影响新建根，不追溯改写已建根的到期时间。

当前仓库模板根 idle/absolute 默认均为 86400 秒，但维护者本轮只指定 env 配置方式，未指定新的默认数值。
最终变量名称、是否必填及默认值随运行时配置契约明确，不将 24 小时硬编码为业务不变量。ClientSession 与各协议
Token 期限按 Q8 单独表达，不能因根使用 env 而自动推导它们的取值。

### Q6：每个 Client 一份统一 Runtime Snapshot

Gate 与所选协议配置合并为每个 Client 的一份 Runtime Snapshot，由同一次 PostgreSQL 行读取构造；共同缓存命中
以一次 Redis 网络往返为预算，同一业务操作接受后复用。Secret 认证沿 Q4 独立处理，不加入普通 Runtime 结果。

共享 Snapshot Module 继续拥有 acquisition、control、bootstrap、失效、发布 CAS、防晚到回填、ABA 保护、有界重试
及 repair/verify；合并 payload 不将缓存版本恢复为会话或协议产物的有效性版本。保留 Admin 提交后传播失败窗口、
显式修复和已取得 Snapshot 的在途操作可完成边界，不承诺全局最新配置。

通行状态与协议可用性仍分别表达；Client 不存在、停用、维护、协议未启用/未配置与获取暂态失败不能折叠成同一个
absent。合并前定向核对的 OIDC UserInfo/loadExistingGrant、Custom SSO authz/Public UserInfo 及 IAM 根 UserInfo
成功操作均依赖协议配置，独立 Gate hook 不证明存在整个成功操作仅需 Gate 的消费者；该调查不代表全仓完整 census。
真正仅需 Gate 的能力边界、TTL、负缓存、坏 payload 和新旧 namespace 的迁移仍须在 D10/D6 明确。

该目标局部修订 ADR-0021/ADR-0022 的三份独立 payload 与分别观察形状，继续保留其一致性与恢复责任。

### Q7：接受 Secret 缓存传播失败窗口

数据库已提交轮换、但对应缓存失效失败或未确认时，旧缓存仍可能使旧 Secret 通过认证。Admin 返回已提交且缓存同步
失败的结果，保留显式修复入口，不自动再次轮换，也不宣称旧 Secret 已失效。这是已接受的故障窗口，不是主动提供
两份有效 Secret 的重叠期。

成功失效后的新 acquisition 不得再接受被失效的缓存，也不得让先前开始的旧读取晚到回填；轮换前已通过认证的在途
操作允许完成。该责任由缓存 owner 的观察/发布协议承担，不能只靠删除键或进程通知。

### Q8：独立配置 ClientSession 期限

ClientSession TTL 由独立 env 配置，两协议共用；只有授权建立或延长本次目标 ClientSession，兑换、UserInfo、authz
及普通访问均不续期。创建与延长都受原 UserSession 到期时间裁剪，并发授权不能缩短已生效期限，不能复活已撤销
或消失的原实例。

对仍有效的原实例，目标期限为 `min(root.expiresAt, max(current.expiresAt, observedNow + clientSessionTtl))`；
新建时为 `min(root.expiresAt, observedNow + clientSessionTtl)`。生命周期时间及取得时有效性继续沿用 Redis 权威，
env 改动只影响后续建立/延长所使用的 TTL，不直接改写已有记录。

各协议 Token 保持独立的签发 TTL，新签发受根和 ClientSession 剩余期限共同裁剪；旧 Code/Token 不随重新授权延长。
默认 TTL 数值、env 名称和验证范围由运行时契约进一步明确，不把 Session TTL 与 Token TTL 合并。

### Q9：接受无墓碑 Code 缺失分支的终止后果

合法 OIDC Code 已消费后，Public Client 的真实旧码持有者即使没有正确 PKCE verifier，也可在满足 Client/协议归属
及适用入口校验后触发原确切 ClientSession 撤销。合法 Code 自然过期、记录消失后首次提交，同样进入这个终止分支；
不建立 consumed 墓碑来区分两者。

这会终止原共享 ClientSession 下的访问，可能影响该实例通过其他授权取得的 Token；未修改的旧 Code 不转向同根同
Client 的新实例。Q10/Q14/Q15 进一步取消了缺失分支对 Code 曾经签发的证明要求，Q16 则修订了记录存在时错误绑定
不消费的原保证，最终契约以下述条款为准。

Redis 故障、损坏记录或消费结果未知不等于明确缺失；精确撤销失败不得报告终止成功。

### Q10/Q14/Q15：三段确切实例定位，不增加防篡改机制

Code 采用 `Code ID.UserSession ID.ClientSession ID`，第三段是原确切实例 ID，不是 Client 内部 ID。
不增加 Code MAC、签名、防篡改密钥或相关轮换/保留体系。Code ID 继续由服务端生成不可预测的一次值，
但其随机性只保护正常兑换，不构成缺失分支的撤销授权证明。

解析格式后直接定位原 ClientSession，并核对它的原根与 Client；Code 自身的协议用途及本操作 Client 所选协议独立检查，
不把 ClientSession 可变的 protocol 标记当作 Code 的不可变身份。不能用根与 Client 的当前关系槽替代原实例。
C1 终止并建立 C2 后，未修改的 C1 旧码仍只能指向 C1，不能消费、撤销或改绑 C2。请求 Client 与目标实例 owner
及适用 Client 认证的前置保护必须在消费或撤销副作用前完成。Gate 在消费前检查；Q34–Q39 已修订原先撤销也
要求 Gate 通过的规则，认证与定位门槛通过后的 Gate 拒绝同样触发原实例撤销尝试。

维护者明确接受：知晓完整定位信息的人可以构造不存在的 Code ID，在通过上述适用前置条件后触发该定位实例的终止。
Public Client 的公开 ID 匹配不证明提交者身份；不再声称只有真实旧 Code 才能触发撤销，也不声称未认证的定位
证明 Code 曾签发。修改定位去指向另一个已知实例属于这项接受的终止能力，不能与未修改旧码保留新实例的保证混淆。

本方向参考 [Keycloak 26.7.3 Code parser](https://github.com/keycloak/keycloak/blob/26.7.3/services/src/main/java/org/keycloak/protocol/oidc/utils/OAuth2CodeParser.java)
的一次性存储和三段定位；本项目将其 Client 内部 ID 改为 ClientSession ID，以保持原实例隔离。
[Code grant](https://github.com/keycloak/keycloak/blob/26.7.3/services/src/main/java/org/keycloak/protocol/oidc/grants/AuthorizationCodeGrantType.java)
的 illegalCode/detach 和 remove 后校验提供顺序参考，不表示本项目沿用全部外围协议行为或已经通过动态验证。

### Q11/Q16：先取出删除，再校验并准备签发

完成有界解析、适用 Client 认证、Gate 和定位归属前置校验后，按 Code ID 从一次性存储原子取出并删除授权数据。
只有明确取得数据者继续校验保存的会话/Client/期限、redirect 和 PKCE，再完成 ID Token 的投影、映射与签名准备，
准备成功后才保存 Access Token 并交付。缺失分支按 Q9/Q15 处理，未知删除结果停止，不换 Token 自动重试。

因此错误 redirect、PKCE 以及后续投影、签名或保存失败都可能已经烧掉 Code，调用方必须重新授权，不恢复 Code。
不为了保留原码重试而新增消费前授权数据预读；不再沿用 #177 原先错误 redirect/PKCE 不消费的断言。
Q33 原先规定普通失败保留共享 ClientSession，此项已由 Q34–Q39 修订为认证与定位门槛通过后尝试撤销原实例；
再次提交已烧掉的 Code 仍是独立的缺失操作，同样遵守最新认证、定位及请求内有界撤销边界。

ID Token 准备放在 Access Token 保存前，取代最初 Q11 的消费前准备建议。原子消费唯一赢家、晚到 Token 的原实例
关联、失败不自动重发及精确终止错误的报告边界仍保留。

### Q12：直接保存可读取的 Secret 原文

维护者选择直接保存当前 SSO Client Secret 原文，以简化保存、认证与超级管理员重读；不采用本轮先前建议的
恢复密文、加解密 owner 或专用加密密钥。当前 Secret 由独立认证能力使用，不进入普通 Client Runtime 结果、
列表/详情 DTO、日志或审计正文；普通管理读取仍只报告是否已配置等必要状态，重读入口单独校验超级管理员权限。

明文存储意味着能读取对应数据库字段或备份的人可以取得 Secret，此方案不提供存储泄露后的凭据保密性。
该决定修订 ADR-0007 的仅 Hash 持久化限制；当前代码仍是协议 Secret Hash，不因本文变更而已迁移。

### Q13：首次升级统一换新所需 SSO Secret

首次停流升级时，为最终所选协议需要 Secret 的 Client 重新生成凭据，接入方同步配置并完成核验后才恢复流量。
旧协议 Hash 无法还原原文，不建立 Hash-only 存量重读例外；不把 Internal API 凭据纳入此轮换范围。

这项迁移增加了接入方配合发布的责任，不能只靠用户重新登录完成。旧双协议 Client 的协议选择、各接入方配置交付、
未知提交和切换失败仍须纳入 D6 的具体清单，本文不表示已生成、分发或轮换任何真实 Secret。

### Q17/Q21/Q22：当前披露范围与原授权续接事实

普通 redirect 允许列表变化后，已签 Code 仍精确匹配原绑定地址，新授权使用新列表；Token TTL 变化只影响后续签发，
不改写已有期限；Public/Confidential 变化后，后续兑换按当前客户端认证方式校验，不自动撤销已有会话或 Token。
已经取得本操作 Snapshot 的在途请求继续遵守既定观察边界。

OIDC 后续 UserInfo 披露采用当前 Client scope 配置，包括新加入范围的字段，不与旧 Token 最初申请的 scope 取交集。
维护者明确确认：旧 Token 只申请 `openid profile`，Client 后来新增 `iam:employments` 时，该 Token 后续 UserInfo
也返回任职信息；移除当前范围则停止后续对应披露。已经签出的 ID Token 内容不改写。

该选择修订 #177 原先“新增 scope 不补授旧 Token”及固定实际 scope 作为 UserInfo 披露上限的规则。Code/Token
如仍保存原授权范围，只表达原授权事实，不能暗中继续作为上述交付的裁剪上限；最终最小字段按真实消费者核销。

尚未签 Code 的授权续接保留首次已接受的授权事实：原 redirect、scope、回调/兑换方及必要请求参数，不复制完整
Client 配置。恢复时不重新审核当前 redirect/scope 允许列表；当前 Gate、SSO 启用状态和适用 Secret 认证仍由各自
owner 独立执行，旧授权事实不成为绕过当前流量或认证保护的许可。

### Q18/Q23：单个回调 URL 自动决定 Custom SSO 接入

维护者选择不显式配置两种接入 capability，也不要求请求提供独立 mode/delivery 选择；配置的回调 URL 指向 IAM 托管
回调时自动采用托管接入，否则使用业务自行回调。每次 Code 仍须绑定实际回调、兑换方和最终落地地址，不能在兑换时
因 URL 配置变化切换用途，或把业务 Code 转到托管入口绕过适用 Secret 认证；两入口 Token 使用同一协议模型。

维护者明确只保留单个 callback URL，不改成回调允许列表，不增加请求侧回调选择或 mode 开关。同一 Client 在同一份
配置下只使用该地址对应的回调方式；系统支持两种接入，不再要求同一 Client 同时开放两种回调入口。该选择修订 #177
原先“同 Client 两接入可并用”的目标及其验收矩阵。

填写 IAM 托管回调 URL 时自动采用托管交付，不增加 Client 侧的第二次启用操作。识别依据必须是实际 IAM 完整回调
地址，不能仅凭 `/sso/callback` 路径判断；当前代码还没有对应完整 URL 分类器。既有 IAM internal/external origin
及部署实际拥有的回调路由是边界依据，业务域 origin 推导不证明对应转发已经部署；最终别名与路由核验随 D6 明确。

Client 中无真实消费者的第三方 `logoutEndpoint` 字段删除，IAM 自身实际 logout endpoint 保留。
托管浏览器发起关联与最终 URL 中 bearer 的退役继续按 #177 暂缓，不由自动识别回调方式宣称已修复。

### Q19：Worker 拥有统一维护入口，不新增通用清理执行器

现有 Worker 的一次性 CLI 统一装配 Kernel、OIDC 和 Custom SSO 的公开维护能力，协议包彼此不反向依赖，
Worker 不引用 app 私有源码。库存、apply 和独立只读 verify、退出码、未知数据保留与部分失败重跑继续由具体 owner
提供并经统一入口核验。

旧无 TTL/pending 状态纳入首次停流清理，不能等待自然到期；新模型已经失效的 Code/Token 按 TTL 或协议自有回收处理，
本票不新增通用可靠清理执行器。Custom SSO 本次可能签发 Token 的同步尽力补偿、账号访问状态恢复和审计责任继续保留，
ORCAS 外部保证由 #145 独立处理。#121 不以本项设计决定或 TTL 回收被记为已实现，交付时仍须逐类核销实际责任。

### Q20：本人全部下线保留当前根，但撤销其应用关系

本人全部下线和重置本人密码继续保留当前 UserSession 本身，同时撤销该根下面的 ClientSession；其他根及其应用关系
照常在本次选择范围内撤销。IAM 管理入口仍登录，当前设备的业务应用需要重新授权，不保留整棵当前根子树。

结果分别表达排除的当前根和实际撤销的应用会话，不能以根被排除推导本次完全无变化，也不能把尽力处理或回收数量
当作已确认终止的会话数量。根级退出、ClientSession 级终止与会话记录回收继续分开计量。

### Q24：固定套件的适用用例与显式偏离记录

本轮采用固定官方 OpenID Conformance Suite 的适用用例证据及明确偏离记录，保留 #177 已限定的协议能力；
不为了取得完整认证 profile 自动新增 `client_secret_post`、重复认证或退出通知能力。

调查固定版本为 `release-v5.2.4`，提交 `ab35a8df4864da35b49eff11483e204e01aa7961`。Basic OP、Config OP、
RP-Initiated Logout OP 及 public Client 补充测试作为计划入口；逐项记录实际 plan、variants、模块与结果。
该版本普通测试请求不统一附带 PKCE，需对适用请求补充 S256 适配，并记录适配 diff 与运行版本。

`client_secret_post` 成功、二次认证等超出范围的项目逐项说明，不记为通过；实际失败、未执行与不适用分开记录，
不得因一项偏离就静默跳过整类行为，适配后的结果也不称为完整官方认证。项目自身 Redis/会话/故障和真实 RP 验证
继续承担独立证明责任，本决定不表示套件或任何新模型测试已经运行。

固定来源包括 [官方版本](https://gitlab.com/openid/conformance-suite/-/tags/release-v5.2.4)、
[Basic OP 计划](https://gitlab.com/openid/conformance-suite/-/blob/ab35a8df4864da35b49eff11483e204e01aa7961/src/main/java/net/openid/conformance/openid/OIDCCBasicTestPlan.java)
及 [默认请求构造](https://gitlab.com/openid/conformance-suite/-/blob/ab35a8df4864da35b49eff11483e204e01aa7961/src/main/java/net/openid/conformance/openid/AbstractOIDCCServerTest.java)。

### Q25–Q27：多标签页与 Cookie 沿用现有实现级别

维护者要求本轮多标签页问题参照现有实现级别，不采用 Q25–Q27 提议的额外并发保证。迁移协议 owner 与会话模型时
保留当前登录页守卫、短期续接/浏览器绑定和实际 HTTP Cookie 行为，不新增跨标签页协调框架、独立并行 attempt
完成槽、实际认证结果与每个 attempt 的强化绑定，或浏览器响应顺序仲裁。

沿用 ADR-0013 的边界：页面守卫之后仍可能并发创建多个根；首次完成证明只承担当前等级的续接区分，不声称已把
具体认证事件绑定到原 attempt。正常登录继续写同名根 Cookie；明确失效或正常退出仍可清理根 Cookie，读取暂态
故障或状态未知时保留 Cookie，不采纳为防迟到响应而一律不清根 Cookie 的建议。

退出以请求中观察到的根为处理目标，不新增“展示确认页时固定根、确认时换根即停止”的更强协议。
不承诺迟到响应不会清到后来写入的同名 Cookie，也不承诺最后点击或服务端最后完成的登录一定成为浏览器最终登录。
这些是继续沿用的浏览器过程边界，不放宽 Code/Token 绑定原确切 ClientSession/UserSession 和服务端精确撤销规则。

因此修订 #177 D9/V2 中多 attempt、实际首次认证关联、确认页固定退出目标及不误清新 Cookie 的强化验收要求；
仍需迁移并回归现有单流程、根复用、重认证拒绝、用途/浏览器绑定、退出确认和暂态保留行为，不能把等级沿用解释为
可以删除既有保护。OIDC 独立 Provider 容器退出后，由新协议 owner 接回必要状态，并以等效可观察行为验收。

### Q28：批量撤销固定捕获的实例集合

批量撤销先捕获本次目标实例集合，再逐个精确处理；失败重试只处理该集合中未完成的原实例，不把后来创建的会话
纳入旧操作。结果丢失且无法恢复原集合时，由管理员重新查询并发起新操作，不自动重新全扫，也不新增持久化撤销
任务框架。

捕获与分页不是全局快照或在途排空，不能据此保证覆盖捕获之后才落库的旧在途写入。已完成、失败、缺失/已终止及
排除对象分别表达，清理数量不代替实际会话终止数量；账号生命周期仍保留自身访问代际与恢复 owner 的约束。

### Q29/Q31：直接切换协议，后续授权复用并更新 ClientSession

维护者选择直接切换，不要求先进入 Maintenance、停流排空或执行手工清理流程，再允许保存协议配置。
该选择修订 #177 §2.1/§6.3 中单 Client 协议切换必须作为维护流程执行的目标；不能将被拒绝的维护前置条件
隐蔽地放回管理页面或 API。

维护者于 2026-09-13 明确采用 Keycloak 的关系复用方式：保存时更新 Client 所选协议和相应配置，沿既有 Admin
提交结果与缓存失效机制发布；不为协议切换先行或随后批量撤销旧会话，也不自动清除旧授权续接，不采用此前 Q31
建议的保存后尽力清理方案。

后续授权仍按同一 `(UserSession ID, Client)` 查找关系。已有实例有效时复用同一个 ClientSession ID，并将其
protocol 更新为本次已接受授权所用协议；不存在、已撤销或过期时才创建新实例 ID。协议变化本身不构成占槽冲突，
删除“实例 protocol 不可变、open 遇到不同协议只拒绝”的约束；错根、错主体、错 Client 与实例不可复活保护继续保留。
更新 protocol 和授权期限必须在同一关系的原子 open 内完成，并保持 Q8 的单调期限与根上限。

ClientSession.protocol 表达该关系最近被授权使用的协议，是可变标记，不是每枚 Code/Token 的不可变用途或身份。
协议产物继续由所属协议独占，保存原确切 ClientSession/根/Client 关联和自身期限；入口验证产物自身用途及本操作
Snapshot 中 Client 当前所选协议，不通过更新 ClientSession.protocol 改写旧产物，也不在普通读取时更新这个标记。

切到另一协议时，旧协议的新在线操作按本次 Client 配置拒绝，但这不是永久撤销；切回原协议后，未撤销、未过期且
根/原 ClientSession/账号许可等检查仍满足的旧 Token 可以再次被接受，不要求仅为恢复访问新建实例或重新签发 Token。
已取得旧 Snapshot 的在途操作继续沿既有边界完成，包括对同一有效关系的 protocol/期限更新；本轮不增加切换代际、
提交前最新配置复查或协议切换栅栏。

显式撤销仍终止原确切 ClientSession，以及引用该实例的全部 Code/Token；跨协议复用同一个实例不拆分其撤销范围。
已明确撤销或到期的实例不能因切换协议恢复，新建的实例不会被未修改的旧 Code 按关系槽改绑。Q14 的原实例隔离
与本节的有效实例跨协议复用分别成立。

这项决定整体修订 #177 的协议切换永久终止、错协议占槽拒绝、先清理旧续接及切回不恢复未撤销旧访问的要求。
仅借鉴有效关系复用和更新协议，不把 Keycloak 的 redirect/scope/notes 移入本项目 ClientSession，也不照搬其失效
实例 restart、续根或其他协议功能。

已核对 Keycloak 26.7.3 的 [setProtocol](https://github.com/keycloak/keycloak/blob/26.7.3/model/jpa/src/main/java/org/keycloak/models/jpa/ClientAdapter.java#L253)、
[默认更新监听器](https://github.com/keycloak/keycloak/blob/26.7.3/server-spi-private/src/main/java/org/keycloak/protocol/AbstractLoginProtocolFactory.java#L41)、
[attachAuthenticationSession](https://github.com/keycloak/keycloak/blob/26.7.3/services/src/main/java/org/keycloak/protocol/oidc/TokenManager.java#L399)
及 [UserInfo 的 Client 协议检查](https://github.com/keycloak/keycloak/blob/26.7.3/services/src/main/java/org/keycloak/protocol/oidc/endpoints/UserInfoEndpoint.java#L211)。
这些源码支持本次借鉴方向，不是本项目已实现或动态验证的证据。

### Q30：继续使用现有人工发布流程

首次发布及实际回退继续按现有人工发布流程由发布 owner 执行，本票不新增自动发布/回退编排或另一套流程。
Q2 的首次全体重新登录、Q13 的所需 Secret 换新，以及新旧状态 owner、配置和运行时的实际迁移仍需在现有流程中
完成；沿用人工流程不表示这些迁移已执行或可以省略核验。

发布文档只补齐此次模型和 owner 变化所需的信息，包含协议入口并入 API、Worker 维护命令及环境/镜像/路由的对应
调整，实际环境步骤与回退决定沿现有人工职责执行。不把先前 Q30 的额外回退方案作为本轮新增交付要求。

### Q32：Secret 重读的超级管理员为 iam:admin

维护者明确“超级管理员”就是现有完整管理员 `iam:admin`，不新增更高角色层级或按用户名识别的特权分支。
Secret 重读通过独立的集中 policy operation 和审计 action 表达，HR 管理员没有该能力；现有 Client 保存、
轮换与会话管理的权限不因重读入口改变，前端继续消费服务端 capability/allowedActions。

### Q34：两协议全部 Code 兑换失败均终止原 ClientSession

维护者明确选择“全部终止”，将两协议的 Code 兑换失败统一为终止原确切 ClientSession 的目标。Q35 将生效范围
收敛为 Secret 认证通过之后的失败，Q37/Q39 进一步明确原实例定位门槛；门槛通过后覆盖 Gate/用途拒绝、
明确缺失/过期/竞争未取得、消费后处理或
交付失败，以及存储故障、损坏和结果未知。这修订 Q11/Q16 中普通失败保留共享实例的规则，也扩大 Custom SSO
仅补偿本次 Token 的失败处理目标。

这项选择接受一次失败可能使原实例下其他已签 Token 的后续在线访问失效；根与其他 Client 不因此一并终止。
原根仍有效时通过重新授权创建新实例，不能重开旧实例。明确的失败处理意图不等于已取得可信目标或撤销已经成功。

### Q35：先校验 Secret，之后的兑换失败才触发撤销

维护者于 2026-09-14 明确要求优先校验 Secret，之后出现问题才撤销 ClientSession。Secret 错误或认证结果尚未
确认通过时不触发该撤销。这收窄 Q34 的“全部”，避免未通过客户端认证的请求仅凭目标定位产生撤销作用。
该确认不自动给 OIDC Public Client 或 Custom 托管回调新增 Secret 要求；两种入口分别按 Q37/Q38 处理。

### Q36：仅在本请求内有界尝试撤销，不承诺自动补齐

维护者于 2026-09-14 确认在本次请求中尝试完成原 ClientSession 撤销，允许有界重试。失败或结果未知时，不承诺
会话已终止，也不承诺之后自动补齐；不据此引入后台可靠撤销任务。重试对象保持原确切实例，不扩大为新实例或
重放兑换/签发；消费失败或未知与撤销失败或未知分别报告，不能把尝试计为已发生作用。

### Q37：OIDC Public 沿用原定位门槛，不以前置 PKCE 成功为条件

维护者于 2026-09-14 确认 Public Client 不增加 Secret 认证；通过格式、Client 与原根/实例归属校验后，后续
兑换失败触发原实例撤销尝试，不要求先通过 PKCE。Code 明确取得后的 PKCE 校验继续执行；缺失记录时仍接受
知道合法实例定位者构造缺失 Code 触发终止的既有边界，不恢复 consumed 墓碑或消费前 PKCE 预读。

### Q38：托管回调不纳入本轮失败策略讨论

维护者明确“托管回调不需要考虑”。本轮后续问题只围绕 Custom 业务端兑换与 OIDC，不新增此前建议的托管
UserSession Cookie 匹配门槛，也不把 IAM 内部读出 Secret 当作外部调用方认证。该范围限制不表示删除托管入口，
不取消其既有成功兑换的 callback/兑换方绑定保证；本轮不继续展开托管失败策略。

### Q39：Custom 业务兑换采用无签名、无消费墓碑的三段 Code

维护者于 2026-09-14 确认外部格式为 `Code ID.UserSession ID.ClientSession ID`，不新增 MAC/签名或消费墓碑。
业务端先通过 Secret 认证，再核对目标实例属于该 Client 与原根；后续兑换失败，包括明确缺失，均在本请求内
有界尝试撤销原实例。格式不可解析、实例不存在或归属不符只拒绝，不猜测或扩大为 Client 全体会话撤销。

这接受持有该 Client 有效 Secret 和合法实例定位者构造不存在 Code ID 触发原实例终止，无需证明 Code 曾签发。
Code 状态和消费仍归 Custom SSO 独占，按所属 Client/原实例隔离，不能用合法定位拼接其他范围的 Code ID 消费
他人记录。统一失败后果不机械改变 Custom 原消费前校验顺序；既有本次 Token 尽力补偿不替代原实例撤销。

Q34–Q39 已整合模型、失败矩阵、配置联动、迁移及验收，详见
[完整设计 §13](../features/sso/unified-session-lifecycle-design.md#13-后续修订code-兑换失败与原实例撤销)。

### Q40：确认本轮整体设计并同步 #177

维护者于 2026-09-14 明确同意 Q34–Q39 的最终整体规则，并要求更新 #177。本轮三段 Code、适用认证和定位
门槛、请求内有界失败撤销、实际作用报告、原实例范围、Custom 既有顺序和补偿、托管讨论范围均已确认。
独立设计提交与 issue 同步记录由 #177 保存；本次不表示已实施、合入、部署或完成实现验收。

## 与既有决策的关系

本 ADR 是修改目标，不将旧实现描述为已经迁移。它对既有 ADR 的局部修订如下，未涉及的领域与工程规则继续适用：

| 既有决策 | 本次保留与修订 |
|---|---|
| ADR-0005 / ADR-0027 | 保留 Redis 实时状态权威、生命周期时间及取得时有效性；根改为单一固定 env TTL。 |
| ADR-0007 / ADR-0010 / ADR-0028 | 保留严格协议配置、用途和归属；改为单协议 Client、两类会话、协议自有 Code/Token、明文 SSO Secret 与新的包/runtime owner。 |
| ADR-0008 / ADR-0016 / ADR-0032 | 保留当前 Catalog、已发布 Facts 及 read-through；OIDC 移除 Claims Snapshot，UserInfo 按当前 Client 披露范围，包括新增字段；普通配置版本不再作为撤销版本。 |
| ADR-0012 / ADR-0021 / ADR-0022 | 保留可逆暂停、Snapshot 观察、CAS、传播失败与显式修复；配置变化本身不撤销，后续通过认证及定位门槛的兑换被 Gate/协议拒绝时按 Q34–Q39 尝试撤销原实例；统一 payload 与敏感 reader 保留。 |
| ADR-0013 | 保留原等级登录守卫、重认证拒绝及浏览器过程边界；协议 owner 迁移，不新增更强多标签页保证。 |
| ADR-0025 | 保留同行锁、no-op、真实提交结果、不自动重放和作用后审计失败；增加当前 Secret 重读以处理响应丢失。 |
| ADR-0029 / ADR-0030 | 保留操作许可、用途及确切实例保护；移除普通配置版本撤销，ClientSession.protocol 可以在授权时更新。 |
| ADR-0031 | 保留 Custom SSO 一次消费、失败重新授权和本次已知 Token 同步尽力补偿；业务兑换按 Q34–Q39 增加原实例撤销尝试，Token 补偿不替代实例撤销，托管回调不纳入本轮讨论。 |
| ADR-0033 | 两协议 Token 在线使用重新检查原根；根成功终止后新访问拒绝不依赖逐个子撤销，取消 OIDC 续根例外。 |
| ADR-0034 | Token 保留随机 bearer、摘要定位及必要独立 ID；OIDC 与 Custom 业务 Code 改为无防篡改三段定位、无消费墓碑，消费顺序仍由各协议拥有。 |

## 设计确认与恢复点

- 确认日期：2026-09-12 至 2026-09-13；Q1–Q32 业务分项及 Q33 整体设计均已确认。
- 后续修订：2026-09-14 已确认 Q34–Q39 分项，Q40 已完成整体确认并要求同步 GitHub #177。
- 目标分支：`main`；首次落盘基线：`b6481f2de5c2930fc381d99e70520e0783091e9d`。
- 功能分支：`codex/unified-session-lifecycle`；独立设计提交 SHA 与后续交接状态记录在 #177。
- Q33 基线的完整设计确认及 issue 同步已完成；Q34–Q39 修订已获 Q40 整体确认，最新设计提交及同步状态
  沿用 issue 交接记录。后续正式 Spec、拆票与实施遵守各自授权边界。
  Code 防篡改密钥、Secret 加密存储、同 Client 多回调和强化多标签页协调退出候选。

文档与 issue 保存修改目标；代码行为、测试验收及实际环境切换分别在后续交付中取得证据。
