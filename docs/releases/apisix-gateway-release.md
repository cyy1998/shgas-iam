# 网关管理

用于首次配置网关、发布应用配置、检查数据面和处理发布失败。开始前确认目标环境与 scope，准备配套配置和受控管理面访问权限。
手册状态与复核日期见[索引条目](../index.md#runbook-gateway)。

## 服务与首次配置

1. **准备环境配置。** 从部署方取得 APISIX 启动配置、该环境各应用的完整 YAML 和发布变量。默认目录 `tmp/gateway-config/apisix/` 由调用方保管，Git 不跟踪。开发 Compose 挂载 `config.dev.yaml`，生产默认挂载 `config.prod.example.yaml`，可通过 `APISIX_CONFIG_PATH` 指定实际文件。应用配置按 `manifests/<env>/<app>.yaml` 存放。本地开发可参照部署方提供的 `variables.dev.example.json` 准备请求变量。部署顺序见[部署手册](deployment.md#首次部署)。
2. **接通管理面。** 生产 Gateway API 位于 apps 编排，APISIX/etcd 位于 gateway 编排。Gateway API 默认通过宿主 `127.0.0.1:30004` 直连，首次发布也使用此地址。两个管理接口仅对可信管理网络开放。开发 Compose 默认在所有宿主地址发布 APISIX Admin 端口，须收紧。生产配置的 `APISIX_ADMIN_ALLOW_CIDR` 须包含 Gateway 的实际源地址，APISIX 启用 `admin_api_version: v3`。
3. **配置服务和调用凭据。** 按下表配置 Gateway 服务。另为首次发布 `prod:iam` 准备编码为 `iam`、启用且未删除的 Client，调用方使用它的 Internal API Secret。若从曾暴露该凭据的旧版本升级，先核实并轮换已暴露凭据。检查 `GET /health` 返回 200 后，按下节执行试运行，确认凭据校验和 APISIX 管理面读取均成功。

| Gateway 服务配置                                               | 运维要求                                                                                                                                                                                                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IAM_GATEWAY_DATABASE_URL`                                     | 使用专用只读账号，授予数据库 CONNECT、实际 schema 的 USAGE，以及 `public.client` 的列级 `SELECT (client_code, client_secret, status, is_delete)`。自定义 schema 时核对实际表位置。                                                            |
| `IAM_GATEWAY_APISIX_ADMIN_URL`、`IAM_GATEWAY_APISIX_ADMIN_KEY` | 提供从 Gateway 可达的 Admin API 地址（如 `http://apisix:9180/apisix/admin`）和 Admin Key。地址不含凭据、query 或 fragment。生产 Compose 从 `APISIX_ADMIN_KEY` 注入 Admin Key。                                                                |
| 执行、单次 APISIX 请求、关闭超时                               | 默认分别为 60、10、70 秒。单次请求预算不超过执行预算。发布及补偿共用执行预算，关闭预算须更长。Compose 的 310 秒关闭宽限覆盖最大关闭预算。变量及取值见[环境模板](../../apps/gateway/.env.example)和[校验规则](../../apps/gateway/src/env.ts)。 |

## 拆分后的 IAM 路由示例

[开发 manifest](../../docker/gateway/iam.dev.example.yaml) 与 [Compose 变量模板](../../docker/.env.dev.example) 配套。
将 manifest 的发布变量写入请求的 `variables`；内外网 Host 包含请求实际使用的端口。启用企微扫码时，
`IAM_WECHAT_MOBILE_HOST` 取 HTTPS 回调的 authority，Auth API 配置回调 URL 和 Agent ID，SSO API 使用同一开关状态。
APISIX 在已配置的入口上按 Host 覆盖 `X-IAM-Entry-Network`，移动回调使用公网 HTTPS 入口。
扫码和第三方回调路由关闭 OpenTelemetry 采样，APISIX 的访问日志格式也应省略查询串和扫码路径中的句柄。脱敏规则应同时匹配原始路径和 rewrite 后的路径。

更新已有 scope 时，把示例的 upstream、URI、优先级和 rewrite 合并进该环境的 YAML，沿用现有路由的
`real-ip`、限流、CORS 和其他插件配置。检查新优先级路由与原路径继承同一组策略，包括可信代理 CIDR、限流 key、
阈值和计数模式。示例中的 `plugin_config: api` 是继承这些共享插件的位置；原路由独有的配置随对应路径迁移。
若前置代理终止 TLS，按实际可信代理与 APISIX 的监听方式核对移动 HTTPS 回调后再放流。

| 兼容别名                       | 规范路径                  |
| ------------------------------ | ------------------------- |
| `/api/iam/public/user-info`    | `/api/iam/sso/user-info`  |
| `/api/iam/auth/authz`          | `/api/iam/sso/authz`      |
| `/api/iam/auth/internal-authz` | `/api/iam/internal/authz` |

切换前逐个查找业务 manifest 的 `forward-auth.uri`。写死旧容器或宿主地址的配置（例如 `http://api:30000/auth/authz`）必须更新。经 APISIX 使用上表规范入口；保留受控直连时，用户会话转到 `http://sso-api:30002/sso/authz`，M2M 转到 `http://integration-api:30005/internal/authz`，以部署中的服务发现和网络地址为准。上表重写只在经过 APISIX 时生效。
三个后端的 `/ready` 均通过后，再按下面的流程发布和验证。确认所有业务网关通过后再停旧实例。

## 发布配置

一次只向一个目标环境发布一个 scope。发布窗口内暂停其他 Gateway 实例和外部工具对同一集群的写入，准备已知良好的恢复配置。以下步骤在**同一个 Linux Bash 终端**运行，需要 curl 7.76 或更新版本及 jq。通过安全环境提供 `IAM_GATEWAY_URL`、`IAM_GATEWAY_CLIENT_SECRET` 及本次所需的私有 `variables.json`（无变量时内容为 `{}`）。

**1. 试运行一次。** 以下以 `prod:iam` 为例。核对服务地址、scope 及 YAML 文件属于同一目标。`prune` 默认为 `false`。本次确需清理旧资源时，在执行前将 `prune` 设为 `true`。试运行会校验配置、读取 APISIX 并显示差异计划。命令经文件描述符传递 API Key 和请求体，显示差异计划或 Gateway 错误码。

```bash
set +x
gateway_apply() {
  local response
  if response=$(curl --disable --silent --show-error --fail-with-body \
    --header @<(printf 'apikey: %s\n' "$gateway_api_key") \
    --header 'Content-Type: application/json; charset=utf-8' \
    --data-binary @- --url "$gateway_endpoint/apply"); then
    printf '%s\n' "$response"
  else
    jq -r '.code | strings | select(test("^GATEWAY_[A-Z_]+$"))' <<<"$response" >&2 2>/dev/null
    return 1
  fi
}

preview_gateway() {
  unset preview_request
  : "${IAM_GATEWAY_URL:?请设置 IAM_GATEWAY_URL}" "${IAM_GATEWAY_CLIENT_SECRET:?请设置 IAM_GATEWAY_CLIENT_SECRET}"
  gateway_endpoint=${IAM_GATEWAY_URL%/}
  gateway_api_key=$IAM_GATEWAY_CLIENT_SECRET
  local prune=false request preview
  request=$(jq -ne --argjson prune "$prune" \
    --rawfile yaml 'tmp/gateway-config/apisix/manifests/prod/iam.yaml' \
    --slurpfile variables 'variables.json' '
      if ($variables | length) == 1 and ($variables[0] | type) == "object"
      then {scope: "prod:iam", $yaml, variables: $variables[0], dryRun: true, $prune}
      else error("variables.json 必须含单个 JSON 对象") end
    ') || return
  preview=$(gateway_apply <<<"$request") || return
  jq -es --argjson prune "$prune" '
    (if length == 1 then .[0].data else null end)
    | if .outcome == "preview" and .dryRun == true and .prune == $prune and (.plan | type) == "object"
    then .plan else error("未确认本次发布选项") end
  ' <<<"$preview" || return
  preview_request=$request
}
preview_gateway
```

**2. 人工确认计划。** 核对 `creates`、`updates`、`deletes` 和 `ignored`。`prune` 为 `false` 时保留 `deletes` 中的候选。`prune` 为 `true` 时，逐项确认列出的候选都应删除。出现非预期对象或错误即停止。需要修改配置或 `prune` 时，按修改后的请求重新试运行并确认。

**3. 正式发布。** 沿用刚核对的目标、凭据和请求，只将 `dryRun` 改为 `false`。正式发布重新读取 APISIX 并计算计划，在写入前检查待删 Consumer 的子凭据。收到非预期响应或请求失败时，按[失败与恢复](#失败与恢复)处理。成功后经受控 Admin API 回读本次触及的对象及其引用，再完成[数据面检查](#数据面检查)。

```bash
(
  set +x
  set -eu
  request=$(jq -e '.dryRun = false' <<<"${preview_request:?请先试运行并核对计划}")
  result=$(gateway_apply <<<"$request")
  jq -ers '
    (if length == 1 then .[0].data.outcome else null end)
    | if . == "applied" or . == "no_change" then .
    else error("发布结果待核实") end
  ' <<<"$result"
)
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

- **写入前被拒绝。** 认证、输入或远端读取失败时，修正原因后按[发布配置](#发布配置)从试运行开始。`GATEWAY_SNAPSHOT_INVALID` 时核对前态。若待删 Consumer 有子凭据或无法确认子列表为空，交由凭据负责人处理。`409 GATEWAY_BUSY` 时等待原操作结束。
- **已确认补偿。** `502 GATEWAY_APPLY_ROLLED_BACK` 表示本次发布失败，触及的配置已恢复。查明原因后，如需重新发布，按[发布配置](#发布配置)从试运行开始。补偿期间已处理的业务请求仍然生效。
- **结果未知、补偿失败或实例阻断。** 正式发布超时、断连、进程退出，或收到 `GATEWAY_APPLY_UNKNOWN`、`GATEWAY_ROLLBACK_FAILED`、`GATEWAY_BLOCKED` 时，停止重发，按以下顺序恢复。

1. 保持其他写者暂停，确认原操作及可能迟到的远端调用已结束。调用方断连后，Gateway 仍可能继续发布或补偿。
2. 经受控 Admin API 回读触及的对象、引用和 Consumer 子凭据，与已知良好的 YAML 和可用前态比对。修复现场并核验，有独立子凭据的对象由其负责人处理。
3. 现场核验后再重启被阻断的 Gateway 实例，解除内存阻断。重启本身不会恢复 APISIX 配置。
4. 如需重新发布，选定本次使用的 YAML（包括要恢复的旧版本），按[发布配置](#发布配置)试运行一次、人工确认后正式发布。回读和受影响的数据面检查均通过后再恢复业务流量及其他写者。
