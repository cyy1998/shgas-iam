# APISIX Gateway 配置发布手册

Type: runbook
Status: Current
Last verified: 2026-07-03
Next review: 2026-10-31

## 适用范围

本手册用于发布 `gateway/manifests/<env>/<app>.yaml` 中由 Git 管理的 APISIX gateway 基线配置。事实来源包括
`gateway/README.md`、`openspec/specs/gateway-configuration-management/spec.md`、
`openspec/specs/system-log-observability/spec.md`、`gateway/src/commands.ts` 和
`gateway/src/__tests__/manifest.test.ts`。

`apisix-sync` 只管理 `labels.source=repo-manifest` 的对象，并避让 `source=dynamic-registry` 的 IAM 动态注册对象。

## 发布前置条件

- 明确 scope，格式必须是 `<env>:<app>`，例如 `dev:iam`、`prod:iam`、`prod:tender`。
- 生产 `.env.prod` 或 CI/CD 环境变量已准备，且不把 `APISIX_ADMIN_KEY`、TLS 私钥、JWT secret 或第三方密钥写入 manifest。
- 生产 `TENCENT_NGINX_TRUSTED_CIDR` 已固定且最小化，禁止 `0.0.0.0/0`。
- 已确认 `IAM_SSO_EXTERNAL_HOST` 和 `IAM_SSO_INTERNAL_HOST`，生产不保留无 host 限制的 `/sso/*` 兜底 route。
- 如终端有代理，访问内网 Admin API 前设置 `NO_PROXY` / `no_proxy`。
- 多节点 APISIX 发布前已评估限流策略；当前 `policy: local` 在横向扩容时会按节点数放大额度。

## 标准发布流程

1. 修改 `gateway/manifests/<env>/<app>.yaml`。
2. 校验 manifest：

```bash
pnpm gateway:apisix:validate -- --env prod:iam --env-file .env.prod
```

3. 查看远端差异：

```bash
pnpm gateway:apisix:diff -- --env prod:iam --env-file .env.prod
```

4. 执行 dry-run：

```bash
pnpm gateway:apisix:apply -- --env prod:iam --env-file .env.prod --dry-run
```

5. 如果本次需要删除 Git 中已移除的 `repo-manifest` 对象，dry-run 时显式带 `--prune` 并确认待删除对象全部属于当前
   `env:app` scope：

```bash
pnpm gateway:apisix:apply -- --env prod:iam --env-file .env.prod --dry-run --prune
```

6. 发布：

```bash
pnpm gateway:apisix:apply -- --env prod:iam --env-file .env.prod
```

首次 dot id 迁移或确认要删除旧对象时使用：

```bash
pnpm gateway:apisix:apply -- --env prod:iam --env-file .env.prod --prune
```

## 真实 IP、限流与多节点复核

- IAM、Tender、GDS API routes 通过 route 级 `plugin_config_id` 绑定 `limit-req`。
- `real-ip` 从可信腾讯云 Nginx 的 `X-Forwarded-For` 解析真实客户端 IP。
- 请求不来自 `TENCENT_NGINX_TRUSTED_CIDR` 时，APISIX 不信任请求自带的 `X-Forwarded-For`。
- 生产单节点可继续使用 `policy: local`；多节点前必须切到 Redis 或 redis-cluster 策略，或在发布记录中接受额度放大风险。
- 修改限流相关 manifest 后，至少校验 dev/prod 的 `iam`、`tender`、`gds` 六个 scope。

## OpenTelemetry / Alloy 交接

- `gateway/manifests/*/iam.yaml` 应保留 `opentelemetry` plugin metadata，且 `set_ngx_var: true`。
- APISIX 容器通过 `APISIX_OTEL_COLLECTOR_ENDPOINT` 指向 Alloy OTLP receiver，开发 compose 默认是 `alloy:4318`。
- Alloy 暴露 OTLP HTTP receiver，并将 APISIX span 送入配置的 tracing/debug pipeline。
- APISIX JSON access log 必须包含 `traceId`、`spanId` 和 `traceparent`，且不得包含 request body、response body、
  `authorization`、`cookie`、`set_cookie` 或原始 query args。

## Smoke 验收

- `validate`、`diff`、`apply --dry-run` 输出无未解释错误；JSON 输出中的 `ignored` 只包含预期的 `dynamic`、
  `out_of_scope` 或 `unmanaged`。
- 通过 gateway 访问 IAM public、admin、rpc、SSO 和前端 routes，确认 `proxy-rewrite`、`forward-auth`、CORS 和 host
  约束没有被误改。
- 带合法 `traceparent` 发起一次请求，确认 APISIX access log、后端 request log 和 `audit_log` 中使用同一 `traceId`。
- 不带 `traceparent` 发起一次请求，确认 APISIX OpenTelemetry 创建 trace context，并把 trace 字段写入 access log。
- Grafana `IAM Request Drilldown` 能用 `requestId` 或 `traceId` 过滤到 gateway 与 backend 日志。

## 回滚

1. 回滚 Git 中的 manifest 版本。
2. 重新执行 `validate`、`diff` 和 `apply --dry-run`。
3. 执行 `apply` 恢复基线对象；如果需要删除新版本创建的 `repo-manifest` 对象，使用 `--prune`。
4. 如需应急恢复，可先从 APISIX Admin API 导出现网配置，再整理回 manifest。
5. 回滚后重复 route、真实 IP/限流和 trace smoke。

不得用 `--prune` 删除 `source=dynamic-registry` 对象；不得跨 `env:app` scope 清理其它业务系统对象。
