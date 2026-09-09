# Custom SSO 一次消费最终契约

> 本文原候选证据保留其规格语境。后续 Spec #163 / ADR-0033 已实现已有 Credential 使用不查父、Custom SSO 不续根/凭据及根撤销尽力级联；正常级联里根/子均失效不构成全子树保证。替代断言、固定候选与证明边界见[Credential 最终账本](credential-authority-contract.md)。包含 #163 的候选发布采用全体下线，不适用本文原规格的保留对象升级；环境未切换。

Status: Current

Last verified: 2026-09-10

Next review: 2026-10-31

本页核对 [Spec #157](https://github.com/cyy1998/shgas-iam/issues/157) 的全部 56 条故事、20 项实现决定和 10 项测试决定。
[#161](https://github.com/cyy1998/shgas-iam/issues/161) 交付最终组合和[保留会话升级手册](../../releases/custom-sso-one-shot-grant-upgrade.md)。
每票候选、实际命令和评审结果以 issue 验收评论为准；父规格固定最终候选的聚合验收由主协调者另记。本页不表示已合入、部署或放流。

> #156 后续修订：授权新鲜度保证已由 [ADR-0032](../../adr/0032-consume-published-subject-facts-for-authorization.md) 取代，
> 改为消费已发布 Facts；下文 #157 固定候选的 freshness 证据保留历史语境。投影缺失仍按一次消费规则失败，
> 当前读取及替代验证见 [已发布 Facts 契约](published-subject-facts-contract.md)。

## 固定候选与复用边界

后续 [#164](https://github.com/cyy1998/shgas-iam/issues/164) 按 ADR-0033 取消 Custom SSO 授权续根，并将两模式新 Credential
（包括未交付残留）改为固定签发期限。下文 #157 原候选的随根续期证据只保留历史语境；替代测试验证 root renewal 前后期限严格相等，
仍保留正常级联清理、一次消费与同步尽力补偿。当前期限及全体下线发布选择见[对接契约](third-party-sso-integration.md)，环境尚未切换。

后续 #166 同时退役已有 Credential 使用及两模式签发后的父读取；下表的“签发后父会话保护”只描述 #157 原候选。
消费前和 Kernel 开始签发仍校验根，签发结果的主体/context/归属直接核对，保留取得时有效性。
根观察后晚到签发可以完成，实际凭据被撤销或消失后不复活；后续访问拒绝，不承诺拦截已经取得的在途响应。
当前组合行为和验证归属见[操作契约](custom-sso-protocol-validation.md)。

| 来源 | 候选 | 复用的证据 |
|---|---|---|
| [#158](https://github.com/cyy1998/shgas-iam/issues/158#issuecomment-5599625004) | `4f3a99cbd7f35b651fcb68faff21acf6572c8348`；生产树来自 `8ad71597847ed0ead06212c0eee895729f5f56e3`，随后两次仅文档修正 | Independent、共享 Kernel 消费、真实 Redis 故障/补偿、HTTP/Cookie/V2。Gateway 过渡路径的证据只作历史，不证明最终 Gateway。R3 Standards/Spec 均 0。 |
| [#159](https://github.com/cyy1998/shgas-iam/issues/159) | `9f75ea05463e75dd67ae769616f3242827812fc6` | Gateway 完整操作、ORCAS 窄替身、HTTP 新授权和 Cookie/redirect、在线恢复退役；同候选重跑 Independent 与 OIDC 回归。R1 两轴 0。 |
| [#160](https://github.com/cyy1998/shgas-iam/issues/160#issuecomment-5600583991) | `c724b0ce69927c1ed856c8b3da048365580fcbd5` | 正式维护/CLI、混合库存、完整保留集逐值/绝对 expiry/lookup/index、故障重跑、新连接及 ACL 只读 verify。R1 两轴 0。不能由其 Kernel 新 Artifact fixture 推断完整 HTTP 新授权。 |
| #161 | review base 为上述 #160 SHA；最终提交及重跑结果由本票评论固定 | 无生产行为变更；在同一树追加 API HTTP+Redis 定向清理→旧码拒绝→同根正式 authorize/token/callback→旧/新 Credential 普通访问。Kernel testing scope 只增加 namespace，便于组合公开维护 owner。 |

所有复用都是在最终树逐项核对后保留的前票行为证据，不将旧数量转记为本票执行。维护没有修改在线消费/签发；#161 的测试变更
没有改变 #158/#159 的生产路径。最终组合直接重跑四 owner 的 Unit、Component、Redis 与类型，以及 API/OIDC process；具体退出码
在 #161 交接/验收评论登记。若之后候选有生产漂移，必须重新判断上述证据，不能仅凭继承关系复用。

实际差异核对：`git diff --name-only 8ad71597847ed0ead06212c0eee895729f5f56e3 4f3a99cbd7f35b651fcb68faff21acf6572c8348`
仅列 `CONTEXT.md` 与 `docs/features/sso/third-party-sso-integration.md`，所以 #158 两次修正前后源码、测试和配置完全相同。
#158→#159 的 Kernel facade/Artifact consumption 无差异；#159→#160 的 Custom SSO `internal/session.ts`、API
`composition/custom-sso-operations.ts` 无差异。#159 的在线恢复退役结果和 #160 的维护实现均保留在本票最终内容中；
本票生产差异为零，新增 namespace 仅在 Kernel `/testing`。这些核对不替代本票新增 H 组合测试。

本票完整类型/Unit/Component/Redis/API-OIDC process 通过后，若后续只修正文档，以上同源码、测试和配置树的行为结果可复用，
只需按 workflow 重跑静态和 diff 检查；无需无条件重做前置暂态、未知消费、补偿等矩阵。主协调者仍须在固定最终候选执行一次
全仓 `pnpm verify`，记录完整类型/Unit/build 的聚合结果；若生产/测试内容漂移，重新运行失效的相关 owner/profile。

## 证据入口

下列代号用于逐项账本；一个入口的通过不能扩大为整规格或环境完成。

- **C**：[完整操作 Redis](../../../packages/custom-sso/test-integration/redis/custom-sso-operation.integration.test.ts)，正式 Custom SSO 工厂与 Kernel；按下文测试行为定位。Client/Barrier/Facts/ORCAS/审计出站使用既有窄替身。
- **K**：[Kernel Artifact](../../../packages/session-kernel/test-integration/redis/session-kernel-artifact.integration.test.ts)、[Credential](../../../packages/session-kernel/test-integration/redis/session-kernel-credential.integration.test.ts)、[Redis 时间](../../../packages/session-kernel/test-integration/redis/session-kernel-time.integration.test.ts)，公开生命周期与真实 Redis。
- **H**：[兑换 HTTP/Redis](../../../apps/api/test-integration/redis/custom-sso-redemption-operation-http.integration.test.ts)，真实 authorize/token/callback handlers、error middleware、生产 mapper/Kernel；包含 #161 的 `Final composition` 场景，覆盖 Independent、Gateway、Gateway+ORCAS。
- **U**：[Public UserInfo/authz HTTP/Redis](../../../apps/api/test-integration/redis/custom-sso-operation-http.integration.test.ts)，普通访问配置/Gate/Facts/许可暂态、Cookie、裁剪和后续请求；H 追加清理后旧/新凭据的相同访问组合。
- **M**：[维护 Redis/CLI](../../../apps/oidc-provider/test-integration/redis/custom-sso-grant-maintenance.integration.test.ts)，正式 maintenance composition、新连接只读 verifier、真实 ACL、混合 Provider/Kernel 对象保留。
- **O**：[OIDC HTTP/Redis](../../../apps/oidc-provider/test-integration/redis/subject-access-authorization.integration.test.ts)，原协议用途、Claims Snapshot、Code/Token/UserInfo 与 replay。M 证明清理不改写其 Binding/Code/Token/Session/Interaction/Grant 和 anchor/lookup/membership；H 额外串联同窗口 OIDC Code 保留。
- **W**：[接入说明](third-party-sso-integration.md)、[OpenAPI routes](../../../apps/api/src/routes/sso/sso.routes.ts)、[错误映射](../../../apps/api/src/middlewares/custom-sso-retryable.error.ts)。
- **P**：[升级手册](../../releases/custom-sso-one-shot-grant-upgrade.md)、[定向命令](../../releases/custom-sso-grant-maintenance.md)。人工环境项目均未执行。

## 56 条故事账本

| 故事 | 最终行为和证据 |
|---|---|
| 1 | C Independent contenders/concurrent redemption：前置通过才一次消费，只有赢家投影/签发。 |
| 2 | C Gateway concurrent redemption、H callback：同一 Kernel 消费后 ORCAS/签发。 |
| 3 | C 三模式 concurrent redemption 与 Independent contenders：确定性屏障、仅一份真实 Credential 和适用的一次 ORCAS。 |
| 4 | C consumed response loss、H replay：重放拒绝，不重交付成功。 |
| 5 | C consume commit failures：未提交与提交后未知均无投影/ORCAS/签发，直接检查状态和作用。 |
| 6 | C temporary config/Gate failures：Maintenance 在消费前保留 Artifact。 |
| 7 | C concurrent/repeated acquisition failures：Snapshot/Gate 首次失败固定、无消费。 |
| 8 | C rejects before Grant consumption、H blocking：Subject Access 暂态早于作用。 |
| 9 | C temporary failures/rejects before consumption 与 K 时间：原 payload/expiry 不变，无延期。 |
| 10 | C Independent Client authentication：错误 Secret 保留 Code。 |
| 11 | C invalid protocol identity、K 用途检查、H 正向 OIDC Code 误投：无误消费或误撤。 |
| 12 | C stale redirect/mode mismatch、H wrong redirect：错误归属保留无关授权。 |
| 13 | C permanent rejection/old version：确认旧配置只处理同观察目标。 |
| 14 | C preserves newer Code/Credential：较新对象拒绝但保留，下一操作可接受。 |
| 15 | C disabled denial、Gateway different subject/parent revocation、H SessionInvalid：根与主体/许可要求保持。 |
| 16 | C accepted redemption/permission survives transitions：取得的配置/Gate/许可沿用，不追加响应前账号裁决。 |
| 17 | C removed before consumption/replaced and revoked Artifacts、K CAS：后续生命周期仍拒绝消失/换 owner。 |
| 18 | C Independent contenders/freshness：只在明确消费成功后投影。 |
| 19 | C Projection freshness、H not-ready：503 SubjectProjectionNotReady，非未认证或无权限。 |
| 20 | C invariant failure、H invalid：烧码且无 Credential/虚构补偿，500 原字段边界。 |
| 21 | H 正式 V2 mapper/schema、TTL；K Redis 时间保留期限语义。 |
| 22 | C Gateway concurrent redemption：ORCAS 晚于消费，仅赢家调用。 |
| 23 | C ORCAS failed/response-lost、H Gateway recovery：旧码拒绝，新授权继续。 |
| 24 | C 外部已作用但响应丢失替身、W/P：IAM 失败不能证明 ORCAS 未建会话。 |
| 25 | C ORCAS response-lost 后新授权再次调用；W/P 记录无外部幂等保证。 |
| 26 | C issuance failures/invariant：写前失败无成功凭据，Code 不恢复。 |
| 27 | C issuance commit failure：写前 UUID 固定，已提交后报错按同 identity 处理。 |
| 28 | C issuance failures/parent revocation：可处理失败同步尽力撤销本次对象。 |
| 29 | C delayed failure preserves newer authorization、K 防覆盖：延迟补偿不撤新对象。 |
| 30 | C issuance failures 撤销失败：残留可观察，Code 不释放、不换 identity 重签。 |
| 31 | C controlled interruptions after consumption/issuance：实际提交后中断不恢复 Code；非 OS kill 演练。 |
| 32 | C 中断/补偿失败与下文生产 census：无持久恢复队列、日志或 executor；这是保证范围，不是最终回收证明。 |
| 33 | C undelivered Credential/next access refuses old generation、K 父子/版本/撤销：残留沿用现有访问约束。 |
| 34 | C undelivered Credential follows root renewal、K 绝对上限、W：初始 TTL 不是固定清除期限。 |
| 35 | C consumed response loss、H replay、W：无成功查询/重放，重新授权。 |
| 36 | W/H token failures：Independent 无需解析消费进度，暂态/内部/未知统一放弃旧码。 |
| 37 | W/OpenAPI/H Retry-After：token 失败等待后开始新授权。Header 自身不携带动作字段。 |
| 38 | H error middleware 原 code/envelope，W/OpenAPI 无恢复阶段/进度字段。 |
| 39 | C Client authentication/归属、W：参数/认证/配置错误先修正，非盲目自动循环。 |
| 40 | H 两模式失败后及清理后正式 authorize 复用真实根 Cookie，无重新认证调用。 |
| 41 | H Gateway JSON 失败、W：用户返回业务应用发起访问，不刷新旧 callback。 |
| 42 | H Gateway 失败无 Location，无循环授权；W 无新增恢复 UI。 |
| 43 | H 暂态与内部失败无根 Cookie 删除，同 Cookie 新授权成功。 |
| 44 | U 暂态/Facts/配置回归；H 清理后旧/新 Credential UserInfo 和 Gateway authz 503 后原凭据重试成功。 |
| 45 | C audit failure 不撤可交付 Credential；K 原子清目标索引/tombstone。新 Grant 无旧 cleanup ref，旧附属 cleanup 由原 owner 保留。 |
| 46 | W/OpenAPI/错误说明与 H 核对一致；不将 token 的新授权策略扩到普通访问。 |
| 47 | P 实际入口/副本/任务停流和排空清单；环境未执行，参数不是 drain 证明。 |
| 48 | M 无索引 active/tombstone/旧三态/orphan 处理，H 定向清理后旧码拒绝；无 namespace 全清。 |
| 49 | M/H 比较有效根与两种 Credential 的持久值/绝对 expiry，H 清理后原凭据访问。 |
| 50 | M 完整 OIDC 保留集逐值/expiry/lookup/index，H 同窗口 Code 保留，O 原访问语义回归；不称作完整部署演练。 |
| 51 | H 旧 Code 401 后同根正式新授权与两模式兑换成功；P 人工旧码/新授权 smoke 待执行。 |
| 52 | M inventory/apply/new process verify 及独立保留基线；目标清零和保留 gate 分开。 |
| 53 | M 部分成功/未知提交/SCAN/连接/ACL/abort、重跑；P 失败持续停流。 |
| 54 | P 全消费者版本、零目标早于新 writer、一次放流与可行回退边界；环境未执行。 |
| 55 | 下文 census 与 #159 删除清单；C/K/H 保留安全证明，M 保留维护能力，无旧名称永久 Guard。 |
| 56 | 候选表、关联议题表、P 环境记录分别表达设计/代码/发布；父级最终验收另记。 |

## 20 项实现决定核对

| 决定 | 最终落点与证据 |
|---|---|
| 1 | 完整 operations owner 仍为 Custom SSO；API 仅协议边界和依赖装配，见下文调用 census、C/H。 |
| 2 | K consumeProtocolArtifact 要求 purpose、token、已观察对象并在 Redis CAS；C 同码赢家和替换测试。 |
| 3 | 唯一消费权威为 Kernel Artifact；无独立新 redemption，在线租约已删，M 只读旧库存。 |
| 4 | C/H 前置认证/用途/mode/归属/版本/根/Gate/许可及精确失效。 |
| 5 | C 操作首次结果、原 expiry、跨过观察时间继续；K 后续对象/CAS 仍裁决。 |
| 6 | Independent consume→完整投影/V2→Credential；Gateway consume→适用 ORCAS→Credential；C/H 保留签发后父会话保护。 |
| 7 | C/H 投影 Not Ready/格式不变量各保留原原因、烧码、不虚构补偿对象。 |
| 8 | C consume 未提交/已提交未知停止；H/C 响应丢失拒绝重放。 |
| 9 | C 写前 UUID、同步精确补偿与延迟补偿；K identity 防覆盖。 |
| 10 | C 补偿失败不重签、残留跟根续期/绝对上限；无新持久恢复承诺。 |
| 11 | C ORCAS 窄 port/替身仅证明 IAM；W/P 将外部幂等/回收未知归 #145。 |
| 12 | C 审计 best-effort、K 消费附属索引；安全日志未加入 Code/bearer/主体资料。 |
| 13 | W/H token 错误原 wire、新授权 Retry-After；U 原凭据重试解释保持。 |
| 14 | W/H Gateway 原 JSON/Cookie/redirect/state、无自动循环。 |
| 15 | U/H 普通访问保留；O OIDC 的 Code/Claims Snapshot/replay 原语义保持。 |
| 16 | M Kernel Artifact 四类 authority/lookup 和 Custom 旧库存 owner，实际 CLI 可达；不依赖业务索引。 |
| 17 | M 关联值 CAS/未知保留/部分失败重跑，新连接只读 verify；环境保留需独立基线。 |
| 18 | P 停全部旧 writer、排空、限定失效、统一版本再放流；无 epoch 推进。 |
| 19 | P 实际命令、保留基线、合法 smoke、暂停/前修/回退；目标环境未执行。 |
| 20 | ADR-0031 局部取代 ADR-0010/0027；C/K/H 安全证明迁移，文档/索引与下文旧测试分类同步。 |

## 10 项测试决定核对

| 决定 | 本次执行或复用范围 |
|---|---|
| 1 | C/M 完整操作及维护+真实 Redis、H/U 实际 HTTP；仅使用已确认两类主要 seam。 |
| 2 | C 正式 factory/Kernel/Redis，窄出站注入和真实对象观察；不以异常本身代替无副作用证明。 |
| 3 | C 未提交/未知提交、消费/签发中断、投影/ORCAS/写前/补偿/响应丢失；H 新授权。可控中断不冒充 OS kill。 |
| 4 | C 同 Code 确定性并发、替换/撤销/用途/版本；M 维护 CAS replacement 与非目标比较。 |
| 5 | H 正式 authorize/token/callback/error middleware、V2/Cookie/state/Retry-After；H 本票追加维护后的新授权和访问。 |
| 6 | M 混合库存/旧三态/orphan/缺索引/独立只读/部分失败；完整 OIDC 由其 owner fixture 建立并逐值比较。 |
| 7 | 复用既有 C/K/H/U/M harness 与 production adapters；仅给 Kernel testing scope 暴露真实 namespace，没有新 Redis 模拟器或 runner。 |
| 8 | #159 移除仅恢复承诺测试；C/K/H 同期替代期限/唯一赢家/用途/版本/补偿/Cookie，正式 mapper 保持 V2。 |
| 9 | 独占 Redis 8.8.0、动态端口、准确 ID 清理；真实 I/O 先 await。每票静态/类型/受影响行为/diff 与父级最终聚合分开记录。 |
| 10 | 未新增或要求系统 E2E、真实 ORCAS、自动切换演练。既有 E2E 保留未执行；环境停流/客户端迁移/放流单独验收。 |

## 生产消费、维护与退役 census

最终链为 Gateway `/sso/token`、`/sso/*` → API `createSsoHandlers` → `createCustomSsoOperationAdapter` →
`createCustomSsoOperations.forOperation()` → `createCustomSsoApplication`。
[session.ts](../../../packages/custom-sso/src/internal/session.ts) 的 `issueAuthorizationCode` 只创建 Kernel Artifact，`cleanupRefs: []`；
`redeemIndependentGrant`、`completeGatewayLogin` 各有一个 `consumeProtocolArtifact` 调用，二者使用同一权威。
[Kernel facade](../../../packages/session-kernel/src/facade.ts) → [消费存储](../../../packages/session-kernel/src/storage/artifact-consumption.ts)
比较完整观察及 lookup/tombstone，原子移除 active/lookup/精确索引，保留 consumed tombstone。OIDC 自己的消费调用独立保留，
不能把“唯一权威”写成“全仓一个调用点”。

API [services composition](../../../apps/api/src/composition/services/index.ts) 和 OIDC [session composition](../../../apps/oidc-provider/src/composition/session/index.ts)
均装配 `createCustomSsoCleanup`。旧 `authorization-grant-redemption` cleanup ref 仍能精确删除；Admin 使用版本 selector，
OIDC [正式维护 composition](../../../apps/oidc-provider/src/composition/session/custom-sso-grant-maintenance.ts) 与
[command](../../../apps/oidc-provider/src/commands/custom-sso-grant-command.ts) 消费两个 maintenance owner。
OIDC 宽 `online-auth:state` 仍有其独立库存消费者，但不能用于这次保留升级。

#159 删除旧在线工厂、reservation/begin/renew/release/consume Lua、lease scheduler/heartbeat/takeover、固定租期、
`CustomSsoDeps.redis`、Gateway 过渡与 `revokeArtifact` port。保留的旧三态 decoder/prefix/fixture、精确 removal 属于维护和 cleanup，
不授予签发权。只证明旧承诺的 lease/释放/接管测试及专用 scheduler/in-memory store 删除；并发唯一赢家、原期限、同观察对象、
错用途/版本、补偿、Cookie 迁至 C/K/H。旧第二份 redemption 初始化失败场景随该写入退出；identity cleanup 与 OIDC 旧库存维护证明保留。
维护 fixture/入口退役条件和 2026-10-31 复核归定向手册，无永久历史词典 Guard。

## 关联议题与环境未执行项

2026-09-09 只读核对 tracker：下列议题仍 OPEN，本票不修改或关闭它们。

| 议题 | 结论 |
|---|---|
| [#140](https://github.com/cyy1998/shgas-iam/issues/140) | 旧租约接管后的最终精确补偿义务被契约取代；不是旧缺陷已修复，也尚未关闭。 |
| [#145](https://github.com/cyy1998/shgas-iam/issues/145) | ORCAS 幂等/期限/撤销仍有效，场景变为消费后失败→新授权→可能再次外部登录。 |
| [#156](https://github.com/cyy1998/shgas-iam/issues/156) | 已按 ADR-0032/#156 取消请求时权限新鲜度耦合；Facts 缺失时兑换重启授权，UserInfo 原凭据重试。 |
| [#144](https://github.com/cyy1998/shgas-iam/issues/144) | 跨 Client 续期边界继续约束残留，不能声称固定 TTL 清除。 |
| [#121](https://github.com/cyy1998/shgas-iam/issues/121)、[#141](https://github.com/cyy1998/shgas-iam/issues/141) | 附属清理与 OIDC 双状态协调独立。 |
| [#71](https://github.com/cyy1998/shgas-iam/issues/71)、[#155](https://github.com/cyy1998/shgas-iam/issues/155) | 热路径预算与重复校验仍有效；新消费缩短相关路径不等于整体完成或性能提升，既有签发 try/catch 等剩余分支仍归 #155。 |
| [#72](https://github.com/cyy1998/shgas-iam/issues/72)、[#137](https://github.com/cyy1998/shgas-iam/issues/137)、[#138](https://github.com/cyy1998/shgas-iam/issues/138)、[#142](https://github.com/cyy1998/shgas-iam/issues/142)、[#143](https://github.com/cyy1998/shgas-iam/issues/143)、[#153](https://github.com/cyy1998/shgas-iam/issues/153)、[#154](https://github.com/cyy1998/shgas-iam/issues/154) | SQL/定位/父会话/Binding/Kernel 接口/配置/退出配置问题各自独立，不由本票完成。 |

#158/#159/#160 已关闭；#161 与父 #157 的评审/最终状态以 tracker 为准。设计已接受和本地代码通过，不代表目标环境数据前提、
旧实例停止、排空、外部接入方迁移、统一版本、受控 smoke、保留对照及放流已验收。真实 ORCAS 幂等/会话回收、PG/composition、
浏览器及系统 E2E 本票未执行；本票无这些范围的生产变更。父级全仓 `pnpm verify` 由主协调者在最终固定候选运行一次。
