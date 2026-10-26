# 网关配置接入

调用方保管完整 YAML，通过 Gateway API 校验、预览和发布。部署与人工恢复见[网关手册](../releases/apisix-gateway-release.md)。

## 准备配置和凭据

`scope` 使用 `<env>:<app>`，app 为 IAM Client code；两段以小写字母或数字开头，其余仅限小写字母、数字、连字符。
Client 须启用且未删除，以其 Internal API Secret 作为 `apikey`。SSO Secret 和 APISIX Admin Key 不能替代。
首次发布 `prod:iam` 需要 iam Client 的凭据，不能使用 iam-admin。

scope 只匹配应用身份，环境仍由部署目标校验；当前没有域名/路径配额、插件审批或完整多租户隔离。
同一 APISIX 集群须保持一个写入口，发布期间也不能从其他工具修改配置。

按调用方保管的 YAML（例如 `tmp/gateway-config/apisix/manifests/dev/iam.yaml`）准备资源；配置不随 clone 提供，准备方式见[网关手册](../releases/apisix-gateway-release.md#服务与首次配置)。占位符仅从本次 variables 取值，缺失时报错；秘密使用变量或外部秘密引用。
资源名按以下规则生成，跨应用接管资源前须核对归属：

| YAML 资源                                                  | 远端标识                          |
| ---------------------------------------------------------- | --------------------------------- |
| service                                                    | `<app>.<env>`                     |
| routes、upstreams、service.plugin_configs、ssls 的本地 key | `<app>.<key>.<env>`               |
| consumers 的本地 key                                       | `<app>_<key>_<env>`               |
| plugin_metadata 的 key                                     | 插件名，全局共享，不按 scope 隔离 |

普通路由自动关联本 scope 的 Service，本地 upstream/plugin_config 按 key 引用；terminal 路由不自动添加 Service/Upstream。
SSL 的 `private_key` 对应 APISIX 私钥。Consumer 子凭据由其负责方管理，不写入此 YAML。

## 校验、预览、发布

三类请求均直接发送到 Gateway API，并携带 apikey。以校验为例：

```http
POST /validate
Content-Type: application/json
apikey: <Internal API Secret>

{"scope":"test:tender","yaml":"<完整 YAML 文本>","variables":{}}
```

1. `/validate` 只校验输入。按返回问题修正 YAML；变量值必须为字符串。
2. 同样的请求发往 `/diff`，检查远端差异；不会修改配置。
3. `/apply` 可先加 `dryRun:true` 预览。正式发布时使用 `dryRun:false`；服务会重新读取配置并规划，旧 diff 不锁定远端状态。

dryRun、prune 均默认 false。需要删除源配置已移除的资源时，明确提交 `prune:true`。
删除仅覆盖当前 app/env 下由 repo-manifest 管理的资源，忽略 dynamic-registry、其他 scope 和未管理对象；此规则不限制创建或更新权限。
待删 Consumer 必须没有独立子凭据；有子凭据或无法可靠读取时，整次发布在写入前拒绝。先由负责方清理子凭据。

请求不能指定服务器文件路径、APISIX 地址或 Admin Key。完整字段和校验规则查
[请求 schema](../../apps/gateway/src/services/gateway/gateway.schema.ts)与[配置校验器](../../apps/gateway/src/validators/index.ts)。

## 判断结果与恢复

响应使用 `{ code, data, message }`，按 data.outcome 判断：

- preview：仅预览；no_change：没有实际写入；applied：本次 Admin API 操作已完成。
- rolled_back：发布失败，已恢复本次尝试修改的资源；仍应按发布失败处理。
- rollback_failed 或 unknown：停止发布，按[人工恢复](../releases/apisix-gateway-release.md#失败与恢复)核对 APISIX，再重启解除阻断。
- busy 或 blocked：本次未读取或修改 APISIX；前态无法可靠恢复时也会在写入前拒绝。

writeAttempted 只表示尝试过写入。超时、响应丢失或未确认完成的响应不能当作失败且未生效，也不能自动重发。
调用方断连后，服务仍会在原期限内继续发布或补偿；没有任务查询或持久历史可供找回结果。
一次回读匹配仍不能排除迟到写入。重启只清除阻断，不证明恢复完成。

发布和补偿不是跨资源事务，数据面可能短暂混用新旧配置，已处理的业务请求无法撤销。
SSL 加密私钥不能与输入明文直接比较，重复发布同一证书配置仍可能触发更新。
`GET /health` 只检查 HTTP 服务；数据库认证、APISIX 和业务路由须分别验证。
