# 网关配置接入

向运维取得目标环境的 Gateway 配置服务地址，向 IAM 管理员取得本应用的 Internal API Secret。每次请求把该凭据放在 `apikey` 请求头。对应的 Client 须启用且未删除。凭据保存在调用方服务端。[应用与凭据](README.md#应用与凭据)

## 第一次校验

以下示例使用测试环境的 `tender` Client。设置 `IAM_GATEWAY_URL` 和 `IAM_GATEWAY_CLIENT_SECRET`，将 `test:tender` 换成自己获准使用的环境与应用。用最小 YAML 验证地址、凭据和请求格式：

```bash
curl --fail-with-body -sS -X POST "${IAM_GATEWAY_URL}/validate" \
  -H "Content-Type: application/json" -H "apikey: ${IAM_GATEWAY_CLIENT_SECRET}" \
  --data-binary '{"scope":"test:tender","yaml":"service: {}","variables":{}}'
```

HTTP 200 且 `data.valid=true` 表示校验成功。示例只声明了一个 Service，`data.resources.services` 应为 1。校验不访问 APISIX。发布时换成本应用的完整配置。以 `iam` Client 校验或发布时，还需满足 [IAM 路由的日志和追踪规则](../../apps/gateway/src/validators/index.ts)。

## 准备应用配置

`scope` 格式为 `<env>:<app>`，两段以小写字母或数字开头，其余字符可用小写字母、数字或连字符。`app` 必须匹配认证 Client 的编码。调用方还需核对目标服务地址所对应的环境。域名、路径和插件的使用范围由部署方管理。[网关配置发布的业务边界](../features/application-integration.md#网关配置发布)

将完整 YAML 作为 `yaml` 字符串提交。`variables` 是可省略的字符串映射，YAML 中的 `${NAME}` 从本次请求取值，缺失会导致校验失败。私钥等秘密使用变量或外部秘密引用。以下配置将 `/api/tender/*` 转给 `api` upstream。请求时传入 `{"API_NODE":"tender.example.test:8080"}` 作为 `variables`。

```yaml
service: {}
upstreams:
  - key: api
    nodes: { "${API_NODE}": 1 }
routes:
  - key: api
    uri: /api/tender/*
    upstream: api
```

| YAML 资源                                                          | 生成的远端标识       |
| ------------------------------------------------------------------ | -------------------- |
| `service`                                                          | `<app>.<env>`        |
| `routes`、`upstreams`、`service.plugin_configs`、`ssls` 的本地 key | `<app>.<key>.<env>`  |
| `consumers` 的本地 key                                             | `<app>_<key>_<env>`  |
| `plugin_metadata` 的 key                                           | 插件名，在集群内共享 |

普通路由用本地 key 引用 upstream 或 plugin_config，自动关联本应用的 Service。`terminal: true` 的路由可直接返回重定向。SSL 声明提供 `cert` 和 `private_key`。Gateway 生成资源 ID 和归属标签，发布前核对会创建或更新的资源，尤其是集群共享的插件元数据。[配置校验器](../../apps/gateway/src/validators/index.ts)

### 配置业务路由的鉴权

用户会话的 `forward-auth.uri` 使用 APISIX 的 `/api/iam/sso/authz`，M2M 应用密钥使用 `/api/iam/internal/authz`。经 APISIX 读取 Custom SSO 主体使用 `/api/iam/sso/user-info`。三个旧路径均为 APISIX 兼容别名，映射及原后端直连的升级步骤见[网关管理](../releases/apisix-gateway-release.md#拆分后的-iam-路由示例)。

## 校验、预览、发布

三个端点均用 `POST` 提交 JSON。响应为 `{code,data,message}`。先判断 HTTP 状态，再读取相应端点的结果。

| 端点        | 请求体                                                         | 成功时如何判断                                                                                               |
| ----------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/validate` | `scope`、`yaml`、可选 `variables`                              | 读 `data.valid` 和资源数量。                                                                                 |
| `/diff`     | 与校验相同                                                     | `data.outcome=preview`。核对 `data.plan` 中的创建、更新、删除候选与忽略项。                                  |
| `/apply`    | 在共同字段上可加布尔值 `dryRun`、`prune`，两者默认均为 `false` | 试运行返回 `preview`。正式发布重新读取远端并规划，返回 `applied`（发生写入）或 `no_change`（实际写集为空）。 |

`plan.deletes` 在预览中列出删除候选。仅正式 `/apply` 同时指定 `prune:true` 才删除本 scope 下已从 YAML 移除的 `repo-manifest` 资源。动态注册、其他 scope 和未受管的资源排除在清理范围外。待删 Consumer 有独立子凭据或无法确认子列表为空时，正式发布会在写入前拒绝。APISIX 回读的 SSL 私钥已加密，重复提交同一证书配置仍可能触发更新。[请求 schema](../../apps/gateway/src/services/gateway/gateway.schema.ts)

## 判断结果与恢复

| 响应                                                                                            | 接入方动作                                                                                                                                |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 400 输入或 YAML 校验失败，401 认证失败                                                          | 按顶层 `code` 修正请求或凭据。若返回 `data.issues`，按其中的位置修正 YAML，再校验。                                                       |
| 409 `GATEWAY_BUSY`                                                                              | 等原发布结束，再决定是否发起新请求。                                                                                                      |
| 502 `GATEWAY_APPLY_ROLLED_BACK`                                                                 | 本次发布失败，已确认补偿。查明原因后重新预览。                                                                                            |
| 503 `GATEWAY_ROLLBACK_FAILED`、`GATEWAY_APPLY_UNKNOWN`、`GATEWAY_BLOCKED`，或正式发布超时、断连 | 停止重发，向运维提供目标 scope 和已知结果，按[失败与恢复](../releases/apisix-gateway-release.md#失败与恢复)核对现场。原请求可能仍在执行。 |

错误响应的 `data` 可能为空。补偿结果中的 `writeAttempted` 只表示尝试过写入。业务路由是否已按预期生效，由运维完成[数据面检查](../releases/apisix-gateway-release.md#数据面检查)。
