# 收口 Custom SSO Subject Projection 交付不变量

## Problem Statement

Independent `/sso/token` 与 `/public/user-info` 都向 client 交付完整的 Custom SSO V1 Client Subject Projection，
但两条路径没有通过同一个 Interface 封闭交付安全不变量。`/public/user-info` 会核对 Projection 返回的 Subject
Identifier、复核当前 Client 配置，并在返回前执行 strict Wire schema 校验；`/sso/token` 当前只 resolve Projection
并调用 mapper，随后便签发和复核 Independent Client Credential、consume Custom SSO Authorization Grant、清理
authorization artifact 并记录成功审计，直到 HTTP handler 组装响应时才执行 strict schema 校验。

当前 production Client Subject Projection Module 会原样返回输入 Subject Identifier，Subject Facts Adapter 也会严格
校验读取结果，因此这不是已经观察到的串号漏洞。然而当前 Interface 允许未来的 Adapter 替换、composition wiring
错误、缓存回归或运行时非法值绕过调用方的静态类型假设。若 Projection 返回另一个格式合法的 UUID，Credential 可以
绑定 Subject A，而响应中的 `subject` 却表示 Subject B；若 mapper 能完成但 strict schema 拒绝运行时值，调用方会收到
`500`，但 Credential 已经激活、Grant 已经 consumed，且成功审计和 artifact 清理可能已经发生。最终会留下未交付 token
的 active orphan Credential，并失去重试原 Grant 的机会。

维护者需要把两条完整 Custom SSO V1 交付路径共同遵守的最小不变量收口为一个窄 Interface，同时保持 Client 配置竞态
检查、Grant lease、Credential 签发与补偿、HTTP request capability、Gateway Subject Header 以及 OIDC 生命周期各自独立。
修复必须提高失败原子性，但不能重新制造跨协议或跨 endpoint 的大型协调模块。

## Solution

在 `@iam/client-subject-projection/custom-sso` 中建立唯一公开的完整 Custom SSO V1 Subject Projection 交付函数。该函数
接收既有 Client Subject Projection Service 与一次 resolve input，并依次完成：resolve Projection、断言结果 Subject
Identifier 等于 input 中的 expected Subject、映射 Custom SSO V1 Wire、执行 strict Wire schema parse。input 中的
Subject Identifier 本身就是 expected Subject，不增加第二个可能传错的参数。

这个函数是本功能唯一新增的 seam。它使用普通导出函数，不新增 factory、port 或 composition adapter。原始
`mapClientSubjectProjectionToCustomSsoV1` 改为 package 内部实现，避免新的调用方绕过 Subject equality 与 strict parse；
Custom SSO V1 schema、Wire 类型和 placeholder preview 能力继续按现有职责公开。

Subject mismatch、mapper failure 和 strict schema failure 统一转换为不携带 Subject、claims、Wire 或原始 cause 的专用
内部不变量错误，并只暴露安全 reason：`subject_mismatch` 或 `invalid_wire`。Client Subject Projection Service 自身抛出的
Subject Projection Not Ready、Subject Access unavailable 及其他既有错误原样传播，保持当前 retryability 与 HTTP 映射。
不变量错误不注入或调用 logger，由 API 的统一错误处理器记录 request/trace 上下文并向 client 返回不暴露细节的内部
`500`。

`/sso/token` 必须在任何 Credential issuance、Grant consume、成功审计或 consumed artifact 清理之前取得经过共享函数
验证的 Wire。此时发生不变量错误时，Credential 尚未开始签发，Grant 不主动 release，而是保持 `redeeming` 至当前
lease 到期；只要原始 Grant 尚未过期，后续可以用新 attempt 重试，且任何失败都不得延长原始有效期。

`/public/user-info` 使用同一共享函数生成完整 Wire，并在共享函数返回后、响应交付前再次复核当前 Client/config version。
若投影期间 Client 被禁用、删除、关闭 Custom SSO、切换配置版本或收窄 Subject Claims，已经构建的 Wire 必须被丢弃。
Gateway Subject Header 继续使用自己的最小扁平 Wire、Subject equality 与 Base64 编码路径；OIDC 继续使用独立 Claims
Snapshot 和协议 Wire。

HTTP handler 现有的完整 token response schema parse 继续保留，作为对 `sid`、`ttl` 和 `subject` 整体 HTTP Contract
的最后防线。共享函数中的 parse 负责副作用前安全，route parse 负责最终响应契约，两者职责不同。

## User Stories

1. 作为 Independent client，我希望返回的 `subject` 与 `sid` 所属 Subject 永远一致，从而不会把一个人的 Credential 与另一个人的身份资料关联。
2. 作为 IAM 用户，我希望我的 Subject Identifier 不会因 Adapter wiring 或缓存错误被交付给另一个主体的登录结果，从而避免身份串号。
3. 作为安全负责人，我希望 Subject equality 在 Credential 签发前完成，从而不变量违例不会创建可用 Credential。
4. 作为安全负责人，我希望 Custom SSO V1 Wire 在 Grant consume 前通过 strict schema，从而无效响应不会产生不可逆状态变化。
5. 作为平台运维人员，我希望 schema failure 不会留下未向 client 交付 token 的 active orphan Credential，从而减少无法解释的活跃认证 artifact。
6. 作为审计人员，我希望不变量失败不会记录 Independent 登录成功，从而审计事实与真实交付结果一致。
7. 作为维护者，我希望 consumed artifact 清理只发生在经过验证且成功 consume 的兑换之后，从而失败路径不会伪装成成功收尾。
8. 作为 Custom SSO client，我希望 `/sso/token` 与 `/public/user-info` 使用同一个完整 V1 Wire 保证，从而两个 endpoint 不会随未来修改发生契约漂移。
9. 作为 API 维护者，我希望只调用一个公开函数即可获得经过身份和 schema 校验的 Custom SSO V1 Wire，从而无需记住隐含调用顺序。
10. 作为 Package 维护者，我希望原始 mapper 不再是公开 Interface，从而未来调用方不能只完成结构映射而绕过安全校验。
11. 作为架构维护者，我希望协议中性的 Client Subject Projection root Interface 不认识 Custom SSO Wire，从而继续服务 Custom SSO 与 OIDC 两个 Adapter。
12. 作为架构维护者，我希望 Custom SSO-specific 交付行为留在现有 `custom-sso` subpath，从而 schema、mapping 与交付不变量拥有同一个 owner。
13. 作为维护者，我希望共享行为是普通函数而不是新的 factory、port 或 adapter，从而修复不会增加 composition 与测试样板。
14. 作为维护者，我希望 expected Subject 直接来自 resolve input，从而调用方没有机会传入两个彼此矛盾的 Subject 参数。
15. 作为安全负责人，我希望合法 UUID 的 Subject mismatch 也被拒绝，从而检查不只验证格式而会验证身份一致性。
16. 作为安全负责人，我希望 mapper 能接受但 schema 拒绝的运行时值在副作用前失败，从而 TypeScript 静态类型不会被误作运行时信任边界。
17. 作为平台运维人员，我希望不变量错误具有稳定且不敏感的 reason，从而可以区分 Subject mismatch 与 invalid Wire，而不记录个人信息。
18. 作为 IAM 用户，我希望错误日志不包含 Subject Identifier、Profile Claim、Authorization Claim 或完整 Wire，从而诊断不会扩大敏感数据暴露。
19. 作为 API client，我希望内部不变量故障返回通用 `500`，从而不会被误导为凭据无效的 `401` 或可立即重试的 `503`。
20. 作为 API client，我希望 Subject Projection Not Ready 与 Subject Access unavailable 继续保持现有稳定 `503` 和 `Retry-After` 语义，从而真正的暂态故障仍可安全重试。
21. 作为 Independent client，我希望 retryable Projection 故障继续立即 release 当前 Grant attempt，从而无需等待 lease 才能重试已知暂态问题。
22. 作为安全负责人，我希望内部不变量故障不会立即 release Grant，从而持久实现错误不会触发无间隔热重试。
23. 作为 Independent client，我希望内部故障修复后仍可在 Grant 原有效期内、待 lease 到期后重试，从而服务端 bug 不会永久烧毁合法登录意图。
24. 作为安全负责人，我希望 Grant 的原始过期时间不会因失败、lease 接管或重试而延长，从而一次性授权保持有界。
25. 作为领域维护者，我希望只有成功签发 Credential 或 Local Session 才能 consume Grant，从而不需要引入含义冲突的失败式 consume。
26. 作为领域维护者，我希望不为该内部错误新增 `failed` Grant 状态，从而现有 `issued → redeeming → consumed` 模型保持稳定。
27. 作为 `/public/user-info` 使用者，我希望响应交付前仍会复核最新 Client/config version，从而在途请求不会使用已经撤销或收窄的配置返回敏感 claim。
28. 作为 Client 管理员，我希望禁用、删除或关闭 Custom SSO 后，仍在构建中的 user-info 响应不能按旧配置成功交付。
29. 作为 Client 管理员，我希望移除 phone、employment 或 `iam:authorization` 后，仍在构建中的响应会在最终复核时被丢弃。
30. 作为 Gateway client，我希望 Gateway Subject Header 保持现有最小字段与独立 Wire，从而本修复不会把完整 Custom SSO Projection 引入转发 header。
31. 作为 OIDC relying party，我希望 OIDC Claims Snapshot、claim mapping 和生命周期完全不受本修复影响，从而协议行为保持稳定。
32. 作为 HTTP Contract 维护者，我希望 token route 继续校验完整响应，从而未来 `sid`、`ttl` 或 envelope 组装错误仍会在出站前被发现。
33. 作为测试维护者，我希望共享 Package Interface 直接覆盖成功、Subject mismatch、invalid Wire 和既有错误传播，从而内部重构不需要修改调用方行为测试。
34. 作为测试维护者，我希望 API component integration 从 Grant redemption 的公开 seam 观察副作用，从而测试不会依赖私有 helper 或实现行号。
35. 作为测试维护者，我希望不通过 production test hook 制造非法 Projection，从而测试能力不会扩大运行时 Interface。
36. 作为维护者，我希望 Current 架构与 feature 设计文档明确记录交付顺序、错误和 lease 语义，从而未来重构不会重新引入 late validation。

## Implementation Decisions

- `@iam/client-subject-projection/custom-sso` 是完整 Custom SSO V1 Subject Projection 交付不变量的唯一 owner；协议中性的
  Client Subject Projection root Module、Subject Facts、Subject Access 和 Authorization Freshness 职责不变。
- 新增普通导出函数 `resolveCustomSsoSubjectProjectionV1`。函数接收现有 Client Subject Projection Service 与
  Resolve Client Subject input，返回经过 strict schema parse 的 Custom SSO V1 Subject Projection。
- 不新增 factory、port、class-based service 或 composition adapter。两个调用方直接使用同一个函数与各自已有的
  Projection Service dependency。
- 函数的固定顺序是 resolve Projection、比较 output 与 input 的 Subject Identifier、执行 Custom SSO V1 mapping、
  执行 strict schema parse。调用方不得插入 hook 或选择性关闭任一步骤。
- Resolve input 中的 Subject Identifier 同时是 expected Subject。Interface 不接受第二个 expected Subject 参数，也不接受
  `skipSubjectCheck`、`allowInvalidWire` 或同类开关。
- 原始 `mapClientSubjectProjectionToCustomSsoV1` 改为 package 内部实现，不再属于公开 Interface。既有 placeholder preview
  可以在 package 内继续复用 mapping implementation；公开 schema 与 Wire 类型继续供 HTTP/OpenAPI contract 使用。
- 新增 `CustomSsoSubjectProjectionInvariantError` 作为 subpath 的错误模式。错误只携带稳定 reason
  `subject_mismatch` 或 `invalid_wire`，不携带输入/output Subject、Projection、Wire、Zod issues 或原始 cause。
- Subject mismatch 在 mapping 前产生 `subject_mismatch`。Mapper 抛错、mapper 成功但 strict schema 拒绝，以及其他
  post-resolve Wire 构建违例统一产生 `invalid_wire`。
- Client Subject Projection Service 在 resolve 阶段抛出的错误不得被统一包装。Subject Projection Not Ready、Subject
  Access unavailable 和未来具有既有语义的 Projection 错误继续由调用方当前 adapter 映射。
- 共享函数不接受 logger dependency，也不自行写日志。专用错误按普通未处理内部错误传播，由 API 统一错误处理器记录
  request ID、trace、route、错误名称、安全 reason 与 stack，并向 client 返回通用内部 `500`。
- 不为不变量错误增加公开 API error code、`Retry-After` 或 retryability marker；不得把它映射为认证失败或 Subject
  Projection Not Ready。
- Independent Grant redemption 在 Principal Session 与 Grant Subject 校验、Subject Claim Selection 构建之后调用共享
  函数，并且必须在 Credential identity 写入、Credential issuance、Credential post-validation 和 Grant consume 之前完成。
- 不变量错误发生时 Credential issue state 保持 `not_started`。失败路径不得调用 Credential revoke 作为伪补偿，因为此时
  本就不应存在 Credential；也不得写成功审计或执行 consumed artifact cleanup。
- 不变量错误沿用现有 non-retryable pre-issue Grant 处理：不显式 release，heartbeat 停止后保持 `redeeming`，当前 lease
  到期后才能由新 attempt 接管。接管不得延长 Grant 原始 expiry。
- 不新增 Grant `failed` 状态，不把失败 Grant 标为 `consumed`，也不永久撤销仍可能在修复后成功兑换的合法 Grant。
- `/public/user-info` 在第一次读取当前 Client 配置并构建 Subject Claim Selection 后调用共享函数；共享函数返回后再次读取
  当前 Client/config version，只有复核成功才返回 Wire。
- Client 二次复核不进入共享函数。Client 被禁用、删除、关闭 Custom SSO、切换版本或改变 claim selection 时继续使用
  现有 app-local 错误分类和 Cookie 清理语义。
- 将二次 Client 复核放在 map/schema parse 之后，使复核更接近响应交付。配置发生变化时，多做的一次内存 mapping/parse
  可以接受，构建结果必须丢弃。
- Gateway Subject Header 不调用完整 Custom SSO V1 交付函数。它继续使用收窄后的 claim selection、独立 Subject equality、
  扁平 Wire 与 Base64 编码，并且不得因此获得 phone、employment 或 authorization。
- OIDC 不调用本函数，也不复用 Custom SSO V1 Wire。OIDC Claims Snapshot、Authorization Code 前置固化及后续重放
  行为保持不变。
- Token HTTP handler 保留现有完整 response schema parse。共享 parse 是 Credential/Grant 副作用前屏障；route parse 是
  `sid`、`ttl` 与 `subject` 整体 HTTP Contract 的 defense in depth。
- 本功能不改变成功响应 JSON、HTTP endpoint、Custom SSO V1 schema、Client 配置 schema、Credential/Grant 持久化形状、
  Redis key、数据库 schema、migration 或 deployment contract。
- Current backend architecture 需要补充共享交付 Interface、raw mapper 收缩与副作用前校验规则；Current Custom SSO Subject
  Projection 设计需要补充 endpoint 顺序、内部 `500`、Grant lease、Client 二次复核和测试矩阵。文档索引同步更新验证日期。
- 本功能没有引入新的领域概念，也没有改变 ADR-0007、ADR-0008 或 ADR-0010 的长期决定，因此不修改 `CONTEXT.md`、
  不新增 ADR。若实现发现必须改变 Client config fail-closed、Grant 状态机或协议 Wire 所有权，应停止并重新取得设计确认。

## Testing Decisions

- 好的测试通过公开 Module Interface 和已有 application seam 观察结果、错误与副作用，不断言私有 mapper、helper 调用次数、
  源码行号、内部变量或具体实现拆分。
- 本功能只新增一个测试 seam：公开的 `resolveCustomSsoSubjectProjectionV1`。Package unit tests 直接通过该函数证明四步不变量，
  不为 raw mapper 保留独立的 public-contract 测试。
- Package 成功测试使用合法 Subject 与已选择 claims，证明返回值已经通过 Custom SSO V1 strict schema，并保持未选择字段、
  空父对象、null phone 和数组 mapping 的既有 Wire 规则。
- Package Subject mismatch 测试让 Projection Service 返回另一个格式合法的 UUID，断言产生 reason 为
  `subject_mismatch` 的专用错误，且错误文本和属性不包含两个 Subject Identifier 或 Projection 内容。
- Package invalid Wire 测试通过现有 Projection Service seam 返回 TypeScript 类型之外、mapper 可以完成但 strict schema
  必须拒绝的运行时值，断言产生 reason 为 `invalid_wire` 的专用错误且不泄漏 Zod issues 或 Wire。
- Package mapper failure 测试使用会在 Wire 构建中失败的运行时 Projection，证明它同样收敛为安全的 `invalid_wire`，而不是
  向调用方暴露偶然的 JavaScript error 类型。
- Package error propagation 测试让 Projection Service 抛出 Subject Projection Not Ready、Subject Access unavailable 和
  一个原样 sentinel error，证明 resolve 阶段错误不被包装、替换或赋予新的 retryability。
- 既有 placeholder preview 与 Custom SSO schema contract 测试继续证明 preview 和正式 Wire 使用相同 mapping 规则；测试
  应通过仍公开的能力或新的共享函数，不重新公开 raw mapper 只为方便测试。
- API component integration 继续使用现有 Independent Grant redemption 公开 seam。测试通过已存在的 Projection dependency
  注入反例，不增加 production composition 开关或测试专用 endpoint。
- API Subject mismatch integration 使用另一个合法 UUID，证明兑换返回内部错误，并在任何 Credential issuance、Grant
  consume、成功审计和 consumed artifact cleanup 前停止。
- API invalid Wire integration 使用 mapper 可接受而 schema 拒绝的运行时 Projection，证明与 Subject mismatch 具有相同的
  副作用前失败保证。
- API integration 通过可观察的 Session Kernel/Grant/Audit ports 和最终 artifact 状态验证“没有 Credential、没有 consume、
  没有成功审计”，而不是直接测试共享函数在 adapter 内的具体位置。
- API integration 固定已确认的 non-retryable lease 行为：不变量失败后当前 attempt 不立即 release，lease 有效期间不能由第二个
  attempt 接管；lease 到期且 Grant 原始 expiry 尚未到达时可以新 attempt 重试；原始 expiry 不延长。
- 既有 retryable Projection/Subject Access 测试继续证明 `503` 会 release 同一 Grant attempt。新测试不得把不变量错误加入
  retryable error 列表。
- `/public/user-info` component integration 证明它通过共享 Interface 返回合法 Wire；Projection 期间 Client/config version
  改变时，post-projection recheck 仍拒绝交付。既有 request-scoped capability 与 Cookie 清理行为保持覆盖。
- Gateway Subject Header 的既有 Subject mismatch、claim 收窄和最小 Wire 测试继续通过，证明它没有被错误迁移到完整
  Custom SSO V1 seam。
- Token route contract 的既有完整 response schema 校验继续保留；若现有覆盖不足，补充测试证明 route 仍会拒绝非法
  `sid`、`ttl` 或整体响应，而不把该责任转移给共享函数。
- 不新增 Full-system E2E。production Projection 实现不会自然产生错误 Subject 或非法运行时值；为 E2E 制造反例而增加
  production hook 会扩大 Interface，收益低于风险。
- 实现采用 test-first 顺序：先增加 Package 与 API integration 失败用例，再实现共享函数并迁移两个调用方，最后收缩 mapper
  导出和更新文档。
- 聚焦验证覆盖 Client Subject Projection workspace 的 unit/lint/typecheck、API 的相关 component integration/lint/typecheck、
  `pnpm check:architecture`、`pnpm check:docs` 与 `git diff --check`。`pnpm verify` 只在后续准备本地合入时按仓库工作流运行。

## Out of Scope

- 合并 `/sso/token`、`/public/user-info`、Gateway callback 或 Gateway authorization 的完整 endpoint lifecycle。
- 把 Client runtime 查询、Subject Claim Selection 构建、配置版本前后复核或 Cookie 清理放入共享 Package 函数。
- 改变 Independent Client authentication、redirect URI 校验、Authorization Grant reservation、heartbeat、consume 或补偿算法。
- 新增 Grant `failed` 状态、永久烧毁内部故障 Grant、立即 release 不变量错误，或改变原始 Grant expiry。
- 改变 Credential identity、签发、post-validation、精确 revoke、tombstone 或 ambiguous write 补偿语义。
- 修改 Gateway Subject Header 的 Wire、字段范围、Base64 交付或 Subject 校验。
- 修改 OIDC 配置、Client Binding、Claims Snapshot、Authorization Code、Token、UserInfo 或 ID Token 行为。
- 修改 Client Subject Projection root Interface、Subject Facts、Subject Access Barrier 或 Authorization Freshness Barrier 的领域语义。
- 修改 Custom SSO V1 成功响应形状、现有稳定 retryable error code、HTTP status、Cookie、Header 或 OpenAPI contract。
- 删除 token route 的完整 response schema parse，或把共享函数扩展为完整 response validator。
- 为内部不变量错误增加公开稳定 error code、`Retry-After`、自动 client 重试协议或错误详情响应。
- 增加 logger dependency、metrics backend、告警规则、审计 action 或包含 Subject/Wire 的诊断日志。
- 新增 factory、port、composition adapter、可插拔 mapper/schema callback 或 test-only production capability。
- 新增数据库表、列、index、constraint、migration、Redis key 或 maintenance/backfill 操作。
- 清理 handoff 中提到的其他过度设计项，包括 OIDC legacy resolver/session fields、test-only production methods、旧 token index
  与 oversized composition return object。
- 创建新的领域术语、修改 `CONTEXT.md`、新增 ADR，或修改冻结的 OpenSpec 历史。
- 本 spec 的发布不包含 production implementation、ticket 拆分、commit、merge、push、PR、部署或发布操作。

## Further Notes

- 当前 production Client Subject Projection implementation 直接从 resolve input 构造 output Subject Identifier，且 Facts
  Adapter 会拒绝 Subject 不一致，因此本功能修复的是 Interface 未封闭造成的未来安全回归面，而不是宣称现网已发生串号。
- Late route schema parse 可以保护 HTTP client 不收到非法 Wire，但无法回滚此前已经完成的 Credential、Grant 和 audit
  副作用；因此它不能替代共享函数中的副作用前 parse。
- ADR-0008 已决定共享协议中性的主体事实与 client 裁剪，同时保持协议 Wire 和生命周期独立；本功能把 Custom SSO-specific
  Wire 不变量放在既有 subpath，遵守该决定。
- ADR-0010 已决定 Custom SSO Grant 直接签发 Credential，并使用写入前已知 identity 做精确补偿；本功能在 Credential
  issuance 之前失败，不改变该补偿模型。
- ADR-0007 与 Current backend architecture 要求 Client 配置版本变化 fail closed。`/public/user-info` 的最终 Client/config
  recheck 必须保留，不能把配置授权语义降级为无文档支持的“请求开始时快照”。
- Spec 中的测试 seam 已在设计访谈中确认：一个新的 Package 公开函数负责共享不变量，既有 API Grant redemption seam
  负责可观察副作用顺序；不需要第三个新 seam 或 E2E hook。
- 本地 tracker 的 spec 不维护生命周期状态字段。该 spec 已完成设计与测试 seam 确认，可继续进入 `/to-tickets`；后续
  implementation tickets 应使用 `ready-for-agent` 状态。本次 `/to-spec` 不构成实现授权。
