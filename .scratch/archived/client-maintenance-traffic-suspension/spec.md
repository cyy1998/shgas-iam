# Client Maintenance 可逆协议流量暂停规格

## Problem Statement

当前 Client 的 `Maintenance` 状态同时承担了“暂停在线流量”和“使协议访问永久失效”的效果，并且管理员无法在维护状态下启用 Custom SSO 或 OIDC。管理员因此不能在一个完整维护窗口内完成协议配置、Secret 分发和启用准备；全局状态变化还会无差别推进 Custom SSO 与 OIDC 的配置版本，使没有发生协议变更的既有访问在恢复正常后也无法继续。

维护状态与停用状态的业务意图不同。维护是可恢复的在线流量暂停，停用才是行政性的永久失效边界。系统需要明确区分协议启用意图、Client 当前可用性、暂态维护阻断和永久协议失效，并在跨 Admin API、Custom SSO API 与 OIDC Provider 的并发和缓存边界上 fail closed。

## Solution

把 Client Maintenance 实现为跨 Custom SSO 与 OIDC 的可逆 Client Traffic Gate：它只暂停 IAM 控制的 client-scoped 在线协议流量，不冻结协议配置，也不因进入或退出维护状态而推进协议配置版本或永久撤销未变更的访问。

管理员可以在 Maintenance 中按照各协议原有的生命周期规则完成配置、启用、禁用、删除和 Secret 轮换。协议启用只表达管理员的启用意图；实际在线可用要求 Client 全局状态为 `Enable`。恢复正常后，仍未过期且未因真实协议变更、退出或撤销而失效的访问继续有效。

Traffic Gate 必须在状态明确为正常时才放行。明确维护时返回协议对应的可重试暂态错误；状态切换中、缺失、损坏或无法读取时返回通用暂态不可用。暂态阻断不得消费一次性对象、删除协议产物、撤销仍可能恢复的访问或清除 Cookie。

## User Stories

1. 作为 Client 管理员，我希望在 Client 处于 Maintenance 时配置 Custom SSO，以便在不开放业务流量的情况下完成接入准备。
2. 作为 Client 管理员，我希望在 Client 处于 Maintenance 时启用 Custom SSO，以便预先保存协议启用意图并在恢复正常后自动生效。
3. 作为 Client 管理员，我希望在 Client 处于 Maintenance 时禁用 Custom SSO，以便在恢复业务流量前撤回不再需要的启用意图。
4. 作为 Client 管理员，我希望在 Client 处于 Maintenance 时删除 Custom SSO 配置，以便安全取消该协议接入。
5. 作为 Client 管理员，我希望在 Client 处于 Maintenance 时轮换 Independent Custom SSO Secret，以便在维护窗口内完成密钥交付。
6. 作为 Client 管理员，我希望 Maintenance 不绕过 Custom SSO 自身的状态转换规则，以便修改已启用配置前仍显式执行禁用、修改和按需重新启用。
7. 作为 Client 管理员，我希望在 Client 处于 Maintenance 时完成 OIDC 的全部生命周期操作，以便两个协议遵循一致的维护语义。
8. 作为 Client 管理员，我希望 Maintenance 中的 OIDC 操作仍遵守 OIDC 自身的配置与生命周期规则，以便协议边界保持独立。
9. 作为 Client 管理员，我希望协议状态继续显示未配置、已禁用或已启用，以便不因 Maintenance 引入虚假的第四种协议状态。
10. 作为 Client 管理员，我希望管理端继续分别展示 Client 全局状态与协议状态，以便从现有信息判断“协议已启用但当前处于维护”。
11. 作为 Client 管理员，我希望管理端不增加额外维护提示文案，以便保持当前状态表达的简洁性。
12. 作为 Client 管理员，我希望 Client 恢复为 `Enable` 时直接激活已保存的协议启用意图，以便无需再次逐个启用协议。
13. 作为 Client 管理员，我希望 Client 恢复为 `Enable` 时不执行 callback、redirect、logout endpoint 等外部连通性探测，以便全局状态恢复不被协议外部依赖耦合或形成 SSRF 能力。
14. 作为 Client 管理员，我希望进入或退出 Maintenance 不推进 Custom SSO 配置版本，以便未变更的 Custom SSO 访问在恢复后继续有效。
15. 作为 Client 管理员，我希望进入或退出 Maintenance 不推进 OIDC 配置版本，以便未变更的 OIDC 访问在恢复后继续有效。
16. 作为 Client 管理员，我希望维护期间真实发生的 Custom SSO 配置、启停或 Secret 变化仍推进 Custom SSO 版本，以便旧 Custom SSO 产物永久失效。
17. 作为 Client 管理员，我希望维护期间真实发生的 OIDC 配置、启停或 Secret 变化仍推进 OIDC 版本，以便旧 OIDC 产物永久失效。
18. 作为 Client 管理员，我希望只有进入 `Disable` 才触发两个协议的全局永久失效，以便行政停用与临时维护具有不同语义。
19. 作为 Client 管理员，我希望离开 `Disable` 时不再次推进两个协议版本，以便状态恢复不制造无意义的第二次换代。
20. 作为 Client 管理员，我希望软删除 Client 继续永久使两个协议的既有访问失效，以便删除行为保持 fail closed。
21. 作为 Client 管理员，我希望在 `Disable` 中仍不能把原本停用的 Custom SSO 或 OIDC 设为启用，以便行政停用不会预置自动开放的新协议意图。
22. 作为 Client 管理员，我希望在 `Disable` 中仍可按各协议现有规则修改配置、删除配置或轮换 Secret，以便为未来恢复做非开放性的准备。
23. 作为 Custom SSO 用户，我希望 Client 进入 Maintenance 后新的 authorize 请求被暂时阻断，以便维护期间不会建立新的 Custom SSO 访问。
24. 作为 Independent Custom SSO client，我希望 Maintenance 中的 token exchange 返回可重试错误而不消费 Authorization Grant，以便恢复正常后仍可在原始有效期内重试。
25. 作为 Gateway Custom SSO client，我希望 Maintenance 中的 callback 返回可重试错误而不消费 Authorization Grant 或创建可用 Local Session，以便暂态维护不会破坏登录流程。
26. 作为 Custom SSO client，我希望 Maintenance 中的受保护 user-info 与 authz 请求被暂时阻断，以便既有 Credential 或 Local Session 在维护期间不能访问在线资源。
27. 作为 Custom SSO client，我希望明确维护返回 HTTP `503`、`AUTH.MAINTENANCE` 和可选 `Retry-After`，以便将维护与非法 Client 或无效 Session 区分并稍后重试。
28. 作为 Custom SSO client，我希望系统无法确认 Client 状态时返回通用可重试不可用，而不是 `AUTH.MAINTENANCE`，以便诊断不会把基础设施故障误报成明确维护。
29. 作为 OIDC relying party，我希望 Maintenance 中的 authorize、interaction/resume 和 token 流程返回标准 `temporarily_unavailable`，以便按 OIDC 暂态错误处理而不丢弃仍可能恢复有效的状态。
30. 作为 OIDC relying party，我希望 Maintenance 中的 UserInfo 或其他 IAM 在线 bearer 使用返回 HTTP `503` 而不是 `invalid_token`，以便不会错误地把仍可能恢复有效的 Token 当作永久失效。
31. 作为 OIDC relying party，我希望一个处于 Maintenance 的 Client 不删除共享 Provider Session 或影响同一 Principal Session 下的其他 Client，以便 client-scoped 维护保持隔离。
32. 作为协议用户，我希望 Maintenance 阻断不清除仍可能恢复有效的 Cookie，以便恢复后可以继续已有流程。
33. 作为协议用户，我希望 Maintenance 不暂停 Authorization Grant、Authorization Code、Credential、Token 或 Session 的过期时间，以便所有访问继续遵守原始 TTL。
34. 作为协议用户，我希望恢复正常后只有尚未过期且版本未变化的对象继续有效，以便 Maintenance 不延长访问生命周期。
35. 作为协议用户，我希望维护期间仍可退出登录，以便随时主动终止访问。
36. 作为安全管理员，我希望维护期间的 logout 与 revocation 永久生效，以便被终止的访问不会在恢复后复活。
37. 作为协议集成方，我希望 discovery、JWKS、公共认证配置和 health 在 Maintenance 中继续可用，以便协议发现、离线验签和运维探测不被 client-scoped 门禁误伤。
38. 作为安全管理员，我希望系统只有明确确认 Client 为 `Enable` 时才放行在线协议流量，以便 Redis 故障、状态损坏或切换竞态不会造成维护绕过。
39. 作为安全管理员，我希望 Traffic Gate 状态切换中的请求 fail closed 并返回暂态错误，以便数据库与运行时状态协调失败时不误放行。
40. 作为管理员，我希望状态更新只有在可靠发布运行时门禁后才报告成功，以便成功响应代表后续门禁检查能观察到新状态。
41. 作为管理员，我希望门禁发布失败时在线流量保持 fail closed 且管理操作报告失败，以便可以安全重试而不冒险开放流量。
42. 作为维护人员，我希望 Maintenance 不支持测试用户、IP、特殊 Header 或管理员令牌绕过，以便维护边界没有隐藏后门。
43. 作为维护人员，我希望真实端到端登录 smoke 在恢复 `Enable` 后执行，以便维护门禁本身不为测试流量开例外。
44. 作为维护人员，我接受状态切换不排空已经开始的请求，以便保持当前在途请求协调粒度而不引入额外 drain 或最终写入 CAS。
45. 作为维护人员，我接受已经越过门禁检查点的在途请求可能完成，以便本次变更聚焦后续在线流量的可靠阻断。
46. 作为 OIDC relying party，我接受已经签发并离开 IAM 的 ID Token 可继续被离线验证到原始过期时间，以便本次变更不扩大为 Token 架构改造。

## Implementation Decisions

- 引入一个协议中性的 Client Traffic Gate，表达至少三类结果：明确正常、明确 Maintenance、状态无法确认。它是运行时流量决策，不替代协议配置或协议启用状态。
- Traffic Gate 必须作为 deep module 封闭状态读取、generation、mutation fence、缓存发布和 fail-closed 语义；Custom SSO 与 OIDC 消费同一语义，不能各自维护不一致的 Maintenance 判断。
- Traffic Gate 的权威状态来自现有 Client 全局状态，不新增数据库生命周期列，也不把 Maintenance 写入 Custom SSO 或 OIDC 配置。
- Traffic Gate 的运行时表示必须具备 generation 与 mutation fence，防止删除缓存后并发旧数据库读取重新发布过期的 `Enable` 状态。
- Admin Client 状态更新在锁定 Client 后建立 runtime mutation fence；数据库提交后以 required 语义发布新 Traffic Gate 状态并推进 generation，发布成功后才结束 mutation。发布失败时不得回退放行。
- Client 状态相同的幂等写入不制造协议换代；只有实际进入 `Disable` 时同时推进 Custom SSO 与 OIDC 生命周期版本并触发全协议永久撤销。
- 进入或退出 Maintenance 不推进 Custom SSO 或 OIDC 配置版本，也不触发协议永久撤销。
- 离开 `Disable` 不推进协议版本；停用期间发生的真实协议 mutation 仍按所属协议规则推进版本。
- 软删除继续推进两个协议版本并触发全协议永久撤销。
- Custom SSO 与 OIDC 的 enable guard 调整为允许 Client 状态为 `Enable` 或 `Maintenance`，继续拒绝 `Disable`。
- Maintenance 不改变 Custom SSO 的启用态只读规则；配置、模式切换、Secret 轮换和删除仍要求 Custom SSO 已禁用。
- OIDC 继续遵守自己的既有配置与生命周期规则，不因与 Custom SSO 共享 Traffic Gate 而合并协议配置。
- Custom SSO 的 authorize、token exchange、Gateway callback、受保护 user-info 和 authz 在不可逆操作前使用 Traffic Gate；明确 Maintenance 映射为 HTTP `503` 与 `AUTH.MAINTENANCE`，状态无法确认映射为通用 retryable unavailable。
- Custom SSO 的 Maintenance 错误复用现有 `AUTH.MAINTENANCE` 契约并修正其当前 `403` 永久拒绝含义，不新增重复错误码。
- OIDC runtime 必须把配置有效性与暂态 Traffic Gate 分离。Maintenance 不再折叠为 client 不存在、client disabled 或 config version 无效。
- OIDC authorize、interaction/resume、token exchange、UserInfo 等目标 Client 在线入口在合适的不可逆操作前检查 Traffic Gate。Maintenance 返回标准 `temporarily_unavailable` 或 HTTP `503`，不得映射成 `invalid_client`、`invalid_token` 或 destructive validation failure。
- OIDC artifact、Credential、Binding 和 Provider Session 的版本校验只处理永久不可用状态与配置版本变化；Maintenance 不触发删除、tombstone 或 protocol revocation。
- 一个 Client 的 Maintenance 不得删除包含其他 Client 的 Provider Session，也不得使其他 Client 的访问失效。
- logout 与 revocation 绕过 Traffic Gate 的使用阻断，但继续执行现有永久撤销语义。
- discovery、JWKS、公共认证配置和 health 不读取 client-scoped Traffic Gate。
- 不暂停任何协议对象的 TTL，不增加维护剩余时间补偿或恢复机制。
- 不增加 Maintenance bypass、canary、测试用户、测试 IP、特殊 Header 或管理员测试令牌。
- 不增加 in-flight request drain、全局 quiescence barrier 或最终 artifact 写入 CAS；沿用现有“越过检查点的请求可完成”边界。
- 不尝试使已离开 IAM 的 OIDC ID Token 暂时失效。
- Admin 前端只解除 Maintenance 状态下 Custom SSO/OIDC enable 操作的禁用条件；继续分别展示 Client 全局状态和协议三态，不新增派生状态或提示文案。
- 本功能不需要数据库 migration；Redis 运行时 key、serialization、TTL、Lua 和 transaction 细节由 Traffic Gate owner 封闭，不暴露给协议或测试 fixture。
- ADR-0012 在实现、故障路径验证和跨协议验收完成前保持 `proposed`；交付完成后再评估转为 `accepted` 并同步当前功能文档。

## Testing Decisions

- 最高层验收 seam 是真实 Admin Client 状态更新入口加公开 Custom SSO/OIDC 协议端点。测试从外部观察状态切换、协议响应、artifact 可恢复性与永久失效，不断言内部 Redis key、Lua 文本、私有方法或调用次数。
- Full-system E2E 扩展现有 Admin Custom SSO 与 OIDC journeys，覆盖 `Enable → Maintenance → Enable`：管理端可在 Maintenance 中完成协议生命周期准备；Custom SSO/OIDC 在线入口暂态失败；恢复后未过期且未变更的访问按原语义继续；协议 discovery/JWKS/公共配置/health 保持可用。
- E2E 不通过路由 mock、直接数据库写入或复制 Redis 协议替代生产 seam，也不引入 Maintenance bypass 来完成维护期 smoke。
- Admin API Component Integration 覆盖状态转换矩阵：进入/退出 Maintenance 不推进版本或撤销；仅进入 Disable 推进两个版本并永久撤销；离开 Disable 不重复推进；软删除保持永久失效。
- Admin API Component Integration 覆盖 Custom SSO 与 OIDC 在 `Maintenance` 可启用、在 `Disable` 不可启用，并保持各协议原有状态前置条件。
- Admin API Redis Integration 通过 production runtime cache/Traffic Gate seam 验证 generation、mutation fence、commit 后 required 发布、并发旧读取不能回填、发布失败保持 fail closed，以及恢复 `Enable` 后解除暂态门禁。
- API Component Integration 覆盖 Custom SSO 各 client-scoped 入口的 Maintenance 映射，断言 HTTP `503`、`AUTH.MAINTENANCE`、可选 `Retry-After`，并断言不清 Cookie、不消费 Grant、不撤销 Credential/Local Session。
- API Component Integration 覆盖状态无法确认时返回通用 retryable unavailable，而不是 `AUTH.MAINTENANCE`、`SSO.INVALID_CLIENT` 或 `SESSION_INVALID`。
- API Redis/Composition Integration 使用真实 Traffic Gate adapter 验证 Custom SSO 跨进程缓存可见性、并发 fence 与恢复行为，不在 fixture 中实现 Redis 协议。
- OIDC Provider Component Integration 覆盖 authorize、interaction/resume、token 和 UserInfo 的暂态错误映射，并断言 Maintenance 不删除 Code、Token payload、Binding、Credential 或 Provider Session。
- OIDC Provider Component Integration 使用多 Client Provider Session 场景，证明一个 Client 的 Maintenance 不影响同一 Principal Session 下其他 Client。
- OIDC Provider Redis Integration 通过 production adapter 验证 Maintenance 与永久 config/version failure 分离，恢复后未过期 artifact 仍可解析，真实协议 mutation 后旧 artifact 仍永久失效。
- OIDC Provider Composition Integration 覆盖真实 PostgreSQL/Redis composition 下 Traffic Gate 发布、runtime 读取和 endpoint 行为，特别验证 confidential 与 public client 不再因不同缓存路径产生 Maintenance 语义差异。
- logout/revocation 测试覆盖 Maintenance 中仍可执行并永久终止访问；discovery、JWKS、公共认证配置和 health 测试覆盖 Maintenance 中继续成功。
- TTL 测试使用可控时钟或既有 adapter seam，验证 Maintenance 不延长过期时间；不使用真实长时间等待。
- 在途请求只验证既有边界没有被意外收紧为 drain/CAS，不要求 Admin 成功响应成为所有旧请求的绝对截止线。
- OIDC ID Token 测试仅确认本次实现不宣称或尝试撤回已签发离线 Token，不把 RP 离线验证阻断纳入验收。
- 聚焦实现验证运行受影响 workspace 的 Unit/Integration collection、lint、typecheck、Architecture Guard、test collection guard、文档索引检查和 `git diff --check`；准备合入时按仓库流程运行一次完整 `pnpm verify`，外部资源 profiles 与 Full-system E2E 使用专用可销毁资源。

## Out of Scope

- 使已经签发并离开 IAM 的 OIDC ID Token 在 Maintenance 中临时失效。
- 在线 introspection 的新增或 Token 模型改造。
- Maintenance 期间暂停、延长或补偿任何 artifact 的 TTL。
- Maintenance 流量绕过、灰度放行、测试用户、测试 IP、特殊 Header、管理员测试令牌或 canary 机制。
- 在 Admin 状态更新成功前排空全部在途请求，或为最终 artifact 写入增加新的全局 CAS/quiescence protocol。
- 新增第四种 Custom SSO/OIDC 状态、派生“待激活”状态或额外管理端提示文案。
- 合并 Custom SSO 与 OIDC 的配置、Secret、版本或生命周期。
- 在恢复 `Enable` 时访问 callback、redirect、logout endpoint 做外部连通性探测。
- 保证第三方系统自行建立的本地会话被 IAM Maintenance 或 logout 完整控制。
- 修改 Principal Session 的跨 Client 生命周期；Maintenance 保持 client-scoped。
- 数据库 schema migration。
- 发布、部署、远端变更或生产数据迁移。

## Further Notes

- 稳定领域语言见仓库根 `CONTEXT.md` 中的 Client Maintenance、Client Disablement、Client Maintenance Unavailable 与 Custom SSO Client Configuration。
- 长期决策见 ADR-0012《将 Client Maintenance 建模为可逆的协议流量暂停》；该 ADR 当前是 `proposed`，因为代码尚未实现本规格。
- 当前运行时会在任意 Client 全局状态变化时推进两个协议版本，Maintenance 还会永久撤销 OIDC 生命周期；这是本规格要替换的现状，不是目标行为。
- 当前 OIDC runtime 存在可陈旧 Client cache，并将 Maintenance 折叠为永久 unavailable。实现必须先建立可逆、generation-fenced 的 Traffic Gate，再移除 Maintenance 的 epoch/revoke 兜底，不能只删除现有版本推进逻辑。
- 本 spec 已按确认的最高层 seam 发布到本地 tracker；`ready-for-agent` 将在后续 `/to-tickets` 生成的 implementation tickets 上通过 `Status` 表达。
