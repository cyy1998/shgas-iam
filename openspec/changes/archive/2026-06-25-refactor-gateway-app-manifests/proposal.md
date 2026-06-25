## Why

现有 APISIX gateway manifest 以资源类型拆成 `routes.yaml`、`upstreams.yaml`、`services.yaml` 等文件，但实际维护时更关心的是一个应用的入口、上游和策略如何组合。随着 `iam`、`tender`、`gds` 同时维护前端、后端、内外网入口和限流策略，当前结构让 app 边界不够直观，也让每个 route 重复声明 service、labels、默认字段。

这次变更将 repository manifest 的源模型调整为 app-centric：每个 app 使用一个 APISIX service 表达应用边界，前后端 route 在同一 service 下通过 route 级 upstream 指向不同运行时组件。

## What Changes

- **BREAKING** 将 manifest 源文件从 `gateway/manifests/<env>/<app>/` 多文件目录改为 `gateway/manifests/<env>/<app>.yaml` 单文件，不保留旧目录格式读取兼容。
- **BREAKING** 将 CLI override 参数从 `--manifest-dir <path>` 改为 `--manifest <path>`。
- **BREAKING** 将 repository-managed APISIX 对象 id/name 统一改为点号命名：`<app>.<env>`、`<app>.<key>.<env>`。
- 每个 app manifest 只生成一个 APISIX service，service id/name 由 `<app>.<env>` 自动生成，不绑定默认 upstream。
- route、upstream、service 内联 plugin_config 使用本地 `key`，loader materialize 时生成 APISIX id/name、labels、route `service_id`、`upstream_id` 和 `plugin_config_id`。
- `service.plugin_configs` 作为 app service 拥有的策略池，route 通过 `plugin_config: <key>` 引用，materialize 后仍输出 APISIX 平级 `plugin_configs`。
- 非 terminal route 必须显式声明 `upstream: <key>`；`terminal: true` route 不注入 service/upstream，用于 redirect 等不转发路由。
- `managed_by/source/env/app` 基础 labels 由 loader 自动注入，业务自定义 labels 可以合并但不能覆盖基础 labels。
- `id/name/service_id/upstream_id/plugin_config_id` 等生成字段在源 manifest 中禁止手写。
- README、测试和迁移发布说明更新，首次 dot id 迁移发布要求使用 `--prune` 清理旧 kebab id 对象。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `gateway-configuration-management`: gateway manifest 源结构、app service 边界、loader/validator 行为、CLI manifest override 参数和迁移发布要求将发生变化。

## Impact

- 影响 `gateway/src/manifest.ts`、`gateway/src/resources.ts`、`gateway/src/validators/`、CLI option、测试 helper 和 gateway README。
- 影响 `gateway/manifests/dev/*.yaml` 与 `gateway/manifests/prod/*.yaml` 的实际文件布局和对象 id。
- 影响 APISIX 发布流程：迁移后第一次 apply 需要 `--prune`，否则旧 kebab id 的 repo-managed 对象会留在远端。
- 不新增运行时依赖；不改变 APISIX Admin API 同步后端的平级资源模型。
