# OIDC 授权、兑换、Token、UserInfo 与退出候选

本文记录 #187–#190 的协议能力；#194 已由 API 默认接线，旧 Provider app 已移除。本文不是环境切换完成记录。
目标来自 [Spec #178](https://github.com/cyy1998/shgas-iam/issues/178) 与 [ADR-0035](../../adr/0035-unify-user-and-client-session-lifecycles.md)。

## 所有权与后续接线

`@iam/oidc` 独占授权、接受参数、Code、Token、签名与认证续接。根入口公开 `createOidcAuthorization`、`createOidcTokens`
和 `createOidcSigningKeys` 的完整操作与错误；
`/wire` 是浏览器可加载的协议结果 schema/type；`/maintenance` 是有界库存、apply 和独立只读库存；`/testing` 是真实
Redis 构造、故障和观察。协议不导入 Custom SSO、旧 Provider、API 私有实现或 HTTP；API 拥有 Cookie、form/query
解析、安全重定向、HTML 与标准错误。

`createRootAuthenticationComposition` 的 `oidc` 配置显式注入同一新 Kernel、Client Snapshot reader 与操作许可容器，
在 `/oidc` 挂载正式 `createOidcHttpRouter`。四认证仍使用原正式 factory/handler，默认生产图没有自动选代或新旧 fallback。
新协议状态不登记到 Kernel，也不创建 Provider Session、Grant、Claims Snapshot 或协议版本副本。

候选 Discovery 按装配公布原 issuer、`/auth`、Code response、三种 response mode、scope、S256、public subject 和关闭参数标志。
显式提供 `oidcTokens` 配置后再公布 `/token`、`/jwks`、none/client_secret_basic 和 RS256；授权独立构造仍不宣称兑换能力。
装配 Token 后同时提供 UserInfo `/me` 并公布 `userinfo_endpoint`；显式 `oidcLogout` 装配后公布 `end_session_endpoint`，不以局部 Discovery 声称官方认证。

## 授权与浏览器过程

授权 GET 与 form POST 保持 `response_type=code`、精确原文 redirect、包含 openid 的允许 scope、非空 state 和两类 Client
强制 S256。nonce 可省略，提供时原样绑定。query、fragment、form_post 都能返回 Code 或已确认安全地址上的标准错误；
form HTML 转义地址、state 和全部字段，使用 no-store/no-referrer。未确认安全地址、重复必要参数或错误编码时返回本地
标准 JSON 错误；不使用 IAM REST envelope 或通用 422。

参数兼容沿旧 Provider 9.9.1 的实际行为：未知参数和关闭的 claims/resource 被忽略；request、request_uri、registration
分别返回对应 not-supported 错误；scope 去重且忽略不支持的 offline_access，不提供 refresh/offline 功能；prompt 只接受
none/login，none 不可组合。max_age 为非负安全整数，0 强制新鲜认证。标准来源为
[OIDC Core](https://openid.net/specs/openid-connect-core-1_0.html)、[PKCE](https://www.rfc-editor.org/rfc/rfc7636)
和 [Form Post Response Mode](https://openid.net/specs/oauth-v2-form-post-response-mode-1_0.html)；具体兼容边界由本地 HTTP 测试证明。

每次授权、守卫或续接使用一次当前 Client Snapshot（包含通行状态与所选 OIDC 配置），可信根解析后取得一次账号许可。
授权不会读取 Subject Facts，不冻结主体披露。普通有效根直接复用；要求重新认证的有效根返回 login_required，不创建
重复认证/MFA 流程。Redis 故障和未知依赖保留 Cookie；明确失效按现有规则清理 global_session。

ClientSession open 发现关系记录损坏或索引类型异常时，沿已接受的安全 redirect/response_mode 返回
`temporarily_unavailable`，保留根 Cookie，不发 Code、不撤销原根或关系；只有明确缺失、终止或过期才归为
`login_required`。有效根不因关系存储损坏而被要求重新认证；授权与 resume 共用这个分类边界。

无根时，协议保存首次接受的 client/redirect/scope/state/response_mode/PKCE/nonce/prompt/max_age，生成随机 oidcReturn。
API 设置 `oidc_interaction_binding`（HttpOnly、SameSite=Lax、Path=/oidc，Secure 由正式配置决定），跳转原统一登录页。
现有 SSO 页面继续请求 `/oidc/login-guard?oidcReturn=…` 并消费直接 `{decision}`；登录后仍去 `/oidc/resume?oidcReturn=…`。
守卫明确允许登录时另发 `oidc_login_completion`，协议保存其摘要并绑定该 continuation。只有匹配证明才让首次登录完成
越过 prompt/login 或 max_age=0 的重认证拒绝；普通无新鲜度要求的续接不新增 completion 前置条件。

resume 必须找到原续接且浏览器绑定匹配，当前 Client 仍须可通行并选择 OIDC；后续配置编辑不改写首次已接受的 redirect
或 scope。停止、切换、恢复配置本身不删除续接。实际 resume 原子一次消费，成功后经原子 open 派生 Code；没有 return
handle 的有效根不能替代续接状态。本票沿用现有多标签页与 Cookie 顺序边界，不新增实际认证事件和 attempt 的强化绑定。

## Code 与维护

Code 外部为 `Code ID.UserSession ID.ClientSession ID`。OIDC 的单记录保留原根/实例/Client、两类稳定 instance、
原授权参数及 Redis 时间确定的固定期限；lookup 摘要含 Client、原根、原 ClientSession 和 Code ID，跨范围拼接不能命中
其他记录。Kernel 的原子 open 复用有效关系、更新最近协议、单调延长且不超过原根；旧记录不改绑后来实例或续期。
兑换在此 owner 内原子取删，不新增消费墓碑或第二登记。

namespace 固定追加 `:oidc:v1:`，仅此 owner 读取。维护不依赖索引或自然 TTL，逐页扫描 Code、Token 和 continuation，按 Client
筛选，严格核对已知记录；apply 比较原始记录再删除。未知格式与非目标记录保留，失败/未知分别保留实际计数；需显式重跑，
没有后台补齐。独立只读 `createOidcInventory` 可用新连接验证同一范围。#193 已接入
[Worker 统一 CLI](../../releases/unified-session-maintenance.md)，全量独立 `createOidcVerifier` 只需 SCAN。

Token 的摘要记录是唯一权威，独立 UUID 反向键仅供管理，不保存 bearer。两键按固定期限原子保存；维护删除 Token 时比较
原始记录，并仅删除仍指向该摘要的反向键。缺索引不阻止发现或在线使用真实摘要记录；未知反向键保留并计入 unknown。
格式合法且主记录缺失的孤立反向键可由全量维护在原子重验缺失后删除；Client 范围不能猜其归属，继续保留。
这不引入 OIDC Token 补偿、自动回收或持久重试任务。

## 兑换与安全使用

`createOidcTokens(...).forOperation(operation).exchange(input, deliver)` 将交付 callback 包含在同一次操作内。
当前配置只读取一次；Confidential 先使用独立 Secret authenticator，Public 的 none 例外由当前 OIDC Client 类型确定。
普通配置已切为其他协议时不凭旧请求推断 Public 身份；适用 Secret 通过后才进入原实例定位。
随后有界解析三段 Code，分别中性观察原 UserSession 与属于同根、同 Client 的 ClientSession；缺失、损坏或归属不符
不消费、不猜当前关系槽。根已终止但真实记录仍在时可中性定位，消费后的许可/生命周期拒绝仍精确处理原实例。

定位成功后，Gate、所选协议、grant_type、入口参数和 Origin 拒绝在取删前发生；其失败仍尝试撤销原实例。
Code 使用包含 Client、原根、原实例和 Code ID 的摘要 lookup 执行一次 GETDEL，只有明确取得者继续。先取得再检查 payload、
原实例、期限、redirect、S256、账号许可和适用会话；原接受 scope/redirect 不按后续允许列表重审。
Public 不要求 Secret 或消费前 PKCE 成功，合法定位者构造缺失 Code 会终止其定位的原实例，这是 Q37 的已接受边界。

ID Token 先准备和签名，随后才保存 Access Token。public sub 是根的 Subject Identifier，auth_time 取根认证时间；
iss/aud/iat/exp、可选 nonce、profile 的 preferred_username/name 与 phone_number 显式映射。
仅 sub 或 IAM 扩展 scope 不读取完整 Facts；profile/phone 经正式许可投影能力读取所需已发布 Facts。ID Token 排除两类 IAM
任职/授权扩展，已经签名的内容固定，不转移 Claims Snapshot。RSA current/previous JSON 沿现有服务端配置含完整私钥、
alg=RS256、唯一非空 kid；仅 current 签名，JWKS 白名单公开 kty/kid/alg/use/n/e。生产 env 已由 API 默认装配，环境尚未切换。

失败通过 `OidcExchangeFailure` 分别提供消费 not_attempted/consumed/missing/unknown、原始失败和确切撤销结果。
API 保持标准 OAuth 错误 body，并结构化记录消费与撤销实际结果。每请求仅一次撤销尝试，默认等待上限 1000ms、可配置
1–5000ms；超时/响应未知不冒称终止，不恢复 Code、不重放签名，也不删除可能残留的 Token。未知命令仍可能晚到完成。
再次主动兑换只按同一原 ID/instance 定位；新实例、其他 Client 和其他根不在撤销范围。

`resolveAccessToken(bearer)` 是 #189 的正式消费能力：固定用途 oidc_access，摘要定位并检查固定期限，读取当前 Client 配置，
重新检查原确切根/实例及账号许可，返回该操作的观察和配置。它不比较可变的 ClientSession.protocol，也不续期。
已接受观察的在途请求不新增提交前复查；原根失效后的新访问不依赖子索引，原实例撤销成功后晚到写入的 Token 仍拒绝使用。

## Token HTTP 与局部成本

API 正式 `/token` POST 接受 form、Public client_id 或 Confidential Basic（form URL 解码和首个冒号分隔）；
格式/参数错误为标准 invalid_request，认证失败为 invalid_client，保持适用 401/WWW-Authenticate、503/Retry-After 和 no-store。
仅支持 authorization_code，不接受 client_secret_post 或新增 refresh grant。Basic 与 body client_id 冲突在认证前拒绝。
预检沿旧 Provider 实际行为：OPTIONS 不依赖 body/client_id，反射 Origin 和请求 headers；实际 POST 仅允许 Public 登记 redirect
origins，拒绝时不返回 ACAO。JWKS GET/OPTIONS 与 Discovery 一样回显 Origin、不开放 credentials，无 Origin 不返回 wildcard。

`oidc-token.integration.test.ts` 使用正式根密码认证 composition、真实 loopback HTTP、同代 Kernel/协议 Redis，覆盖
签名/JWKS、门槛前零作用、门槛后失败矩阵、消费竞争、晚写 Token、新实例隔离、超时/失败/未知、固定期限、当前配置与维护。
状态故障由各 owner testing 能力注入，真实 Redis adapter 完成原子操作；不以 mock 调用次序代替实际库存和会话状态。

2026-09-14 本地 Bun 1.3.14、Redis 8.8.0 的完整 Confidential Token POST 样本使用透明 TCP 代理，连接完成并 warm 后
按顺序请求，实际观察如下。数值为局部样本，最终固定源码基线对比由 #196 负责。

| 请求 scope | 请求/响应批次 | 串行波次 | 样本耗时 | 其中 RSA 签名 |
|---|---:|---:|---:|---:|
| openid | 9/9 | 9 | 8.78ms | 0.42ms |
| openid profile phone | 10/10 | 10 | 8.71ms | 0.45ms |
| openid profile phone | 10/10 | 10 | 10.11ms | 0.46ms |

九步包含普通 Snapshot、Secret、原根定位、原实例定位、Code 取删、在线原根/实例、Barrier、Redis 签发时间和 Token 保存；
profile/phone 增加正式 Facts reader 一次 warm Redis 读取。签名在进程内完成。样本使用真实 Snapshot、Secret authenticator、
Barrier 和 Facts cache/reader，源 Client/Secret 计数和 Facts SQL 均为零；Facts 的拒绝连接只证明 warm 不回源，不证明 PG fallback。
代理记录请求/响应 data 批次与交替序列；该小 payload、无 pipeline 样本的交替数证明所观察的串行波次，不能将任意 TCP 分片
自动视为命令数。这里不重复计算先前摘要定位收益，不从 Snapshot 单次 RTT 推断完整端点收益。

## UserInfo 当前披露

`createOidcUserInfo(...).forOperation(operation).read` 复用 `resolveAccessToken` 的一次在线观察，包括 Token 固定用途、
原确切根/实例、当前所选协议配置和账号许可。随后仅从该配置的 `allowedScopes` 构建中性 Selection，不再读取 Client、
不续根/关系/Token、不比较可变的 ClientSession.protocol，也不在响应前复查。配置暂停或切换的拒绝不撤销实例；切回后
满足其他条件的原 Token 可以恢复。原根成功终止后的新访问不依赖子索引，旧实例不能借新授权恢复。

`/me` GET、POST 支持 Authorization Bearer，form POST 也接受单一 `access_token`；重复或混用机制为 `invalid_request`，
query bearer 沿原 Provider 配置拒绝。无 bearer/无效 Token 为 401 和 Bearer challenge；没有凭据时 challenge 不带 error。
明确 Maintenance 为 `temporarily_unavailable` 并说明维护，未知配置/会话/Facts I/O 同为 503 但不冒充 Maintenance；
均保持 Retry-After/no-store，不套 IAM envelope、不清可恢复 Cookie。UserInfo 不接受 caller scope 作为披露上限。
实际 CORS 只接受 Token 所属 Client 当前 redirect origins，Public/Confidential 相同，不相信请求 client_id；
预检沿既有公开行为反射 Origin/headers、声明 GET/POST，实际请求重新按 Token Client 检查，不开放 credentials。

每次披露包括新增和收窄范围，旧 Token 原申请 scope 只表达授权事实，不参与交集。profile/phone 保持标准字段，
`iam:employments` 保留 orgCode/orgName/orgType/fullOrgPath、posCode/posName 与 responsibility 形状；
`iam:authorization` 只映射该 Client 已发布的角色/权限，不包含 responsibility 或其他 Client 的授权。
已签 ID Token 内容固定，纯 sub 不读完整 Facts。

两协议共同复用 `createPermittedClientSubjectProjectionService`，其输入只包含主体、Client、Selection 和本操作许可；
ORCAS 外部 user/session 仍由 Custom 专用上下文拥有。现有中性 Projection/Facts 接口满足要求，本票未增加协议专用字段。
正式 `createSubjectFactsReader` 使用 strict v3 Redis 已发布缓存，warm 零 PG；miss/坏 payload 只回读已发布行的八列。
不读取 Dirty、Detail、Search 或源表，不现场聚合；旧权限可交付，缺失/损坏的必要事实暂态失败，不能省略声明伪装成功。
Redis 连接异常不当作 miss，PG 异常不当作无主体；合法回源后的缓存回填失败沿既有 owner 允许交付。

`oidc-userinfo.integration.test.ts` 在 API Redis 与 Composition profiles 分别覆盖正式 HTTP 的传输、动态披露、
切换恢复、原实例/根拒绝、单次许可/配置、在途完成及真实 PG/Redis 回源/故障；沿既有 fixture 保持 setup 失败清理，
真实 I/O 先普通 await 再同步断言。Composition 使用真实迁移的随机 schema、无效 Detail/Search、缺失 Dirty 与实际 SQL
证据核对窄读，专用 Facts 连接断开时仍确认 Token 保留。Client 配置源沿窄 seam 加真实 Snapshot invalidation 控制；
这些测试不冒称 Admin 配置事务或生产接线已切换。

## #155 逐项处置

| 核验步骤 | 本候选处置与证据 |
|---|---|
| Gateway、Independent、IAM 根与 OIDC UserInfo 完整路径 | Custom 的 `authenticateToken → accept → project` 已由 #185/#186 交付；根 UserInfo 继续由 `createRootSessionService` 独立接受 Client；OIDC 为 `resolveAccessToken → 当前 Selection → projection`。 |
| 首次用途/Client 与后续配置复用 | Token owner 验证用途、摘要、原身份，取得一次 Snapshot；UserInfo 复用返回配置与观察，不再调用 `loadAcceptedClient`、不判断普通配置版本或可变 CS.protocol。HTTP 计数直接证明一次 acquisition、一次账号许可。 |
| 纯赋值 try/catch 与真实失败 | 新 UserInfo 的 catch 只围绕异步安全 Token 解析，将永久协议拒绝转为标准 invalid_token；无纯赋值异常包装。兑换实际 I/O、消费未知与原实例撤销仍由 #188 保留，Custom Token 补偿未删除。 |
| 错误用途、旧/新实例、暂态与跨环节交付 | 复用 #188 用途/关联证明；本票正式 HTTP 证明原实例终止后旧 Token 拒绝、新实例可用、原根漏子索引仍拒绝、暂态不清 Cookie、账号拒绝后旧代不恢复及已观察在途完成。 |

Selection 输入校验、Facts payload strict parser、主体匹配与许可证明分别属于不同信任边界，继续保留。
#194 已移除旧 Provider/Custom 在线图并迁移行为保护；不把内存校验整理计作端点性能收益，最终成本归 #196。

## 其他验证与资源

### 退出确认与取消修订

#190 的 `createOidcLogout` 独占退出请求，API 保留 `/session/end` GET/form POST、`/session/end/confirm` form POST
与本地 `/session/end/success`。确认页仍使用 `xsrf`，确认按钮提交 `logout=yes`，取消按钮不提交 logout。
2026-09-14 的旧 Provider 真实 HTTP/Redis 证据表明：默认取消按钮虽写着 `No, stay signed in`，成功确认路由的外层
middleware 仍终止根并清 Cookie。维护者在本票实施时明确授权修正该缺陷：**取消只消费本次退出确认，保留 UserSession、
ClientSession、Token 和 global_session Cookie**。旧 Provider 事实证据固定在 #190 评论及旧候选源码；当前 HTTP 与实际浏览器点击分别证明修正。
这项当前授权修订优先于“保留既有流程”可能带来的旧取消作用推断。

hint 由与签名同一 current/previous RSA key owner 验签，要求 RS256、可信 kid、正确 issuer、单 Client audience 和 subject；
显式 client_id 必须匹配。沿旧行为允许过期 ID Token 作为退出 hint，不将其作为当前根认证。post_logout_redirect_uri
必须带合法 hint 并精确匹配 Client 登记地址，GET/form POST 一致；未确认安全地址、错误 hint、重复参数或 CSRF 失败均本地
标准错误，不能转向任意外站。已接受的 Client、hint 摘要/主体、redirect 和 state 保存到确认状态，提交时不接受覆盖；
当前 Client 配置获取故障暂态保留 Cookie，Maintenance 或关闭 SSO 不妨碍退出，后续 redirect 列表编辑不改写已接受地址。
state 只在已接受 RP 地址回传。HTML 不嵌 hint、根 bearer 或 Client 原文，CSP 只允许本地表单与已接受的 RP origin。

OIDC namespace 内独立 `logout:` 状态保存 Redis 时间确定的期限、随机浏览器绑定摘要和 CSRF 摘要。两个确认 Cookie
均为 HttpOnly、SameSite=Lax、Path=/oidc/session/end，Secure 由正式配置决定；随机请求 handle 和浏览器绑定必须共同命中，
CSRF 匹配后才可按原字节一次消费。状态没有 Provider Session/Grant 依赖，也不保存一个强制固定的根 ID。
新的确认请求覆盖此浏览器的单流程确认 Cookie；不新增跨标签页协调或同名 Cookie 响应顺序保证。

确认提交只中性解析**该请求实际观察的根**并精确撤销，不要求新账号许可。确认页之后浏览器换根时，终止新请求观察根，
原页根保持原状态；已观察在途可以完成，下一派生在线访问必须检查根并拒绝，即使子索引漏项。缺失、过期或已经终止
等明确无效与正常退出清 global_session；Redis、坏状态、配置获取故障或撤销 failed/unknown 保留 Cookie 并返回 503。
日志分别报告 confirm/cancel 和 Kernel 实际撤销范围/结果，unknown 不冒称成功或等待自动补齐；客户端可重新发起明确退出。
不承诺第三方本地会话退出、逐枚 Token 回收、额外退出通知或迟到响应不会清理新 Cookie。

无有效根仍沿自动 POST 流程结束；有有效根显示两个按钮。取消不读取或撤销根，不清根 Cookie，只清本次确认 Cookie，
重放旧表单失败。维护 inventory/apply/独立只读 verify 同时识别退出状态，包括无 TTL、无索引记录；按 Client 筛选，
无 Client 记录仅在全 owner 范围处理，未知与非目标数据保留，原始字节变化不误删。

`@iam/api test:integration:browser` 使用调用方的专用 `IAM_API_TEST_REDIS_URL`、单 Chromium、零重试、动态 loopback
候选 API 和测试 RP；实际点击取消/确认并验证 Cookie、Token、state 导航和 CSRF/unsafe redirect。本地 fixture 子进程
只拥有自身服务器与随机 Redis namespace，启动失败及正常结束都进入清理；此通道不启动 Docker、不依赖运行环境。
它不替代 SSO 前端完整 mock-browser、Conformance Suite、真实第三方 RP 或环境部署验收。基础退出 HTTP/Redis/浏览器
行为已在本票覆盖，#195 仅补套件与互操作证据。

API `oidc-authorization.integration.test.ts` 经正式根密码认证、同代 Kernel、真实 Client Snapshot Redis 与正式 HTTP
验证授权、续接、参数、安全错误、三模式、CORS、单次许可、并发关系和 Cookie；源 Client 和账号屏障按窄 seam 控制，
不把这些替身声称为 PostgreSQL 配置事务证据。OIDC owner Redis 测试补维护、固定期限与旧实例隔离。
Discovery GET/OPTIONS 按原实装回显 Origin，无 Origin 时不保留 wildcard；授权不开放 CORS。UserInfo CORS 按下述 Token Client 的当前登记 origins 处理。

新包 Redis 通道为 `pnpm --filter @iam/oidc test:integration:redis`，只使用调用方专用 `IAM_OIDC_TEST_REDIS_URL`。
API 使用自己的 `IAM_API_TEST_REDIS_URL`。各 fixture 随机 namespace 并精确清理；实际命令、候选 SHA 和资源清理由 #187
交接登记。类型、Collection Guard 和包构建闭包不替代真实协议套件、浏览器或最终全系统 E2E；这些后续票和部署责任保持独立。
