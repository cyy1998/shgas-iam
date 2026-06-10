## Why

`gateway/apisix` 的 APISIX 同步工具已经从一个简单脚本成长为同时负责 CLI、manifest 加载、校验、diff、apply、Admin API 访问和输出序列化的发布工具。当前实现集中在单个 `scripts/apisix-sync.ts` 文件中，扩展资源类型、增加校验规则或调整 CLI 行为时需要穿越大量无关代码，维护成本和误改风险都在上升。

本变更将同步工具模块化，并借机收紧 CLI 与 JSON 输出契约，使 APISIX 基线发布工具更清晰、可测试、可扩展。

## What Changes

- 将 APISIX 同步工具源码从 `gateway/apisix/scripts/` 迁移到 `gateway/apisix/src/`，不保留旧 `scripts/apisix-sync.ts` 兼容 shim。
- 引入 Commander 作为 CLI 参数库，并将 `validate`、`diff`、`apply` 建模为明确的子命令。
- **BREAKING**: CLI 不再默认使用 `dev:iam`；`validate`、`diff`、`apply` 必须通过 `--env <env:app>` 或 `APISIX_MANIFEST_ENV` 显式指定 manifest scope。
- **BREAKING**: CLI scope 只支持 `<env>:<app>` 格式，不支持 env-only scope，例如 `--env dev`。
- **BREAKING**: `diff --json` 和 `apply --json` 将 `ignoredDynamic`、`ignoredOutOfScope`、`ignoredUnmanaged` 合并为统一 `ignored[]`，每项包含 `reason`。
- **BREAKING**: `apply --json` 将 `applied` 从按 `created/updated/deleted` 分组的对象改为统一数组，每项包含 `action`。
- 保持 manifest 同步语义不变：仓库 manifest 仍只管理 `source=repo-manifest` 对象，继续避让 `source=dynamic-registry`、out-of-scope repo 对象和 unmanaged 对象。
- 保持 APISIX Admin API 请求语义不变：diff 仅读取远端状态，apply 创建或更新 managed 对象，删除仍需要显式 `--prune`。
- 更新 README，说明新的源码布局、CLI 显式 scope 要求和 JSON 输出结构变化。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `gateway-configuration-management`: 调整 APISIX sync CLI 的 scope 要求、子命令契约和 JSON 输出结构。

## Impact

- 影响 `gateway/apisix/package.json` 的脚本入口、依赖声明和验证范围。
- 影响 `gateway/apisix/src/` 下新增的 CLI、manifest、validation、planning、apply、Admin API client、output 等模块。
- 影响 `gateway/apisix/scripts/` 下旧入口和旧测试文件的迁移或删除。
- 影响 `gateway/apisix/README.md` 中目录结构、常用命令和 JSON 输出说明。
- 新增 `commander` 作为 `@iam/gateway-apisix` 的运行时依赖。
- 对直接执行 `bun gateway/apisix/scripts/apisix-sync.ts` 或消费旧 JSON 输出字段的外部脚本存在兼容性影响；根级 `pnpm gateway:apisix:*` 和 package-level `validate`、`diff`、`apply` 入口继续保留。
