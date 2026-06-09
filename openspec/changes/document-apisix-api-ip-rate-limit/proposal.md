## Why

IAM、Tender 和 GDS 的 API 入口目前缺少统一的网关层 IP 平滑限流策略，外部访问在异常请求或简单刷接口场景下会直接打到后端服务。需要在 APISIX manifest 中文档化并后续落地一套只覆盖 API 的限流基线，同时避免误伤前端静态资源、文件下载和内部系统互调。

## What Changes

- 在 APISIX 仓库 manifest 中为 `dev` 和 `prod` 的 `iam`、`tender`、`gds` API routes 引入基于 `plugin_config` 的 IP 平滑限流策略。
- 使用 APISIX `limit-req` 插件按 `remote_addr` 做单节点本地计数，普通 API 默认每 IP `10/s` 并提供 `burst: 20` 的短峰值缓冲，持续超限返回 `429`。
- 为 `iam` 内部互调路由提供单独放宽策略，允许每 IP `50/s` 并提供 `burst: 100` 的短峰值缓冲。
- 在 API 限流 `plugin_config` 中同时启用 `real-ip`，从可信腾讯云 Nginx 的 `X-Forwarded-For` 解析真实客户端 IP。
- 将 `iam` SSO API 现有 CORS 策略与限流策略合并到 SSO 专用 `plugin_config`，避免 route 只能引用一个 `plugin_config_id` 的限制。
- 不覆盖前端页面、静态资源、MinIO 或 Webroot 类路由。
- 无 **BREAKING** API 合约变更；调用方超过限流阈值时会收到 `429`。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `gateway-configuration-management`: 增加 APISIX 仓库基线 manifest 对 API IP 平滑限流、真实 IP 解析、内部路由放宽和发布验证的要求。

## Impact

- 影响 `gateway/apisix/manifests/{dev,prod}/{iam,tender,gds}/plugin-configs.yaml` 和对应 API routes 的 `plugin_config_id`。
- 影响 `gateway/apisix/README.md` 中网关策略、生产环境变量、验证和发布说明。
- 需要生产环境提供可信腾讯云 Nginx 出口 CIDR 占位符值；不得信任 `0.0.0.0/0`。
- 生产 APISIX 当前为单节点，限流策略使用 `policy: local`；未来横向扩容前需要重新评估并切换到 Redis 策略。
