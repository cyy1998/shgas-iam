# 双入口登录与 OIDC issuer 联合验收

Status: Current

Last verified: 2026-09-16

Next review: 2026-10-31

本账本对应 [Spec #197](https://github.com/cyy1998/shgas-iam/issues/197) 的 S1–S64，联合票为
[#200](https://github.com/cyy1998/shgas-iam/issues/200)。功能分支 `codex/dual-entry-oidc`，本票评审基线
`a8a85d2132d7caea3252156f71334b2b2c38959e`。代码候选、实际提交和双轴评审结论由 #200 评论固定；
父 Spec 的全仓 `pnpm verify` 由协调者执行。本页不表示目标环境已清理、合入或部署。

## 证据入口与证明范围

- **N**：[导航票 #198](https://github.com/cyy1998/shgas-iam/issues/198)，固定候选 `5c6707ef`，
  API HTTP/真实 Redis、Portal component/browser、配置和正式 composition 的已验收结果。
- **I**：[issuer 票 #199](https://github.com/cyy1998/shgas-iam/issues/199)，固定候选 `a8a85d21`，
  [API issuer HTTP 矩阵](../../../apps/api/test-integration/redis/oidc-issuers.integration.test.ts)及完整协议回归。
  其 manifest/轻量可信代理证据不替代本票 APISIX。
- **G**：[双入口 Full-system browser](../../../e2e/system/dual-entry.spec.ts)。根 `pnpm test:e2e` 先在同 origin
  完成 Admin → HR Admin → OIDC（含本页新增用例），再启动独立双 hostname 的完整正式 runtime/APISIX 栈执行新增用例。
  使用 `internal.iam.localhost` 与 `external.iam.localhost`，Chromium 只在本进程解析到 loopback；协议请求经过正式
  APISIX manifests。无 `page.route` 替代核心协议；Node 探测仅将测试 authority 的连接目标解析到 loopback，真实 Host
  仍由 APISIX 匹配。两个 origin 相等的场景独立执行，两个 localhost 端口不充当域名 Cookie 证据。
- **P**：[独立 RP](../../../apps/api/test-integration/composition/oidc-rp.integration.test.ts)，固定
  `openid-client@6.8.1`；同 origin 和双 issuer 分别执行 Public/Confidential、Discovery、S256、授权响应 `iss`、
  ID Token 签名/issuer/audience/nonce、UserInfo、JWKS及四种退出参数组合。HTTP cookie jar 不充当真实浏览器域隔离证明。
- **C**：本地固定 suite 逐模块账本 `test-results/oidc-conformance/dual-entry-conformance-results.json`，
  按仓库根目录的 `test-results/` 规则忽略，不随 Git checkout 分发；本页保留验收摘要和复现入口。固定 release-v5.2.4 /
  `ab35a8df4864da35b49eff11483e204e01aa7961`，沿用已提交的默认关闭 S256 请求适配、本次明确启用；
  JAR SHA-256 `2fd8cd2b390f2edd1f33574b914169235d832e3b65f8dc274ba5deebaaa0d1e62`。
  没有修改官方验证断言，不宣称官方认证。
- **U**：[固定旧来源升级演练](../../../apps/api/test-integration/composition/dual-entry-upgrade.fixture.ts)，
  完整旧 workspace `5c6707efbf2069649f2c3ea4396bffbd28dcab96`、冻结 lockfile、独立 API 与三个 Worker 进程。
  [HTTP 驱动](../../../apps/api/test-integration/composition/dual-entry-upgrade-http.fixture.ts)先建立连贯旧根/关系及两协议
  可用凭据，再停旧、清理、独立 verify、启动新候选重放旧凭据和双入口新登录；不从新工作树 import 旧 writer。
- **W**：[Worker 全 Redis 通道](../../../apps/worker/test-integration/redis/online-state-command.integration.test.ts)，
  真实新进程证明未知/错类型保留、部分作用、1001 成员分批、scan-only verify、提交丢响应与原范围重跑。
- **R**：[OIDC 发布手册](../../releases/oidc-release-runbook.md)与[统一 owner 维护](../../releases/unified-session-maintenance.md)。
  操作参数、失败保持停流、旧工具与回退职责属于文档契约；真实环境的停流、排空、DNS/TLS、注册和放流仍须发布负责人核验。

## 本票实际运行

最终浏览器内容上根 `pnpm test:e2e` 于本机 Windows 完整通过，耗时 5m47.219s，单 worker、零 retry。
同 origin exact project 为 `iam-e2e-20260916031938800-94709325`（`127.0.0.1:58621`）；
双 hostname exact project 为 `iam-e2e-20260916032313424-5e767930`（共同动态端口 `55547`）。
两者均报告 passed-and-cleaned，原始 Compose/Gateway/seed/diagnostics 保存在各自 `e2e/system/test-results/<run-id>/`。
前一完整运行也通过；其后仅将取消/确认及未知路径变体拆成独立案例，并以上述完整命令重新验证。

两套 issuer 的 Basic 38、Config 1、Logout 11、Public 9，共 118 个计划位置逐项登记于 C。
官方结果与本地结论分列：64 PASSED、8 WARNING、20 REVIEW、12 SKIPPED，另14项未创建；
本地结论为92通过、26不适用。20 REVIEW 必须逐张读取实际 PNG 和对应 requirement，自动 driver 仍以 exit 1 结束，
不能写成命令 exit 0 或官方全 PASSED。14张本地错误页对应未登记 redirect、无效/缺失 hint；6张到达实际退出完成页，
同类退出后的在线失效由 P 的 UserInfo 拒绝补证。

WARNING 保留实际边界：profile/phone 没有虚构全部可选字段，acr_values 请求未返回 acr，Discovery 未提供推荐
`claims_supported`。SKIPPED 的 email/address/all scopes/alternate/request-object/refresh 逐项由实际元数据条件决定。
每个 issuer 的3项主动不创建为 client_secret_post 成功与两种重复认证；另外4项由固定官方
`@VariantNotApplicable(ClientRegistration=static_client)` 排除（Basic signature/unsigned/request-uri-unsigned及Public signature），
不是漏跑适用模块。P 独立执行签名验证，不因专门动态注册模块不适用就省略签名核验。

本次 Java 21.0.4、Maven 3.9.11 既有固定 JAR、Bun 1.3.14、Node 24、Playwright Chromium 与合成 HTTPS；
新证书覆盖 loopback 及两测试 hostname，2026-09-16至2026-09-30有效，Node 仅用本次 `NODE_EXTRA_CA_CERTS`。
suite 的两个 loopback 端口证明两个实际 issuer 的独立协议一致性，G 另证两个真实 hostname；不混淆两种证明。

最终 suite 原始 run 为 `C:/Users/caiyi/AppData/Local/Temp/iam200-evidence/suite-run3/`：两个 issuer 分别为
`https://127.0.0.1:51157/oidc` 与 `https://127.0.0.1:51156/oidc`，suite 为 `https://127.0.0.1:60783`。
矩阵记录每个当前 plan/module ID、实际 variant、日志/PNG SHA-256、官方结果和逐图本地判读。
实际工具为 Node 24.18.0、Chromium 149.0.7827.55、Playwright 1.61.1、tsx 4.23.1。
执行入口为 `pnpm --filter @iam/api exec bun run test-integration/composition/oidc-suite.fixture.ts <config.json>`；
本次 config 为任务目录的 `suite-config3.json`，其中明确双 issuer、合成证书和独立 outputDirectory。

| 实际命令（workspace前缀为 `pnpm --filter @iam/<workspace>`） | 结果 |
|---|---|
| API `test:unit` / `test:integration:component` | 66 / 218 pass |
| API `test:integration:redis` | 单轮空库完整277 pass；未放宽断言 |
| API `test:integration:composition` | 30 pass / 934断言，含24个独立RP场景与生命周期/正式入口回归 |
| API `test:integration:process` / `test:integration:browser` | 1 / 3 pass |
| OIDC `test:integration:redis` | 3 pass |
| Worker `test:integration:redis` | 11 pass / 162断言 |
| Gateway `test:unit` / `test:integration:component` | 32 / 7 pass |
| E2E-system `test:unit` / `test:integration:process` | 73 / 3 pass |
| API/OIDC/Worker/Gateway/E2E-system/SSO `typecheck` | 全通过 |
| 根 `pnpm test:e2e` | 独立同origin与双hostname两个完整lifecycle通过 |
| 根 `pnpm verify:static` / `pnpm check:docs` / `git diff --check` | 通过；最终全仓 `pnpm verify` 由协调者另跑 |

### 旧状态与非目标数据

U 在开启资源前逐 blob 校验旧 SHA 的2,581个文件。旧正式 API 先签发根、两个 Client 关系、两协议 Code/Token、
有效续接与退出确认；Code 实际兑换且 Token 实际 UserInfo 成功。保留另一份未消费 Code/续接/确认作为清理后重放输入。
旧 owner 的公开 testing 另外通过旧 production writer 建立无 TTL、缺 reverse及孤立 reverse 变体；这些变体不是正常凭据证明的替身。

增强证据后的完整演练通过，原始安全材料在本机 `C:/Users/caiyi/AppData/Local/Temp/iam200-upgrade-Hm4gUM/`。
`api.log.baseline.json` 记录精确三个 namespace、各 PG/owner 摘要与非目标 Redis key/value 摘要、绝对 expiry；
`api.log.inventory.json`、`api.log.apply.json`、`api.log.verify.json` 记录三个独立 Worker PID/调用参数及实际报告。
`api.log.preservation.json` 和 `report.json` 保存前后摘要比较与自然到期分类，不保存凭据值或完整 Redis key。
库存为 Kernel 19、Custom 7、OIDC 9，独立 verify 三者 matching 均0；全范围、owner=all、没有 Client filter。
账号1条、Client3条（含 SSO/Internal 凭据）、审计1条及真实 Facts/Profile/Subject Access、两组普通/敏感 Snapshot 读回一致；
另比较限制、短信/nonce、队列 opaque sentinel。自然到期单列，未知状态不靠全库清空绕过。
该轮共比较14项非目标 Redis 值/绝对 expiry，自然到期0项；Worker inventory/apply/verify PID分别为58408/44112/59408。

新候选沿用同一资源、签名 keys 和原 external origin，原Cookie、两协议Code/Token、续接与退出确认在两入口均拒绝恢复；
内/外新登录、两协议兑换/UserInfo以及退出成功。清零早于新登录，不能在 smoke 写入之后再次声称运行库始终零会话。
旧未过期 ID Token 的离线签名可保持有效；IAM 在线清理不承诺第三方/ORCAS 本地登录即时退出。

显式复现 U：先从固定 SHA 提取完整独立 workspace 并安装冻结 lockfile，由调用方提供独占 API PostgreSQL/Redis URL，再运行：

```text
pnpm --filter @iam/api exec bun run test-integration/composition/dual-entry-upgrade.fixture.ts --source-directory <fixed-old-workspace>
```

其中真实 Worker 子进程从旧 `apps/worker` 执行 `bun --no-env-file run online-auth:state -- <mode> ...`，
是同一公开 package script 的独立进程，未在新工作树中调用旧函数冒充命令。

## S1–S64 逐项账本

“通过”指上述代码/临时资源边界内的直接结果；R 的实际目标环境动作全部未执行。

| Story | 可观察要求及结果 | 证据 |
|---|---|---|
| S1 | 内网 Custom 授权进入原入口的根相对登录页；通过。 | N、G |
| S2 | 公网 Custom 登录导航保持原入口；通过。 | N、G |
| S3 | 内网 OIDC 根相对登录页与原授权身份保持；通过。 | N、I、G |
| S4 | 公网 OIDC 登录与授权身份一致；通过。 | N、I、G |
| S5 | 认证续接保留原参数及入口，完成原授权；通过。 | N、I、G |
| S6 | Portal 的授权/退出导航来自本入口发现配置；通过。 | N、G |
| S7 | OIDC 确认 form与默认成功落点相对，取消/确认作用分开；通过。 | N、G、P |
| S8 | 裸登录及仅 ssoReturn 不开放认证上下文；通过。 | N、G的退出后裸登录、I |
| S9 | 已有效根重入继续复用，无新增重复认证；通过。 | N、I、原 Full-system OIDC |
| S10 | prompt/max_age 原新鲜认证拒绝保留；通过；重复认证成功不适用。 | I、P、C |
| S11 | 内网发起仍使用配置的完整公网托管 callback；通过。 | N、G |
| S12 | 业务自行处理 Custom callback 保持登记地址；通过。 | N、U |
| S13 | 最终业务落地与 OIDC redirect原值/校验保留；通过。 | N、I、G、P、C |
| S14 | OA/微信既有完整入站及相对 resume回归通过；真实注册/可达性未执行。 | N、R |
| S15 | Custom/OIDC发现返回完整当前入口端点；通过。 | I、G、P、C |
| S16 | 内网 Discovery/整条OIDC流程使用内网issuer；通过。 | I、G、P、C |
| S17 | 公网 Discovery/整条OIDC流程使用公网issuer；通过。 | I、G、P、C |
| S18 | 相同 origin 对两标签映射同一身份；通过，另跑独立同origin系统场景。 | I、G、P |
| S19 | 同一Public/Confidential Client可用于两issuer；通过。 | I、G、P、C |
| S20 | 两入口共享当前凭据及配置，未复制Client；通过。 | I、P、U |
| S21 | 两issuer共用受控current/previous密钥；通过；真实轮换未执行。 | I、G、P、R |
| S22 | 稳定sub保留，客户端按(iss,sub)识别；通过。 | I、P |
| S23 | Host/Forwarded/query不成为任意issuer；通过。 | I、G |
| S24 | 正式APISIX覆盖伪造入口header；通过。 | G |
| S25 | 未知host不能命中Custom/OIDC发现兜底；通过。 | G |
| S26 | 缺失/非法入口标记在协议状态作用前拒绝；通过。 | I |
| S27 | login path只接受安全根相对路径，歧义输入拒绝；通过。 | N、I |
| S28 | 单issuer/public-origin消费者与模板迁移；新双输入进程/Compose通过。 | I、G、P |
| S29 | 启动完整校验两origin，同origin合法；通过。 | I、G、P |
| S30 | 首次接受issuer固定到授权及续接；通过。 | I、G、P |
| S31 | 错issuer守卫/续接不消费、不清Cookie；通过。 | I |
| S32 | 三段Code与原精确定位/一次消费保留；通过。 | I、U |
| S33 | 成功及安全回调错误携带iss；通过。 | I、G、P |
| S34 | Discovery声明iss能力、无混入口元数据缓存；通过。 | I、G、P、C |
| S35 | 无法验证redirect的错误留IAM本地；通过。 | I、C实看错误PNG |
| S36 | ID Token iss及Access Token归属来自原授权；通过。 | I、G、P、C |
| S37 | 跨issuer Code门槛后失败并有界撤销原实例；通过。 | I |
| S38 | 错issuer已取Code不恢复、不能原入口重试；通过。 | I |
| S39 | 只撤原ClientSession，根/其他Client/新实例保留；通过。 | I |
| S40 | Confidential Secret门槛前零消费/零撤销；通过。 | I |
| S41 | Public保留原PKCE与归属顺序；通过。 | I、P、C |
| S42 | 缺码/期限/重放保留门槛后失败撤销；通过。 | I |
| S43 | 同/跨入口竞争至多一次消费，错入口不签发；通过。 | I |
| S44 | 消费未知和撤销未知分别表达，无自动重发；通过。 | I、W |
| S45 | 无签名/墓碑与构造缺码的已接受边界未扩张；通过。 | I、ADR-0035/0036 |
| S46 | 同根同Client共享有效关系；通过。 | I |
| S47 | 共享关系终止使两issuer在线Token失效；通过。 | I |
| S48 | UserInfo错issuer不披露且不扩大撤销；通过。 | I |
| S49 | 当前披露、Client Gate、Subject Access保持；通过。 | I、原Full-system、P |
| S50 | hint按本次issuer验签，错误入口先拒绝；通过。 | I |
| S51 | 退出确认/取消绑定issuer，错误入口零消费/零Cookie/零根作用；通过。 | I |
| S52 | 正常取消保留、确认作用于请求当前根；通过。 | I、G、P、C |
| S53 | 两不同hostname各自持有host-only Cookie，无同步；通过。 | G |
| S54 | 同host不同端口可能共享Cookie，不承诺端口隔离；边界已明确。 | R、P/C证明范围说明 |
| S55 | 全部根/关系及两协议在线产物/索引清理；临时演练通过。 | U |
| S56 | 固定旧writer/decoder、停旧与三个独立命令；临时演练通过。 | U |
| S57 | 部分失败/未知保持停流，原范围重跑及独立verify；通过。 | W、R |
| S58 | PG业务与非会话Redis摘要/绝对expiry及owner读回保留；通过。 | U |
| S59 | 新候选拒绝旧Cookie、两协议Code/Token/续接/确认；通过。 | U |
| S60 | 双入口新登录成功；离线Token/第三方本地登录不属即时失效承诺。 | U、G、R |
| S61 | 不自动混入旧Provider/Client/Secret/Snapshot维护；范围明确。 | U真实命令、R |
| S62 | 正式HTTP与真实Redis观察签发/消费/撤销，非字段存在测试；通过。 | I、U、W |
| S63 | 真实APISIX+两hostname浏览器与另一个same-origin场景；通过。 | G |
| S64 | 两issuer适用suite/RP、全owner清理和联合通道有实际结果；全仓最终验证另由协调者记录。 | G、P、C、U、W |

## 失败记录、资源与发布边界

初次suite配置使用系统数据库名，被专用库guard拒绝；改用独占PG中的专用测试库后从头运行。
首次静态检查发生于并行fixture仍编辑时，lint报格式错误；修正后重跑，不将该次记录为通过。
API Browser首次启动使用默认输出根，误清理API `test-results` 下历史#195及本次suite生成材料，随后因打开文件未结束；
已精确停止本次进程树，配置固定到 `test-results/browser`。历史受影响说明在[原记录](../oidc/protocol-conformance.md)，
本次suite改在独立 `C:/Users/caiyi/AppData/Local/Temp/iam200-evidence/` 完整重跑，不用旧结论冒充新证据。
重新启动suite时一次调用早于HTTPS readiness，连接拒绝；原失败保留，等待实际readiness成功后开始新的完整运行。

临时PG/Redis/APISIX/etcd使用仓库固定镜像，suite另用官方Mongo6.0.13；独占容器创建即记录exact ID，动态loopback端口，
E2E由exact-project lifecycle统一清理。新API Redis完整profile使用初始DBSIZE=0的单轮独占资源，不放宽SCAN页数断言。
八个本票独占容器（包括最后复验中断生命周期的PG/Redis）均已按创建时记录的完整ID删除，suite JVM已停止；
安全资源记录在任务目录 `resources-cleaned.json`。四次E2E exact-project生命周期均已完成各自清理。
新增升级CLI复用既有 conformance 外层中断生命周期，资源初始化前开始监听，阶段间检查中断，并保持监听至全部清理结束；
旧Worker命令保留30秒有界完成及进程树清理，未新增无界后台任务。
本地TLS和suite/UI均为合成环境，没有修改机器trust store、生产数据或真实第三方控制台。
目标环境停流/排空、DNS/TLS/直连限制、OA/微信/ORCAS/业务RP注册与可达性、真实迁移/清理、放流和回退全部未执行。
所有ticket通过也不自动授权merge、push、部署或关闭父Spec。
