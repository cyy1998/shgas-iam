# 网关管理

Type: runbook
Status: Current
Last verified: 2026-10-25
Next review: 2026-11-25

通过独立 Gateway HTTP API 发布调用方保管的 app-centric YAML，例如 `tmp/gateway-config/apisix/manifests/<env>/<app>.yaml`。
输入及资源归属见[Gateway 配置契约](../features/gateway/gateway-configuration-api.md)，常规发布统一使用 HTTP。

## 服务与首次配置

本文引用的 `tmp/gateway-config/apisix/` 是 Git 忽略的调用方配置目录，不随 clone 提供。
先从部署方保管的配置准备该目录，再运行 Compose、校验或发布；不将实际配置和发布变量重新纳入 Git。

应用部署见[部署与发布](deployment.md)。Gateway API 在 prod apps 编排，APISIX/etcd 在 prod gateway 编排；
dev/prod Gateway 默认宿主 `127.0.0.1:30004`，不依赖尚未建立的 IAM 数据面路由。
Gateway 和 APISIX Admin API 仅对可信管理网络开放；dev APISIX Admin 的宿主映射默认监听所有地址，部署时须收紧。
`APISIX_ADMIN_ALLOW_CIDR` 必须包含 Gateway 容器实际源地址，APISIX 保持 `admin_api_version: v3`。

| 服务配置                                | 要求                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `IAM_GATEWAY_DATABASE_URL`              | 专用 PostgreSQL 只读连接；不复用 API/Admin 读写账号                                                         |
| `IAM_GATEWAY_APISIX_ADMIN_URL`          | 实际可达的 HTTP(S) Admin API base URL，如 `http://apisix:9180/apisix/admin`，不含 URL 凭据、query、fragment |
| `IAM_GATEWAY_APISIX_ADMIN_KEY`          | APISIX Admin Key，与调用方 Internal Secret 分开；Compose 从 `APISIX_ADMIN_KEY` 注入                         |
| `IAM_GATEWAY_OPERATION_TIMEOUT_MS`      | 默认 60000，最高 240000，发布与补偿共用预算                                                                 |
| `IAM_GATEWAY_APISIX_REQUEST_TIMEOUT_MS` | 默认 10000，不超过执行预算                                                                                  |
| `IAM_GATEWAY_SHUTDOWN_TIMEOUT_MS`       | 默认 70000，必须大于执行预算，最高 300000；部署关闭宽限须覆盖它                                             |

其他监听和载荷限制见[环境模板](../../apps/gateway/.env.example)。Compose 的 `stop_grace_period: 310s` 覆盖最大关闭预算。
reader role 需要 CONNECT、实际 schema 的 USAGE 及 `public.client` 的列级
`SELECT (client_code, client_secret, status, is_delete)`；自定义 schema/search_path 时核对实际位置。
Gateway 不需要 Redis、不执行 migration，应用只读设置不能代替数据库最小权限。

首次发布前准备 Enable、未删除且 code 为 `iam` 的 Client，使用其 Internal API Secret，不是 SSO Secret，`iam-admin` 不能替代。
从曾暴露 Internal 凭据的旧版本升级时，先核对公开响应并轮换确已暴露的凭据，再开放管理入口。
`GET /health` 仅证明 HTTP 就绪；发布前另行确认只读数据库访问、APISIX 健康及管理凭据。
源码启动命令为 `pnpm --filter @iam/gateway-apisix start`。

## 发布配置

适用于指定 `<env>:<app>` scope 的配置更新。发布窗口内暂停其他 Gateway 实例和外部写者的发布；实例内串行不能隔离跨实例写入。
准备完整 YAML、仅本次所需的 variables 字符串映射及已知良好的恢复配置；服务不持久保存前态、任务或发布历史。
SSL 私钥以 `${TLS_PRIVATE_KEY}` 等变量传入，YAML 不内嵌秘密；生产可信代理 CIDR 不得为全网段。

1. 从安全环境提供 `IAM_GATEWAY_URL` 和 `IAM_GATEWAY_CLIENT_SECRET`，在调用方终端准备私有 `variables.json`。
   以下是 PowerShell 7 示例；文件读取在调用方发生，不接受服务器路径，也不转发服务的整个环境：

   ```powershell
   $gatewayEndpoint = $env:IAM_GATEWAY_URL.TrimEnd('/')
   $gatewayHeaders = @{ apikey = $env:IAM_GATEWAY_CLIENT_SECRET }
   $gatewayRequest = @{
     scope = 'prod:iam'
     yaml = Get-Content -LiteralPath 'tmp/gateway-config/apisix/manifests/prod/iam.yaml' -Raw -Encoding utf8
     variables = Get-Content -LiteralPath 'variables.json' -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
     prune = $false
   }
   $validation = Invoke-RestMethod -Uri "$gatewayEndpoint/validate" -Method Post -Headers $gatewayHeaders -ErrorAction Stop `
     -ContentType 'application/json' -Body ($gatewayRequest | ConvertTo-Json -Depth 20)
   if ($validation.data.valid -ne $true) { throw 'Gateway validation did not pass' }
   $preview = Invoke-RestMethod -Uri "$gatewayEndpoint/diff" -Method Post -Headers $gatewayHeaders -ErrorAction Stop `
     -ContentType 'application/json' -Body ($gatewayRequest | ConvertTo-Json -Depth 20)
   $preview.data.plan
   ```

2. 检查目标 scope、创建/更新/删除对象及忽略项；忽略原因只应为预期的 dynamic、out_of_scope、unmanaged。
   需要清除本 scope 多余 repo-manifest 对象时先设置 `prune=true` 并重做 diff，后续请求保持同值。
   有非预期对象或请求失败时停止；diff 不冻结后续计划。
3. dry-run 后再明确提交正式发布：

   ```powershell
   $gatewayRequest.dryRun = $true
   $dryRun = Invoke-RestMethod -Uri "$gatewayEndpoint/apply" -Method Post -Headers $gatewayHeaders -ErrorAction Stop `
     -ContentType 'application/json' -Body ($gatewayRequest | ConvertTo-Json -Depth 20)
   if ($dryRun.data.outcome -ne 'preview' -or $dryRun.data.dryRun -ne $true) { throw 'Gateway preview failed' }
   $dryRun.data.plan
   ```

   确认预览后执行：

   ```powershell
   $gatewayRequest.dryRun = $false
   $applied = Invoke-RestMethod -Uri "$gatewayEndpoint/apply" -Method Post -Headers $gatewayHeaders -ErrorAction Stop `
     -ContentType 'application/json' -Body ($gatewayRequest | ConvertTo-Json -Depth 20)
   if ($applied.data.outcome -notin @('applied', 'no_change')) { throw 'Gateway apply was not confirmed' }
   ```

4. 经受控 Admin API 回读本次触及对象，核对身份、引用及预期字段，再完成受影响数据面检查。

prune 不删除 dynamic-registry、其他 app/env 或未管理对象。待删 Consumer 有独立 credential 或无法确认其子列表为空时，
整次 apply 写前拒绝；先由子凭据 owner 处理，不绕过检查。
APISIX SSL list 返回加密私钥，同源 YAML 再次提交仍可能重写 SSL；`no_change` 只表示本次实际写集为空。

## 数据面检查

只检查本次影响的 scope、路由和 upstream：

| 改动                 | 完成标准                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------ |
| host/path/upstream   | 正式入口请求到达目标服务，rewrite 后路径与响应符合接口约定                                 |
| 鉴权、前端或协议入口 | 合法及无效身份结果正确；涉及 Admin/SSO/OIDC 时完成真实浏览器流程，核对 Cookie、回调与 CORS |
| real-ip、限流        | 可信代理下 IP 正确；非可信来源伪造 X-Forwarded-For 不改写真实 IP，受控限流请求确实被拒绝   |
| Trace 配置           | 按[Trace 关联检查](observability-system-logs.md#trace-关联检查)关联网关与后端              |

IAM/Tender/GDS 共用限流变更时，核对 dev/prod 的六个 scope 配置，在目标环境验证受影响路由。
`policy: local` 按节点计数，多节点前需评估并配置 Redis/redis-cluster 计数。
回读不证明全部数据面节点同时切换；检查失败停止后续发布及受影响业务放流，按下节恢复。

## 失败与恢复

| 结果                                                    | 下一步                                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 认证、输入、远端读取或前态失败                          | 尚未写入，修正后重新校验与预览；`GATEWAY_SNAPSHOT_INVALID` 也包括待删 Consumer 子凭据检查失败 |
| `409 GATEWAY_BUSY`                                      | 等待原操作结束，不排队或自动重试                                                              |
| `502 GATEWAY_APPLY_ROLLED_BACK`                         | 本次触及配置已确认恢复，查明失败原因后明确提交新请求                                          |
| `503 GATEWAY_ROLLBACK_FAILED` / `GATEWAY_APPLY_UNKNOWN` | 恢复失败或未知，实例阻断后续 apply；按下面步骤人工恢复                                        |
| 超时、断连或进程异常退出                                | 按结果未知处理；断连后原操作可能继续，不能直接重发                                            |

未知或阻断时：

1. 停止后续发布并协调其他写者，确认原操作及可能迟到的远端调用结束。
2. 经受控 Admin API 核对本次触及对象、引用及 Consumer 子凭据，与已知良好 YAML 和可用前态比较。
3. 修复现场；确需 Admin API 应急写入时保持其他写者暂停，遵守子凭据所有权。
4. 确认现场与在途状态后再重启 Gateway。重启仅清内存阻断，不自动核验或恢复 APISIX。
5. 重做 validate、diff、dry-run，明确提交新发布，完成回读和受影响数据面检查后恢复调用方与业务入口。

恢复旧 YAML 也走相同流程，prune 只在删除范围确认后开启。
补偿允许中间配置短暂生效，不撤销业务请求作用；崩溃无自动恢复，详见[回滚与并发边界](../features/gateway/gateway-configuration-api.md#回滚与并发边界)。
