# Token 直接状态最终契约

> Historical：本页保留旧候选的契约与证据；Spec #178 最终在线模型已由 ADR-0035 取代，当前发布以统一会话维护手册为准。

Status: Historical

Last verified: 2026-09-10

Next review: 2026-10-31

本页逐项核对 [Spec #170](https://github.com/cyy1998/shgas-iam/issues/170) 的 66 条故事、20 项实现和 12 项测试决定。
三类 token 状态、全部消费者及四 owner 维护已实现；[原始版本成本](token-state-cost-evidence.md)单独记录。
功能分支为 `codex/token-state-records`，目标为 `main`；原始基线为 `33305c0463747e535ccb8e1fc98b42efb598b954`，
设计提交为 `89c04cf9fdfe6dfc7786651a63f983177581d8b0`，本票 review base 为 `d945f5f721ada527a8c2e6600309a5d78aaf251a`。
最终候选的完整 SHA、下述命令的执行结果和两轴评审由 [#176 验收评论](https://github.com/cyy1998/shgas-iam/issues/176)
固定，避免为写入文档自身提交 SHA 再改变候选。父 Spec 的最终 gate 另记，保持 open 待人工收尾授权。
文档描述实现和证明范围；未执行目标环境停流、清理、部署、重新登录或放流。

## 最终 owner 与证据入口

Kernel 拥有完整 token 的 SHA-256、类型分区、单记录 active/revoked、反向 ID、Redis 时间、条件转换和必要索引。
API/Custom SSO、OIDC 与 Admin 拥有各自协议、授权、错误映射和管理范围；维护工具只组合四个 owner。
无 token Client Binding 保留内部 ID 生命周期。Provider 自有 lookup、Cookie/JWT/JWK、Client Secret 保持，Kernel lookup HMAC 已退役。

下表是可观察断言索引。各入口通过本页验证命令实际执行，单纯文件存在、类型通过或 Collection Guard 不表示行为通过。

| ID / owner | 真实入口及代表断言 |
|---|---|
| K1 / Kernel | [Principal state](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/packages/session-kernel/test-integration/redis/session-kernel-principal-state.integration.test.ts)：`token observes one SHA-256 state and time`，正式创建后单 EVAL、ID/摘要拒绝、按 ID 同对象；续期保持身份、authTime、绝对期限并更新两键和索引。 |
| K2 / Kernel | [Credential state](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/packages/session-kernel/test-integration/redis/session-kernel-credential-state.integration.test.ts)、[Artifact state](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/packages/session-kernel/test-integration/redis/session-kernel-artifact-state.integration.test.ts)：正式签发后单 EVAL、类型/用途/Client、空串/损坏/故障分类及同记录终态。 |
| K3 / Kernel | [Credential identity](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/packages/session-kernel/test-integration/redis/session-kernel-credential.integration.test.ts)：并发创建唯一 owner、防覆盖、新 UUID、`revokes a caller-known credential after Redis commits and the adapter reports failure`。 |
| K4 / Kernel | [直接状态原子转换](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/packages/session-kernel/test-integration/redis/direct-state-transitions.integration.test.ts)：WRONGTYPE 在任何 state/期限/索引变化前拒绝，旧 finalize/cleanup 保留新 owner 和 payload；三类 state suites 补最终公开操作。 |
| K5 / Kernel | K1/K2 的真实暂停交错：根读取后撤销、续期竞争，迟到 Credential 更新不能覆盖终态；观察对象撤销不伤替换对象。 |
| K6 / Kernel | 三类 state suites 的 `pending ... original retention`；[Artifact lifecycle](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/packages/session-kernel/test-integration/redis/session-kernel-artifact.integration.test.ts)跨实例恢复：终态/ID 无 TTL、管理可达、cleanup 后恢复原截止或删除、重复幂等。 |
| K7 / Kernel | K2 Artifact 的 `atomic consumption ... one winner` 与 `consumed Artifact naturally expires with its ID and stops reporting replay`：两个真实 Redis 消费者唯一赢家、同记录 consumed、索引精确移除，自然保留截止后 state/ID 消失、resolve/consume 均 missing。 |
| K8 / Kernel | [Redis 时间](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/packages/session-kernel/test-integration/redis/session-kernel-time.integration.test.ts)：四生命周期正负应用偏差/跳变、取得后跨期限、缺失不重建；K2 无父 Return Handle 正式创建/解析/消费。 |
| K9 / Kernel | [根撤销](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/packages/session-kernel/test-integration/redis/session-kernel-root-revocation.integration.test.ts)、[prepared](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/packages/session-kernel/test-integration/redis/session-kernel-prepared-revocation.integration.test.ts)、[selected](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/packages/session-kernel/test-integration/redis/session-kernel-selected-revocation.integration.test.ts)：实际数量、重复、当前根/新代/新版本/非目标保留、部分失败继续及未知不伪报成功。 |
| A1 / API | [正式 Hono UserInfo/authz](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/api/test-integration/redis/custom-sso-operation-http.integration.test.ts)：四模式 `Public UserInfo`；有效200、误投/损坏401、Redis故障500后恢复200；在 Facts 出站内真实撤销已解析对象，在途仍200、下一请求401。 |
| A2 / API | [正式授权兑换 HTTP](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/api/test-integration/redis/custom-sso-redemption-operation-http.integration.test.ts)：Independent/Gateway/ORCAS 的唯一许可、消费前检查、烧码/重新授权、签发未知补偿与原200/302交付；下一访问观察自身终态。 |
| C1 / Custom SSO | [完整操作 Redis](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/packages/custom-sso/test-integration/redis/custom-sso-operation.integration.test.ts)：`contenders enter projection only after the unique confirmed consumption`、消费/签发中断不重开Code、迟到失败补偿自身且保留较新授权。 |
| C2 / Custom SSO | 同一完整操作：剩余五分钟根裁剪、固定凭据不滑动与自然到期、授权不续根、ORCAS失败烧码；已有凭据不查父、新授权/兑换仍查父。 |
| O1 / OIDC | [正式 Provider HTTP/Redis](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/oidc-provider/test-integration/redis/subject-access-authorization.integration.test.ts)：Provider自行生成Code/AccessToken，损坏Code 400 invalid_grant、损坏AccessToken 401、Redis类型故障500；ID/摘要/用途/Client/关联不一致拒绝且peer保留。 |
| O2 / OIDC | 同一入口 `allows exactly one concurrent HTTP redemption of the same Code`、重放撤销Grant、PKCE/redirect/Client拒绝不提前消费；Kernel消费后替换Provider载荷不被迟到写覆盖。 |
| O3 / OIDC | 同一入口 `accepts a missed child after real root revocation`、`oIDC HTTP authorization renews its root and Binding without extending both same-root Custom SSO Credentials`：独立访问、自身/Binding/Snapshot仍检查、三方同根续期边界与操作配置/Gate。 |
| M1 / Admin | [混合管理 Redis](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/admin-api/test-integration/redis/session-management.integration.test.ts)：三个 mixed 场景经正式管理服务验证OIDC与两模式Custom SSO、数量、重复、当前根、非目标、pending恢复。 |
| P1 / runtime | [API composition](../../../apps/api/test-integration/composition/entry.integration.test.ts)、[OIDC composition](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/oidc-provider/test-integration/composition/entry.integration.test.ts)、[Admin PG/Redis](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/admin-api/test-integration/composition/client-protocol-revocation.integration.test.ts)及四app process：无Kernel lookup配置的production装配，真实PG/Redis与协议版本限定。 |
| L1 / 四owner | [实际维护CLI](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/oidc-provider/test-integration/redis/online-auth-state.integration.test.ts)、[生产混合库存](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/oidc-provider/test-integration/redis/client-protocol-artifact-cleanup.integration.test.ts)：全部固定键族、pending/损坏/无TTL/孤立，dry-run只读，apply后新进程verify，非目标逐值/绝对expiry保持，未知/失败/超时/abort及完整重跑。 |
| V1 / 协调者 | 本页最终执行命令及 #176 固定候选记录；[成本证据](token-state-cost-evidence.md)实际原始基线对照。 |
| H1 / 发布owner | [全体下线手册](../../releases/online-auth-redis-time-cutover.md)：人工固定源/目标/回退与维护候选、停流排空、源/目标清理、新进程verify、统一镜像、重新登录、双协议/Admin smoke、保留集和放流，均未执行。 |

## 66 条用户故事逐项核对

| 故事 | 最终可观察结果 / owner证据 |
|---|---|
| 1 | 根token直接单状态认证；K1、A1。 |
| 2 | Independent凭据直接解析后UserInfo200；K2、A1。 |
| 3 | Gateway Local Session直接解析后UserInfo/authz200；K2、A1。 |
| 4 | Provider真实AccessToken经Kernel直接解析；O1及成本V1。 |
| 5 | Kernel/Provider Code与Return Handle直接解析；K2/K7、O1/O2。 |
| 6 | 正常解析一个确定state键，一次Lua同取TIME；K1/K2和V1实际命令。 |
| 7 | Kernel与完整fixture HTTP分别计量，完整OIDC仍多次访问；V1。 |
| 8 | runtime无lookup current/previous配置可启动并工作；P1及完整类型/行为。 |
| 9 | Kernel生成及Provider opaque token、HTTP参数/wire保持；A1/A2/O1/O2。 |
| 10 | 生产生成链仍使用32字节随机源，Provider默认256-bit opaque；K1/K2/O1与ADR-0034源核对，非密码学统计检验。 |
| 11 | 完整原始token求摘要，提交摘要被拒绝；K1/K2、A1/O1。 |
| 12 | 内部ID不作为bearer；K1/K2、A1/O1。 |
| 13 | 跨类型误投不解析其他类型；K1/K2、A1/O1。 |
| 14 | 同类purpose/protocol/type/Client继续拒绝误投；K2、A1/O1/O2。 |
| 15 | 独立ID反向定位同一记录，按ID管理/撤销；K1/K3/K9、M1。 |
| 16 | Provider payload与Kernel ID/主体/authTime/Binding/Snapshot关联校验；O1/O3。 |
| 17 | 写前UUID在提交后响应未知仍精确补偿；K3、C1/A2。 |
| 18 | 每次新Credential采用新identity，过期后仍新UUID；K3/C1。 |
| 19 | 活跃与保留终态占位不可覆盖；K1/K2/K3/K4。 |
| 20 | state/反向ID/必要索引原子创建，WRONGTYPE无部分写；K1/K2/K4。 |
| 21 | 原父子/用户/Client/protocol/Binding目标集合不扩大；K9、M1/O3。 |
| 22 | 同记录原子撤销，下一读取拒绝；K1/K2、A1。 |
| 23 | 已检查请求允许在对象自身撤销后交付，不增加响应前复查；A1四模式真实HTTP/Redis，K5。 |
| 24 | 迟到续期/更新不能恢复终态；K5/K4。 |
| 25 | 旧观察撤销只作用同对象，替换者保留；K4/K5/K9、O2。 |
| 26 | 迟到cleanup/finalize比较当前owner和终态；K4/K6/O2。 |
| 27 | 重复撤销幂等且只统计实际转换；K9、M1。 |
| 28 | 终态保留ID/摘要/原因/时间/归属/cleanup信息；K1/K2/K6。 |
| 29 | pending终态、cleanup refs和反向ID可管理；K6、M1。 |
| 30 | 外围失败不恢复有效性；K6、M1/A2。 |
| 31 | pending state/ID无TTL，不因期限失联；K6、L1。 |
| 32 | cleanup完成恢复原截止或已过截止立即删除；K6。 |
| 33 | 尚存普通终态返回revoked；K1/K2。 |
| 34 | 未知/自然消失返回missing_or_expired；K1/K2/K7/K8。 |
| 35 | 空串/JSON/结构与摘要损坏独立拒绝；K1/K2、A1/O1。 |
| 36 | Redis异常失败关闭，保持协议故障映射；K2、A1/O1。 |
| 37 | 消费针对已验证token/owner/观察对象原子转换；K7/O2。 |
| 38 | 多个前置观察只有一个消费赢家；K7/C1/O2。 |
| 39 | reason=consumed终态返回consumed_replay；K7、O2。 |
| 40 | 真实自然保留期限到达后解析及再消费均missing；K7新增直接断言。 |
| 41 | 消费成功才投影、ORCAS和签发；C1/A2。 |
| 42 | 消费未知或后续失败需新授权，原Code不重开；C1/A2。 |
| 43 | OIDC Code消费/重放、Grant关联撤销保持；O2。 |
| 44 | 根续期保留token和ID；K1/K8。 |
| 45 | Redis观察时间更新滑动期限并裁剪到absolute；K1/K8。 |
| 46 | 反向ID和state同期限，索引score同步，共享索引不早失效；K1/K8。 |
| 47 | authTime与绝对期限不因普通续期改写；K1/K8/O3。 |
| 48 | 续期/撤销竞争按条件结果，不重建缺失或终态；K5/K8。 |
| 49 | Custom SSO固定期限且授权不续根；C2/A2/O3。 |
| 50 | 已有Credential使用不复查父根；C2/O3、K9漏撤边界。 |
| 51 | 新授权/Code兑换校验适用父根；A2/O1/O3。 |
| 52 | 根成功与子尽力级联分离，保留漏撤/晚到签发边界；K9/M1/A2/O3。 |
| 53 | Artifact不随根续期，合法无父Handle保持；K8/K2。 |
| 54 | Binding无外部token，按ID生命周期与完整性检查；O1/O3/K8。 |
| 55 | Subject Access、配置/Gate及Binding/Snapshot/业务授权不被简化掉；A1/A2/O1/O3/P1。 |
| 56 | 停流/排空/停止旧writer后才清源布局；H1人工未执行，L1仅证明命令强制声明。 |
| 57 | 固定owner键族覆盖源/目标及无索引、损坏、无TTL；L1。 |
| 58 | apply后新进程直接扫描verify，新增残留可令verify失败；L1。 |
| 59 | 非目标owner逐值及绝对expiry保留，工具不连接PG；L1。生产PG/配置保留由H1另验。 |
| 60 | 无HMAC装配可新登录/签发/访问的代码组合由P1/A2/O1证明；实际统一部署后重登录仍H1未执行。 |
| 61 | runtime无同类型双读；P1、K1/K2。环境无新旧进程混跑由H1核验，未执行。 |
| 62 | 失败非零、幂等完整重跑；L1。失败时真实环境持续停流由H1执行。 |
| 63 | 回退先停新writer，用理解目标布局的维护候选清理并独立verify；L1证明清理能力，H1回退未执行。 |
| 64 | 原始33305c04与候选同资源/依赖实际请求对照；V1。 |
| 65 | 正式公开factory/HTTP/管理/CLI及真实状态和副作用断言；全部K/A/C/O/M/P/L证据，不按源码形状验收。 |
| 66 | 代码结果和人工环境发布分别记录；本页、V1、H1。 |

## 20 项实现决定逐项核对

| 决定 | 最终实现与证据 |
|---|---|
| 1 | Kernel唯一存储owner，消费者只用能力出口，Binding按ID；K1/K2/P1。 |
| 2 | 完整token SHA-256与类型分区，无ID/摘要fallback，原生成链；K1/K2/A1/O1。 |
| 3 | 一次Lua只读确定state并取TIME，非仅把旧布局塞入Lua；K1/K2/V1。 |
| 4 | ID反向值只为摘要，同一权威状态服务协议/管理/补偿；K1/K3/K9/O1/M1。 |
| 5 | 原子创建防占位；新identity不作永久历史去重，也不承诺提前撤销未来对象；K3/K4。 |
| 6 | 同位置active/revoked保留诊断和cleanup必要字段；K1/K2/K6。 |
| 7 | resolved/revoked/consumed_replay/schema_invalid/purpose_mismatch/missing及故障保持；K1/K2/K7/A1/O1。 |
| 8 | 观察字节和owner CAS，状态/索引原子变化；外围cleanup独立，K4/K5/K7。 |
| 9 | 在途允许完成但后续更新仍可失败，非父提交屏障；A1/A2/K5/O3。 |
| 10 | 同观察Artifact唯一消费、精确索引和重放；C1/A2/O2/K7。 |
| 11 | Redis时间、根滑动与绝对期限、Custom SSO固定期限、Artifact不续期；K1/K8/C2/O3。 |
| 12 | 原终态保留计算，pending无TTL，完成恢复原截止；K6。 |
| 13 | 实际计数、原范围、当前根和版本/代际、尽力级联，不承诺可靠后台清理；K9/M1。 |
| 14 | 协议授权与关联仍由协议owner验证；A1/A2/O1/O3/P1。 |
| 15 | Kernel HMAC配置/env/候选退役，其他密码能力保留；P1及运行时证据。 |
| 16 | 复用online-auth:state与四owner固定扫描，无全库删除；L1。 |
| 17 | 停流排空、三步清理核验、统一版本、smoke、回退先清新状态；H1未执行，L1仅证明自动能力。 |
| 18 | 当前架构/配置/契约/runbook同步，未新增schema或迁移框架；本页及文档检查。 |
| 19 | 原始基线/候选实际命令、RTT、波次、Lua内部独立记录；V1。 |
| 20 | 固定候选验证和新两轴评审，父Spec保持open；#176/父Spec评论与H1。 |

## 12 项测试决定逐项核对

| 决定 | 实际证明与限制 |
|---|---|
| 1 | K/A/C/O/M/L全部使用已有公开factory/adapter与真实Redis，不引入Redis模拟器。 |
| 2 | K1/K2经正式高熵生成及写入；O1真实Provider opaque对象；误投/用途拒绝与单EVAL。 |
| 3 | K1/K2/K7/A1/O1观察错误结果和实际状态，损坏/故障不伪装missing。 |
| 4 | K3/K9/C1/M1验证ID、防覆盖、索引范围、计数、未知提交精确补偿及非目标。 |
| 5 | K4/K5/K7真实Redis交错/并发；A1补在途自身撤销的最终HTTP交付，O2并发HTTP唯一兑换。 |
| 6 | K1/K8/C2/O3证明时间、可达性、偏差、取得后跨期限及固定期限，K7补自然终态到期。 |
| 7 | C1/A2/O2证明消费后未知/失败及重新授权、协议关联；ORCAS替身不证明外部幂等/退出。 |
| 8 | K6/M1的真实cleanup失败、无TTL/管理可达、恢复原截止、owner冲突及新对象保护。 |
| 9 | L1实际package命令、新进程verify、混合源/目标/孤立/损坏/pending、逐owner保留和失败重跑。 |
| 10 | V1原始固定基线与候选同资源实跑根/两模式/OIDC Code/AccessToken；Kernel与HTTP成本分开。 |
| 11 | 下述完整验证与 #176 固定候选结果；真实I/O先await再同步断言，未执行不记通过。 |
| 12 | 未新增完整系统E2E/自动部署演练，H1所有真实环境步骤均未执行。 |

## 实际执行与复用边界

#171–#175 的固定候选与原日志由各票验收评论保存，不能把不同阶段测试数相加或把切片基线当原始全链基线。
本票重新运行8个相关workspace的完整Unit/Component/Redis、typecheck，四app process、三app PG/Redis composition，
以及root Unit与三份Compose解析。OIDC完整Redis包含 #175 六条真实CLI测试，无须另造维护命令。
新增仅为A1最终在途结果与K7自然过期的直接断言；其余前票断言在本候选完整行为中重跑。
production源码与 #175 相同，#174生产装配与 #175维护的证明范围因此保持；最终运行结果仍按本票日志记录。

```text
pnpm verify:static
pnpm exec turbo typecheck --filter=@iam/session-kernel --filter=@iam/api-core --filter=@iam/custom-sso --filter=@iam/api --filter=@iam/admin-api --filter=@iam/oidc-provider --filter=@iam/worker --filter=@iam/e2e-system --force --concurrency=3
pnpm exec turbo test:unit test:integration:component test:integration:redis --filter=@iam/session-kernel --filter=@iam/api-core --filter=@iam/custom-sso --filter=@iam/api --filter=@iam/admin-api --filter=@iam/oidc-provider --filter=@iam/worker --filter=@iam/e2e-system --force --concurrency=1
pnpm exec turbo test:integration:process --filter=@iam/api --filter=@iam/admin-api --filter=@iam/oidc-provider --filter=@iam/worker --force --concurrency=1
pnpm --filter @iam/db db:migrate
pnpm exec turbo test:integration:composition --filter=@iam/api --filter=@iam/admin-api --filter=@iam/oidc-provider --force --concurrency=1
pnpm test:unit:root
docker compose --env-file docker/.env.dev.example -f docker/docker-compose-dev.yml config --quiet
docker compose --env-file docker/.env.prod.example -f docker/docker-compose-prod.yml config --quiet
docker compose -f e2e/system/compose.yaml config --quiet
pnpm check:docs
git diff --check
pnpm verify
```

`pnpm verify`由主协调者在本票focused commit固定最终候选后执行一次；只有该gate通过才进入本票正式两轴评审/关闭。
父级复用同一SHA结果；发生修复时只复用仍有效的证据，失效gate重新运行。确切SHA/退出码不由本页预先宣称。
本地日志为 `test-results/ticket-176-{static,typecheck,behavior,process,composition}-final.log`、
`ticket-176-migrate.log`、`ticket-176-root-unit-final.log`，最终全仓gate路径沿 #176 评论。
额外composition首次漏传 `IAM_API_CORE_TEST_REDIS_URL`，Admin按预期fail fast；补齐后完整3app重跑通过，
以 `ticket-176-composition-rerun.log`为最终结果。首次root Unit误收集基线副本，移出候选树后109/109通过；
失败日志保留，不作为基线豁免或通过记录。行为22/22 tasks（1929 tests）、类型17/17、process4/4（18 tests）、
composition3/3（9 tests）已执行；最终固定候选复核与全仓verify仍以本票验收评论为准。

调用方独占Redis `docker.xuanyuan.run/library/redis:8.8.0`（动态loopback 38288）和PostgreSQL
`docker.xuanyuan.run/postgres:18.4`（动态loopback 39772），分别PONG/pg_isready后注入七个owner-specific Redis URL与三个app test DATABASE URL；
迁移的 `DATABASE_URL` 仅指该临时库。资源准确ID、清理结果在验收评论，不读取开发/生产连接。

API Hono fixture的Barrier、Client/Gate、Facts以及ORCAS为可控出站；OIDC fixture的Client/Gate、账户/Facts亦为可控出站。
真实PG/Redis composition补production连接，Admin使用正式ClientService/UoW而非完整Admin HTTP+PG。
混合管理的用户摘要/audit/cleanup替身不证明真实第三方退出。可控暂停/故障证明作用边界，不等同生产崩溃或可靠最终回收。
未执行真实ORCAS、浏览器/完整系统E2E、部署、用户下线、停流排空、人工维护/回退及放流；未合main或push。
