# Credential 独立访问最终契约

> Historical：本页保留旧候选的契约与证据；Spec #178 最终在线模型已由 ADR-0035 取代，当前发布以统一会话维护手册为准。

Status: Historical

Last verified: 2026-09-10

Next review: 2026-10-31

本文逐项核对 [Spec #163](https://github.com/cyy1998/shgas-iam/issues/163) 的 62 条用户故事、20 项实现决定和 12 项测试决定。
长期边界由 [ADR-0033](../../adr/0033-trust-issued-credentials-without-principal-session-revalidation.md) 拥有；#168 交付联合证据与发布准备，父规格最终聚合验收由协调者记录。
代码已实现，目标环境的停流、排空、全体下线、统一部署、重新登录、回退与放流均未执行。账本行不是部署通过记录。

## 固定候选与已执行证据

| 标记 | Owner / 前票最终候选 | 实际执行及复用边界 |
|---|---|---|
| T164 | Custom SSO、API、OIDC、Kernel；`a64a8e37226ab9c2da3ab2bdba1149e572811ee0` | [验收](https://github.com/cyy1998/shgas-iam/issues/164#issuecomment-5603457082)：三消费者完整类型、Unit、Component，四 owner Redis 通过。期限、Cookie、短根及跨 Client/Maintenance 证据继续有效；使用时父依赖已由 T166/T167 替换，不复用旧父拒绝结论。 |
| T165 | Kernel、API Core、Custom SSO、API、Admin API、OIDC、Admin；`f7ef9815e1ac262f21687f154be97802ca95a912` | [验收](https://github.com/cyy1998/shgas-iam/issues/165#issuecomment-5603962337)：七 owner 完整类型/Unit/Component、六后端 Redis、Admin Browser 21 通过。实际转换、当前根例外、代际、审计及页面未变；浏览器使用 mocked backend，不证明 PG 事务。 |
| T166 | Custom SSO、API、Kernel；`847469e16e8d500eeea5ec104e44712aee25f197` | [验收](https://github.com/cyy1998/shgas-iam/issues/166#issuecomment-5604289777)：三 owner 完整类型/Unit/Component/Redis。正式 HTTP 漏撤、晚到、根兑换、用途/账号/期限/非目标证据继续有效；外部依赖替身边界见报告。 |
| T167 | OIDC、Kernel；`52e530e4f48050cd1334b241dd506061343c245d` | [验收](https://github.com/cyy1998/shgas-iam/issues/167#issuecomment-5604737079)：两 owner 完整类型/Unit/Component/Redis；OIDC Process 5、PG/Redis production Composition 1 通过。Binding/Token 完整性、晚到、根兑换、代际及维护能力未变。性能在 `8aabe7d6` 采样，后续 testing 修复不改生产树。 |
| T168 | OIDC 与文档；review base 为 T167 | 将原两 mode 分别同根的续期用例合为同一 fixture 的两种 Custom SSO Credential 与 OIDC，补同时存在的联合观察。没有改生产或维护命令，不重建重复 suite。实际命令、最终候选和评审结果记录在 [#168](https://github.com/cyy1998/shgas-iam/issues/168)。 |

前四票完整 suite 的执行记录而非文件存在构成复用依据。T168 不改变生产树；新增联合测试的 OIDC 完整行为/类型另行执行，其他未变 owner 复用上表实际结果。前票都经过独立双轴评审；父级最终 `pnpm verify` 不由本账本代跑或推定。

## 直接证据入口

下表标记在每个逐项行中给出 owner 和可定位 seam，行内再指出具体观察；不能仅以所在 package 的绿色数量代替断言。

| 标记 / owner | 直接入口及观察 |
|---|---|
| C / API + Custom SSO | [兑换 HTTP/Redis](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/api/test-integration/redis/custom-sso-redemption-operation-http.integration.test.ts)：三模式正式 logout、一次子枚举失败、根 revoked/漏撤 Credential resolved、UserInfo/authz 200、自身撤销 401、Code 未消费、晚到签发与期限；[访问 HTTP/Redis](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/api/test-integration/redis/custom-sso-operation-http.integration.test.ts)：严格 context、错用途及正常命令采样。T166。 |
| S / Custom SSO | [完整操作 Redis](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/packages/custom-sso/test-integration/redis/custom-sso-operation.integration.test.ts)：授权根期限不变、五分钟裁剪、跨 Client/Maintenance、连续访问到期、未交付残留、消费唯一赢家、旧代拒绝及新代保护。T164/T166。 |
| H / API | [正式 handler Component](../../../apps/api/test-integration/component/sso.handlers.integration.test.ts)、[完整 Kernel adapter Component](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/api/test-integration/component/custom-sso-session-kernel.adapter.integration.test.ts)：TTL/Cookie、响应后到期的取得时有效性、用途、补偿、认证/退出；C 同时以真实 Redis 核对签发观察。T164/T166。 |
| O / OIDC | [Provider HTTP/Redis](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/oidc-provider/test-integration/redis/subject-access-authorization.integration.test.ts)：`accepts a missed child after real root revocation but rejects its own invalid %s`、根观察后暂停/晚到、Code 未消费、Binding/Token/Snapshot 矛盾、代际及配置/许可矩阵。T167。 |
| J / OIDC + Custom SSO + Kernel | 同一 O 文件 `oIDC HTTP authorization renews its root and Binding without extending both same-root Custom SSO Credentials`：两模式实际授权/兑换根全值不变；OIDC HTTP 再授权后根与 Binding expiry 增大，两份 Credential 全值及 fixed policy 不变、principal ID 同根。T168。 |
| K / Kernel | [根撤销 Redis](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/packages/session-kernel/test-integration/redis/session-kernel-root-revocation.integration.test.ts)、[prepared Redis](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/packages/session-kernel/test-integration/redis/session-kernel-prepared-revocation.integration.test.ts)、[Credential Redis](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/packages/session-kernel/test-integration/redis/session-kernel-credential.integration.test.ts)、[时间 Redis](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/packages/session-kernel/test-integration/redis/session-kernel-time.integration.test.ts)：子失败/冲突、根失败/未知、真实转换计数、cleanup、代际替换、Redis 时间及三上限。T165/T167。 |
| A / Admin API + Admin | [管理服务 Redis](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/admin-api/test-integration/redis/session-management.integration.test.ts)、[Resignation Redis](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/admin-api/test-integration/redis/resign-user.integration.test.ts)、[认证 Component](../../../apps/admin-api/test-integration/component/authentication.handler.integration.test.ts)、[页面 Browser](../../../apps/admin/test-integration/browser/sessions.spec.ts)：根保护、本人 children、用户范围、数量/changed、审计后作用及提示。密码和未扩张账号流程的完整 Component 执行见 T165 验收第 7 项。 |
| M / OIDC maintenance + 四 owner | [维护 Redis](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/oidc-provider/test-integration/redis/client-protocol-artifact-cleanup.integration.test.ts) 的 `resets current online owners without indexes, retries partial deletion and independently verifies retained state`：真实四 owner 混合库存、索引删除、dry-run 无写、部分失败/重跑、observer 独立连接 verify、旧根/凭据拒绝、非目标值保留。已由 T164/T165/T167 完整 OIDC Redis 实际执行。 |
| R / 发布负责人 | [全体下线 runbook](../../releases/online-auth-redis-time-cutover.md)：目标固定、四 owner、停旧 writer/排空、三个独立进程、非目标基线、统一版本、smoke、失败重跑/回退。文档已交付，环境各项未执行。 |

M 的独立 verify 是独立 Redis 连接，不是 `online-auth:state` CLI 子进程；定向 Grant 命令的 CLI/ACL 测试不能冒充四 owner CLI 实测。R 要求的新进程 verify、实际停流与重新登录仍是人工发布 gate。PG 不被维护命令连接；PG 保留的环境证明由数据 owner 基线对照负责，Redis key 哨兵不能证明整个 PG 保留集。

## 62 条故事逐项核对

| US | Owner / 证据来源 | 直接事实与边界 |
|---|---|---|
| 1 | C / T166 | Gateway authz 根 revoked、漏撤 Credential resolved 后 200，自身撤销后 401；正常路径去父读取。 |
| 2 | C / T166 | Independent UserInfo 同一真实撤根场景 200，身份直接来自 Credential。 |
| 3 | C / T166 | Gateway UserInfo 与 authz 采用相同漏撤访问结果。 |
| 4 | O / T167 | Provider `/oidc/me` 漏撤 AccessToken 使用 200、父/账户读取零。 |
| 5 | O / T167 | Binding `readForAccessToken` 不经 authorization/account 回查根；真实 HTTP 无间接父读取。 |
| 6 | O / T167 | Binding 自身到期/撤销、Token/Credential/Binding 认证时间及 Snapshot 归属矛盾拒绝。 |
| 7 | C、O、K / T166/T167 | 缺失、到期、撤销、坏 context/metadata 均拒绝；旧响应不复活对象。 |
| 8 | C、S、O / T166/T167 | protocol/type/Client/mode 误投拒绝，原对象与非目标保留。 |
| 9 | C、S、O / T166/T167 | 错入口及较新配置对象不被误撤，CAS 替换者保留。 |
| 10 | C、O / T166/T167 | 坏 JSON、非法代际、主体/认证事实矛盾失败关闭，不读父/当前代际补齐。 |
| 11 | C、S、O / T166/T167 | 每操作一次绑定主体/代际许可；延迟交付及回调复用，不跨请求。 |
| 12 | S、O、A / T165/T167 | 禁用/旧代新请求拒绝，不消费或签发；根尽力语义不改变 Barrier。 |
| 13 | K、S、O、A / T165/T167 | prepared 及晚到 selector 保留重新启用新代，旧凭据不会恢复。 |
| 14 | S、O / T166/T167 | Maintenance/暂态配置及屏障错误保留可恢复对象；恢复后仅仍有效对象可用。 |
| 15 | S、O / T166/T167 | 同操作分别固定配置/Gate 首次结果，后续新请求按版本拒绝。 |
| 16 | C、O / T166/T167 | 撤根后新授权无成功 Code。 |
| 17 | C、O / T166/T167 | 续接 invalid、interaction/guard/resume 保留根身份验证。 |
| 18 | C / T166 | 撤根前保留 Custom Code，撤根后兑换 401、Artifact 未成功消费。 |
| 19 | O / T167 | 漏撤 Authorization Code 在根失效后兑换失败、消费标记未成功设置。 |
| 20 | A / T165 | Admin REST/tRPC 认证仍解析根并取得账号许可，撤根/禁用继续拒绝。 |
| 21 | C / T166 | IAM 根 token Public HTTP 撤根后拒绝，未改成 Credential 入口。 |
| 22 | S、H、O / T166/T167 | 原一次消费、PKCE、redirect、Secret、浏览器归属及重放拒绝整包保持。 |
| 23 | S、C、O / T166/T167 | 消费后失败不恢复 Code、不重放成功结果；重新授权仍是恢复方式。 |
| 24 | C、O / T166/T167 | 真实根观察后同步暂停，撤根完成后放行仍可写入/交付；无提交时根屏障。 |
| 25 | C、O、K / T166/T167 | 已撤销/消失对象不复活，已取得响应可完成但下一访问拒绝；消费冲突仍唯一赢家。 |
| 26 | K、A、C、O / T165/T167 | 根已确认撤销即完成，漏撤访问另由双协议 HTTP 验证。 |
| 27 | K / T165 | 已发现 children 仍尝试，部分失败不放弃其余对象。 |
| 28 | K / T165 | 子枚举/单子异常不阻止根独立转换。 |
| 29 | K / T165 | 根 CAS 冲突及写后响应丢失返回失败，observer 保留已发生事实。 |
| 30 | C、O / T166/T167 | 漏索引/失败/晚到凭据合法时可用，Custom 固定到期后拒绝；OIDC 另受 Binding 约束。 |
| 31 | K、C、O / T165/T167 | 自身权威撤销后拒绝，cleanup/finalize 失败不复活。 |
| 32 | A / T165 | 单次当前根及不能识别当前根时拒绝。 |
| 33 | A、K / T165 | 本人全部下线只保留当前根，children 和其他 roots 仍处理。 |
| 34 | A、K / T165 | 指定用户范围、未知用户 no-op、peer 用户保留。 |
| 35 | K、A / T165 | 只计 revoked 转换，missing/already revoked/failure 不计完成，CAS 冲突 excluded。 |
| 36 | A、K / T165 | 根保留或已撤销但新撤 children 时 changed:true。 |
| 37 | A / T165 | 页面按实际根/仅子/no-op 分别提示，确认语明确关联对象尽力。 |
| 38 | A / T165 | 审计后作用失败提示保留、刷新事实、不自动重放；Browser mocked backend 边界见上表。 |
| 39 | A / T165 | 密码 changed 表达提交，撤销摘要独立；本人当前根例外保持。 |
| 40 | C、H / T165/T166 | logout 用途校验及所属根范围不变，正式 handler 清 Cookie/redirect；失败不虚报成功。 |
| 41 | A、H / T165 | 完整账号 Component 保持自助改密/找回密码原不下线流程，无新调用。 |
| 42 | S、J / T164/T168 | Independent fixed_at_issue，续根后 Credential 全值不变。 |
| 43 | S、J / T164/T168 | Gateway 与 Independent 同一固定策略，无 Cookie 刷新入口。 |
| 44 | S、J / T164/T168 | 每种 Custom 授权/兑换前后根全值相等，不改变 lastActiveAt 或 expiry。 |
| 45 | J / T168 | 同根 OIDC HTTP 再授权使根与 Binding expiry 增大，Binding 原续期策略保持。 |
| 46 | J / T168 | 两种 Custom 凭据同时存在于该根，OIDC 续期后两份全值严格不变。 |
| 47 | S / T164/T166 | 原 Client Maintenance 期间另一 Client 授权兑换/authz，原凭据 expiry 不变。 |
| 48 | K、S、O / T164/T167 | 配置 TTL/根当前/根绝对三上限保持，晚到签发不越根观察上限。 |
| 49 | S、C / T164 | 五分钟根请求一小时，两模式实际 Credential deadline 等根当前 deadline，响应不超过 300 秒。 |
| 50 | C、H / T164 | Independent TTL 与 Gateway Cookie Max-Age 等同次签发观察的剩余秒数；亚秒向上取整。 |
| 51 | K、H、O / T164/T167 | Redis 创建/读取/到期及取得时有效性，应用偏差不新增复裁。 |
| 52 | S、C / T164/T166 | 未交付/补偿失败残留固定期限，不随根延长，到期拒绝；不承诺真实 ORCAS 回收。 |
| 53 | M、R / T167/T168 | 复用现有四 owner 全清，无新增 policy 迁移；实际环境未执行。 |
| 54 | R / T168 | 逐副本停旧 writer/reader、阻断直连/重试/调度、排空后才能清理；人工未执行。 |
| 55 | M / T167 | 删除索引仍扫描 Kernel/Grant/OIDC store/Provider state 固定键族，损坏 orphan 也移除。 |
| 56 | M、R / T167/T168 | 真实 dry-run 无写、apply、独立连接 verify；发布需三个新进程，后者未执行。 |
| 57 | M、R / T167/T168 | Redis 非目标值直接保留；PG/epoch/全部 owner 环境基线由人工核验，不以 key 哨兵代替。 |
| 58 | M、R / T167/T168 | 清理后旧根/凭据解析拒绝；真实环境旧 Code/Session 拒绝与新版本重新登录待人工 smoke。 |
| 59 | M、R / T167/T168 | 部分失败重跑通过；环境失败保持停流、重新全清/verify，不恢复旧登录态或混跑。 |
| 60 | C、O / T166/T167 | 实际前后采样及原始区间见下表，局部 RTT 与波次不冒充全热路径预算。 |
| 61 | C、S、O、K、A / T164–T168 | 旧随根续期/父必拒断言迁移；用途/代际/精确清理/非目标和既有 E2E 保留。 |
| 62 | R / T168 | 明确第三方自建会话及离线 ID Token 不由全清保证退出，人工对接 owner 自负其范围。 |

## 20 项实现决定逐项核对

| ID | Owner / 证据 | 最终实现与复用边界 |
|---|---|---|
| 1 | K、C、O / T166/T167 | Kernel 中性生命周期、Subject Access 操作许可分工未变。 |
| 2 | C / T166 | Credential 自带主体/context，坏上下文失败关闭，无父/当前账号修补。 |
| 3 | O / T167 | Binding 公开用途分离；Token extra/Credential metadata/Binding 可信认证时间与 Snapshot 一致。 |
| 4 | C、O、A / T165–T167 | 授权、兑换、续接、根 token 仍查根；晚到允许，无提交屏障。 |
| 5 | S、C、O / T166/T167 | 用途、配置/Gate、Subject Access、消费与精确失败保持。 |
| 6 | K、A / T165 | 根已确认作用与子尽力分开，根未知/失败不虚报。 |
| 7 | C、O、K / T165–T167 | 漏索引/冲突/晚到残留合法可用，无后台执行器或最终撤销 SLO。 |
| 8 | K、C、O / T165–T167 | 自身撤销权威，外围 cleanup 不回滚；既有 pending 不承诺发现漏项。 |
| 9 | A、K / T165 | 当前根例外仅根、原用户/代际 selector、非目标/新代保护不扩大。 |
| 10 | A、K / T165 | 原结果封装、真实数量/changed；密码提交与会话数量分开。 |
| 11 | A / T165 | 页面真实作用文案、after-effect 刷新不重放、有界安全日志。 |
| 12 | S、J / T164/T168 | 两模式 fixed_at_issue，Custom 不续根；OIDC 原根/Binding 续期保持。 |
| 13 | K、S、O、J / T164/T167/T168 | 三期限上限、五分钟例与 OIDC 关联期限未扩张。 |
| 14 | H、C / T164 | 原 wire/Cookie Redis 剩余 TTL，无刷新或滑动补偿接口。 |
| 15 | M、R / T168 | 复用持久模型及全体下线，不新增 schema/缓存/反向数据库/policy 迁移。 |
| 16 | M、R / T168 | 固定 Redis/namespace/候选、停流排空、dry-run/apply/新进程 verify、统一版本重新登录；环境未执行。 |
| 17 | M、R / T168 | apply 不代替零残留；保留非目标/epoch，失败停流重跑，回退不恢复旧登录态。 |
| 18 | 文档 / T168 | ADR-0033 标明已实现未部署，ADR-0029/0031 局部取代与原语境保留，CONTEXT/Current 契约同步。 |
| 19 | S、J、H / T164/T168 | #144 的固定期限、同根活跃/Maintenance/Cookie/未交付全部纳入；不扩张密码/OIDC 生命周期。 |
| 20 | C、O / T166/T167 | 固定真实正常入口采样，原始区间可复查；无毫秒目标，不宣称 #71/#137 完成。 |

## 12 项测试决定逐项核对

| TD | Owner / 证据 | 已验证与限制 |
|---|---|---|
| 1 | C、S、O / T166/T167 | 现有公开操作、HTTP 与真实 Redis；外部替身明确，不新建模拟器/框架。 |
| 2 | C、O / T166/T167 | 真实根撤销后漏撤仍可用、对象独立状态及自身失效；不是仅 spy 次数。 |
| 3 | C、O / T166/T167 | 三 Custom 入口及 OIDC Binding/Snapshot 组合；根失效与 Binding 失效区别直接观察。 |
| 4 | C、O、A / T165–T167 | 根认证/新授权/两 Code 兑换保留，前置失败未消费，PKCE/归属/重放保持。 |
| 5 | K、C、O / T165–T167 | 索引/子失败/CAS/根未知/根观察后晚到使用同步点与实际状态。 |
| 6 | K、S、O、A / T165–T167 | 自身撤销与 cleanup 分开、晚到清理保留新代/peer；账号屏障不降级。 |
| 7 | K、S、J / T164/T168 | 短根裁剪、Custom 不续根、同根两模式与 OIDC、跨 Client/Maintenance 均固定；OIDC Binding 仍续期。 |
| 8 | H、C、S / T164/T166 | Cookie/响应、未交付及业务到期；旧随根/父必拒已迁，余下保护保持。 |
| 9 | A、K / T165 | Admin 服务/Component/Browser 与真实 Redis 验证例外、数量、子失败、审计、密码分离。 |
| 10 | M、R / T167/T168 | 复用四 owner 实际 Redis suite；CLI 新进程与部署 gate 未执行，既有 E2E 保留，不新建完整系统测试。 |
| 11 | C、O / T166/T167 | before/after 实际正常请求，客户端 RTT、Lua 内部、波次分开；失败分支只做行为验证，未采样。 |
| 12 | 所有 owner / T164–T168 | 真实 I/O 普通 await 后同步断言；每票 static/type/行为/diff 与双轴记录，父最终 verify 由协调者执行；发布未执行。 |

## 性能统一口径

实际原始样本、命令区间、环境与固定生产候选分别见 [Custom 报告](custom-sso-credential-authority-evidence.md) 和 [OIDC 报告](../oidc/oidc-credential-authority-evidence.md)。
三类主要使用入口为 Gateway authz、Custom Public UserInfo（分两 mode）及 OIDC UserInfo；各正常入口 1 warmup + 5 samples，全为 HTTP 200。
客户端命令含 EVAL 本身，Lua 内部命令另外计数；RTT 是 sendCommand 起止的客户端往返，包含调度、传输、Redis 执行与客户端处理，不能解释为纯网络传播时延。
串行波次按相交在途区间归并，两组实际区间均不相交。累计 RTT 是每请求 Redis 区间之和，不是 HTTP 端到端时间。

| 正常入口 | 客户端命令 / 实际波次 before→after | Lua 内部 before→after | 累计 RTT 中位数 ms before→after |
|---|---|---|---|
| Gateway authz | 6→4 / 6→4 | 4→2 | 2.7686→1.8385 |
| Gateway UserInfo | 6→4 / 6→4 | 4→2 | 2.7739→1.9134 |
| Independent UserInfo | 6→4 / 6→4 | 4→2 | 2.9357→1.5068 |
| OIDC UserInfo | 22→18 / 22→18 | 18→14 | 11.2918→7.4197 |

Custom before=`f7ef9815`、after=`59d69df8`，Bun 1.3.14、Redis 8.8.0、ioredis 5.11.1、Windows；同容器端口 39286。
OIDC before=`847469e1`、after=`8aabe7d6`，Node 24.18.0、Vitest 4.1.10、相同 Redis/ioredis/Windows；同容器端口 38746。
两套测试的替身范围不同，不能横向比较绝对 RTT 或把其总和宣称完整登录收益。Custom 只观测 Kernel Redis；Client/Gate/Barrier/Facts/Secret/ORCAS 为替身，未覆盖真实 TCP HTTP/APISIX。
OIDC 使用真实 Provider TCP HTTP、Kernel/Barrier/Facts/Provider stores，但 Runtime/Gate/account repository 为替身；真实 PG/Redis production Composition 是另外的接线证据，不属于该性能采样。
上述固定历史候选的剩余成本属于 Credential lookup/tombstone/期限、Subject Access、配置/Gate、OIDC Binding/anchor/payload、主体交付与网络。失败、授权、兑换及真实第三方未测性能，小样本不承诺延迟预算，不宣称 [#71](https://github.com/cyy1998/shgas-iam/issues/71) 或 [#137](https://github.com/cyy1998/shgas-iam/issues/137) 完成。

## 测试迁移及最终交接

旧 Custom 随根续期断言由 S/H/J 的固定期限、短根裁剪及 Cookie 同观察替代；旧父失效必拒由 C/O 的真实漏撤访问替代。
OIDC 原根认证时间变化断言改为 Token/Credential/Binding 三者一致。签发观察后对象消失不拦截已取得响应，但不复活、下一访问拒绝；消费唯一赢家、用途/代际、版本/暂态、精确 cleanup/非目标保护继续执行。
历史 Spec #128/#146/#157 的账本保留原候选语境；相关 Current 入口已指出 ADR-0033 的局部取代，保留对象发布流程不适用于本次包含 #163 的统一候选。

T168 未修改生产、维护、PG 或 process/composition 接线，复用 T167 的 Process/Composition 和前票未失效结果；只为三方同根组合运行完整 OIDC 类型/Unit/Component/Redis，另执行 static/docs/diff。M 随完整 Redis suite 再次执行，但不新增全系统 E2E、真实 ORCAS 或环境切换。
#167 曾误设数据库迁移 env 名并连接默认库；只读 journal 未发现本次新增 migration，不能据此证明无 DDL 元数据语句，误目标调用不计证据。随后显式临时 DATABASE_URL 的 Composition 才为有效记录，详细边界见 T167 验收。本票不访问 PostgreSQL、不读取 .env 或默认资源。

本票实际通过 `pnpm --filter @iam/oidc-provider typecheck`、`test:unit`（48）、`test:integration:component`（140）、`test:integration:redis`（135）。原两 mode 参数化合为一条同时两模式的联合用例，136→135 不表示删除一种模式的断言。
`pnpm verify:static`（21 workspace lint、96 docs、env、architecture、collection）、`pnpm check:docs` 和 `git diff --check` 通过。
Redis 使用仓库 8.8.0 镜像，临时容器 `09691e09389990eb11944ee9974efa59c6347bf4d1940528f7aa7a4dbbc4ad34`，动态端口 39766、OIDC 独占 DB 1；等待 PONG 后显式设置 `IAM_OIDC_PROVIDER_TEST_REDIS_URL`。各测试关闭连接及 namespace，容器已按准确 ID 删除。
类型与行为运行于 2026-09-09 深夜，文档最终核验跨至 2026-09-10；未使用默认或开发资源。

最终候选与两轴评审轮次由 #168 交接/验收评论登记；父 #163 保持 open，协调者在全部切片完成后运行最终全仓 gate 再验收关闭。未合入、push 或部署。
