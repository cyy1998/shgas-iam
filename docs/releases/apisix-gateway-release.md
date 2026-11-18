# 网关管理

Type: runbook
Status: Current
Last verified: 2026-10-25
Next review: 2026-11-25

## 服务与首次配置

1. **准备环境配置。** 从部署方取得 APISIX 启动配置、该环境各应用的完整 YAML 和发布变量。默认目录 `tmp/gateway-config/apisix/` 由调用方保管，Git 不跟踪。开发 Compose 挂载 `config.dev.yaml`，生产默认挂载 `config.prod.example.yaml`，可通过 `APISIX_CONFIG_PATH` 指定实际文件。应用配置按 `manifests/<env>/<app>.yaml` 存放。本地开发可参照部署方提供的 `variables.dev.example.json` 准备请求变量。部署顺序见[部署手册](deployment.md#首次部署)。
2. **接通管理面。** 生产 Gateway API 位于 apps 编排，APISIX/etcd 位于 gateway 编排。Gateway API 默认通过宿主 `127.0.0.1:30004` 直连，首次发布也使用此地址。两个管理接口仅对可信管理网络开放。开发 Compose 默认在所有宿主地址发布 APISIX Admin 端口，须收紧。生产配置的 `APISIX_ADMIN_ALLOW_CIDR` 须包含 Gateway 的实际源地址，APISIX 启用 `admin_api_version: v3`。
3. **配置服务和调用凭据。** 按下表配置 Gateway 服务。另为首次发布 `prod:iam` 准备编码为 `iam`、启用且未删除的 Client，调用方使用它的 Internal API Secret。若从曾暴露该凭据的旧版本升级，先核实并轮换已暴露凭据。检查 `GET /health` 返回 200 后，用下节的校验和差异预览分别确认数据库凭据读取和 APISIX 管理面读取成功。

| Gateway 服务配置                                               | 运维要求                                                                                                                                                                                                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IAM_GATEWAY_DATABASE_URL`                                     | 使用专用只读账号，授予数据库 CONNECT、实际 schema 的 USAGE，以及 `public.client` 的列级 `SELECT (client_code, client_secret, status, is_delete)`。自定义 schema 时核对实际表位置。                                                            |
| `IAM_GATEWAY_APISIX_ADMIN_URL`、`IAM_GATEWAY_APISIX_ADMIN_KEY` | 提供从 Gateway 可达的 Admin API 地址（如 `http://apisix:9180/apisix/admin`）和 Admin Key。地址不含凭据、query 或 fragment。生产 Compose 从 `APISIX_ADMIN_KEY` 注入 Admin Key。                                                                |
| 执行、单次 APISIX 请求、关闭超时                               | 默认分别为 60、10、70 秒。单次请求预算不超过执行预算。发布及补偿共用执行预算，关闭预算须更长。Compose 的 310 秒关闭宽限覆盖最大关闭预算。变量及取值见[环境模板](../../apps/gateway/.env.example)和[校验规则](../../apps/gateway/src/env.ts)。 |

## 发布配置

一次只向一个目标环境发布一个 scope。发布窗口内暂停其他 Gateway 实例和外部工具对同一集群的写入，准备已知良好的恢复配置。以下三个 PowerShell 7 代码块在**同一终端**按步骤执行。通过安全环境提供 `IAM_GATEWAY_URL`、`IAM_GATEWAY_CLIENT_SECRET` 及本次所需的私有 `variables.json`（无变量时内容为 `{}`）。

**1. 校验配置并查看差异。** 以下以 `prod:iam` 为例。核对服务地址、scope 及 YAML 文件属于同一目标。命令在调用方读取文件，只显示计划中的资源标识和忽略原因。

```powershell
$ErrorActionPreference = 'Stop'
$endpoint = $env:IAM_GATEWAY_URL.TrimEnd('/')
$post = @{
  Method = 'Post'
  Headers = @{ apikey = $env:IAM_GATEWAY_CLIENT_SECRET }
  ContentType = 'application/json; charset=utf-8'
}
$request = @{
  scope = 'prod:iam'
  yaml = Get-Content -LiteralPath 'tmp/gateway-config/apisix/manifests/prod/iam.yaml' -Raw -Encoding utf8
  variables = Get-Content -LiteralPath 'variables.json' -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
}
$body = $request | ConvertTo-Json -Depth 20
$validation = Invoke-RestMethod @post -Uri "$endpoint/validate" -Body $body
if ($validation.data.valid -ne $true) { throw '配置校验失败' }
$diff = Invoke-RestMethod @post -Uri "$endpoint/diff" -Body $body
if ($diff.data.outcome -ne 'preview') { throw '未取得差异计划' }
$diff.data.plan | ConvertTo-Json -Depth 10
```

**2. 核对删除范围并试运行。** 逐项核对 `creates`、`updates`、`deletes` 和 `ignored`。默认保留 `deletes` 中的候选。仅在本次确需删除且已核对全部候选时，将下面的 `prune = $false` 改为 `prune = $true` 后执行。试运行只预览。正式发布才检查待删 Consumer 的子凭据。出现非预期对象或错误即停止。

```powershell
$applyRequest = $request + @{ dryRun = $true; prune = $false }
$preview = Invoke-RestMethod @post -Uri "$endpoint/apply" -Body ($applyRequest | ConvertTo-Json -Depth 20)
if ($preview.data.outcome -ne 'preview' -or $preview.data.dryRun -ne $true -or $preview.data.prune -ne $applyRequest.prune) {
  throw '未确认本次发布选项'
}
$preview.data.plan | ConvertTo-Json -Depth 10
```

**3. 确认试运行计划后发布。** 沿用刚核对的 `$applyRequest`，只切换 `dryRun`。正式发布会重新读取远端并规划。成功后经受控 Admin API 回读本次触及的对象及其引用，再完成[数据面检查](#数据面检查)。

```powershell
$applyRequest.dryRun = $false
$result = Invoke-RestMethod @post -Uri "$endpoint/apply" -Body ($applyRequest | ConvertTo-Json -Depth 20)
if ($result.data.outcome -notin @('applied', 'no_change')) { throw '发布结果待核实' }
$result.data.outcome
```

## 数据面检查

| 改动                  | 完成标准                                                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| host、路由、upstream  | 从正式入口访问，核对目标服务、rewrite 后路径及响应。接管已有路由前按 URI 和 host 查重，尤其留意远程开发环境已有的 Contract API、Tender/MinIO 未管理路由。`prune` 会保留这些对象。 |
| SSO、OIDC、鉴权、前端 | 核对内外网域名、监听端口和可信入口标记，按[双入口配置](authentication-and-session.md#oidc-双入口配置)走一次受影响的浏览器登录或回调，并检查拒绝场景、Cookie 与 CORS。             |
| 真实 IP、限流         | 生产只信任实际前置代理的最小 CIDR。核对受控请求的来源 IP 和限流响应。IAM/Tender/GDS 共用策略变更时核对 dev/prod 六个 scope。`policy: local` 按节点计数，扩容前核对共享计数方案。  |
| Trace                 | 用[日志与 Trace 检查](observability-system-logs.md#trace-关联检查)关联同一次请求的网关与后端记录。                                                                                |

任一受影响入口未通过检查时，暂停后续发布及该入口的放流。Admin API 回读成功只确认管理面状态。

## 失败与恢复

- **写入前被拒绝。** 认证、输入或远端读取失败时，修正原因再校验和预览。`GATEWAY_SNAPSHOT_INVALID` 时核对前态。若待删 Consumer 有子凭据或无法确认子列表为空，交由凭据负责人处理。`409 GATEWAY_BUSY` 时等待原操作结束。
- **已确认补偿。** `502 GATEWAY_APPLY_ROLLED_BACK` 表示本次发布失败，触及的配置已恢复。查明原因再决定是否重新发布。补偿期间已处理的业务请求仍然生效。
- **结果未知、补偿失败或实例阻断。** 正式发布超时、断连、进程退出，或收到 `GATEWAY_APPLY_UNKNOWN`、`GATEWAY_ROLLBACK_FAILED`、`GATEWAY_BLOCKED` 时，停止重发，按以下顺序恢复。

1. 保持其他写者暂停，确认原操作及可能迟到的远端调用已结束。调用方断连后，Gateway 仍可能继续发布或补偿。
2. 经受控 Admin API 回读触及的对象、引用和 Consumer 子凭据，与已知良好的 YAML 和可用前态比对。修复现场并核验，有独立子凭据的对象由其负责人处理。
3. 现场核验后再重启被阻断的 Gateway 实例，解除内存阻断。重启本身不会恢复 APISIX 配置。
4. 从校验、差异预览和试运行重新开始，确认计划后发布。恢复旧 YAML 也遵循同样流程。回读和受影响的数据面检查均通过后再恢复业务流量及其他写者。
