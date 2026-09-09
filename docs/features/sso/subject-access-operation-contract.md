# Subject Access 操作许可最终契约

本文核对 [Spec #128](https://github.com/cyy1998/shgas-iam/issues/128) 的 62 条故事及最终公开入口，
架构决定见 [ADR-0029](../../adr/0029-check-subject-access-once-per-business-operation.md)。
#129–135 建立的过渡路径已由 #136 统一启用。本文列出可执行证据和证明边界；候选 SHA、实际命令、结果和评审轮次
以 [#136](https://github.com/cyy1998/shgas-iam/issues/136) 及父 Spec 的验收评论为准。
表中的测试存在、静态核对或故事覆盖均不等同于某个候选已经执行通过，更不等同于目标环境已切换。

## 最终公开 owner

| Owner | 正式契约 | 调用方责任 |
|---|---|---|
| API Core `subject-access` | `createSubjectAccessOperations` 创建操作；`run` 在完成或失败后关闭。`acquireForAuthentication` / `acquireForSession` 固定第一次成功或失败；`requirePermission` 只接受当前主体的已取得许可。 | 从可信认证结果或已解析对象取得身份；不得把请求体字段当许可，也不得把操作对象保存在跨请求单例中。 |
| API Core `subject-access` | `encodeSubjectAccessContext` / `parseSubjectAccessContext` 解释版本、Subject Identifier、transition ID；`createSubjectAccessSessionContext` 仅返回不透明 `subjectContext`。`createSubjectAccessSessionRevocation` 拥有失败后的代际翻译和撤销编排。 | 存储上下文不是许可；外层校验并决定撤销范围，cleanup 失败仍拒绝。 |
| Session Kernel | 唯一 `createSessionKernel`；根创建显式传入 `{ subjectContext }`，带主体的 Binding、Credential、Artifact 原样继承。列表通过 `listPrincipalSessions` 查询；上下文精确撤销通过 `revokeUserSessionsByContext` / `prepareUserSessionRevocationByContext`。 | Kernel 仅管理对象和不透明上下文，不读 Barrier，不解释账号代际，不感知 HTTP 容器。无主体 Artifact 保持独立生命周期。 |
| API / Custom SSO | `createCustomSsoOperations(...).forOperation(operation)` 是受保护协议能力；API `createCustomSsoOperationAdapter` 包住独立调用，`createApiOperationAuthenticationHandlers` 包住整个 UserInfo middleware 与 `next()`。统一认证 adapter 在身份认证后、根创建前取得许可。登录续接 adapter 仅返回 operation-bound 原始检查，页面 decision 用例仅由 `composition/use-cases` 装配。 | 授权、续接、兑换、callback、authz、UserInfo 分别拥有操作；不能把整个浏览器旅程合为一个许可。logout 是独立终止访问能力。 |
| Client Subject Projection | 唯一 `createPermittedClientSubjectProjectionService` 由调用方证明许可；没有独立 Barrier 工厂。 | API 和 OIDC 证明当前操作、许可身份与主体一致；Facts 缺失和授权新鲜度仍由 Projection 判定。 |
| OIDC Provider | 正式 `createOidcProviderRuntime` / `createOidcProviderSession` 使用请求桥接；`createOidcSessionOperations(...).forOperation` 与正式 Session adapter 共用操作。Provider callbacks 从请求状态取用；原生 interaction、guard、resume 显式创建容器。 | Code 的首次可信解析先于消费取得许可；AccessToken 首次可信解析先于 Binding mapping 刷新取得许可。已消费 Code 重放和 logout 保留终止访问例外。 |
| Admin API / Admin | 正式 authentication handler 覆盖 REST 和 tRPC，在管理员业务处理前取得许可；已许可资料读取与角色、HR 范围、目标业务规则分别处理。页面展示 Principal Session Record。 | 列表不逐目标检查或撤销；管理员撤销权限仍有效，目标账号不必可访问。页面不能把记录存在解释为当前允许访问。 |

API 的 ORCAS 后续资料读取、Admin 已许可管理员资料读取、OIDC 已许可账号查询均不再使用 enabled/deleted 条件追加账号拒绝。
其他业务查询的状态条件没有全局删除。账号状态 mutation 的 pre-block、数据库提交、publication/repair 和同步 cleanup 模型保持各自 owner。

## 证据索引与分类

“共享”表示由公共能力或真实存储 owner 集中证明，不要求每个协议复制完整矩阵；“消费者”表示实际用例、HTTP、协议或页面适配的接入证据。
“人工未执行”表示必须由发布负责人取得目标环境证据。浏览器测试使用 mocked backend，不能证明完整部署链。
下面的短名只用于定位文件；逐条核对表另列公开可观察断言，不能仅凭短名或故事编号判定通过。

| 短名 | 具体证据 | 证明范围 |
|---|---|---|
| Permission | [Subject Access Component](../../../packages/api-core/test-integration/component/subject-access-operation.integration.test.ts) | pending Promise 共享、首次裁决固定、主体/代际绑定、伪造及关闭后拒绝、暂态失败无撤销。 |
| Context Redis | [操作与中性 Kernel Redis](../../../packages/api-core/test-integration/redis/subject-access-operation-kernel.integration.test.ts) | 真实持久化继承、延迟创建、旧代隔离撤销、无主体 Artifact、拒绝不受撤销失败影响。 |
| Kernel | [Kernel Component](../../../packages/session-kernel/test-integration/component/session-kernel.integration.test.ts)、[Credential Redis](../../../packages/session-kernel/test-integration/redis/session-kernel-credential.integration.test.ts)、[Artifact Redis](../../../packages/session-kernel/test-integration/redis/session-kernel-artifact.integration.test.ts)、[时间 Redis](../../../packages/session-kernel/test-integration/redis/session-kernel-time.integration.test.ts) | 上下文输入、记录查询、期限、父子关系、一次消费和存储冲突；不证明账号可访问。 |
| SSO Component | [API 完整认证与 Custom SSO Component](../../../apps/api/test-integration/component/custom-sso-session-kernel.adapter.integration.test.ts) | 四种认证 composition、协议效果、错误、配置、补偿和退出。 |
| SSO Redis | [Custom SSO 操作 Redis](../../../packages/custom-sso/test-integration/redis/custom-sso-operation.integration.test.ts) | 真实 Grant/Kernel 的作用顺序、在途许可、下一调用拒绝、补偿及单赢家。 |
| API HTTP | [四模式 UserInfo HTTP](../../../apps/api/test-integration/redis/custom-sso-operation-http.integration.test.ts)、[三模式兑换 HTTP](../../../apps/api/test-integration/redis/custom-sso-redemption-operation-http.integration.test.ts) | 正式操作装配 helper、Hono route/handler、真实 Redis，包含 Cookie、wire、header、scope 关闭和状态变化；不包含浏览器和 Gateway 部署。 |
| Projection | [Projection Component](../../../packages/client-subject-projection/test-integration/component/client-subject-projection.contract.integration.test.ts)、[Custom SSO delivery Component](../../../packages/custom-sso/test-integration/component/custom-sso-subject-delivery.integration.test.ts) | 许可先于资料读取、字段裁剪、主体一致、Facts 和授权新鲜度失败、输出形状。 |
| OIDC HTTP | [正式 Provider/原生 HTTP 与 Redis](../../../apps/oidc-provider/test-integration/redis/subject-access-authorization.integration.test.ts) | 实际 Token、UserInfo、授权、interaction/guard/resume、logout；Code 消费和 mapping 刷新顺序、并发隔离、协议错误。 |
| OIDC Component | [操作 Session Component](../../../apps/oidc-provider/test-integration/component/subject-access-operations.integration.test.ts)、[Session adapter Component](../../../apps/oidc-provider/test-integration/component/subject-access-session-adapter.integration.test.ts) | Session staging、claim、binding、严格上下文、Return Handle 和退出。 |
| Admin HTTP/Redis | [认证 Component](../../../apps/admin-api/test-integration/component/authentication.handler.integration.test.ts)、[管理会话 Redis](../../../apps/admin-api/test-integration/redis/session-management.integration.test.ts) | 正式 REST/tRPC 认证/授权适配、真实 Barrier 与 Kernel、账号变化、记录列表无目标检查及撤销反馈。 |
| Admin UI | [页面 service Component](../../../apps/admin/test-integration/component/session-management.integration.test.ts)、[浏览器会话页面](../../../apps/admin/test-integration/browser/sessions.spec.ts) | 安全错误和返回值；mocked-backend 页面文案、筛选分页刷新、当前会话保护及撤销反馈。 |
| 资料查询 | [ORCAS PostgreSQL](../../../apps/api/test-integration/postgres/permitted-orcas-user.integration.test.ts)、[OIDC repository Component](../../../apps/oidc-provider/test-integration/component/repository-availability.integration.test.ts)、Admin HTTP/Redis | 已许可资料不按账号状态追加过滤；资料不存在和查询异常仍失败。 |

## 62 条故事逐项核对

| 故事 | 类别 | 已建立的公开可观察证据与限制 |
|---|---|---|
| 1 每调用一次许可 | 共享＋消费者 | Permission 对一次操作的 Barrier seam 计数为 1；API HTTP、OIDC HTTP、Admin HTTP/Redis 分别观察一请求一次读取。此预算不代表端点总 Redis RTT。 |
| 2 内部步骤共用 | 消费者 | SSO Redis 授权完成 renew 和真实 Grant 创建仍只读一次；兑换覆盖消费、issue、交付。OIDC HTTP Token 多回调成功且一次读取。 |
| 3 下一调用重查 | 共享＋消费者 | Permission 新 operation 增加读取；API/OIDC/Admin HTTP 第一请求在途成功、第二请求拒绝且读取从 1 增到 2。 |
| 4 旅程分段 | 消费者 | SSO Redis 分别调用 authorize、continuation、redemption、UserInfo；OIDC HTTP native interaction 与 Provider 请求分别取得许可，guard/resume 独立计数。不是整个浏览器旅程缓存。API Composition 另由真实 `/sso/login-guard` 验证有效、缺失和无效 Cookie 的页面 decision、清 Cookie 与根记录不续期。 |
| 5 并行共享 | 共享＋消费者 | Permission 在未释放同步 gate 前发起两个 acquire，只有一个读取且两者返回相同许可；OIDC HTTP 并发请求各自检查，不能彼此借用许可。 |
| 6 固定成功与失败 | 共享＋消费者 | Permission 对 disabled、unavailable、Redis failure 并行重试断言相同失败和一次读取；OIDC HTTP 在同 Provider 请求中重试 adapter，失败保持不变且新 Code 未消费。 |
| 7 结束失效 | 共享＋消费者 | Permission 在 close 后拒绝 require/getContext/acquire，pending 在关闭后完成仍不能许可；API HTTP 保留的 capability、OIDC HTTP 保留的 claims callback 在请求结束后拒绝。 |
| 8 可信来源 | 共享＋消费者 | Permission 拒绝伪造容器和许可；SSO Redis 无效协议身份在取得许可前拒绝且零读取；OIDC Component 校验真实 principal 与 staged identity，不能由传入主体替代。 |
| 9 绑定主体代际 | 共享 | Permission 的 context subject/generation 矩阵拒绝错配且不重查；Context Redis 将许可代际保存为真实根和子对象上下文。 |
| 10 中途换身份拒绝 | 共享 | Permission 在 pending、成功后、失败后分别拒绝不同主体或代际；不读取另一主体 Barrier，也不撤销无关对象。 |
| 11 无主体及无效凭据 | 共享＋消费者 | Permission 的惰性 run 不读取；SSO Redis invalid credentials 零读取；OIDC HTTP subjectless Return Handle 不取得账号许可。 |
| 12 四种认证 | 消费者 | SSO Component 的 production authentication composition 对密码、手机、OA、微信各观察一次检查；拒绝时 Principal Session creation mock 零调用。 |
| 13 根保存许可代际 | 共享＋消费者 | Context Redis 读取根的 subjectContext 与许可一致；SSO Component 四种认证的创建参数解析为此次许可上下文，未再次 capture。 |
| 14 迟到创建沿用旧代 | 共享＋消费者 | Context Redis 在许可后变更账号代际再创建根；SSO Redis 在途 redemption 的迟到 Credential 保留原 context，后续访问拒绝。 |
| 15 派生原样继承 | 共享 | Context Redis 创建 Binding、Credential、Artifact，比较真实持久化 context 与根一致。 |
| 16 续期不可升级 | 共享 | Context Redis renew 后 context 不变；向派生输入附加替换 context 不能覆盖父值，已撤销父对象不能借许可重新派生。 |
| 17 坏上下文不补齐 | 共享＋消费者 | Permission 对缺失、null、非 JSON、缺字段、未知版本、坏代际和额外字段拒绝且不调用 Barrier；OIDC Component 对真实 principal context 的身份不一致拒绝。 |
| 18 无主体 Artifact | 共享＋消费者 | Context Redis 无 context 创建和消费一次，重复消费失败；OIDC Component/HTTP Return Handle 无 Subject Access 读取且不因检查而消费。 |
| 19 authorize 作用前检查 | 消费者 | SSO Redis 初始 blocking/disabled 时零 Grant 且 root expiry 不变；成功后 renew 与 Grant 创建完成，读取仍为 1。 |
| 20 continuation 只读 | 消费者 | SSO Redis 比较 continuation 前后的持久化 root value，期限不变且无 Grant/Credential；另一次 continuation 独立检查。 |
| 21 Independent 消费前检查 | 消费者 | SSO Redis/API HTTP blocking 拒绝后 Grant 未消费且无 Credential；恢复后同一码仍可兑换。 |
| 22 callback/ORCAS 前检查 | 消费者 | SSO Redis/API HTTP Gateway 与 ORCAS 模式拒绝时观察零 ORCAS、零签发及未消费 Grant；恢复可继续原兑换。 |
| 23 authz 共用 | 消费者 | SSO Redis Gateway/Gateway-ORCAS authz 解析 Credential、父 Session、交付 header 后仍只有一次读取，header 保持裁剪。 |
| 24 UserInfo 四分支 | 消费者 | API HTTP 的 IAM、Independent、Gateway、Gateway-ORCAS 都运行真实请求；延迟交付仍在 scope 中、重复交付不增加 Barrier 读取、结束后 capability 拒绝。 |
| 25 OIDC 所有授权入口 | 消费者 | OIDC HTTP 运行正式 authorization、native interaction、guard、resume；每个入口有独立操作且拒绝在受保护作用前发生。 |
| 26 Code 消费前检查 | 消费者 | OIDC HTTP 对 blocking/不可用断言 503、consume 零调用，恢复后同 Code 成功；disabled 也未消费新 Code。 |
| 27 AccessToken 先检查 | 消费者 | OIDC HTTP UserInfo 的 disabled/blocking/unavailable 矩阵检查一次且 mapping refresh 零调用，分别返回 401/503。 |
| 28 Provider 多回调 | 消费者 | OIDC HTTP Token 多回调一次读取，平行 Token/UserInfo 请求分别计算许可并在结束后关闭 claims。 |
| 29 原生独立容器 | 消费者 | OIDC HTTP native interaction/guard/resume 分别取得许可；native account failure 后容器关闭，下次独立重试可成功。 |
| 30 漏接入关闭 | 共享＋消费者 | Permission 拒绝伪造/缺失容器；SSO Redis 缺失或 closed operation 不能 authorize；OIDC HTTP 在 operation 外读取 Code 不消费，保留 claims 不能使用。 |
| 31 在途继续 | 共享＋消费者 | Context Redis 许可后 blocking 仍可创建、派生、续期、消费；SSO、OIDC、Admin 的 HTTP/Redis 在资料或签发阶段变更账号后，本次仍完成。 |
| 32 后续重新拒绝 | 消费者 | API HTTP、OIDC HTTP、Admin HTTP/Redis 在途成功后发起下一请求，观察账号拒绝、读取增加且资料读取不再发生。 |
| 33 旧代永不恢复 | 共享＋消费者 | Context Redis stale denial 撤销旧代树；SSO Redis 在途旧代 Credential 在新代启用后拒绝；OIDC Component 旧 context 在 renew 前拒绝。 |
| 34 新登录取得新代 | 共享 | Context Redis 新代认证创建根后，晚到旧代 prepared/exact-context 撤销仍保留新根可解析；环境实际重新登录另见故事 61。 |
| 35 生命周期仍有效 | 共享＋消费者 | Kernel Redis 保留期限、父子归属、消费和并发冲突断言；SSO Redis 真实并发兑换只有一个 Credential winner，不确定写入先补偿，补偿失败不释放 Grant。 |
| 36 Client 与业务授权 | 消费者 | SSO Component 配置版本、redirect、Client mismatch/maintenance 仍拒绝；OIDC HTTP obsolete config、scope/freshness 仍拒绝；Admin Component 已许可但无角色仍拒绝。未扩大 HR scope。 |
| 37 Projection 复用许可 | 共享＋消费者 | Projection 在缺失/错主体 proof 时先拒绝且 Facts/freshness 零读取；SSO Redis 多次交付一次 Barrier，API/OIDC 正式 composition 传入当前 operation proof。 |
| 38 资料不追加账号判断 | 消费者 | ORCAS PostgreSQL 对 Disable/Pause/deleted 仍读取已许可主体资料，而原 active 查询仍拒绝；Admin HTTP/Redis 在途返回 disabled/deleted profile 仍成功；OIDC repository 已许可读取无状态过滤。 |
| 39 缺资料/授权未就绪 | 消费者 | Projection 缺失、错主体、refreshed 错主体、freshness not-ready 均失败；SSO Redis ORCAS 缺 Profile 不出站，消费后的 Grant 保持不可重用；OIDC HTTP account/Facts 消失仍失败。 |
| 40 API/Admin 错误与 Cookie | 消费者 | API HTTP disabled/旧代返回既有错误并过期相应 Cookie；Admin Component/HTTP SESSION_INVALID 清理 Cookie，资料缺失仍未经授权。 |
| 41 OIDC 协议错误 | 消费者 | OIDC HTTP Token 的 Subject Access 明确失效返回 `401 / login_required`，UserInfo 返回 `401 / invalid_token`；两者暂态失败返回 `503 / temporarily_unavailable`。`invalid_grant` 属于已消费 Code 重放等协议拒绝，见故事48；native guard/interaction 保留原路由错误语义。 |
| 42 暂态不终止会话 | 共享＋消费者 | Permission unavailable/Redis failure 零撤销；API/OIDC/Admin HTTP 暂态分支保留 Cookie；OIDC 同 Code 恢复后成功，证明未消费。坏上下文矩阵由共享测试承担。 |
| 43 禁用/旧代撤销 | 共享＋消费者 | Permission disabled 清理使用凭据代际、stale 只撤销旧根；Context Redis 观察旧树对象被撤销；SSO Redis disabled 拒绝保留新代根。 |
| 44 晚到清理隔离新代 | 共享 | Context Redis prepared 和 exact-context 两种旧代撤销均保留新代 Session；空 prepared 集合不会退化全用户撤销。 |
| 45 cleanup 失败仍拒绝 | 共享＋消费者 | Permission 清理抛错/部分失败仍固定拒绝；Context Redis 真正撤销失败后的下一尝试仍拒绝；Admin Component 旧代 cleanup 失败仍清 Cookie 并拒绝。 |
| 46 logout 不查账号 | 消费者 | SSO Redis blocking/disabled 下 logout 零读取且根和 Credential 失效；OIDC HTTP disabled logout 不取得新许可，保留目标凭据校验。 |
| 47 管理员可撤销失效目标 | 消费者 | Admin HTTP/Redis 先认证管理员，再列出 disabled 目标的旧记录并撤销两根；目标 Barrier 始终未读，撤销结果按实际对象计数。 |
| 48 已消费 Code 重放 | 消费者 | OIDC HTTP 已消费 Code 重放返回协议拒绝并撤销 Grant；测试确认不要求新 Subject Access 许可。 |
| 49 REST/tRPC 管理员保护 | 消费者 | Admin HTTP/Redis 分别请求 `/admin/capabilities` 和真实 tRPC fetch handler，第一次 200/一次检查，账号变化后第二次 401/再次检查。 |
| 50 管理员与目标区分 | 消费者 | Admin HTTP/Redis 只对 adminSubject 读取 Barrier，disabled 目标仍能查和撤销；角色策略在独立 middleware 中继续拒绝无权管理员。 |
| 51 会话记录语义 | 共享＋消费者 | Kernel inventory 测试先移除自然过期成员再计数分页；Admin HTTP/Redis 保留未撤销旧代记录并输出账号状态，不声明记录代表可访问。 |
| 52 查询无目标作用 | 消费者 | Admin HTTP/Redis 两页和刷新后 Barrier 仅管理员一次、auditWrites 为空；两个目标树仍全部 resolved，只有显式撤销后改变。 |
| 53 页面说明 | 消费者 | Admin UI browser 断言“记录存在不代表当前允许访问”和旧代记录可撤销提示可见；页面源码同步文案。浏览器执行情况必须查候选验证记录，源码核对不能替代运行。 |
| 54 筛选分页刷新及反馈 | 消费者 | Admin HTTP/Redis 按 userId 两页无重复、刷新两条、保护当前根、重复撤销 no-op、cleanup safe summary；Admin UI browser 断言筛选、分页、手动刷新和确认交互。 |
| 55 外部形状不变 | 消费者 | API HTTP 断言 V2 subject、encoded Gateway header、Cookie 与 redirect state；Projection 保留字段裁剪，OIDC HTTP 实际 Token/UserInfo 响应和错误保持标准形状。 |
| 56 Kernel 中性 | 共享＋源码核对 | Kernel 公开依赖不含 fence/validator/请求容器；Context Redis 用同一正式 Kernel 完成生命周期。静态核对只证明依赖边界，账号许可由外层测试证明。 |
| 57 Subject Access 集中拥有 | 共享＋源码核对 | Permission/Context Redis 覆盖 codec、许可、拒绝和撤销；三 runtime composition 共同使用 API Core 工厂，Kernel 不解释 context。 |
| 58 共享与实际入口 | 共享＋消费者 | 共享计数矩阵结合 API HTTP、OIDC HTTP、Admin HTTP/Redis 的真实作用、消费、refresh 和 Cookie 断言；低层 mock 不能替代这些协议证据。 |
| 59 维护停流/排空/统一切换 | 人工未执行 | [切换手册](../../releases/subject-access-operation-cutover.md)规定停流、drain、统一版本和认证状态清理。测试未执行目标环境停流、排空或部署，需发布负责人留存证据。 |
| 60 清理保留集/verify/回退 | 人工未执行＋文档核对 | 切换手册列 owner namespace、保留集、独立验证及回退。脚本或单元测试存在不代表环境清理完成；禁止以全库清空替代 owner 范围。 |
| 61 切换后重新登录 | 共享＋人工未执行 | Context Redis/四种认证证明新格式根可创建并被后续操作解析；目标环境切换后的真实用户重新登录、旧登录失效与各消费者联调仍由发布负责人验收。 |
| 62 测试迁移与分开记录 | 文档核对＋消费者 | 下面登记被替换测试目标与新 owner；#136/父 #128 评论登记固定候选命令和结果，切换手册另记环境步骤。不将完成切片或文档覆盖表解释为上线完成。 |

## 旧测试目标的迁移

旧 Kernel `principalAccessFence`、`validatePrincipal` 及账号失效分类测试不再作为 Kernel 契约。
账号判断迁至 Permission Component、Context Redis 和实际协议 HTTP；Kernel 原有对象期限、存在性、父子关系、唯一消费、
并发签发、记录分页、prepared revocation 继续由中性工厂验证。测试里的旧双实例 `writer/lifecycle` 过渡构造收敛到同一最终 Kernel 表面。

Custom SSO 原“在创建 Artifact/签发 Credential 中再次发现禁用”的断言，改为一次许可完成在途操作、下次调用拒绝；
logout 原账号拒绝断言改为无需账号许可仍撤销根和 Credential。Grant 消费、未知写入同步尽力补偿、补偿失败不恢复 Code、
ORCAS 失败后重新授权、Client/redirect/config、Cookie、wire 及日志保密断言继续保留。Component 为可控调度复用正式操作 Kernel binding，
真实 Redis/HTTP 另外证明生产存储与作用顺序。
API 与 Custom SSO 操作 Redis fixture 通过 `@iam/custom-sso/testing` 的 `createAuthorizationGrantRedisInspection`
按 Grant ID 取得旧库存状态/期限摘要及精确清理；key、序列化与 removal adapter 留在 Grant owner。
新 Grant 只由 Kernel Artifact 表达，完整 Redis 操作直接回读消费状态、原期限与替换对象；旧库存由
`createLegacyAuthorizationGrantFixture` 构造，OIDC cleanup 继续验证目标与非目标保留。
#158/#159 按 ADR-0031 退役原 Code 恢复断言，保留消费前暂态无作用、一次赢家和同步尽力补偿证明。

Projection 原 Barrier/permission 双工厂重复矩阵合为唯一 permission 矩阵，删除仅证明旧工厂独立 Barrier 的测试。
资料、选择、错主体、授权 freshness、字段裁剪和协议输出断言没有随旧工厂删除。旧 live account 查询追加拒绝的测试目标
迁为已许可资料读取不按 enabled/deleted 过滤；ORCAS Profile 缺失、查询异常、OIDC account/Facts 缺失及 Admin profile 失败仍保留。

## 代码验收与环境验收边界

本规格没有要求新增完整系统 E2E 或自动维护切换演练。实际执行的 Unit、Component、Redis、PostgreSQL、Composition、
Process、Browser 与静态检查分别按候选记录；未执行通道不得写为通过。Browser 的 mocked backend 只证明页面交互，
HTTP/Redis 的内嵌 runtime 不能证明部署网络、Gateway 停流、进程统一版本或人工 drain。

故事 59–61 的目标环境操作保持未执行，直到发布负责人按切换手册记录环境、统一版本、精确清理与独立 verify、
新登录/旧登录结果及回退判据。批准实施 #128 或完成代码验收均不授权生产清理、部署或流量操作。
