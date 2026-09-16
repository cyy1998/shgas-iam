# API OIDC 发布与回滚手册

Type: runbook
Status: Current
Last verified: 2026-09-16
Next review: 2026-10-31

## 发布前提

当前 OIDC 由 `apps/api` 的 Bun runtime 与 `@iam/oidc` 提供；旧 `apps/oidc-provider`、独立镜像和 Provider Cookie key 已退役。
本地代码验证不表示已切换环境。统一会话模型的首次升级见[统一维护手册](unified-session-maintenance.md)；
本次从无 issuer 的 unified 布局切换双 issuer，执行下文的固定旧工具全会话清理与协调发布，不重跑先前模型迁移。

API 必填 `IAM_API_SSO_INTERNAL_ORIGIN`、`IAM_API_SSO_EXTERNAL_ORIGIN` 与 `IAM_API_OIDC_CURRENT_JWK_JSON`。
两项 origin 仅允许 HTTP(S)、无用户信息、非根路径、query、fragment、空白或反斜杠；规范化后各自加 `/oidc`。
两值相同形成同一 issuer，不能按入口标签拒绝。独立单 issuer/public-origin 输入已退役；移除旧环境配置，
由 API/Gateway/前端协调切换。两个 issuer 共用当前/previous 签名密钥；JWK 使用受控 Secret 注入，禁止临时生成生产密钥。
其他 `IAM_API_OIDC_*` 包括 previous JWK、namespace、各协议 TTL、login path 与 secure Cookie，准确默认值以
[API env](../../apps/api/.env.example)为准。API/Admin 必须共用 Kernel namespace 与根期限；协议 Token TTL 不续根。

Gateway 的 `/oidc` route 保持路径并转到 API upstream，不做 `/oidc` rewrite。`/oidc/health`、`/health` 延续 Redis 探测语义，Redis 故障返回 503；
`/ready` 检查真实 PG/Redis；健康不等于 Client 配置或全部协议可用。部署前在固定配置上执行 Gateway validate/diff，
实际 apply 与 TLS、代理信任、来源网络及 readiness 由发布负责人核对。

## 双 issuer 的入口与状态切换

Gateway 的 `oidc-internal` / `oidc-external` routes 按部署 host 覆盖 `X-IAM-Entry-Network`；dev 使用包含端口的
`http_host` authority，prod 使用 host。API 只接受 internal/external，按固定配置选择 issuer，不从任意 Host、Forwarded
或 query 生成身份；`OIDC_TRUST_PROXY` 仍仅影响客户端 IP。直连限制须由发布 owner 核验，合法 header 本身不能证明来源可信。
替换旧路由时必须按 Gateway 手册对指定 scope 执行 diff/dry-run/prune，确认旧无 host 的 `oidc-provider` 对象已删除；
只新增两条路由会留下未知 host 旁路。验证调用方伪造头被覆盖、未知 host 不交付协议，以及两入口实际可达。

新增 OIDC 授权/Code/续接、Access Token 与退出确认记录的必填 issuer；当前在线与维护 decoder 都严格读取新 schema。
无 issuer 的旧 unified 状态必须用固定旧候选 **`5c6707efbf2069649f2c3ea4396bffbd28dcab96`** 及其 lockfile/工具制品处理，
不能用新 decoder inventory 代替，也不能线上 fallback。记录固定制品 digest 与实际三个 namespace；停流并排空后，
按[统一会话维护](unified-session-maintenance.md)以 `layout=unified`、`owner=all`、无 Client filter，分别新进程执行
inventory、apply、verify。清理包括根、应用关系和两协议产物/索引；失败或未知保持停流，按原精确范围重跑。
本次不重跑旧 Provider source 清理、Client 迁移、Secret 换新或 Snapshot 全量修复。

清零后协调启动新一代，分别验证两入口的新登录、Discovery/授权响应 `iss`、Code/Token/UserInfo、退出取消/确认；
错 issuer Code 在认证和原关系定位后一次消费并有界撤销原 ClientSession，改回原入口也不能重试旧 Code。
其他产物错 issuer 拒绝而不消费续接/确认、不清 Cookie、不撤根。同根同 Client 的关系共享，终止会影响两个 issuer 的在线 Token。
不同 hostname 各自持有 Cookie；同主机不同端口可能共享 Cookie，不能用双端口测试证明域名隔离。不新增跨域免登录。
账号、Client/凭据、审计和非会话 Redis 值/绝对期限须比较独立基线；离线 ID Token 与第三方本地登录不因 IAM 清理立即失效。

#199 提供协议 HTTP/真实 Redis、配置和新状态维护证明；#200 承担真实 Gateway/不同 hostname 浏览器、两套协议检查及旧状态
升级联合演练。实际结果与固定候选由对应 issue 记录。当前没有执行目标环境停流、清理或发布。

### 本次双入口维护窗口的执行顺序

下列步骤仅适用于已经采用 ADR-0035 unified 会话布局、尚未采用 issuer 绑定的环境。仍处于旧 Provider/source
布局的环境不满足本流程前提，应另行选择匹配其实际版本的升级手册。先前模型迁移的完成不能由仓库 HEAD 推断。

1. 发布负责人固定源 API、目标 API/Admin API/Worker/Gateway/前端、回退候选及其配置身份，保存匹配
   `5c6707efbf2069649f2c3ea4396bffbd28dcab96` 的旧维护制品及冻结 lockfile。记录制品摘要、Redis primary/DB
   和三个 owner 的实际 namespace，独立保留业务库与非会话 Redis 的基线。不得把新 decoder 报告的未知旧记录当作无库存。
2. 关闭登录、Custom/OIDC、Admin 会话操作、直连与自动重试入口；停止所有旧 reader/writer 和有关后台/one-shot
   操作，并确认各副本在途请求完成。维护参数只是操作员声明，不能替代真实停流/排空证据。
3. 在固定旧制品中显式注入 Worker Redis 配置，分别启动三个独立进程。下列 namespace 必须逐项替换为步骤1
   的精确值；Custom 当前通常与 Kernel 共用配置，但仍须独立核对，不凭默认值猜测。

   ```bash
   pnpm --filter @iam/worker online-auth:state -- inventory --layout unified --owner all --kernel-namespace '<actual-kernel>' --custom-namespace '<actual-custom>' --oidc-namespace '<actual-oidc>' --writers-stopped --drained
   pnpm --filter @iam/worker online-auth:state -- apply --layout unified --owner all --kernel-namespace '<actual-kernel>' --custom-namespace '<actual-custom>' --oidc-namespace '<actual-oidc>' --writers-stopped --drained
   pnpm --filter @iam/worker online-auth:state -- verify --layout unified --owner all --kernel-namespace '<actual-kernel>' --custom-namespace '<actual-custom>' --oidc-namespace '<actual-oidc>' --writers-stopped --drained
   ```

   不添加 Client filter。全范围 verify 是独立 SCAN 观察，所有 owner matching 必须为零；apply 删除数量不能替代它。
   无 TTL、缺索引、孤立索引也须在各 owner 范围核验。未知、changed、未完成批次、超时、提交丢响应或任何非零退出
   都保持停流；保存真实作用结果，按原布局和精确范围从 inventory 重新确认、处理原因、apply，再另起 verify。
4. 对比账号、Client 配置、SSO/Internal 凭据、审计及非会话状态基线。Redis 比较值摘要与绝对 expiry，明确列出自然
   到期；同时通过 Subject Access、Facts/Profile、普通/敏感 Snapshot 的 owner 读回其实际语义。
   本步骤不清空 Redis，不轮换 Secret、不运行 Client 迁移、旧 Provider source 清理或 Snapshot 全量 repair。
5. 协调切换 API/Gateway/前端及 env。配置两项完整 origin、安全根相对 login path、共享 current/previous JWK；
   Gateway 对固定 host 覆盖入口 header，并按当前 scope 的 diff/dry-run/prune 清除旧兜底路由。
   核验后端不可绕过、TLS/DNS、readiness 和两条入口各自的完整 Discovery。相同 origin 环境核验为同一个 issuer。
6. 在受控入口重放旧根 Cookie、两协议 Code/Token、Authentication Continuation 和退出确认，确认不能恢复旧登录。
   随后分别从内、外入口真实新登录、授权、callback、Token/UserInfo、取消/确认退出；检查相对导航、host-only Cookie、
   固定跨入口 Custom callback、伪造 header 覆盖和未知 host 拒绝。接入方独立校验本次 `iss`、签名、audience、nonce
   及业务回调配置。全部完成后由发布负责人逐入口恢复流量，保留控制面 read-back 与执行时间。

若步骤5或6失败，关闭受控入口并排空新候选；使用与新 schema 匹配的维护工具清理演练中新建的在线状态并独立 verify，
再恢复已固定的兼容回退应用、Gateway、前端和配置。回退后仍要求重新登录与完整 smoke，不恢复旧会话备份、不混跑
无 issuer 与带 issuer reader/writer。业务数据未在本次流程迁移，不把恢复数据库或重新执行旧模型迁移加入自动回退。
第三方本地登录、ORCAS 会话与未过期离线 ID Token 仍由对应外部系统和有效期负责；不能将 IAM 在线清零写成它们即时失效。

## JWK Signing Key Rotation

1. 生成唯一 `kid` 的 RS256 RSA private JWK，存入受控 Secret 配置。
2. 将旧 current 设为 `IAM_API_OIDC_PREVIOUS_JWK_JSON`，新值设为 current；滚动期间各 API 副本须有一致核验集合。
3. 部署后核对 Discovery 的 issuer/JWKS URL 不变，JWKS 同时提供两份 public key 且不含私钥参数。
4. 真实 RP authorize/token，验证 ID Token 新 `kid`、签名、issuer/audience/nonce/expiry；旧未过期 Token 仍可核验。
5. 等旧 ID Token 最长期限与实际副本排空后移除 previous，再核对 JWKS。

重复 kid、非法 RSA 或缺少 current 必须启动失败；不降级为内存 key。配置和签名 tests 属于 API/package owner，
#195 官方固定套件单独验收，不能以本地 smoke 代替。

## 逐 Client 与故障 smoke

Client 选择唯一 OIDC，设置合法 redirect/post-logout URIs、scopes、Public/Confidential 和独立当前 SSO Secret。
Public 使用 PKCE S256；Confidential 同时使用 Basic 与 PKCE。普通详情不含 Secret，授权的窄读取需审计。
核对 authorize/resume/token/me、当前 UserInfo 披露与 ID Token IAM claim 排除、Code replay/PKCE 失败后重授权、
Maintenance 暂态保留、恢复访问、取消退出保留及确认退出终止请求当前根。

依赖不可用时协议返回暂态且保留可恢复 Cookie；readiness 变为不可用，恢复后重新探测。API 的结构化
`oidc_server_error`（error）与 `oidc_protocol_error`（warn）仅含安全 code/outcome/path/status；
确认 Grafana 在 `service=api` 查询，不能继续依赖旧 Provider service/event。观测细节见[日志手册](observability-system-logs.md)。

## 回滚与验收记录

统一升级的数据库与状态回退只按[统一维护手册](unified-session-maintenance.md)，不能用旧 Provider 镜像连接最终收缩 schema。
保存固定候选、镜像、配置身份、数据门禁、安全基线、原始 smoke、JWK public 观察及 cleanup/放流结论。
不可记录 private JWK、Secret、Code、Token 或 Cookie。目标环境的停流、数据迁移、部署和放流本票均未执行。
