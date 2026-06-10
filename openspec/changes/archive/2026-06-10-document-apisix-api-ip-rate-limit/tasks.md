## 1. Manifest 策略配置

- [x] 1.1 在 `gateway/apisix/manifests/dev/iam/plugin-configs.yaml` 和 `gateway/apisix/manifests/prod/iam/plugin-configs.yaml` 中新增普通 API、内部 API、SSO API 合并策略的 `plugin_config`
- [x] 1.2 在 `gateway/apisix/manifests/dev/tender/plugin-configs.yaml` 和 `gateway/apisix/manifests/prod/tender/plugin-configs.yaml` 中新增 Tender API IP 限流 `plugin_config`
- [x] 1.3 在 `gateway/apisix/manifests/dev/gds/plugin-configs.yaml` 和 `gateway/apisix/manifests/prod/gds/plugin-configs.yaml` 中新增 GDS API IP 限流 `plugin_config`
- [x] 1.4 为 `iam` 普通 API routes 绑定普通 API 限流 `plugin_config_id`，为 `iam-internal` 绑定内部 API 限流 `plugin_config_id`
- [x] 1.5 将 `iam-sso` route 从原 CORS `plugin_config_id` 切换到包含 CORS、`real-ip` 和 `limit-req` 的 SSO API 合并策略
- [x] 1.6 为 Tender API routes 绑定 Tender API 限流 `plugin_config_id`，并确认 `/minio/*` 未绑定该策略
- [x] 1.7 为 GDS API routes 绑定 GDS API 限流 `plugin_config_id`，并确认 `/webroot/*` 未绑定该策略
- [x] 1.8 检查所有目标 API routes 没有直接声明同名 `limit-req` 插件，避免覆盖 `plugin_config` 中的限流策略

## 2. 文档更新

- [x] 2.1 更新 `gateway/apisix/README.md`，说明普通 API `10/s/IP` + `burst: 20`、IAM internal `50/s/IP` + `burst: 100`、`429` 返回码和只覆盖 API routes 的边界
- [x] 2.2 在 `gateway/apisix/README.md` 中记录腾讯云 Nginx `X-Forwarded-For`、可信出口 CIDR 环境变量和禁止 `0.0.0.0/0` 的生产要求
- [x] 2.3 在 `gateway/apisix/README.md` 中记录单节点 `policy: local` 限制，以及 APISIX 横向扩容前需要切换 Redis 或 redis-cluster 策略

## 3. 验证

- [x] 3.1 运行 `pnpm gateway:apisix:validate -- --env dev:iam`
- [x] 3.2 运行 `pnpm gateway:apisix:validate -- --env dev:tender`
- [x] 3.3 运行 `pnpm gateway:apisix:validate -- --env dev:gds`
- [x] 3.4 使用生产环境变量文件或渲染环境运行 `pnpm gateway:apisix:validate -- --env prod:iam`
- [x] 3.5 使用生产环境变量文件或渲染环境运行 `pnpm gateway:apisix:validate -- --env prod:tender`
- [x] 3.6 使用生产环境变量文件或渲染环境运行 `pnpm gateway:apisix:validate -- --env prod:gds`
- [x] 3.7 如本地 APISIX 可用，对普通 API route 执行超过 `10/s/IP` + `burst: 20` 的请求验证并确认持续超限返回 `429`
- [x] 3.8 如本地 APISIX 可用，对 `iam-internal` route 执行短峰值与持续超过 `50/s/IP` 的请求验证
