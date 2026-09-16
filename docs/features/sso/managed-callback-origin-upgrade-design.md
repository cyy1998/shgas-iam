# 托管回调 origin 推导的升级设计

本文承接 [ADR-0038](../../adr/0038-derive-managed-sso-callback-from-redirect-origin.md)。Q1–Q10 已确认，
旧 Gateway/Independent 直升来源固定为 `b6481f2de5c2930fc381d99e70520e0783091e9d`。
维护者调用 `to-spec` 将设计发布为 Spec #201。本文保留设计理由，当前执行步骤分别由
[同代手册](../../releases/managed-callback-origin-preserving-upgrade.md)和
[跨代手册](../../releases/b648-managed-callback-upgrade.md)拥有；最终执行证据见
[70故事账本](managed-callback-origin-acceptance.md)。代码与本地演练不代表目标环境已经验收。

## 直接升级的目标

在一次维护窗口内完成必要的离线配置、数据库和状态阶段，最后只启动最新业务 runtime。
不要求将中间业务版本上线供用户登录；仍须通过来源核验、数据转换和删除旧列之前的完整门禁。
中间离线工具、临时数据形状和最终线上配置是不同概念，不能把“直升”理解为跳过所有历史数据迁移。

## 先确定来源

Gateway/Independent 是旧 Custom SSO 配置模式，不能单独确定数据库及在线状态版本。
维护者已提供上述精确源 SHA；实施和演练据此固定 migration journal、旧配置形状和实际认证状态布局。
上线时另固定 PostgreSQL、Redis primary/DB 与各 namespace；不从默认值猜测，也不要求在讨论中提供凭据。

| 来源 | 数据与状态边界 |
|---|---|
| 已是当前统一会话、双 issuer 和单协议显式回调类型 | ADR-0038 Q4：只清指定托管 Client 的旧 Code/续接，保留原会话、Token，以及业务 Client/OIDC 状态。 |
| 已统一会话但 OIDC 产物尚未绑定 issuer | 既有双 issuer 升级要求全体重新登录，须用能读旧产物的固定工具清理；不能直接让最新严格 decoder 处理旧记录。 |
| 指定 b6481f2 来源：旧 Kernel 四对象、Provider 和 Gateway/Independent 配置 | Q8 已确认全体重新登录，按适用 source 与 unified 全 owner gate 处理，不迁移旧登录态；配置和凭据须先完成旧列到最新单协议的迁移。 |
| 更早或不能识别的来源 | 先确定源 schema 和适用 decoder，再补支持与演练；拒绝猜测转换或绕过未知状态。 |

现有历史固定来源证据为旧 Provider `9.9.1`、Claims Snapshot V2 及扩展期候选
`aeb2dc45294f3553ad596cda5194e9643378c31b`；无 issuer 的 unified 升级证据另固定
`5c6707efbf2069649f2c3ea4396bffbd28dcab96`。它们是两条来源证据，不代表可以任意互换工具或直接覆盖未知部署。

对指定源 SHA 的只读比较已确认：Client 旧字段和配置 schema 与扩展期候选兼容，缺少五个新 `sso_*` 列；
源 migration 最后为 `20260823091908_remove_subject_claim_catalog_version`。进入现有精确扩展期入口前必须执行新增列阶段。
旧 Gateway HTTP 授权本来按业务落地 origin 推导 `/sso/callback`，旧配置并无完整回调字段。

认证写入的逐文件比较也确认：b648 的旧 Provider 全部生产源码、Kernel 旧状态/存储/转换/keys，以及 Custom SSO
旧写入实现与已验证 aeb2 来源没有形状差异。Provider 锁定 `9.9.1`，Claims Snapshot 为 V2；当前 source decoder
覆盖这些来源，源码核对未发现需要新增 decoder 的差异。旧 Custom Code 属于 Kernel Artifact，本地 Token 属于
Kernel Credential；实际升级演练仍须使用精确 b648 writer，不能以源码比较代替动态证明。

## 旧配置进入最新模型

| 旧事实 | 最新目标与保留边界 |
|---|---|
| Custom Gateway | 显式 `managed`，最终配置无 `callbackEndpoint`；保留合法的业务落地允许列表、主体披露和 ORCAS。管理员落实各允许 origin 的 `/sso/callback` 代理。 |
| Custom Independent | 显式 `business`，保留完整业务回调；即使路径为 `/sso/callback` 也不改为 managed。旧 `logoutEndpoint` 不进入最新配置。 |
| 所选协议的 enabled | 转成统一 `ssoEnabled`，不按另一协议的状态猜测启用意图。 |
| 同 Client 同时有 OIDC 和 Custom 配置 | 沿用显式选择一个协议的 manifest，不因一方停用就静默删除其配置或代替维护者选择。删除旧列前必须完成全量 verify 和备份。 |
| Independent 或 confidential OIDC 的旧 Secret hash | Q9 接受沿用新 SSO Secret，不从哈希恢复原文；接入方在窗口内切换，凭据身份在重跑时保持。Internal API 凭据保持独立。 |
| Gateway 或 public OIDC | 不因迁移新增外部认证 Secret 要求。 |
| Client/Role、用户、业务属性及其他非目标事实 | 验证保留；配置迁移不重建 Client 身份、业务权限或用户。 |

现有迁移按冻结源 schema 和现行 Domain 规则验证地址、pattern 和 claim。来源不合法时中止，不自动放宽允许列表，
不根据路径重新猜测已知的 Gateway/Independent 模式。当前 inventory 的精确列布局与 1000 Client 上限须作为来源门禁暴露，
超出支持范围需先扩展并验证工具，不能截断或漏迁。

## 离线阶段与门禁

1. **固定和预检**：固定源、目标、回退及各维护制品，核验备份；读取源 schema/journal、Client 清单及状态布局。
   预检确认适用的扩展期入口、所有协议冲突的明确选择、受控 Secret 切换准备和业务 origin 代理清单。
2. **停止和排空**：关闭相关入口、冻结配置写入，停止新旧 reader/writer 并排空在途请求及任务。
   Client Maintenance 或 CLI 标志不替代实际停流证据。
3. **配置迁移**：真实迁移 runner 先执行并登记到 `20260914061007_romantic_maestro`，保留旧八列并加入新五列。
   按既有准备命令方式先安装所需的显式类型过渡 CHECK；基于批准 manifest 和冻结来源/中间 schema 规划全量目标，
   通过来源摘要及锁内一致性检查后写入。Independent 保留真实业务地址；Gateway 的中间地址由离线工具内部生成，
   只用于通过历史 CHECK，不要求管理员提供 `gatewayCallback`。任一未决或不合法项阻断写入；重复执行不轮换已有新 Secret。
4. **独立验证与收缩**：新进程全量核验模式映射、唯一中间值、配置、启用意图、凭据身份及非目标事实，成功后才执行并登记
   `20260914173743_confused_mystique` 删除旧列。继续原样执行并登记 `20260916050609_explicit_callback_type`，
   此时保留中间地址以通过历史 CHECK；最后执行本次新增的版本化转换，删除 managed 地址并安装最终约束。
   最终严格 verify 证明所有托管配置无地址、中间值无残留，才允许最新 runtime 启动。
   不修改历史 SQL、不跳过 journal、不掏空配置来绕过数据门禁，不将中间 schema 暴露为在线兼容能力。
5. **状态处理**：按来源表选择对应 owner 和 decoder。Q8 已接受旧版全体重新登录，旧来源执行 source 全 owner
   清理及相应目标 unified 全 owner 核验；若包含无 issuer unified 残留，使用匹配该布局的固定工具。
   旧 Custom Code 在旧 Kernel Artifact 中，Token 在旧 Kernel Credential 中，不能只清 Custom redemption。
   精确 b648 的 Custom 续接是原 query 加根 Cookie/login-guard，没有当前统一续接对象；旧 Provider Interaction 另由 Provider owner 清理。
   b648 的 redemption writer 已退役、只保留删除能力，仍运行该 source owner 的库存/清理/独立核验以拦截恢复残留。未知记录保留并阻断成功。
6. **Snapshot 与最新服务**：清理最新 Snapshot 三个缓存族，用新进程独立 verify；启动最新服务后由 reader 回源。
   数据源已经满足最新严格 schema 才开放受控 smoke，不运行中间业务版本。
7. **放流前验证**：管理配置、业务 Secret 兑换、内外网托管回调和 Cookie、两协议新登录、当前状态拒绝旧产物、
   业务数据和非目标保留均通过；接入方完成必要的 Secret/代理切换后，由发布负责人恢复流量。

这些阶段需在实现时形成一条明确且可演练的入口与命令序列。当前固定历史 manifest、当前 Worker manifest 和最新目标格式
不能混用；不能把尚未实现的无地址转换写成现有命令已经具备的能力，也不能为迁移方便重新要求最终托管配置保存地址。

指定 b648 来源自身没有 unified writer。不存在中间部署或回退残留的环境，无需仅因经过最新版本就强制再运行
无 issuer unified 的旧工具；若实际库存存在该布局，则必须另外选择匹配工具，不能让最新 decoder 猜测读取。

## 配套部署输入

同一窗口还须从 b648 的部署输入协调到最新运行图，不能仅迁移 Client 表：

- 旧独立 `oidc-provider` 服务退出运行图，OIDC 路由指向 API；按目标 Gateway 手册替换旧路由，核验未知 host
  和伪造入口 header 不形成旁路。最新内外网 origin 决定固定 issuer，接入方校验本次选定 issuer。
- 既有 current/previous OIDC JWK 通过受控配置迁入 `IAM_API_OIDC_*`，不因 Client Secret 换新而自动轮换签名密钥；
  旧 Provider 专属 issuer、Cookie keys 等退役变量不作为新 API 配置继续使用。
- API/Admin API 共同固定 Kernel namespace、UserSession 和 ClientSession 期限，Custom Token 期限独立设置；
  旧 idle/absolute/tombstone 配置不再用于调节新模型。旧源与新目标 namespace 分别记录，不能以示例默认值代替实值。
- 登录入口显式设置为目标允许的安全根相对路径；各业务 origin 的 `/sso/callback` 代理、最新 Admin/SSO 前端和
  API/Admin API/Worker 一起核验，再恢复入口。

以上差异来自指定源与当前基线的 `.env.example`、生产 Compose 和现行 OIDC 手册的只读比较；
不是已读到实际部署配置，更不表示已改动目标环境。

## 实施落点

#202 冻结离线契约并实现 origin 推导；#203 完成在线严格配置和同代数据库准备；#204 交付 owner 定向维护与同代保留演练。
#205 交付固定 b648 的阶段 runner、内部中间地址、独立进程核验收缩与最终门禁；执行步骤以
[数据库手册](../../releases/b648-client-database-upgrade.md)为准。
#206 使用精确 b648 API/独立 Provider writer 执行完整直升，并补正式双 hostname Gateway 旅程；实际结果单独登记，不能用数据库或旧分段测试替代。

## 失败与恢复

配置事务回滚只覆盖本事务。数据库已提交、收缩已完成或 Redis 已部分清理后，失败不表示零作用；
保持停流，按相同来源和精确作用范围重新 inventory、修复并独立 verify，不能根据上次计数直接放流。
收缩后的回退需要匹配的业务库/journal 备份、应用和维护制品；不靠补建空旧列恢复，也不恢复旧登录态来掩盖跨代不兼容。
Secret 分发若已经发生，回退的接入方协调也须纳入恢复计划。

## 整链验证要求

用固定支持来源产生真实旧配置和适用的旧在线状态，在任务独占 PostgreSQL/Redis 上执行正式离线入口及最新 DDL，
最后只启动最新 runtime。来源固定为维护者指定 b648 SHA；历史 aeb2 的分段证据不能替代该源到新目标的实际演练。
覆盖 Gateway、Independent、OIDC/Custom 双配置选择、来源漂移与异常中止、重复执行、
新 Secret 身份稳定、Internal 凭据和业务事实保留、历史约束过渡、状态清理门禁、Snapshot 回源及真实浏览器代理登录。
另覆盖同代增量路径，直接证明 Q4 的 Token/会话身份和期限保留。测试资源和自动化结果不替代目标环境核验。

## 来源

- [统一会话维护手册](../../releases/unified-session-maintenance.md)
- [OIDC 发布手册](../../releases/oidc-release-runbook.md)
- [旧配置规划](../../../apps/worker/scripts/b648-upgrade/upgrade-plan.ts)
- [旧配置迁移与核验](../../../apps/worker/scripts/b648-upgrade/upgrade.ts)
- [扩展期 DDL](../../../packages/db/src/migrations/20260914061007_romantic_maestro/migration.sql)
- [收缩 DDL](../../../packages/db/src/migrations/20260914173743_confused_mystique/migration.sql)
- [显式类型 DDL](../../../packages/db/src/migrations/20260916050609_explicit_callback_type/migration.sql)

Q1–Q10、完整升级设计与验证范围随 `to-spec` 定稿，发布时由 Spec 保存设计提交及分支交接记录。
本地实施及演练不代表已运行目标环境数据库迁移或部署。
