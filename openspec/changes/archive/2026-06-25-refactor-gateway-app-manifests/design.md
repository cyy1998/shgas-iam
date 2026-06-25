## Context

现有 gateway manifest 已按 `<env>:<app>` 作用域拆分，但每个 app 目录内仍以 APISIX 资源类型拆成 `routes.yaml`、`upstreams.yaml`、`services.yaml`、`plugin-configs.yaml`、`consumers.yaml` 和 `ssl.yaml`。这导致维护者在 review 一个 app 的入口时需要跨文件拼接 route、service、upstream 和 plugin_config，也让每个对象重复写 `labels`、`service_id`、`name`、默认 `priority/status/enable_websocket` 等机械字段。

目标模型是 app-centric source manifest：仓库源文件按 app 聚合，APISIX service 表达 app 边界，route 在同一 service 下通过 route 级 upstream 指向前端、后端、OIDC、文件服务等不同运行时目标。同步工具内部仍 materialize 为 APISIX Admin API 所需的平级 resources。

## Goals / Non-Goals

**Goals:**

- 将 manifest 源文件切换为 `gateway/manifests/<env>/<app>.yaml`。
- 每个 app 只 materialize 一个 APISIX service，service 不绑定默认 upstream。
- 使用本地 `key` 和点号 id 生成规则减少重复字段，同时保持远端 APISIX 对象可追踪。
- 将 `service.plugin_configs` 展开为 APISIX 平级 `plugin_configs`，让 route 通过本地 `plugin_config` 引用。
- 用 validator 强制 app service 边界、引用完整性、生成字段禁写、labels 自动注入和 terminal route 规则。
- 迁移 `dev`/`prod` 的 `iam`、`tender`、`gds` manifests，并以行为等价测试保护 route、upstream、auth、rewrite、rate limit 和 SSO 入口语义。

**Non-Goals:**

- 不保留旧 `gateway/manifests/<env>/<app>/` 多文件目录读取兼容。
- 不引入 `defaults` 继承段；upstream 行为字段仍显式声明。
- 不新增 Zod 或其他 schema 依赖。
- 不支持跨 app 引用 upstream 或 plugin_config。
- 不改变 APISIX Admin API 的平级资源模型、planner、remote diff 的基本工作方式。
- 不新增迁移专用 `--replace` apply 模式；首次迁移发布依赖 `--prune` 和发布窗口控制。

## Decisions

### 单文件 app manifest

默认路径改为 `gateway/manifests/<env>/<app>.yaml`，CLI override 改为 `--manifest <path>`。旧 `--manifest-dir` 和旧目录读取不保留。这样 schema、文档和错误路径都只维护一种源形态。

### 资源生成规则

源文件只声明本地语义：

```yaml
service:
  desc: Tender gateway app service
  plugin_configs:
    - key: api-ip-rate-limit
      plugins: {}

upstreams:
  - key: api
    nodes: {}

routes:
  - key: api
    uri: /api/tender/*
    upstream: api
    plugin_config: api-ip-rate-limit
```

loader materialize 后生成：

- `service.id/name = <app>.<env>`
- `upstream.id/name = <app>.<key>.<env>`
- `route.id/name = <app>.<key>.<env>`
- `plugin_config.id/name = <app>.<key>.<env>`

`key` 限制为 kebab-case segment，不能包含点号或环境/app 后缀。同类型内 key 必须唯一，不同资源类型可以复用 key。

### app service 边界

每个 app 恰好一个 service。service 不绑定 `upstream_id`，以避免 route 漏写 upstream 时悄悄转发到默认目标。非 terminal route 必须显式写 `upstream: <key>`，loader 自动注入当前 app service 的 `service_id` 和目标 `upstream_id`。`terminal: true` route 不注入 service/upstream，用于 redirect 等不转发路由。

### plugin_config 所属关系

源文件不允许顶层 `plugin_configs`。app service 下的 `plugin_configs` 是该 app 的策略池，route 通过 `plugin_config: <key>` 本地引用。materialize 后仍输出 APISIX 平级 `plugin_configs`，并在 route 上写 `plugin_config_id`。

route-specific 插件如 `proxy-rewrite`、差异化 `forward-auth` 保留在 route 内。只有真正复用且横切的策略放入 `service.plugin_configs`，例如限流、real-ip、CORS 组合策略。

### labels 和生成字段

loader 自动为所有 materialized repo-managed 对象注入：

```yaml
labels:
  managed_by: shgas-iam
  source: repo-manifest
  env: <env>
  app: <app>
```

源对象可以提供业务自定义 labels，但不能覆盖这些基础 labels。源文件禁止手写 `id`、`name`、`service_id`、`upstream_id`、`plugin_config_id` 等生成字段。

### 默认字段

源文件不再写 `priority: 0`、`status: 1`、`enable_websocket: false` 等 APISIX 默认值，loader 也不主动生成。只有非默认行为才显式声明，例如 `priority: 100`、`status: 0` 或 `enable_websocket: true`。

### validation 分层

`loadManifest()` 负责读取和 materialize，`validateManifest()` 负责 schema invariants 和引用完整性。引用找不到时由 validator 报错。错误 file 指向新单文件；path 第一版尽量使用源字段，如 `routes[1].upstream` 或 `service.plugin_configs[0].key`，少量 materialized 字段路径可以接受。

## Risks / Trade-offs

- [Risk] 全量 dot id rename 会让远端 APISIX 看到 create/delete，而不是 update。→ 迁移发布文档要求先 `diff`，再 `apply --dry-run --prune`，最后 `apply --prune`。
- [Risk] 当前 applier 先 create/update 后 delete，迁移窗口内同 URI 新旧 route 可能短暂共存。→ 第一版接受短窗口，要求新旧 route 行为等价并在低流量窗口发布；不引入额外 apply 模式。
- [Risk] 自动注入 labels/service_id 降低源文件噪音，但错误定位可能比旧多文件粗。→ 错误 file 必须指向单文件，后续可按需引入 source map。
- [Risk] 不支持 `defaults` 会保留 upstream 行为字段重复。→ 优先保持显式和可 review，避免结构迁移同时引入继承语义。
- [Risk] route/upstream/plugin_config 使用本地 key 后可能误写引用。→ validator 覆盖缺失引用、重复 key、非法 key 和跨 app 生成字段。

## Migration Plan

1. 新增单文件 manifest loader/materializer 和 validator 规则。
2. 修改 CLI 参数为 `--manifest <path>`，删除 `--manifest-dir`。
3. 将 `dev`/`prod` 的 `iam`、`tender`、`gds` manifest 迁移为 `<app>.yaml`，删除旧 app 目录。
4. 更新 README、`.env.example` 说明和发布流程，强调首次迁移发布必须使用 `--prune`。
5. 增加 source schema/materialization 单元测试，以及旧新关键行为等价测试。
6. 运行 `pnpm --filter @iam/gateway-apisix test`、`typecheck` 和六个 scope 的 `validate`。

Rollback 策略：在 Git 回滚到旧 manifest/schema 版本后重新执行旧版本 sync 工具发布；如果远端已创建 dot id 对象，回滚发布同样需要 `--prune` 清理当前 scope 的 repo-managed dot id 对象。

## Open Questions

无。
