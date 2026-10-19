# API OIDC 发布与密钥维护

Type: runbook
Status: Current
Last verified: 2026-09-21
Next review: 2026-10-31

本页用于当前 API OIDC 的配置发布、签名密钥轮换、验收与兼容版本恢复。
协议处理顺序及失败作用见[OIDC 接入与协议契约](../features/oidc/oidc-integration.md)；
一次性双 issuer 切换见[固定历史手册](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/oidc-release-runbook.md)，
不作为当前发布的清场步骤。

## 配置与发布前提

OIDC 由 `apps/api` Bun runtime 和 `@iam/oidc` 提供。核对固定应用、Gateway、SSO 前端与配置身份：

- API 必填 `IAM_API_SSO_INTERNAL_ORIGIN`、`IAM_API_SSO_EXTERNAL_ORIGIN`、`IAM_API_OIDC_CURRENT_JWK_JSON`。
  origin 仅允许 HTTP(S)，不得有用户信息、非根路径、query、fragment、空白或反斜杠；规范化后加 `/oidc`。
  两个 origin 相同即同一个 issuer，不能按入口标签拒绝；不同 issuer 共用 current/previous 签名密钥。
- 私钥通过受控 Secret 注入，不临时生成生产 key。namespace、Token/Code/续接期限、login path 与 secure Cookie
  按[API env](../../apps/api/.env.example)核对；API/Admin API 共用相应 Kernel namespace 和会话期限。
- Gateway `/oidc` 保留路径转发至 API。`oidc-internal`/`oidc-external` 按部署 host 覆盖
  `X-IAM-Entry-Network`；dev 按含端口的 authority，prod 按 host。API 不从任意 Host、Forwarded 或 query 生成 issuer。
  `IAM_API_OIDC_TRUST_PROXY` 仅影响客户端 IP：默认 true，取 X-Forwarded-For 首项；false 或缺头时用连接地址，
  不以 X-Real-IP/CF-Connecting-IP 替代。部署时须匹配实际可信代理边界。
- Gateway 的实际 host、API origin、SSO 地址和 RP 配置须一致。核验未知 host 拒绝、伪造入口头被覆盖、后端不能被外部直连绕过；
  合法 header 本身不能证明来源可信。TLS、DNS 与直连限制须取得目标环境证据。

Gateway 发布按[限定 scope 的 validate/diff/dry-run/apply 流程](apisix-gateway-release.md)，删除对象须明确 prune。
发布负责人核对固定候选及兼容回退配置，不将日常部署扩展为全会话清理。

`/health` 和 `/oidc/health` 探测 Redis，故障返回 503；`/ready` 检查真实 PostgreSQL/Redis。
健康成功不证明 Client 配置或完整协议可用。

## JWK 签名密钥轮换

当前实现启动时一次载入 current 和可选 previous，只有 current 签名，二者都参与 JWKS 和退出 hint 验签。
两个配置槽都要求 private JWK，不能把 public-only JWK 填入 previous；没有独立的多代验证集合或热更新。
以下采用明确停流、排空后协调替换全部副本的路径；不能从 current/previous 两槽推导无缝滚动轮换保证。
signer 随 API 进程启动，停止旧 signer 需要停止对应 API 进程，共享该进程的其他入口也须纳入维护窗口。

### 判断是否能开始

记录 current 为 A、已有 previous 为 P、新 key 为 B，保留各自 Secret 版本和 public JWK 指纹。
如果 P 仍须被任一 RP 或 IAM 退出 hint 接受，不能直接用 A 覆盖它：两槽无法同时容纳 P/A/B，本轮暂缓新轮换，
保留现有配置；如果已停流则保持维护，由负责人按明确兼容决策处理。不得默认缩短 P 的兼容期。

旧 key 的普通 ID Token 接受窗口至少按以下证据计算：全部旧副本停止签名并排空后的时点上界、实际签发的最长 TTL、
各 RP 接受的 clock tolerance，以及代理/RP 的 JWKS 缓存、主动刷新和未知 kid 重试行为。
以旧 key 最后可能签名时点加最长 TTL 和 RP 时钟宽限作为到期下界，不能仅从 Secret 更新时间计时。
RP 缓存期限本身不延长 Token 的 exp，但可能延迟新 key 可见；开放新签名流量前须证明每个 RP 能取得并使用 B。

IAM 当前 `verifyLogoutHint` 刻意接受过期 ID Token，未按 `exp` 设置 hint 退役期限。
因此等待普通 Token TTL 不能证明 previous 可移除；要保持既有 hint 兼容就继续保留该 key。
若 P 或后续 A 不能退役而业务要求再次轮换，必须先解决多代验证能力与 hint 兼容政策，不能靠手册假定旧 hint 已失效。
多代验证、滚动轮换与 hint 退役期限仍在[待讨论议题 #263](https://github.com/cyy1998/shgas-iam/issues/263)中，
该议题不构成兼容政策已经改变或新能力已经可用的依据。

### 停流、替换与开放

1. 固定全部 API 副本、入口、部署版本、配置/Secret 版本与可逐副本访问的受控地址，包含自动扩容和待重启副本。
   B 使用新且唯一 `kid` 的 RS256 RSA private JWK，通过受控密钥管理工具准备；private JWK 不进入命令行或验收记录。
2. 关闭所有 OIDC 授权、兑换、续接和退出入口及后端直连/自动重试，停止旧 API signer，排空在途请求。
   逐副本读回停止状态，记录最后可能由 A 签名的时点上界。Client Maintenance 不能代替停流或停止 signer。
3. 仅在 P 已可退役的前置判断通过后，将 A 设为 `IAM_API_OIDC_PREVIOUS_JWK_JSON`、B 设为 current，协调启动全部目标副本。
   每个副本核对实际加载的配置版本与 readiness；旧副本、旧模板或自动扩容模板仍能上线时不继续。
4. 保持业务入口关闭，按下节从受控管理路径逐副本检查 public JWKS，并检查两个实际入口的 Discovery/JWKS。
   使用受控 RP 测试流量将兑换固定到各副本，验证新 ID Token 的 B kid、签名、issuer、audience、nonce 和 expiry；
   JWKS 中同时存在 A/B 只能证明验证集合，不能单独证明每个副本确实使用 B 签名。
5. 逐 RP 清点并使用其真实配置刷新 JWKS，或等待已确认的缓存期限并实际验证 B；未知 kid 不自动刷新的 RP 不能省略刷新。
   验证旧 A Token 的剩余接受期与 A 签发的退出 hint 路径，完成[双入口验收](#双入口与逐-client-验收)后才按控制面逐项开放。
   无法证明 RP 已接受 B 时保持维护，不以反复轮询负载均衡地址代替副本和 RP 清点。

A 作为 previous 的移除是另一次受控配置发布：须同时满足普通 Token 接受窗口结束和明确的退出 hint 退役条件，
并重新停流、排空、更新全部副本及 JWKS/RP 核验。未确定 hint 退役条件时继续保留 A，不自动按 TTL 移除。
重复 kid、非法 RSA 或缺少 current 必须启动失败，不降级为内存 key。轮换不改变 issuer 身份；
共享 key 不能使不同 issuer 的 Code、Token 或续接互换。

### 逐副本与入口的 public JWKS 核验

发布清单先准备两份仅含公开信息的 JSON 文件：

- `oidc-verification-targets.json`：数组，每项有唯一 `name`、实际 `baseUrl`、`entry`（`internal|external`）、
  预期 `issuer`、`directReplica`。`baseUrl` 是不带 `/oidc` 的实际 origin；受控副本地址分别列出，两个 Gateway 入口也分别列出。
- `expected-oidc-jwks.public.json`：由受控密钥管理工具从 A/B 导出的 `{ "keys": [...] }`，只含 `kty/kid/alg/use/n/e`。
  来源和 public 指纹需与 Secret 版本关联；不从待核验端点反向生成预期值。以后满足移除条件、发布仅含 B 的配置时，预期文件也只列 B。

在该清单所在的受控目录运行下列 PowerShell 7 只读检查。副本地址须使用已经批准的管理连接/隧道，不为检查开放外网直连。
仅直连副本时显式发送受信入口头；Gateway 入口按实际 host 选择 issuer，不发送覆盖头。

```powershell
$oidcTargets = @(Get-Content -LiteralPath './oidc-verification-targets.json' -Encoding utf8 -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop)
$oidcExpected = Get-Content -LiteralPath './expected-oidc-jwks.public.json' -Encoding utf8 -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
if ($oidcTargets.Count -eq 0 -or @($oidcTargets.name | Sort-Object -Unique -CaseSensitive).Count -ne $oidcTargets.Count) {
  throw 'Missing or duplicate verification targets'
}
function Get-OidcPublicIdentity($key) {
  $allowed = @('kty', 'kid', 'alg', 'use', 'n', 'e')
  if (@($key.PSObject.Properties.Name | Where-Object { $_ -cnotin $allowed }).Count -gt 0) {
    throw 'Unexpected JWK fields'
  }
  if ($key.kty -cne 'RSA' -or $key.alg -cne 'RS256' -or $key.use -cne 'sig' -or !$key.kid -or !$key.n -or !$key.e) {
    throw 'Invalid public JWK'
  }
  [ordered]@{ kty = $key.kty; kid = $key.kid; alg = $key.alg; use = $key.use; n = $key.n; e = $key.e } | ConvertTo-Json -Compress
}
$oidcExpectedIdentities = @($oidcExpected.keys | ForEach-Object { Get-OidcPublicIdentity $_ } | Sort-Object -CaseSensitive)
if ($oidcExpectedIdentities.Count -notin @(1, 2) -or @($oidcExpected.keys.kid | Sort-Object -Unique -CaseSensitive).Count -ne $oidcExpectedIdentities.Count) {
  throw 'Expected one or two distinct public keys'
}
foreach ($oidcTarget in $oidcTargets) {
  if (!$oidcTarget.name -or $oidcTarget.entry -cnotin @('internal', 'external') -or $oidcTarget.directReplica -isnot [bool]) {
    throw 'Invalid verification target'
  }
  $oidcHeaders = if ($oidcTarget.directReplica) { @{ 'X-IAM-Entry-Network' = $oidcTarget.entry } } else { @{} }
  $oidcDiscovery = Invoke-RestMethod -Uri "$($oidcTarget.baseUrl)/oidc/.well-known/openid-configuration" -Headers $oidcHeaders -TimeoutSec 10 -ErrorAction Stop
  if ($oidcDiscovery.issuer -cne $oidcTarget.issuer -or $oidcDiscovery.jwks_uri -cne "$($oidcTarget.issuer)/jwks") {
    throw 'Unexpected issuer or JWKS URL'
  }
  $oidcJwks = Invoke-RestMethod -Uri "$($oidcTarget.baseUrl)/oidc/jwks" -Headers $oidcHeaders -TimeoutSec 10 -ErrorAction Stop
  $oidcActualIdentities = @($oidcJwks.keys | ForEach-Object { Get-OidcPublicIdentity $_ } | Sort-Object -CaseSensitive)
  if (@(Compare-Object -ReferenceObject $oidcExpectedIdentities -DifferenceObject $oidcActualIdentities -CaseSensitive).Count -gt 0) {
    throw 'Unexpected public key set'
  }
  [pscustomobject]@{ target = $oidcTarget.name; issuerVerified = $true; publicKeySetVerified = $true }
}
```

每个目标应有一条成功记录；缺目标、异常、空清单或请求被路由到其他副本均不算通过。
目标与实际副本映射须由部署控制面读回确认，脚本不能自行发现漏列副本。
public JWKS 检查与 RP 签名/缓存验收分别留证，不能互相替代。

## 双入口与逐 Client 验收

Client 选择 OIDC，核对 redirect/post-logout URIs、scopes 和 Public/Confidential 类型。
Public 使用 PKCE S256；Confidential 使用 Basic 与 PKCE。普通详情不含 Secret，
通过[授权且审计的窄读取](../features/admin/client-sso-configuration.md)取得当前值，响应丢失不要求再次轮换。

在内外入口分别核对：

- Discovery、授权响应 iss、实际 RP callback、Code 兑换、Token/UserInfo 和取消/确认退出。
  RP 校验本次 issuer、签名、audience、nonce；UserInfo 按当前披露配置交付，ID Token 内容固定。
- Code replay、错误 PKCE 和错 issuer 的结果符合协议契约。已认证且已定位原实例的 Code 兑换失败与在线访问暂态拒绝
  具有不同撤销作用，不能把 Maintenance 一概当成“保留实例”。
- 退出取消保留登录；确认退出作用于提交时观察的当前根。依赖故障保持可恢复 Cookie，
  readiness 不可用，恢复后重新探测。
- 不同 hostname 的 Cookie 隔离、相对导航、受控入口头和未知 host 拒绝。
  同主机不同端口可能共享 Cookie，双端口协议测试不能证明浏览器域名隔离；不承诺跨域免登录。

按[验证归属](../architecture/architecture-verification.md)选择 API、RP 与浏览器证据；
固定官方套件的入口及配置在[命令页](../development/commands.md#oidc-协议套件)。
本地 smoke、套件和真实环境验收各自记录，不相互冒充。

## 故障、恢复与留证

API 在 `service=api` 记录 `oidc_server_error`（error）与 `oidc_protocol_error`（warn），
仅含安全 code/outcome/path/status。按[日志手册](observability-system-logs.md)关联 requestId/traceId，
不记录 private JWK、Secret、Code、Token、Cookie 或原始请求。

发布或 smoke 失败时关闭受影响入口并排空，恢复与当前 schema/状态兼容的固定应用、Gateway、前端及配置；
重新执行 readiness 和完整受影响 smoke，再逐控制面读回放流。
密钥轮换失败还须固定本轮已经实际签名的 key 集合。若 B 已签发 Token 或 hint，不能直接恢复仅含 P/A 的旧配置而丢弃 B。
需要回到 A 签名时，可在没有第三个必须保留 key 的前提下，以 A current、B previous 协调替换并重新核验；
P 仍须保留或兼容条件未定时，两槽无法满足恢复要求，保持维护并由负责人先解决密钥集合问题，不自动删除任何所需 key。
确需清理当前在线状态或恢复 Snapshot 时另按[统一维护手册](unified-session-maintenance.md)，不能把删除计数视为恢复完成。
旧代 schema/issuer 的切换或回退须恢复匹配版本的历史流程，不能用旧 Provider 镜像连接当前数据。

记录候选、镜像、配置身份、JWK public 观察、smoke 与放流结果。
IAM 在线撤销不保证离线 ID Token 或第三方自建登录即时失效；实际部署和外部系统的恢复仍由相应负责人确认。
