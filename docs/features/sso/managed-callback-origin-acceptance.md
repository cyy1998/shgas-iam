# 托管回调 origin 与 b648 直升验收账本

本页逐项核对 [Spec #201](https://github.com/cyy1998/shgas-iam/issues/201) 的 70 条故事。
当前记录区分已关闭切片、#206 的同代/跨代演练、正式系统回归与最终候选检查；没有执行目标环境迁移或放流。
索引状态不替代运行结果。最终候选 SHA、`pnpm verify` 和独立双轴评审结论由 #206 的交接评论固定。

## 证据来源与状态

| 代号 | 可追溯证据 | 已证明的范围 |
|---|---|---|
| A | [#202 验收](https://github.com/cyy1998/shgas-iam/issues/202#issuecomment-5694168726)，候选 `ec0608fa53c29c94d44b0b8cbe529e6ae584af94` | 正式 HTTP/Redis、两 hostname Host 改写代理浏览器、冻结离线契约；API Redis 296、Browser 4 pass。中间配置不可独立发布。 |
| B | [#203 验收](https://github.com/cyy1998/shgas-iam/issues/203)，候选 `2a9030c519e0f56b0d4ce6fb375ce0aa0f5785e1` | 最终严格配置、管理 API/PG/Redis、Admin Browser、真实 DDL 与完整 Domain 来源门禁；两轮评审后通过。 |
| C | [#204 验收](https://github.com/cyy1998/shgas-iam/issues/204#issuecomment-5695127363)，候选 `78ceab1b490fe151eec967608c31004611a9787f` | 同代旧 writer→正式维护→最新 HTTP；28 个保留对象摘要/绝对期限相同，0 自然到期，原 Token 200。 |
| D | [#205 验收](https://github.com/cyy1998/shgas-iam/issues/205#issuecomment-5695576553)，候选 `e34cbd17d711ba835f8cc40b880374a7348db990` | 精确 b648 migrations→正式分阶段数据库链；Worker PG 44、DB PG 26 pass。数据库成功不证明在线状态或放流。 |
| E | [#206](https://github.com/cyy1998/shgas-iam/issues/206)，跨代 fixture 与最终聚合 | 精确 b648 2676 blobs、旧 API/独立 Provider HTTP、正式 DB/source/target/Snapshot 链及最新 API smoke、完整 Integration 和正式 same-origin/双 hostname Gateway 系统旅程均通过；最终检查及评审由交接评论固定。 |
| M | [同代手册](../../releases/managed-callback-origin-preserving-upgrade.md)、[跨代手册](../../releases/b648-managed-callback-upgrade.md) | 操作责任与放流门禁；目标环境操作尚未执行。 |

下表“切片已证”保留 A–D 的具体验收出处；E 已在当前实现重跑完整 Integration、两条升级链和正式系统旅程，
覆盖其当前行为通道。人工环境责任仍单独标明；历史来源检查、测试收集或工具可达均不替代实际执行。

## 70 条故事的逐项证据

| 故事 | 可观察行为与证据 | 状态 |
|---|---|---|
| 1 | A/E：同一 Client 在两 hostname 分别返回当次 origin 的 callback，正式 Gateway 浏览器完成 200 落地。 | 最终回归已证 |
| 2 | A：正式 authorize 拒绝不匹配完整落地规则的 URL，未签出可兑换 Code。 | 切片已证 |
| 3 | A：HTTPS、HTTP localhost、非默认端口的 Location 保留实际 origin。 | 切片已证 |
| 4 | A：业务 path/query 不进入 callback 基础路径，固定为根 /sso/callback。 | 切片已证 |
| 5 | A：只允许业务子树仍能授权同 origin 的根 callback。 | 切片已证 |
| 6 | A：一级子域匹配成功，多级子域仍拒绝。 | 切片已证 |
| 7 | A：真实浏览器最终完整落地 query 保留。 | 切片已证 |
| 8 | A：当时非法协议、凭据、fragment、端口及路径分别拒绝；后续 fragment 已放开，现行规则见[授权契约](custom-authorization-candidate.md)。 | 原切片已证，fragment 拒绝已取代 |
| 9 | A：正式请求仅用既有 client/redirectUrl/可选 state 完成授权。 | 切片已证 |
| 10 | A/B：旧托管地址 path/query 不参与 Location；最终配置不含该字段。 | 切片已证 |
| 11 | A：省略 state 可完成；已有 state 绑定和最终交付保持，query 篡改不能覆盖。 | 切片已证 |
| 12 | A：business Location 使用登记完整地址。 | 切片已证 |
| 13 | A/D：business 地址 pathname 为 /sso/callback 仍走业务 Secret 兑换。 | 切片已证 |
| 14 | B：Admin managed 创建、回填、保存不要求或提交 callbackEndpoint。 | 切片已证 |
| 15 | B：managed 的旧值/null 均被严格输入拒绝，数据库/公开输出无字段。 | 切片已证 |
| 16 | B：business 空地址/非法地址拒绝，合法完整地址保存回读。 | 切片已证 |
| 17 | B：浏览器类型切换观察实际请求，隐藏旧值不混入 managed，切回 business 按必填规则检查。 | 切片已证 |
| 18 | B：管理入口拒绝 business ORCAS，managed 可用；普通切换已有 Secret 不变。 | 切片已证 |
| 19 | B：真实管理提交、PG 回读、Snapshot 传播及 fresh reader 回源使用同一严格形状。 | 切片已证 |
| 20 | A：首次 callback/redirect/state/redeemer 固定，续接后原事实不变。 | 切片已证 |
| 21 | A：过期和错误浏览器绑定续接被拒绝，不退回 query 重建授权。 | 切片已证 |
| 22 | A：白名单编辑后已接受续接/Code 仍按原事实完成，新授权受新规则约束。 | 切片已证 |
| 23 | A：client、落地、用途和 state 篡改不能改写原授权结果。 | 切片已证 |
| 24 | A：两方向类型切换后 login guard、续接、managed callback/business exchange 拒绝原流程。 | 切片已证 |
| 25 | A：当前状态/维护/协议启用、两类会话和主体访问门禁回归。 | 切片已证 |
| 26 | A：两类 Code 不能互换消费入口，错误用途不取得 Token。 | 切片已证 |
| 27 | A：Code 只消费一次，失败补偿与原实例作用范围回归。 | 切片已证 |
| 28 | A：business Secret、原完整 callback、原落地与当前配置绑定继续拒绝错误输入。 | 切片已证 |
| 29 | A/E：真实 APISIX 将 upstream Host 改成 api.e2e.internal，发布后回读配置，callback 完成并返回原业务入口。 | 最终回归已证 |
| 30 | A/E：两 hostname 的根 Cookie 与 managed local Cookie 均 host-only，另一入口不存在同名 Cookie。 | 最终回归已证 |
| 31 | M：允许的每个业务 origin 必须配置 /sso/callback 代理并逐一 smoke。 | 手册已记录；环境待操作 |
| 32 | A：两个主机独立 Cookie，无跨域同步；沿用同一 Client 的会话模型。 | 切片已证 |
| 33 | C/M：固定停流、停写、drain 和统一消费者更新顺序，拒绝混跑。 | 演练已证；环境待操作 |
| 34 | B：迁移只减 managed 地址键，business/OIDC/Secret/其他事实保留。 | 切片已证 |
| 35 | C：首次 inventory 捕获 managedClients，逐原 Client 清全部旧 Code/续接，包括不同历史用途。 | 同代已证 |
| 36 | C：UserSession、ClientSession、Token 原值/身份/绝对期限一致，原根可新授权。 | 同代已证 |
| 37 | C：业务 Client、OIDC 与非目标 namespace 独立摘要/绝对期限比较相同。 | 同代已证 |
| 38 | C：token-id 在读取前排除，合法孤立反向索引和无 TTL 变体保留。 | 同代已证 |
| 39 | C：正式 inventory/apply/新进程 verify 均限定 unified/custom-sso/原 Client/authorization。 | 同代已证 |
| 40 | C：坏记录、未知族和归属未知保留，命令非成功。 | 同代已证 |
| 41 | C：部分作用、CAS replacement、提交后丢响应后按同一精确范围重跑。 | 同代已证 |
| 42 | C/E：正式 Snapshot repair/独立 verify 先于最新 reader 回源和 smoke。 | 两条演练已证 |
| 43 | B/C：配置和维护重跑保持 Secret 身份及保留对象绝对期限。 | 同代已证 |
| 44 | D/E：Git 精确 b648 SHA 建源库；逐 blob 核对 2676 个文件和 lockfile，独立旧 API/Provider 实际写入。 | 整链已证 |
| 45 | D：schema/journal/默认值/约束/格式/1000 Client 上限漂移拒绝；E 固定独占资源和 source/target 布局。 | 整链已证 |
| 46 | D/E：数据库阶段离线，跨代演练停止旧 API/Provider 后只启动最新 API；正式完整系统另运行当前 API/Admin API/Worker/前端/Gateway，无旧 Provider。 | 整链及完整运行图已证 |
| 47 | D：expand 明确截止 romantic_maestro，保留来源八列，独立 verify 控制收缩。 | 切片已证 |
| 48 | D：Gateway→managed，最终 verify 无 callbackEndpoint。 | 切片已证 |
| 49 | D：Independent→business，即使同路径也保留原完整业务 callback。 | 切片已证 |
| 50 | D：receipt 与最终 verify 对比 enabled、合法规则、claims、适用 ORCAS。 | 切片已证 |
| 51 | D：双配置未显式选择时阻止写入，不依据 enabled 推断。 | 切片已证 |
| 52 | D：sourceDigest、锁内全量规划和独立 verify 拒绝漂移/未决，零部分写入。 | 切片已证 |
| 53 | B/D：完整 Domain URL/pattern/claim 校验逐模式拒绝坏来源，修正后才可继续。 | 切片已证 |
| 54 | D：Independent/confidential OIDC 生成新 Secret；M 要求接入方切换。 | 数据库已证；分发待环境执行 |
| 55 | D：原 manifest 重跑 Secret/credential ID/生成时间保持，报告无明文；M 规定受控分发。 | 切片已证；分发待环境执行 |
| 56 | D：Gateway/public 无新增 Secret，Internal 凭据及 Client/Role 事实保持。 | 切片已证 |
| 57 | D：工具生成 .invalid 离线中间地址，manifest 拒绝 gatewayCallback，最终删除。 | 切片已证 |
| 58 | A/D：冻结来源/中间契约与在线 schema 分开；最终 verify 拒绝地址残留。 | 切片已证 |
| 59 | D：原 SQL/hash/timestamp 按阶段登记，未改历史 journal、未跳登记。 | 切片已证 |
| 60 | D：contract 持锁启动独立进程全量 verify，通过后才删列。 | 切片已证 |
| 61 | E：最新入口拒绝旧根、Custom/OIDC Code/Token；旧 Custom query+root Cookie 要求重新登录，旧 Provider guard/resume 均拒绝。 | 整链已证 |
| 62 | E：source all 覆盖 Kernel Artifact/Credential、Custom redemption 和 Provider，再完成目标 unified all；b648 redemption writer 已退役、真实库存为零，仍执行全套 gate。 | 整链已证 |
| 63 | M/E：记录每个 DB/namespace/实际布局，纯 b648 未执行 5c 无 issuer 工具；目标布局独立库存为零。 | 整链已证 |
| 64 | E：22 个非目标 Redis 值摘要/绝对 expiry 相同、0 自然到期；用户/Client/Internal/Role/审计相同；人工注入坏版本被保留，apply 和独立 verify 均失败。 | 整链已证 |
| 65 | M/E：最新 API OIDC、Gateway 路由、双 issuer、current/previous JWK 保持、namespace/期限及前端正式旅程通过。 | 自动化已证；环境仍待核验 |
| 66 | D/M：收缩中断 receipt 保留并可重跑；回退匹配库/journal/制品，不补空列或恢复旧登录态。 | 数据库故障已证；环境恢复待操作 |
| 67 | E：精确 b648 真实旧 API/Provider writer→正式数据库/状态链→最新 API，真实 Token/Code/Interaction，不手写旧认证序列化。 | 整链已证 |
| 68 | A/E：正式 APISIX 两个不同 hostname、原完整落地/query/state/Token、真实 RP 200 及 host-only Cookie 全旅程通过。 | 最终回归已证 |
| 69 | M/E：按实际执行参数核对制品/资源身份、数据库与状态顺序、Secret、Snapshot、恢复和人工放流条件。 | 手册与命令已核对；环境待操作 |
| 70 | C/E：当前树再次完成同代 28 对象保留和 b648 全清，两份独立 receipt；一个通过不替代另一个。 | 两条演练已证 |

## 两条升级链和最终运行记录

同代来源为 `7825b22384ac823c8b5c0db905c0141ced264abd`，#204 核验 2594 个 tracked blobs 和冻结 lockfile。
本票当前树重跑 receipt 为 `C:/Users/caiyi/AppData/Local/Temp/iam204-upgrade-gI5Lo1/report.json`，旁边 baseline 保存
28 个对象的摘要与绝对 expiry，0 自然到期，原 Token 可访问并以原根新授权。#204 原 receipt `iam204-upgrade-DxujgW/report.json`
仍是旧候选的独立记录；本机临时文件不保证其他机器可访问。

跨代来源固定为 `b6481f2de5c2930fc381d99e70520e0783091e9d`。入口为
`apps/api/test-integration/composition/b648-upgrade.fixture.ts <fixed-source-dir> [evidence-dir]`，旧 Provider writer
支持文件为 `b648-source-runtime.fixture.ts`。当前树通过 receipt 为
`C:/Users/caiyi/AppData/Local/Temp/iam206-upgrade-epSQId/report.json`，相邻 `commands.json` 保存每个正式子进程、参数、退出预期和报告。
冻结 lockfile SHA-256 为 `2faf6c14e8732930cca0619c086344f9847f634a463f553ae6bf5f71c5ffe6c1`。
旧 writer 在维护前停止；全部数据库阶段、source/target 全 owner 和 Snapshot 独立 verify 先于新 smoke。
旧根/两协议旧 Token/Code 拒绝，新 managed 完整落地、新 business/OIDC Secret 兑换及 UserInfo 成功，旧 Secret 拒绝，current/previous JWKS 保持。
22 个非目标 Redis 值及绝对 expiry 保留，PostgreSQL 用户/Client/Internal 凭据/Role/审计逐值比较不变。
b648 Custom 没有当前统一 Authentication Continuation 对象：旧续接是原 query 配合 root Cookie 的 login guard；
验收应证明最新模型拒绝旧 root，不能记录为删除一个不存在的 Custom continuation。Provider Interaction 另行清理验证。

## 最终行为通道

当前实现执行 `pnpm test:integration` 完整六阶段并退出 0，日志为本机
`C:/Users/caiyi/AppData/Local/Temp/iam206-integration-final.log`。component 复用本轮同内容的首次执行缓存；
process、Redis、PostgreSQL、composition、browser 均无缓存、实际执行。资源通道的关键计数：

| 通道 | 实际结果 |
|---|---|
| Redis | API 296、Worker 15、API Core 50、Kernel 21、OIDC 3、Admin API 2、Profile 6 pass。 |
| PostgreSQL | Worker 44、DB 26、API 41、Admin API 234、Profile 57、Role Assignment 45、Responsibility 9 pass。 |
| Composition | API 30、Admin API 27 pass，含当前真实 HTTP/PG/Redis 与 OIDC RP。 |
| Browser Integration | Admin 67、SSO 10、API 4 pass；真实 managed origin 浏览器及管理类型交互均执行。 |
| Full-system 支持 | E2E workspace Unit 73 pass；它只证明 lifecycle/seed 支持，不代替下面的正式 Gateway 旅程。 |

首轮 Standards 评审后，将四种管理输入拒绝拆为各有独立 Client/Redis fixture 的具名参数化场景，
成功传播、类型往返保留 Secret、repair 后新 reader 回源各自独立。整改后完整 Admin API composition 为
33 pass / 210 assertions，typecheck 通过；日志为 `C:/Users/caiyi/AppData/Local/Temp/iam206-r1-composition.log`。
此次只修改该测试和文档，生产代码、E2E 及两条升级演练未变，上述其余行为证据继续适用；最终树另运行 `pnpm verify`。

初次 Integration 的 DB6 资源触发现有 scan-only ACL 不允许 SELECT，保留失败日志；改为新的独占 Redis DB0 后从根命令完整执行。
没有修改 ACL 测试断言或将失败豁免。升级与 Integration 的任务容器已按准确 ID 清理；E2E 由各自 exact-project lifecycle 清理。

`pnpm test:e2e` 最终完整执行退出 0、无缓存、耗时 5m41s，依次完成：

- same-origin：`iam-e2e-20260916104513098-52a931e0`，Admin → HR Admin → OIDC，
  `full-system-e2e-passed-and-cleaned`；真实 HR outcome receipt、migration/seed receipt 与 Playwright 结果在同名 `e2e/system/test-results/` 目录。
- 独立双 hostname：`iam-e2e-20260916104841862-1ea326c3`，`internal.iam.localhost` / `external.iam.localhost:57773`，
  `dual-entry-e2e-passed-and-cleaned`；同一 managed Client 各回本次 origin，business 仍走登记地址，完整落地、state、Token、Cookie、UserInfo、退出、两 issuer/JWKS、伪造 header 与未知 host 均执行。

RP 终点是测试专有无脚本 HTML，仅匹配两 authority 下的三个精确 URI；真实浏览器必须收到 200，不能仅以 URL 停在 404 作为落地证据。
正式 manifest 的现存 route/header policy 保持，E2E 变体设置 API upstream Host rewrite 并回读已发布配置。
维护窗口的源/目标在线状态演练与最新完整运行图使用不同的任务资源，分别记录，不声称在目标环境部署。

历史失败 artifact 保留：缺少 Bun 的迁移镜像、错误 upstream readback ID、旧 Admin 地址输入动作、managed 中间 state 误断言、
RP route 缺日志插件、RP MIME 导致浏览器下载。均定位后修复；最后先以真实 Chromium 两 hostname × 三终点和正式双入口 journey 定向通过，
再完整重跑上述 root 两阶段。没有重试单个断言、降低通过条件或隐藏失败。

固定最终候选 SHA、`pnpm verify` 与双轴评审结果由 #206 交接评论统一记录。
必需验证或评审尚未完成时，本页不宣称 Spec 验收通过。
父 Spec 保持 open，目标环境停流、迁移、Secret 分发、代理部署和人工放流均尚未执行。
