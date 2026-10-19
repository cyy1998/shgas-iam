# APISIX Gateway 配置发布手册

Type: runbook
Status: Current
Last verified: 2026-10-16
Next review: 2026-10-31

## 适用范围

本手册通过独立 Gateway HTTP API 发布调用方保管的 app-centric YAML，包括仓库
`apps/gateway/manifests/<env>/<app>.yaml` 中的 IAM 基线。输入、结果和恢复边界以
[Gateway 配置 API 契约](../features/gateway/gateway-configuration-api.md)为准。
旧直接发布 CLI 和根 `gateway:apisix:*` 已退役，常规发布统一通过 HTTP。

## 服务配置与部署

dev 使用 `docker/docker-compose-dev.yml`，prod 使用 `docker/docker-compose-gateway-prod.yml`；
`gateway-api` 独立构建自 `apps/gateway/Dockerfile`，默认向宿主 `127.0.0.1:30004` 映射，
不经过尚未建立的 IAM 路由。直连入口和 APISIX Admin API 均只对可信管理网络开放。
Gateway API 的 dev/prod 默认宿主映射均为 loopback；既有 dev APISIX Admin 映射默认监听所有宿主地址，prod 默认仅 loopback，
部署方须按现场管理网络约束访问。APISIX 的 `APISIX_ADMIN_ALLOW_CIDR` 还须覆盖 Gateway 容器的实际源地址；
宿主 loopback 端口映射不能代替容器间访问的 allowlist。
APISIX dev/prod config 显式设置 `admin_api_version: v3`，不能保留不匹配的旧响应格式。

| 变量                                    | 必填 / 默认值 | 约束                                                                                                 |
| --------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| `IAM_GATEWAY_DATABASE_URL`              | 必填          | IAM PostgreSQL 专用只读连接，dev/prod 均显式提供。                                                   |
| `IAM_GATEWAY_APISIX_ADMIN_URL`          | 必填          | HTTP(S) Admin API base URL，例如 http://apisix:9180/apisix/admin，不含 URL 凭据、query 或 fragment。 |
| `IAM_GATEWAY_APISIX_ADMIN_KEY`          | 必填          | APISIX Admin Key，与调用方 Internal Secret 分开。                                                    |
| `IAM_GATEWAY_HOSTNAME`                  | 0.0.0.0       | 服务监听地址，宿主映射范围由 Compose 控制。                                                          |
| `IAM_GATEWAY_PORT`                      | 30004         | 1–65535。                                                                                            |
| `IAM_GATEWAY_MAX_REQUEST_BYTES`         | 1048576       | 1 字节至 16 MiB，包含 YAML 和变量的 JSON 总大小。                                                    |
| `IAM_GATEWAY_OPERATION_TIMEOUT_MS`      | 60000         | 正整数，最高 240000；覆盖远端读取、正向写入和必要补偿。                                              |
| `IAM_GATEWAY_APISIX_REQUEST_TIMEOUT_MS` | 10000         | 正整数，不超过执行预算，每次请求还受剩余总预算限制。                                                 |
| `IAM_GATEWAY_SHUTDOWN_TIMEOUT_MS`       | 70000         | 大于执行预算，最高 300000。                                                                          |

配置模板为 `apps/gateway/.env.example`、`docker/.env.dev.example` 和 `docker/.env.prod.example`。
Gateway 不需要 Redis，也不执行 migration、创建 schema 或角色。部署负责人事先准备专用 reader role，
授予数据库连接、适用 schema 的 USAGE，以及 `public.client` 上
`SELECT (client_code, client_secret, status, is_delete)` 的列级读取权限；表使用既有默认 public schema，
自定义 search_path 的部署应对应核对实际 schema。不要复用 API/Admin 的读写账号。
应用 pool 上限为 4，设置 default_transaction_read_only，连接与查询预算不超过 10 秒；
应用级只读设置不能代替数据库角色的最小权限。

源码启动使用 `pnpm --filter @iam/gateway-apisix start`（`bun src/main.ts`），开发监听使用 dev。
dev Compose 等待数据库与 APISIX 健康，prod Compose 等待 APISIX，外部 IAM 数据库由部署负责人先核对连通性与权限。
`GET /health` 的 200 仅证明 HTTP 就绪，
不证明数据库认证、APISIX 可读写或业务路由已经发布；关闭期间返回 503。
SIGTERM/SIGINT 停止新工作并等待在途操作和数据库连接关闭，关闭期限耗尽失败退出。
Compose 的 `stop_grace_period: 310s` 覆盖允许的最大 300 秒关闭预算；其他部署须保留相应余量。

## 发布前置条件

- 明确 `<env>:<app>` scope；prod:iam 的 app 精确匹配当前 IAM Client code iam。
  Client 必须 Enable、未删除，apikey header 提交其 Internal API Secret，不使用 SSO Secret。
  首次发布前通过已有 Client 管理流程准备 iam 和 Internal Secret，iam-admin 不能替代，也没有免认证入口。
- 从曾暴露 Internal 凭据的版本升级时，核对公开 Client 状态响应。当前匿名入口和 OpenAPI 只公开 clientCode、clientName、status、url；
  若现场旧版本或入口已暴露 Internal 凭据，先轮换这些凭据再开放 Gateway 管理。仓库静态问题不证明生产已经泄露。
- 同一 APISIX 集群的发布窗口由部署负责人统一协调写入口，暂停其他 Gateway 实例和外部写者的并发发布。
  代码只串行当前实例，没有分布式锁、唯一实例检测或跨实例隔离。
- 准备完整 YAML 和本次 variables 字符串映射，不在 YAML 写入 TLS 私钥、JWT secret 或第三方密钥。
  变量不回退服务环境，不接受服务器文件路径；SSL 使用 `private_key: ${TLS_PRIVATE_KEY}`，key 仍为本地名。
- 保留调用方已知良好的 YAML 和发布前现场资料；服务没有持久前态、发布历史或任务结果查询。
- 生产可信代理 CIDR 固定且最小化，禁止 TENCENT_NGINX_TRUSTED_CIDR 为全网段；
  核对 SSO 内外网 host、CORS、forward-auth 和 proxy-rewrite。按实际代理配置为管理入口设置 NO_PROXY。

## 标准发布流程

1. 修改并 review YAML，准备只含本次所需变量的私有 variables.json，例如生产 upstream、host、CIDR 和证书变量。
   不将该秘密文件、生成的请求 JSON 或 Secret 写入 Git、日志和验收记录。
2. 从仓库根目录在 PowerShell 构造请求，URL 和 Client Secret 由发布终端安全环境提供：

```powershell
$gatewayEndpoint = $env:IAM_GATEWAY_URL.TrimEnd('/')
$gatewayHeaders = @{ apikey = $env:IAM_GATEWAY_CLIENT_SECRET }
$gatewayRequest = @{
  scope = 'prod:iam'
  yaml = Get-Content -LiteralPath 'apps/gateway/manifests/prod/iam.yaml' -Raw -Encoding utf8
  variables = Get-Content -LiteralPath 'variables.json' -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
}
$validation = Invoke-RestMethod -Uri "$gatewayEndpoint/validate" -Method Post -Headers $gatewayHeaders -ErrorAction Stop `
  -ContentType 'application/json' -Body ($gatewayRequest | ConvertTo-Json -Depth 20)
if ($validation.data.valid -ne $true) { throw 'Gateway validation did not pass' }
$preview = Invoke-RestMethod -Uri "$gatewayEndpoint/diff" -Method Post -Headers $gatewayHeaders -ErrorAction Stop `
  -ContentType 'application/json' -Body ($gatewayRequest | ConvertTo-Json -Depth 20)
$preview.data.plan
```

IAM_GATEWAY_URL（本机可为 http://127.0.0.1:30004）和 IAM_GATEWAY_CLIENT_SECRET 是示例调用方变量，
不属于服务启动配置。文件读取发生在调用方终端；variables.json 必须是字符串映射，按对应 manifest 占位符准备，
不把服务启动环境整体转发。

3. 检查 data.plan 中的创建、更新、删除候选和忽略项；忽略原因只应含预期的 dynamic、out_of_scope、unmanaged。
   核对资源数量、目标 scope 和每项差异；有非预期对象或请求失败时停止，不继续 apply。
   diff 是观察时预览，不冻结后续发布计划。
4. 先 dry-run；需要删除当前 scope 内多余 repo-manifest 对象时，预览和正式请求均显式设 prune=true：

```powershell
$gatewayRequest.dryRun = $true
$gatewayRequest.prune = $false
$dryRun = Invoke-RestMethod -Uri "$gatewayEndpoint/apply" -Method Post -Headers $gatewayHeaders -ErrorAction Stop `
  -ContentType 'application/json' -Body ($gatewayRequest | ConvertTo-Json -Depth 20)
if ($dryRun.data.outcome -ne 'preview' -or $dryRun.data.dryRun -ne $true) {
  throw 'Gateway dry-run result was not confirmed'
}
$dryRun.data.plan
```

5. 确认后明确提交正式发布：

```powershell
$gatewayRequest.dryRun = $false
$applied = Invoke-RestMethod -Uri "$gatewayEndpoint/apply" -Method Post -Headers $gatewayHeaders -ErrorAction Stop `
  -ContentType 'application/json' -Body ($gatewayRequest | ConvertTo-Json -Depth 20)
if ($applied.data.outcome -notin @('applied', 'no_change')) {
  throw 'Gateway apply result was not confirmed'
}
```

响应为 `{code,data,message}` envelope；HTTP 200 的 data.outcome 分别为 preview、no_change 或 applied，
后两者以 written:false/true 区分是否写入。只有正式完成确认才返回 applied，失败即使补偿成功也不返回成功。
APISIX SSL list 返回加密私钥，含明文私钥变量的相同源配置再次提交仍可能显示 SSL update 并重写；
Gateway 不自行解密比较，no_change 只表示当前实际写集为空，不是七类重复提交均无写入的保证。

6. 通过受控 APISIX Admin API 回读本次触及的对象，核对资源身份、引用和预期字段，再执行下述受影响数据面 smoke。
   仅配置 API 验证时，PostgreSQL、APISIX/etcd 和 Gateway 足以证明请求与回读；
   业务路由放流还必须有对应 upstream/runtime 及真实调用证据。回读不证明所有数据面节点同时切换。

prune 只删除当前 scope、来源规则允许的对象，不清理 dynamic-registry、其他 app/env 或未管理对象。
资源标识与归属见[YAML 契约](../features/gateway/gateway-configuration-api.md#yaml-配置与资源归属)。
待删 Consumer 如有独立 credential 子资源，或无法确认子列表为空，整次 apply 写前拒绝且不阻断。
先由子凭据实际 owner 处理，再重新预览和提交；不绕过检查，也不把子树当作七类恢复集合。

## 真实 IP、限流与 Smoke

发布前列出受影响 scope、路由和对应 upstream，以及合法身份、无凭据/错误身份等预期结果；
对未涉及的业务不扩大操作范围。仅 `health=200` 或 API apply 成功不能代替下面的数据面检查。

| 检查                  | 执行与通过条件                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| host/path 与 upstream | 通过正式业务入口发送受控请求，确认到达预期服务，rewrite 后路径和响应符合该接口约定；不只检查网关返回 200。                                                 |
| 认证与浏览器入口      | 对需要鉴权的路由分别检查合法和无效身份；涉及 Admin、SSO、OIDC 或前端时完成对应浏览器流程，确认 host、Cookie、回调与 CORS。                                 |
| 真实 IP 与限流        | 核对受影响路由的 plugin_config，在可信代理与非可信来源分别检查 IP 观察；非可信来源自带 X-Forwarded-For 不能改写真实 IP。使用受控限流请求确认实际拒绝行为。 |
| 日志关联              | 按[Trace 发布前置](observability-system-logs.md#trace-发布前置)及[Trace Smoke](observability-system-logs.md#trace-smoke)确认同一请求的网关/后端关联。      |

IAM、Tender、GDS 的共用限流配置变化时，核对 dev/prod 中 iam、tender、gds 六个 scope 的配置，
再在本次目标环境执行受影响路由的 smoke。real-ip 仅信任配置的腾讯云 Nginx CIDR。
单节点使用 policy:local；多节点前评估并切换 Redis 或 redis-cluster 计数，否则额度按节点数放大。

任一回读或 smoke 失败时，停止后续发布和受影响业务放流，按下节核对现场并恢复；
记录目标、结果、requestId/traceId 与时间窗口，不记录凭据或未经裁剪的配置。Alloy debug exporter 不证明持久 trace 存储可用。

## 失败、补偿与人工恢复

| 观察到的结果                                        | 操作责任                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| 认证、输入、远端读取或前态失败                      | 尚未写入，不进入恢复阻断；修正原因后重新校验、预览。                       |
| 409 GATEWAY_BUSY                                    | 当前实例仍在发布或恢复；等待原操作结束，不排队或自动重试。                 |
| 502 GATEWAY_APPLY_ROLLED_BACK                       | 原发布失败，已确认恢复本次触及配置；核对原因后明确决定是否提交新请求。     |
| 503 GATEWAY_ROLLBACK_FAILED / GATEWAY_APPLY_UNKNOWN | 恢复失败或作用未知，实例保留内存阻断，后续 apply 返回 GATEWAY_BLOCKED。    |
| 客户端超时、断连或进程异常退出                      | 调用方按结果未知处理，不自动重发；进程存活时原操作继续并更新最终阻断状态。 |

`GATEWAY_SNAPSHOT_INVALID` 包括本次写集中缺少必需结构的前态或载荷，以及无法确认待删除 Consumer 的子凭据为空。
例如缺少路由目标的 Upstream、缺少 uri/uris 的 Route 不会进入写阶段；修正来源或现场后可明确提交新请求，无需重启解除阻断。
七类最低结构与插件业务字段的检查边界见[功能契约](../features/gateway/gateway-configuration-api.md#回滚与并发边界)。

补偿覆盖所有已尝试目标，包括报错但可能生效的目标，恢复旧值、重建删除对象和移除本次新建对象。
它允许中间配置短暂生效，不是跨资源事务，不撤销业务请求作用。发布和补偿都不自动重试，
共享同一执行期限，没有额外恢复预算。强杀后没有自动补偿或持久恢复记录。

未知或阻断时，发布负责人依次执行：

1. 停止调用方后续发布，协调其他实例和外部写者；确认原操作与可能迟到的远端请求已经结束。
   不因响应丢失、超时或一次回读匹配就认定恢复完成。
2. 经受控 APISIX Admin API 只读导出并核对本次触及对象、引用和 Consumer 子凭据，
   对照调用方 YAML 和现场前态定位差异。只读导出不构成第二条常规发布通道。
3. 由发布负责人修复现场。确需直接调用 Admin API 应急维护时，明确 owner、暂停其他写者并保留安全操作记录；
   不绕过子凭据所有权，不把应急维护当作自动恢复保证。
4. 确认现场和在途状态后再重启 Gateway。重启只清除内存阻断，不核验恢复、不重放旧请求；
   新进程 health 成功也不证明现场恢复。
5. 重新 validate、diff、dry-run，操作者明确提交新发布，完成回读和 smoke 后恢复调用方。

恢复旧版 YAML 时，先确认没有未知或在途操作，再取回已知良好版本，按相同 HTTP 流程校验、预览和发布；
只有删除目标符合范围及恢复前提时才启用 prune。重新发布旧 YAML 同样可能失败，不能替代人工核验。
