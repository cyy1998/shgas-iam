# 统一会话最终契约与验收账本

Status: Current

Last verified: 2026-09-15

Next review: 2026-10-31

来源为 [Spec #178](https://github.com/cyy1998/shgas-iam/issues/178) 和 [最终票 #196](https://github.com/cyy1998/shgas-iam/issues/196)。本页逐项登记96故事、27实现决定、11测试决定和10来源责任，共144行。需求全文以Spec为准；这里的缩写不是新增契约。

本票 review base 为 `ce2a92bd7bb1b588111e30e9d47f80b1b9e69606`，目标 main 为 `b6481f2de5c2930fc381d99e70520e0783091e9d`，功能分支 `codex/unified-session-lifecycle`。本页登记固定实现内容的行为证据；最终静态/聚合命令结果及候选SHA随本票交接保存。

维护者于2026-09-15明确要求「不要搞改造前后成本对比」，取代本票AC4及Spec TD10的本次执行要求。对比已停止，自有未提交驱动、独立基线worktree及两项基线专用资源已清理。此前探索产生的原始日志/数据只保留过程事实，不比较、不宣称收益。原owner性能工具未删；#71/#72完整预算和来源issue保持独立。下文相关项标为本次取消，既不是性能通过，也不是未完成的阻断项。

## 证据归属与复用条件

下表缩写对应公开测试入口，冒号后的数字为本票开始时测试位置，具体行为以测试标题和断言为准。每条采用真实Redis/PG或明确出站替身；不存在文件不等于执行。

| 缩写 | 测试入口 |
|---|---|
| K | [packages/session-kernel/test-integration/redis/unified-session-lifecycle.integration.test.ts](../../../packages/session-kernel/test-integration/redis/unified-session-lifecycle.integration.test.ts) |
| B | [packages/api-core/test-integration/redis/subject-access-operation-kernel.integration.test.ts](../../../packages/api-core/test-integration/redis/subject-access-operation-kernel.integration.test.ts) |
| S | [packages/api-core/test-integration/redis/client-snapshot.integration.test.ts](../../../packages/api-core/test-integration/redis/client-snapshot.integration.test.ts) |
| C | [apps/api/test-integration/redis/root-authentication.integration.test.ts](../../../apps/api/test-integration/redis/root-authentication.integration.test.ts) |
| OA | [apps/api/test-integration/redis/oidc-authorization.integration.test.ts](../../../apps/api/test-integration/redis/oidc-authorization.integration.test.ts) |
| OT | [apps/api/test-integration/redis/oidc-token.integration.test.ts](../../../apps/api/test-integration/redis/oidc-token.integration.test.ts) |
| OU | [apps/api/test-integration/redis/oidc-userinfo.integration.test.ts](../../../apps/api/test-integration/redis/oidc-userinfo.integration.test.ts) |
| OL | [apps/api/test-integration/redis/oidc-logout.integration.test.ts](../../../apps/api/test-integration/redis/oidc-logout.integration.test.ts) |
| AF | [apps/api/test-integration/composition/oidc-userinfo.integration.test.ts](../../../apps/api/test-integration/composition/oidc-userinfo.integration.test.ts) |
| AE | [apps/api/test-integration/composition/entry.integration.test.ts](../../../apps/api/test-integration/composition/entry.integration.test.ts) |
| RP | [apps/api/test-integration/composition/oidc-rp.integration.test.ts](../../../apps/api/test-integration/composition/oidc-rp.integration.test.ts) |
| AP | [apps/admin-api/test-integration/postgres/client-sso-management.integration.test.ts](../../../apps/admin-api/test-integration/postgres/client-sso-management.integration.test.ts) |
| AS | [apps/admin-api/test-integration/composition/client-sso-snapshot.integration.test.ts](../../../apps/admin-api/test-integration/composition/client-sso-snapshot.integration.test.ts) |
| AR | [apps/admin-api/test-integration/composition/root-security.integration.test.ts](../../../apps/admin-api/test-integration/composition/root-security.integration.test.ts) |
| UI | [apps/admin/test-integration/browser/client-sso.spec.ts](../../../apps/admin/test-integration/browser/client-sso.spec.ts) |
| WR | [apps/worker/test-integration/redis/online-state-command.integration.test.ts](../../../apps/worker/test-integration/redis/online-state-command.integration.test.ts) |
| WP | `client-sso-upgrade-command.integration.test.ts`（历史验收入口，已随旧 CLI 退役；当前升级验证见 b648 独立脚本测试） |
| WC | `client-sso-contraction-command.integration.test.ts`（历史验收入口，已随旧 CLI 退役；当前升级验证见 b648 独立脚本测试） |
| DB | [packages/db/test-integration/postgres/client-sso-contraction.integration.test.ts](../../../packages/db/test-integration/postgres/client-sso-contraction.integration.test.ts) |
| J | [apps/api/test-integration/redis/unified-protocols.integration.test.ts](../../../apps/api/test-integration/redis/unified-protocols.integration.test.ts) |
| E | [e2e/system/src/unified-session-journey.ts](../../../e2e/system/src/unified-session-journey.ts) |

#194的最终生产候选为1ccdeddc54eef8be7ba3b97769e911d028ef3823：Kernel21/145、CoreRedis50/342、AdminPG233/1430及composition26/182、WorkerPG16/92及Redis11/162、DBPG19/79，真实CLI在新进程执行；R8三条系统旅程run20260915030508592-6d757a61通过。随后#195无生产改动；本票仅改测试/证据，所以未受影响的生产路径、资源模型和原测试内容仍适用，以下标“复用”均指这个内容与环境匹配判断，并非假称当前SHA重跑。完整命令与原始本机证据见[#194交接](https://github.com/cyy1998/shgas-iam/issues/194#issuecomment-5674228806)。

#195采用固定suite release-v5.2.4/ab35a8df4864da35b49eff11483e204e01aa7961：59格本地46pass/13不适用；官方32PASSED/4WARNING/10REVIEW/6SKIPPED，另7未创建；原始REVIEW不改称官方PASSED。独立openid-client6.8.1为8flows/128assertions。结果及S256适配见[协议验收](../oidc/protocol-conformance.md)。本票不改生产OIDC，所以该矩阵可复用，不称完整官方认证。

J是新API共享fixture联合HTTP；E是在真实Admin/PG/Redis/Gateway/浏览器同一根中串联两协议。E与J各自完整建立同根实例，不把旧单协议局部测试拼成联合。原测试中通过Kernel直接改protocol或替身setClient的用例只承担局部证明。

## 96条用户故事

| 项 | 需求 | 证据 | 状态与限制 |
|---|---|---|---|
| US1 | 密码、短信、OA 和微信登录继续可用 | C:458,561 | 同内容/环境复用 |
| US2 | 已有有效根登录能被授权流程复用 | C:324; OA:203; J/E | 同内容/环境复用；新联合已执行（J/E） |
| US3 | 登录失败限制和认证审计继续生效 | C:458,527,561; OT:693,725 | 同内容/环境复用 |
| US4 | 不同设备或登录形成独立 UserSession | C:458; K:51 | 同内容/环境复用 |
| US5 | 根登录期限固定且不因协议活动延长 | K:51,115 | 同内容/环境复用 |
| US6 | 同根同 Client 的并发授权复用一个有效 ClientSession | K:92; OA:203; J/E | 同内容/环境复用；新联合已执行（J/E） |
| US7 | 后续授权只延长目标 ClientSession 且不超过原根 | K:115,143 | 同内容/环境复用 |
| US8 | 兑换、UserInfo、authz 和普通访问不续期 | OU:52; C:960,1381 | 同内容/环境复用 |
| US9 | 每枚 Token 保留签发时确定的期限 | C:1381; OT:44 | 同内容/环境复用 |
| US10 | 失效应用关系通过新 ID 重新建立 | K:220,356; C:1019 | 同内容/环境复用 |
| US11 | 根成功终止后新的派生在线访问被拒绝，即使子索引漏项 | K:201; OU:81; J | 同内容/环境复用；新联合已执行（J/E） |
| US12 | 原 ClientSession 撤销影响引用它的全部协议访问 | K:243; J/E | 同内容/环境复用；新联合已执行（J/E） |
| US13 | 撤销某一应用关系保留其他 Client 和根登录 | OT:525; AR:421; J | 同内容/环境复用；新联合已执行（J/E） |
| US14 | 可信观察只能由本 factory 的有效操作创建和使用 | K:159,72 | 同内容/环境复用 |
| US15 | 管理记录不能转为在线许可 | K:159,72 | 同内容/环境复用 |
| US16 | 已取得有效观察的在途操作能按既有边界完成 | B:68; OA:257; OU:181 | 同内容/环境复用 |
| US17 | 期限与响应剩余秒数依据 Redis 时间 | K:115,143; C:409; OT:44 | 同内容/环境复用 |
| US18 |  Client 保留稳定身份、角色归属和独立 Internal API 凭据 | AP:163; DB:52 | 同内容/环境复用 |
| US19 | 每个 Client 可以不配置 SSO，或严格选择 OIDC/Custom SSO 之一 | AP:163,294; DB:83 | 同内容/环境复用 |
| US20 | 没有协议配置时不能启用 SSO | AP:163,294; DB:83 | 同内容/环境复用 |
| US21 | 单独关闭 SSO 后保留配置且不连带关闭 Internal API | AP:163; AR:421; AS:166; E | 同内容/环境复用；新联合已执行（J/E） |
| US22 | 直接切换 Client 协议和相应配置 | AP:163; OA:43; C:271; E | 同内容/环境复用；新联合已执行（J/E） |
| US23 | 协议切换不自动轮换 Secret、撤销会话或清除续接 | AP:163; OA:43; C:271; E | 同内容/环境复用；新联合已执行（J/E） |
| US24 | 切换后的授权可复用有效 ClientSession 并更新其 protocol | K:92; J/E | 同内容/环境复用；新联合已执行（J/E） |
| US25 | 切回原协议时未撤销、未过期且满足其他条件的旧访问可以恢复 | OU:116; C:1325; E | 同内容/环境复用；新联合已执行（J/E） |
| US26 | 配置变化本身和之后兑换失败导致的实例撤销分开报告 | AR:421; C:1019; OT:131; E | 同内容/环境复用；新联合已执行（J/E） |
| US27 | 新的授权使用当前 redirect 允许列表，已接受的续接和 Code 保留原地址结论 | OA:43; C:271 | 同内容/环境复用 |
| US28 |  Client 通行状态和所选协议配置来自同一次共同源观察 | S:93; AS:166 | 同内容/环境复用 |
| US29 | 普通 Snapshot warm 命中只用一次 Redis 网络往返 | S:374 | 同内容/环境复用 |
| US30 |  Secret 只经独立敏感能力提供 | S:93; AP:613 | 同内容/环境复用 |
| US31 |  Secret 认证缓存优先且轮换使缓存失效 | AS:78; AP:381; E | 同内容/环境复用；新联合已执行（J/E） |
| US32 | 只保留当前 SSO Secret 而没有主动重叠期 | AS:78; AP:381; E | 同内容/环境复用；新联合已执行（J/E） |
| US33 | 轮换不撤销原会话、Code 或 Token | AS:78; AP:381; E | 同内容/环境复用；新联合已执行（J/E） |
| US34 | 轮换已提交但缓存同步失败时能看到真实结果和修复提示 | AS:78; AP:381; E | 同内容/环境复用；新联合已执行（J/E） |
| US35 | 成功失效阻止旧读取晚到回填 | S:215; AS:372 | 同内容/环境复用 |
| US36 | 缓存故障、缺失、损坏和重复 CAS 冲突有明确结果 | S:253,270 | 同内容/环境复用 |
| US37 | 经独立授权和审计重读当次当前 Secret | AP:381; UI:40 | 同内容/环境复用 |
| US38 | 读取审计失败时不交付 Secret，且日志审计不记录原文 | AP:414 | 同内容/环境复用 |
| US39 |  HR 无权重读 Secret，前端消费服务端能力 | AP:241,381,613; UI:129 | 同内容/环境复用 |
| US40 | 保留现有 issuer、端点、Code Flow 和必要标准错误 | AE:22; OT:44; RP:8 | 同内容/环境复用；新联合已执行（J/E） |
| US41 |  Public 使用 none、Confidential 使用 client_secret_basic，且两者强制 S256 | OT:44,131,608; RP:8 | 同内容/环境复用 |
| US42 |  state、redirect、scope、可选 nonce 与响应模式按已接受范围校验和绑定 | OA:15,135,172 | 同内容/环境复用 |
| US43 |  query、fragment、form_post 都保留 Code 响应能力 | OA:15,135,172 | 同内容/环境复用 |
| US44 |  prompt/max_age 保留现有根复用和重认证拒绝行为 | OA:72,225 | 同内容/环境复用 |
| US45 |  Confidential 的 Secret 未通过时既不消费 Code 也不撤销实例 | OT:98,608; E | 同内容/环境复用；新联合已执行（J/E） |
| US46 | 无法解析、目标不存在或归属不符的 Code 请求只拒绝 | OT:98; C:1001 | 同内容/环境复用 |
| US47 |  Code 消费在所属协议、Client 和原实例范围内隔离 | OT:429,525; C:1404 | 同内容/环境复用 |
| US48 |  Code 原子取出删除只有一个明确取得者 | OT:237; J | 同内容/环境复用；新联合已执行（J/E） |
| US49 | 明确取出后的 redirect、PKCE、投影或签名失败烧掉 Code 并要求重新授权 | OT:131 | 同内容/环境复用 |
| US50 |  ID Token 准备成功后才保存 Access Token | OT:131 | 同内容/环境复用 |
| US51 | 通过认证及原实例定位门槛后的兑换失败尝试终止原应用关系 | OT:131; C:1019; J/E | 同内容/环境复用；新联合已执行（J/E） |
| US52 | 缺失、过期消失和竞争未取得均进入该撤销规则 | OT:131; C:1279,1075 | 同内容/环境复用 |
| US53 | 存储故障、损坏和消费未知保持真实错误分类 | OT:131,279; C:1019 | 同内容/环境复用 |
| US54 |  Public 的失败撤销不增加前置 Secret 或 PKCE 成功条件 | OT:191; C:1019 | 同内容/环境复用 |
| US55 | 验收覆盖合法定位者构造不存在 Code ID 的撤销效果 | OT:191; C:1019 | 同内容/环境复用 |
| US56 | 撤销仅在本请求内有界尝试且分别报告实际结果 | OT:279,388; C:1131,1357 | 同内容/环境复用 |
| US57 | 成功撤销后晚到写入的 Token 仍被在线检查拒绝 | OT:237; C:1075; J | 同内容/环境复用；新联合已执行（J/E） |
| US58 | 原实例的失败撤销和重试保留新实例、其他 Client 与其他根 | OT:388,525; K:243; AR:278; J/E | 同内容/环境复用；新联合已执行（J/E） |
| US59 | 每个 Client 只有一个 callback，由实际完整 IAM 地址自动识别托管接入 | C:383; AP:587 | 同内容/环境复用；人工边界见后文 |
| US60 |  authorize 的 client/redirectUrl/state、token 的 Basic 与 form 输入继续保留 | C:271,383,737,1001 | 同内容/环境复用 |
| US61 | 业务 Code 统一采用三段格式且无需新签名密钥 | C:271,383,737,1001 | 同内容/环境复用 |
| US62 |  Code 绑定签发时的 callback、兑换方、最终落地地址和 state | C:271,383,737,1001 | 同内容/环境复用 |
| US63 | 业务兑换先认证和定位，再执行现有适用前置校验与一次消费 | C:1019 | 同内容/环境复用 |
| US64 | 错误 callback、兑换方或落地地址不能消费 Code，而在已通过认证及定位时仍尝试撤销原实例 | C:1019 | 同内容/环境复用 |
| US65 | 消费后投影、签发或交付失败不恢复 Code，并保留本次已知 Token 的同步尽力补偿 | C:1019,1131 | 同内容/环境复用 |
| US66 | 本次 Token 补偿不替代原实例撤销证明 | C:1131,694,862 | 同内容/环境复用 |
| US67 | 既有 callback 绑定、Cookie、跳转和 ORCAS 交付继续工作 | C:737,899 | 同内容/环境复用；人工边界见后文 |
| US68 | 消费失败或未知时不调用 ORCAS | C:778,676 | 同内容/环境复用 |
| US69 | 托管消费后的失败继续重新授权并尽力补偿本次已知 Token | C:823,862,694 | 同内容/环境复用 |
| US70 | 响应仍为 sid/ttl/subject，sid 表达协议 bearer | C:960,737 | 同内容/环境复用 |
| US71 | 两协议消费已发布 Subject Facts | AF:13; C:720 | 同内容/环境复用 |
| US72 | 旧 Token 的 UserInfo 按本操作 Client 当前披露范围返回，包括新增范围 | OU:52 | 同内容/环境复用 |
| US73 | 完整 Subject 和 Gateway 最小 Header 各按当前配置裁剪 | C:899,960 | 同内容/环境复用 |
| US74 | 已签 ID Token 内容固定、新签 ID Token 使用实际需要的 Facts，并排除两类 IAM 扩展授权/任职声明 | OU:52; OT:44,82 | 同内容/环境复用 |
| US75 | 仅需稳定 sub 时不额外读取完整 Facts | OT:82; C:579 | 同内容/环境复用 |
| US76 | 账号访问许可继续独立检查且旧代不会因重新启用而恢复 | B:89,142; C:1325 | 同内容/环境复用 |
| US77 | 列表显示会话记录而不冒称在线用户 | AR:278; K:72 | 同内容/环境复用 |
| US78 | 批量撤销固定捕获的实例集合 | AR:278; K:259 | 同内容/环境复用 |
| US79 | 已终止数、排除数、失败和产物回收结果分开表达 | AR:237,482; K:280 | 同内容/环境复用 |
| US80 | 未完成原实例集合可供后续明确操作重试，集合丢失则重新查询发起新操作 | AR:278; K:259 | 同内容/环境复用；人工边界见后文 |
| US81 | 本人全部下线或重置密码保留当前根但撤销其 ClientSession | AR:133 | 同内容/环境复用 |
| US82 | 单根撤销继续保护当前管理根 | AR:482; K:259 | 同内容/环境复用 |
| US83 |  no-op、明确已提交、Unknown COMMIT 与作用后审计失败保留不同反馈 | AP:139,547; AS:252; AR:192 | 同内容/环境复用 |
| US84 | 页面刷新和 Secret 重读不会清除尚未修复的传播提示 | UI:40,236 | 同内容/环境复用 |
| US85 | 登录守卫、续接、退出确认与暂态保留 Cookie 按现有级别回归 | C:527,436; OA:98,225; OL:79,96,190 | 同内容/环境复用 |
| US86 | 未确认安全 redirect 时本地报错，CORS 按实际公开行为和 Client origins 限定 | OA:150,172; OT:206; OU:8 | 同内容/环境复用 |
| US87 |  Kernel 只拥有两类会话、协议各自拥有产物 | AE:22; K:72; WR:75; #194 退役映射 | 同内容/环境复用；新联合已执行（J/E） |
| US88 |  OIDC HTTP 并入 API 后完整迁移 env、readiness、日志、镜像、路由和测试 owner | AE:22; OT:380; OL:202; #194 process/Gateway | 同内容/环境复用；新联合已执行（J/E）；人工边界见后文 |
| US89 |  Worker 统一提供 owner 有界库存、apply 和独立只读 verify | WR:177,239,261 | 同内容/环境复用 |
| US90 | 维护覆盖无索引、pending、无 TTL 与孤立库存，并保留未知和非目标数据 | WR:75,94,111,142 | 同内容/环境复用 |
| US91 | 部分失败后能按明确范围重跑且新进程核验 | WR:154,261; WP:150 | 同内容/环境复用 |
| US92 | 首次升级全体重新登录并为需要 Secret 的 Client 换新 | WC:9; DB:74; WR:75 | 同内容/环境复用；人工边界见后文 |
| US93 | 旧双协议 Client 由人工明确选择，缺少 callback 的托管库存补齐实际路由 | WP:82,124 | 同内容/环境复用；人工边界见后文 |
| US94 | 前后端、外部接入方和 Gateway 协调切换并提供实际证据 | AE:22; DB:52; #194 E2E R8 | 同内容/环境复用；新联合已执行（J/E）；人工边界见后文 |
| US95 | 固定版本协议套件、真实 RP、资源故障与完整端点成本各有独立证据 | RP:8; #195 套件; AE与原owner故障矩阵 | 套件/RP/资源按内容复用；维护者取消本次前后成本对比 |
| US96 | 每个来源问题按新契约逐项核销并保留未覆盖责任 | 下文来源责任 | 已逐项核销；不关闭来源 |

## 27条实现决定

| 项 | 决定 | 证据 | 状态与限制 |
|---|---|---|---|
| ID1 | 能力所有权。 | C:458; K:72; AE:22; WR:75; AR:278 | 复用；新增联合/人工边界按对应US登记 |
| ID2 | 删除重复权威。 | AE:22; WR:75; #194 出口/Guard/退役映射 | 复用；新增联合/人工边界按对应US登记 |
| ID3 | 两类会话模型。 | K:51,92,220 | 复用；新增联合/人工边界按对应US登记 |
| ID4 | Kernel 公开能力与信任。 | K:159,72,220,243 | 复用；新增联合/人工边界按对应US登记 |
| ID5 | 许可和在途操作。 | B:68,89; K:201; OA:257; OU:181; J | 复用；新增联合/人工边界按对应US登记 |
| ID6 | 期限与原子关系。 | K:92,115,143; C:1381; OU:52 | 复用；新增联合/人工边界按对应US登记 |
| ID7 | 生命周期与索引。 | K:339; C:409; OT:44; WR:75 | 复用；新增联合/人工边界按对应US登记 |
| ID8 | Client 与严格配置。 | AP:163,294,613; DB:52 | 复用；新增联合/人工边界按对应US登记 |
| ID9 | 可逆配置操作。 | AP:163; AR:421; E | 复用；新增联合/人工边界按对应US登记 |
| ID10 | 统一 Snapshot。 | S:93,374; AS:166 | 复用；新增联合/人工边界按对应US登记 |
| ID11 | Snapshot 故障与恢复。 | S:215,253,270,312; AS:252; WR:201 | 复用；新增联合/人工边界按对应US登记 |
| ID12 | Secret 存储与认证。 | AS:78; S:93; AP:381,587; E | 复用；新增联合/人工边界按对应US登记 |
| ID13 | 当前 Secret 重读。 | AP:381,414; UI:40,129 | 复用；新增联合/人工边界按对应US登记 |
| ID14 | Code 定位与隔离。 | C:324,1404; OT:429,525 | 复用；新增联合/人工边界按对应US登记 |
| ID15 | 兑换失败的共同门槛。 | C:1001,1019; OT:98,131,191,608; E | 复用；新增联合/人工边界按对应US登记 |
| ID16 | 撤销结果和已接受边界。 | C:1075,1131,1279,1357; OT:237,279,388; J | 复用；新增联合/人工边界按对应US登记 |
| ID17 | OIDC 顺序。 | OT:131,237,293,815 | 复用；新增联合/人工边界按对应US登记 |
| ID18 | Custom SSO 接入与 wire。 | C:271,383,737,960 | 复用；新增联合/人工边界按对应US登记 |
| ID19 | Custom 业务消费与失败。 | C:1019,1131,1075 | 复用；新增联合/人工边界按对应US登记 |
| ID20 | 托管与 ORCAS 的保留边界。 | C:676,694,737,778,823,862 | 复用；新增联合/人工边界按对应US登记 |
| ID21 | Facts 和当前披露。 | AF:13; OU:52; C:720,899; OT:82 | 复用；新增联合/人工边界按对应US登记 |
| ID22 | 续接与浏览器。 | C:271,436,527; OA:43,98,225; OL:79,96,190 | 复用；新增联合/人工边界按对应US登记 |
| ID23 | OIDC 兼容范围。 | OA:15,72,135,150,172; OT:44,206,380; OU:8; OL:202; RP:8 | 复用；新增联合/人工边界按对应US登记 |
| ID24 | Admin 提交与反馈。 | AP:139,493,547; AR:192; UI:236 | 复用；新增联合/人工边界按对应US登记 |
| ID25 | 会话管理。 | AR:133,237,278,482; K:259 | 复用；新增联合/人工边界按对应US登记 |
| ID26 | 首次数据迁移。 | WP:82,124; WC:9; DB:52,74; WR:75,201 | 复用；新增联合/人工边界按对应US登记 |
| ID27 | 运行时与维护交付。 | AE:22; WR:94,177,239,261; #194 process/Gateway/E2E | 复用；新增联合/人工边界按对应US登记 |

## 11条测试决定

| 项 | 决定 | 证据 | 状态与限制 |
|---|---|---|---|
| TD1 | 主测试边界。 | K; C/OA/OT/OU/OL; AP/AS/AR; WR/WP; J/E | 复用；新增联合/人工边界按对应US登记 |
| TD2 | 好测试的标准。 | K:159; C:1001,1019; OT:98,131; AP:493; WR:261 | 复用；新增联合/人工边界按对应US登记 |
| TD3 | V1 协议状态。 | C:1001,1019,1404; OT:98,131,191,237,429 | 复用；新增联合/人工边界按对应US登记 |
| TD4 | V2 会话和并发。 | K:92,115,159,201; J | 复用；新增联合/人工边界按对应US登记 |
| TD5 | V3 Snapshot 和敏感读取。 | S:93,215,253,270,312,374; AS:78; AP:414; WR:201 | 复用；新增联合/人工边界按对应US登记 |
| TD6 | V3 配置、披露和接入。 | AP:163; AR:421; E; C:271,737-899; OA:43; OU:52; AF:13 | 复用；新增联合/人工边界按对应US登记 |
| TD7 | 管理与页面。 | AP:139,241,381,414,547; AR:133,192,278; UI:40,129,236 | 复用；新增联合/人工边界按对应US登记 |
| TD8 | OIDC HTTP 与互操作。 | OA/OT/OU/OL; RP:8; #195 固定矩阵 | 复用；新增联合/人工边界按对应US登记 |
| TD9 | V4 维护与运行时。 | WR:75,94,154,177,239,261; WC:9; AE:22; #194 R8 | 复用；新增联合/人工边界按对应US登记 |
| TD10 | V4 成本。 | 维护者2026-09-15明确指令「不要搞改造前后成本对比」 | 取消本次前后对比，不适用当前验收；不是性能验证通过 |
| TD11 | 验证与旧测试替换。 | 本票最终验证与144项账本 | 账本/行为已核对；最终聚合退出状态见本票交接 |

## 10项来源责任

| 项 | 按Q40核销的责任 | 行为证据/取代关系 | 保留责任 |
|---|---|---|---|
| SRC141 | Code/Token由OIDC独占；先取删、失败/未知、晚到写入 | OT:131,237,279,293,815；J。Provider/Kernel双登记、Grant/Claims Snapshot由当前owner取代 | 没有OIDC Token补偿或后台补齐；原REVIEW/未知保持真实 |
| SRC142 | 同根不同Client、不同根、原新实例隔离 | K:220,243；OT:525；AR:421；J/E。protocol不可变/切换永久终止被有效实例复用取代 | 捕获非全局快照；不承诺清除第三方会话 |
| SRC143 | 可信父、factory/operation隔离、唯一关系与真实消费者 | K:51,92,159,220；AE；J。Kernel只含US/CS，Code/Token归协议 | 摘要定位/用途匹配/固定Token期限为基线已有，不重复计收益 |
| SRC153 | 启用中保存/直接切换/当前Secret缓存及审计重读 | AP:163,381,414,547；AS:78；UI:40,236；E。旧重叠期/提前撤旧/加密/维护前置由单一当前原文取代 | 传播失败窗口、在途旧认证、人工Secret分发保留 |
| SRC154 | 删除无消费者logoutEndpoint，保留IAM退出 | DB:52；AP严格配置；OL及C:1521。schema/页面/对接说明随194迁移 | 不新增第三方退出通知，旧离线decoder继续读取历史字段 |
| SRC155 | protocol/type/client重复权威、Runtime重复读取与纯赋值异常层 | C:1001,1019,1404；OT:429；C:496。详见统一维护手册逐项最终消费者核对 | 保留真实I/O/未知/唯一消费/原身份/Token补偿；内存整理不声称端点收益 |
| SRC162 | Worker公开维护装配，逐命令保留/替代/退役 | WR全11项、新进程inventory/apply/verify；WC旧工具先迁移再DDL；统一维护手册逐命令表 | 无通用可靠后台执行器；旧工具固定aeb2dc45制品及旧schema边界 |
| SRC169 | 统一payload/源Client行/共同warm一次RTT，窄Gate/敏感能力 | S:93,215,253,270,312,374；AS；E。旧独立Gate与合并待选由统一Snapshot取代 | Gate拒绝不先于适用Secret/可信定位；维护者取消本次前后成本对比，不据局部RTT推导完整端点收益 |
| SRC121 | 逐类盘点终止与回收，不按TTL认定可靠清理全部完成 | K:201,259,280,339；C:694,862,1131,1357；B:142；AR:192；下表 | 权威未知、账号恢复、作用后审计及部署监控/SLO仍独立负责；来源保持open |
| SRC145 | 保留消费后ORCAS与本次IAM Token同步尽力补偿 | C:676,694,737,778,823,862仅证明IAM编排和替身外部调用 | 真实幂等/复用替换创建/期限/查询/精确退出独立未验证，保持open |

所有来源已读取实际issue，未修改或关闭#141/#142/#143/#153/#154/#155/#162/#169/#121/#145。#178/#177保持open，父级记录由协调者负责。

## 仍需可靠承担的作用与人工边界

| 作用 | Owner/重试 | 可遗忘条件与未执行项 |
|---|---|---|
| US/CS权威终止 | Kernel；Admin仅重试原捕获集合，未知不称终止 | 原记录期限终结或明确终态；丢集合须重新查询发起新操作 |
| 根到子尽力作用 | Kernel/Admin；子失败不反转根 | 新在线检查原根而拒绝；不依赖逐Token回收，不承诺捕获后晚到全部包含 |
| Code/Token/续接/退出/索引回收 | 原协议owner TTL/显式离线维护 | 新终态不取消TTL；旧pending/无TTL须停流source清理，不等待自然过期 |
| Q36业务失败撤销 | 两协议当前请求内有界处理原实例 | 失败/未知无后台自动补齐承诺；不重放Code或签发 |
| 本次Custom Token补偿 | Custom仅本次已知Token比较删除 | removed/missing/replaced/unknown分开；托管不追加共享实例撤销 |
| 账号访问恢复 | Subject Access/User Profile Worker；PGintent/Redis recovery/authority repair | 原部署调度、排空、监控/SLO仍需保持；会话清理不把Unknown Barrier改enabled |
| 作用后审计 | Admin/认证审计owner报告真实作用、告警及人工核对 | 无通用可靠补审计；不自动重放已生效mutation |
| ORCAS外部会话 | #145/外部接入方 | IAM退出/TTL/替身不证明外部退出或有界残留 |

前后端和消费者迁移：API根认证/Custom/OIDC/Public/Internal、Admin REST/tRPC/页面、SSO续接、Worker CLI、Gateway upstream与Compose环境/镜像均在#194迁到唯一模型，原三旅程直接证明仓内代表路径。外部REST/RP必须同步严格配置DTO、三段Custom Code、当前Secret、sid为bearer、会话计数及原实例撤销语义；独立RP只证明所列OIDC交互，不证明全部真实接入方已切换。

生产停流、各副本drain、Client双协议人工选择、实际托管callback路由、Secret受控分发、旧扩展期工具apply/独立verify、最终DDL、source/unified清理、Snapshot repair/新进程verify、部署、readiness/smoke与放流均未在目标环境执行。按[统一维护手册](../../releases/unified-session-maintenance.md)和[OIDC发布手册](../../releases/oidc-release-runbook.md)由发布owner取得证据。API与OIDC同进程意味着资源耗尽/进程失效共同影响API协议；临时Redis/PG故障与process readiness测试不代替生产容量/代理/TLS/外部依赖验收。

既有show-me提交1891cacc保持原样，非SSO收益，合入范围由协调者另核；无merge/push/deploy/父或来源关闭。

## 本票执行与交接

实现内容冻结后串行完成必需检查；最终候选SHA、静态/聚合退出状态与fresh双轴结果由本票交接和完成评论保存。成本对比已按维护者指令取消。

| 本票实际命令/证据 | 结果及适用范围 |
|---|---|
| `pnpm --filter @iam/api test:integration:redis` | 最终203 tests / 2006 assertions、6files、退出0；含J两协议同一HTTP/Redis组合、完整原owner矩阵及有界收尾。不同前轮assertion总数按实际日志保留，不据此推导覆盖变化。 |
| `pnpm --filter @iam/e2e-system test:unit` | 76 tests / 230 assertions、退出0；编排与既有旅程helper未变，后续仅新增协议验收/helper依赖。 |
| `pnpm test:e2e` | R1完整Admin→HR→OIDC，4m39.477s、退出0，run `20260915051041813-a9b1c3f2`；单project、零retry、真实migrations/seed/Worker/Gateway/浏览器。 |
| `pnpm --filter @iam/e2e-system oidc:journey` | 收紧精确状态/错误体/效果header及配置完整结果后，R4退出0且passed-and-cleaned，run `20260915053329074-d82e3c49`。未变Admin/HR沿用R1，不重跑整套。 |
| `pnpm exec turbo typecheck --filter=@iam/api --filter=@iam/e2e-system --concurrency=1` | 最终15tasks通过；含新的直接domain依赖和传递类型。 |
| #195协议套件/独立RP、#194未受影响CLI/PG/Composition/Browser | 按上文实际内容与环境复用，未冒称本票重跑；production源码和上述owner未改变，#195只新增dev依赖/测试/证据，#196只新增测试/helper/domain测试依赖和账本。 |

本机原始执行目录为 `apps/api/test-results/acceptance-196/`，保留 `static-flow.md`、`api-redis-final.log`、`type-final.log`、`e2e-r1.log`、`e2e-oidc-r4.log`、资源身份/cleanup JSON及最终静态/聚合命令日志。固定候选提交后交接记录补齐SHA，不在文档中使用自引用提交号。

历史失败没有豁免：首版type发现只读数组类型和可空latch调用，均修复；E2E增强R2/R3分别发现Custom claims与seed OIDC scope的规范化顺序，最终直接使用与Admin相同的公开`normalizeClientSsoConfig`并完整比较配置，R4通过。两次失败的trace超过现有intake预算导致required diagnostics非零，原trace/PNG/error-context保留在相应`.playwright-staging`目录，未放宽预算、隐藏失败或修改生产行为。

资源：本票独占Redis/PG采用仓库固定8.8.0/18.4镜像、动态loopback端口、唯一名称/label，创建即登记fullID。对比取消后仅其两项基线资源和独立worktree先清理；其余验证资源在验证后按exactID收尾，实际记录见资源JSON。R2/R3/R4各即时记录15create/15destroy、0unmatched且exact-project容器/网络/volume为空。R1事件watcher因format参数引号丢失提前退出，历史恢复只得到9destroy、未得到create；其完整创建ID记录缺失如实保留，不能宣称16/16。R1 owner清理成功、exact-project库存为空；最后R4有完整即时事件记录。未触碰任何开发/生产资源或两项此前审批拒绝的临时目录。
