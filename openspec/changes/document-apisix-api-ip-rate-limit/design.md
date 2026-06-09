## Context

APISIX manifest 目前按 `dev/prod` 和 `iam/tender/gds` 分目录管理，`apisix-sync` 会同步带有 `managed_by=shgas-iam`、`source=repo-manifest` 标签的仓库基线对象。现有路由中，IAM 的 SSO route 已通过 `plugin_config_id` 绑定 CORS，Tender 和 GDS 的部分 API route 直接配置了 `forward-auth`，Tender service 还承载了 `/minio/*` 等非 API route，GDS service 承载了 `/webroot/*`。

本变更文档化一套只覆盖 API 的网关层 IP 平滑限流策略。访问路径存在两种网络形态：内网直接访问 APISIX，无前置代理；外网访问先经过腾讯云 Nginx，再转发到 APISIX。生产 APISIX 当前为单节点。

## Goals / Non-Goals

**Goals:**

- 在 `dev` 和 `prod` 的 `iam`、`tender`、`gds` API routes 上提供统一的 IP 平滑限流基线。
- 普通 API 按每 IP `10/s` 平滑限流，并提供 `burst: 20` 的短峰值缓冲，超过阈值时返回 `429`。
- `/api/iam/internal/*` 面向内部系统互调，采用更宽松的 `50/s` 与 `burst: 100`。
- 外网经腾讯云 Nginx 访问时，仅从可信代理来源的 `X-Forwarded-For` 解析真实客户端 IP。
- 保留已有 `forward-auth`、`proxy-rewrite`、CORS 等插件行为。
- 避免误伤前端页面、静态资源、MinIO 和 Webroot。

**Non-Goals:**

- 不引入 Redis 或跨节点全局限流；生产横向扩容前另行设计。
- 不实现按用户、consumer、apikey 或内部系统身份维度的配额。
- 不改变后端 API 合约、认证授权逻辑或业务返回结构。
- 不让第三方动态注册对象直接提交任意 APISIX plugin 配置。

## Decisions

### 使用 `limit-req` 而不是 `limit-count`

普通 API 采用 APISIX `limit-req` 插件：

```yaml
limit-req:
  rate: 10
  burst: 20
  rejected_code: 429
  key_type: var
  key: remote_addr
  policy: local
```

`limit-req` 使用漏桶语义，更符合“每秒最多访问 10 次，并允许短峰值缓冲”的平滑限速预期。`limit-count` 的固定窗口在窗口边界可能允许瞬时双倍请求，不作为默认方案。

### 普通 API 保留短峰值缓冲

普通 API 使用 `burst: 20`，允许短时间突发请求在平滑限流语义下排队处理；持续超过阈值时返回 `429`。这样可以降低正常业务短峰值误伤，同时让异常持续流量仍按 HTTP 语义被限流。

### 内部 IAM 路由单独放宽

`iam-internal` 使用单独 `plugin_config`：

```yaml
limit-req:
  rate: 50
  burst: 100
  rejected_code: 429
  key_type: var
  key: remote_addr
  policy: local
```

内部调用来源 IP 当前不稳定且不可枚举，不适合做来源 IP 白名单。保留限流可以降低异常流量风险；放宽阈值和短峰值缓冲可以减少批处理、同步任务或 NAT 出口聚合带来的误伤。

### 使用 route 级 `plugin_config`

限流不放在 service 层。Tender 和 GDS 的 service 同时承载非 API route；service 级限流会影响 `/minio/*`、`/webroot/*` 或前端静态资源。route 级 `plugin_config` 是正确的行为边界。

对于已有 `plugins` 的 route，APISIX 会将 route 直接插件与 `plugin_config` 合并；同名插件以 route 直接配置优先。因此为 API route 绑定 `plugin_config_id` 不会覆盖已有 `forward-auth` 或 `proxy-rewrite`。

### SSO API 合并 CORS 与限流

APISIX route 只能引用一个 `plugin_config_id`。`iam-sso-*` 现有 CORS 不能与独立限流 `plugin_config` 同时引用，因此改为 SSO 专用策略，例如 `iam-sso-api-policy-prod/dev`，在同一个 `plugin_config` 内同时声明 `cors`、`real-ip` 和 `limit-req`。

### 在 API `plugin_config` 中配置 `real-ip`

API 限流策略同时启用 `real-ip`：

```yaml
real-ip:
  source: http_x_forwarded_for
  trusted_addresses:
    - ${TENCENT_NGINX_TRUSTED_CIDR}
  recursive: true
```

外网请求只有来自可信腾讯云 Nginx 出口 CIDR 时才采纳 `X-Forwarded-For`；内网直连请求不匹配可信代理时继续按 APISIX 看到的 `remote_addr` 限流。可信 CIDR 需要由生产环境变量注入，禁止配置为 `0.0.0.0/0`。

### 单节点使用 `policy: local`

生产 APISIX 当前为单节点，使用本地计数可以避免额外 Redis 依赖。未来 APISIX 横向扩容前，必须把限流策略改为 Redis 或 redis-cluster，否则多节点下每 IP 实际额度会按节点数放大。

## Risks / Trade-offs

- [Risk] 腾讯云 Nginx 出口 CIDR 配错或过宽会导致真实 IP 解析不准确，甚至允许伪造 XFF 绕过限流 → 生产发布前必须确认固定出口 CIDR，并在文档中禁止 `0.0.0.0/0`。
- [Risk] 普通 API `burst: 20` 会允许少量短峰值流量通过 → 这是降低正常业务误伤的取舍；持续异常流量仍会被 `429` 限制。
- [Risk] `iam-internal` 来源 IP 不稳定，按 IP 限流可能在 NAT 聚合场景下仍有误伤 → 使用较高阈值和 `burst: 100` 缓冲，后续可升级为按内部调用方身份限流。
- [Risk] APISIX 横向扩容后 `policy: local` 会放大额度 → 将切换 Redis 策略列为扩容前置条件。
- [Risk] route 上已有同名 `limit-req` 时会覆盖 `plugin_config` 中的限流策略 → 本次实施应检查目标 API routes 不直接声明同名插件。

## Migration Plan

1. 在 `gateway/apisix/manifests/{dev,prod}/{iam,tender,gds}/plugin-configs.yaml` 新增普通 API、内部 API 和 SSO API 策略。
2. 为目标 API routes 绑定对应 `plugin_config_id`，保留已有 route 级 `plugins`。
3. 将 `iam-sso-*` 从原 CORS `plugin_config` 切换到合并后的 SSO API policy。
4. 更新 `gateway/apisix/README.md`，说明限流策略、可信 XFF、环境变量、验证命令和多节点注意事项。
5. 对 `dev` 和 `prod` 的三个 app 分别运行 `validate`；生产发布前运行 `diff` 和 `apply --dry-run`。
6. 发布异常时回滚 Git manifest 并重新执行 `validate`、`diff`、`apply --dry-run` 和 `apply`。

## Open Questions

- 腾讯云 Nginx 出口 CIDR 的具体变量名和值由部署环境提供；设计要求固定、最小化且不得为全网段。
- 未来 APISIX 横向扩容时，需要在扩容变更中确定 Redis 连接、认证和失败降级策略。
