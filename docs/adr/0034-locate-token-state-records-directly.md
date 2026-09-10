---
status: accepted
---

# 由 token 直接定位统一生命周期状态记录

[讨论 #137](https://github.com/cyy1998/shgas-iam/issues/137) 希望取消外部 token 解析中的正向 lookup 间接层及独立撤销预读，让 token 直接定位对象状态。维护者于 2026-09-10 确认全部分项、完整方案和验证边界，并授权发布正式规格；本 ADR 记录已接受的修改目标；#171–#173 已实现 Principal、Credential 与 Artifact 切片，Kernel lookup HMAC 配置退役见[运行时契约](../features/sso/token-state-runtime-evidence.md)；#175 已交付全体下线维护，#176 的最终账本连接全部验收和原始基线成本；固定候选 gate 与评审由该票评论记录，实际环境切换未执行。根生命周期与实际前后观测见[根状态证据](../features/sso/principal-direct-state-evidence.md)。

## 已确认分项

维护者于 2026-09-10 确认：

- Principal Session、Credential 和 Protocol Artifact 的外部 token 解析一起统一，不仅调整 Credential。
- 对象有效和已撤销状态由同一条记录表达。撤销把记录原子转换为明确的 `revoked` 终态，保留对象身份、定位摘要、原因、撤销时间、保留截止、必要归属和清理信息；解析无需再读取独立撤销标记。沿用既有终态保留期限，不要求保存完整 active payload。
- 已通过检查的在途请求允许继续完成；撤销生效后的新读取必须拒绝，迟到写入不能恢复已撤销对象。允许继续处理不保证后续消费或更新成功，不取消对象状态与并发比较约束。
- 保留独立内部 ID。认证按 token 直接定位记录，按 ID 的管理、协议关联和失败补偿通过反向定位访问同一记录；ID 不成为 bearer token。
- token 定位采用普通 SHA-256，取消本定位用途的 HMAC current/previous key 与轮换。完整 token 在本地派生定位摘要；正常解析以一个确定状态键为目标。生产 token 来源和不可预测性已完成静态核对，不能将密码或可预测业务 ID 当作随机 token。
- 沿用 pending cleanup 保留规则：存在待清理工作时保留撤销记录，完成后按原保留截止恢复过期或删除；撤销立即生效。本次不额外承诺可靠后台清理最终成功，相关执行器仍属 #121。
- 一次性 Artifact 使用同记录的 `revoked` 与 `reason=consumed` 表达消费终态，后续仍识别为 `consumed_replay`。消费原子竞争，仅一个赢家；多个请求通过前置检查不意味着都能消费成功。
- 记录存在时区分有效、撤销、消费重放和损坏；记录消失后返回 `missing_or_expired`，不永久保存历史以区分从未存在和自然过期。Redis 错误仍失败关闭，不能伪装成缺失。
- 发布采用停流、排空、清理旧在线认证状态、统一版本、重新登录；不保留旧对象，不双读旧 HMAC 布局，不做在线迁移。

这些分项延续 [ADR-0027](0027-own-online-authentication-lifecycle-time-in-redis.md) 的 Redis 生命周期时间与取得时有效性，以及 [ADR-0033](0033-trust-issued-credentials-without-principal-session-revalidation.md) 的凭据独立使用、兑换查父与根撤销尽力级联边界。统一存储不自动改变一次消费、续期策略或父撤销对晚到签发的保证。

## 2026-09-10 调查基线与取舍

只读调查基线为本地 `main` 的 `33305c0463747e535ccb8e1fc98b42efb598b954`，不表示该候选已部署。以下仅描述该固定历史基线，不代表当前 runtime。该基线 Kernel 在首个 HMAC candidate 命中的正常 Credential 读取中，串行读取 lookup tombstone、lookup、对象 tombstone，再通过 Lua 观察 Redis 时间与对象，共四次网络往返；previous candidate 命中通常为六次。这是静态调用计数，不是完整 HTTP 性能实测。

证据入口为 `packages/session-kernel/src/storage/store.ts` 的 `resolveStoredByExternalToken` / `resolveStoredObject`，以及 `storage/observation.ts`。该基线 Credential Identity 与 bearer token 独立；Custom SSO 以预先确定的 ID 补偿不确定签发，OIDC 以 Kernel ID 验证协议载荷关联并撤销。该基线 `storage/revocation-transitions.ts` 与 `facade.ts` 还拥有撤销归属、外围清理、重复操作及保留期限。因此减少读取不能只删除映射和标记而遗漏这些职责。

保留现有布局并合并 Lua 能减少往返，但不会取消正向间接层；本轮已选择同时简化定位和撤销状态表达。内部 identity 继续独立，通过反向管理定位保留既有引用和补偿能力；SHA-256 使定位不再依赖 HMAC 轮换候选。

补充只读调查确认：Principal Session 续期保留 token/ID，使用 Redis 观察时间裁剪 idle 与 absolute 期限，并条件更新当前记录及索引；Artifact 不随根续期。该基线 Artifact 消费保存 `RevokedTombstone(reason="consumed")`，后续返回 `consumed_replay`；唯一赢家由原子比较与状态转换保证，不能因多个请求都通过前置校验而允许多次消费。证据入口为 `facade.ts` 的 `renewPrincipalSession` / `consumeProtocolArtifact` 及 `storage/artifact-consumption.ts`。

Client Binding 没有外部 token；Artifact 可以没有父根，OIDC Code/AccessToken 的外部 token 由 Provider 生成。统一模型不能假定所有对象都有根、都有 token，或所有 token 都由 Kernel 编码内部 ID。

## SHA-256 的适用边界

Kernel 默认生成器使用 `randomBytes(32)`；Principal、Custom SSO Credential/Code 与 OIDC Return Handle 均走该链路。当前本地依赖 `oidc-provider 9.9.1` 的 opaque Code/AccessToken 使用默认 `bitsOfOpaqueRandomness=256`，经 NanoID 的密码学随机源生成，生产配置没有覆盖随机度。核对入口为 `packages/session-kernel/src/security/token.ts`、`apps/oidc-provider/src/provider/configuration.ts`，以及本地 Provider 的 `lib/models/formats/opaque.js`、`lib/helpers/defaults.js` 和 NanoID 实现。依赖源码核对不表示实际部署版本或历史库存已经验证。

入口只接受原始 token，再对它求摘要；不能增加接受摘要或内部 ID 作为 bearer 的 fallback。键继续按 Principal/Credential/Artifact 类型分区，同类别内保留 purpose、protocol、Client 及归属验证。HMAC 没有 payload 签名职责，消费时的 token—对象匹配改用同一 SHA-256 规则。

本选择只处理 Kernel token 定位。OIDC Cookie/JWT 签名、Client Secret 校验等独立密码功能保留。Provider 自有模型 lookup 也保留。Provider 当前模型键、Kernel 的 Provider metadata 和 cleanup refs 仍可能包含原始 OIDC token/code，因此本次不承诺整个 Redis 泄露后 bearer 不可恢复；保留 lookup HMAC 同样无法消除这些已有明文引用。Provider 存储脱敏不由本轮定位改造隐式承接。

## 实现与验收决定

维护者已确认以下细化；三类状态已按 #171–#173 实现，配置及维护已交付；全部逐项证据见[最终账本](../features/sso/token-state-contract.md)，固定候选执行及评审以 #176 评论为准，环境未切换：

- 三类外部 token 状态使用按类型隔离的 SHA-256 定位键，内部 ID 通过反向定位访问同一对象，不复制第二份 active/revoked 权威状态。正常 token 解析用一次 Lua 同时观察一个状态记录和 Redis 时间，目标为一次网络往返；该目标只覆盖 Kernel 对象解析，不声称整个认证 HTTP 请求只有一次 Redis 访问。
- 创建原子建立状态、ID 反向定位和索引；已占用的 ID 或 token 位置不能被新签发覆盖。反向定位跟随对象续期和终态保留期限，pending 时同样保持可达。撤销、消费、续期及清理均校验同一观察对象和归属，迟到操作不能覆盖或删除较新的对象；原子转换协调必要索引变化，外围 cleanup 仍在转换后执行。
- Principal 的滑动期限与绝对上限、Custom SSO Credential 的固定期限、Artifact 不随根续期及唯一消费规则保持。Client Binding 继续以内部 ID 定位，本轮不为它引入 token；必要适配保持其原生命周期和协议完整性。公共协议 token 格式和调用行为保持，退役的仅是 Kernel lookup HMAC 配置与派生候选。
- 维护复用[全体在线认证状态流程](../releases/online-auth-redis-time-cutover.md)。实施时必须更新 owner 清单，使切换工具能清除源布局，并清除/独立核验目标布局，以支持 smoke 后重跑和回退；不能直接把现有五键族清单当作已覆盖新布局。回退同样停流、排空、清理当前状态后统一旧版本，用户重新登录，不恢复旧登录态。非目标 owner 和业务数据保留。
- 行为验证使用现有 Kernel 真实 Redis、Custom SSO/API 与 OIDC 的正式协议 HTTP/Redis、按 ID 撤销及维护命令测试入口。覆盖三类状态解析、token 摘要误投与跨类型误投、用途与归属、未知/到期/损坏/Redis 失败、消费唯一赢家与重放、根续期及反向定位期限、重复撤销、并发撤销/续期/消费、迟到更新/清理保护、pending 清理与完成过期、无索引库存维护和非目标保留。测试真实 I/O 先普通 await，再同步断言。
- 在固定可比基线与候选上观察实际请求，分别记录 Redis 命令调用、网络 RTT 与串行波次；覆盖根 token 认证、Custom SSO Independent/Gateway、OIDC Code/AccessToken 代表入口，区分 Kernel 局部解析成本与完整请求成本。HMAC previous 的旧基线只用于对照，不成为新系统兼容要求。
- 本次不新增完整系统 E2E 或自动化部署演练。按仓库规则完成适用静态、类型、行为验证与最终聚合验收；实际停流、清理、统一版本、smoke 和放流由人工环境验收，不能以本地测试代替。

## 确认状态

Q1–Q9 分项及 Q10 完整设计、实现与验收决定均已确认；维护者随后调用 to-spec，授权整理并发布正式规格。该 ADR 为 `accepted`，不作为当前运行时已改变的证据。

本轮落盘分支为 `codex/token-state-records`，目标分支为 `main`。正式 Spec 保存范围、用户故事、实现与测试决定及设计提交交接；设计确认和规格发布不表示实现、合入或部署已经完成。
