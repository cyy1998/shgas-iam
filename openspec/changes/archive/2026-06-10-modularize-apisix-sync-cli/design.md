## Context

`gateway/apisix` 已经是私有 workspace package，负责管理 APISIX manifest、同步 CLI、测试、lint 和 typecheck。当前同步器实现仍集中在 `gateway/apisix/scripts/apisix-sync.ts`，单文件同时承担：

- CLI 参数解析、help 输出和命令分派；
- manifest scope 解析、目录定位、YAML 读取和环境变量渲染；
- APISIX 资源定义、同步顺序、ID 提取和引用校验；
- ownership policy、scope label 校验和敏感配置校验；
- APISIX Admin API client、远端响应 unwrap 和 diff normalize；
- plan、apply、JSON/human-readable 输出。

这个结构已经可以工作，但它让每次新增资源类型、校验规则或输出契约调整都需要修改同一大文件。近期 API IP 限流相关校验也说明 validator 会继续增长；如果仍保持单文件，后续扩展会越来越难 review。

本次变更同时包含工具接口 breaking change：不再保留旧脚本路径、不再默认 `dev:iam`、不再支持 env-only scope，并统一 JSON 输出中 ignored/applied 的结构。

## Goals / Non-Goals

**Goals:**

- 将 APISIX 同步工具源码迁移到 `gateway/apisix/src/`，并拆分为清晰模块。
- 使用 Commander 建模 `validate`、`diff`、`apply` 三个子命令。
- 要求所有同步命令通过 `--env <env:app>` 或 `APISIX_MANIFEST_ENV` 显式指定 scope。
- 将 APISIX 资源模型集中到 `resources.ts`，作为资源类型、文件名、top key、Admin API endpoint、ID 字段、同步顺序和顶层引用关系的唯一来源。
- 将 ownership policy、manifest validators、planning、applying、Admin API client、normalize 和 output 分离，提升测试性。
- 统一 `diff --json` 和 `apply --json` 输出中的 ignored/applied 表达。
- 保持 manifest 内容、APISIX Admin API 写入语义、repo-managed/dynamic-registry 管理边界和 prune 安全边界不变。

**Non-Goals:**

- 不实现 env-only 聚合 scope 或 `--all-apps` 发布模式。
- 不将资源模型迁移为外部 YAML/JSON 配置。
- 不让 ownership policy 通过 CLI 动态配置。
- 不引入 dotenv；`--env-file` 继续使用同步器内部最小解析器。
- 不改变 APISIX manifest 文件内容或目录分层。
- 不改变 APISIX Admin API endpoint、HTTP method 或 request body 语义。
- 不增加跨 package 的正式 `exports` API。

## Decisions

### 源码迁移到 `src/`，不保留旧脚本 shim

同步工具已经是 package 级工具，正式入口应是 root/package scripts，而不是直接执行文件路径。实现时删除 `gateway/apisix/scripts/apisix-sync.ts`，将可执行入口迁移到 `gateway/apisix/src/cli.ts`，并更新 package scripts：

```json
{
  "apisix": "bun src/cli.ts",
  "validate": "bun src/cli.ts validate",
  "diff": "bun src/cli.ts diff",
  "apply": "bun src/cli.ts apply"
}
```

旧路径不保留 shim，避免源码根目录迁移后仍存在第二入口。README 需要明确直接脚本路径已移除。

### Commander 负责 CLI 子命令和参数解析

引入 `commander`，将 `validate`、`diff`、`apply` 定义为三个子命令。`src/cli.ts` 只负责 Commander wiring、错误处理和调用 command orchestration；`src/commands.ts` 承载 `runValidate`、`runDiff`、`runApply`。

通用参数：

- `--env <env:app>`
- `--manifest-dir <path>`
- `--env-file <path>`
- `--render-env`
- `--json`

`diff` 和 `apply` 额外支持：

- `--admin-url <url>`
- `--admin-key <key>`

`apply` 额外支持：

- `--dry-run`
- `--prune`

`--admin-url` 默认仍为 `http://127.0.0.1:9180/apisix/admin`，优先级为 `--admin-url` > `APISIX_ADMIN_URL` > 默认本地 URL。`--admin-key` 优先级为 `--admin-key` > `APISIX_ADMIN_KEY`，diff/apply 缺少 Admin API key 时失败。

### scope 必须显式且必须是 `<env>:<app>`

不再默认 `dev:iam`。scope 来源优先级为：

```text
--env <env:app> > APISIX_MANIFEST_ENV > missing error
```

`env` 和 `app` 均限制为：

```regex
^[a-z0-9][a-z0-9-]*$
```

`--env dev` 这类 env-only scope 明确失败。`--manifest-dir` 仍可覆盖读取目录，但不改变 scope 语义；manifest 中的 `labels.env` 和 `labels.app` 仍必须匹配显式 scope。

### 资源模型集中在 `resources.ts`

`resources.ts` 定义资源注册表，例如：

```ts
{
  kind: "routes",
  fileName: "routes.yaml",
  topKey: "routes",
  endpoint: "routes",
  idFields: ["id"],
  syncOrder: 60,
  references: [
    { field: "service_id", targetKind: "services", targetName: "service" },
    { field: "upstream_id", targetKind: "upstreams", targetName: "upstream" },
    { field: "plugin_config_id", targetKind: "plugin_configs", targetName: "plugin_config" },
  ],
  compare: {
    ignoreFields: ["create_time", "update_time", "modifiedIndex", "key"],
    defaultValues: {
      priority: 0,
      status: 1,
    },
  },
}
```

第一阶段引用校验只支持资源定义声明的顶层字段，不支持 JSONPath、数组内引用或嵌套路径。写入顺序由显式 `syncOrder` 派生，删除顺序使用反向顺序；不做自动拓扑排序。

### ownership policy 模块化但不暴露 CLI 开关

`ownership-policy.ts` 定义默认 policy：

```ts
{
  managedBy: "shgas-iam",
  repoSource: "repo-manifest",
  dynamicSource: "dynamic-registry",
  labelKeys: {
    managedBy: "managed_by",
    source: "source",
    env: "env",
    app: "app",
  },
}
```

CLI 不提供 `--managed-by` 或 `--repo-source` 等危险开关。模块内部提供 `isRepoManaged`、`isDynamicManaged`、`isInScope` 等函数，便于 planner 和 validators 复用。

### validators 使用静态 registry

`validators/index.ts` 通过静态数组组合校验器：

- required IDs / duplicate IDs；
- ownership labels；
- scope labels；
- references；
- sensitive values；
- trusted proxy。

validator 不能通过 CLI 关闭，也不做动态加载。sensitive validator 使用代码内规则表维护合法 non-secret 路径，例如 `.labels.source`、`.plugins.limit-req.key`、`.plugins.prometheus.prefer_name`。`real-ip.trusted_addresses` 中未渲染的 `${VAR}` 占位符允许通过；渲染后的 `0.0.0.0/0` 或 `::/0` 必须失败。

### 环境变量渲染保持 parse 后递归渲染

manifest 加载流程保持：

```text
read YAML text -> parseYaml() -> recursively render string values and object keys
```

这样 `${IAM_API_HOST}:${IAM_API_PORT}` 形式的 object key 仍可工作，同时避免变量值破坏 YAML 原始语法。支持范围保持最小：

- 支持 `${VAR}`。
- 缺少变量时 fail fast。
- 不支持 `${VAR:-default}`。
- `--env-file` 支持最小 env assignment 子集，不承诺完整 shell/dotenv 兼容。

### JSON 输出统一 ignored/applied

内部和 JSON 输出都使用统一 ignored 结构：

```ts
interface IgnoredChange extends PlannedChange {
  reason: "dynamic" | "out_of_scope" | "unmanaged";
}

interface ChangePlan {
  creates: PlannedChange[];
  updates: PlannedChange[];
  deletes: PlannedChange[];
  ignored: IgnoredChange[];
}
```

`apply` 结果使用统一 applied 数组：

```ts
interface AppliedChange extends PlannedChange {
  action: "create" | "update" | "delete";
}
```

`creates`、`updates`、`deletes` 三组 plan changes 保留，便于 diff 扫描和 prune review。dry-run apply 输出 `applied: []`。

### public index 保持窄导出

`src/index.ts` 只导出稳定核心 API 和类型，例如 `loadManifest`、`validateManifest`、`planChanges`、`applyPlan`、`ApisixAdminClient` 和相关类型。不导出 `cli.ts`、`output.ts`、normalize helper、unwrap helper 或 validator 内部实现。`index.ts` 不读 `process.argv`、不 console、无副作用。

### Admin API client 支持 fetch 注入

`ApisixAdminClient` 默认使用 `globalThis.fetch`，同时支持构造时注入 fetch，便于测试 header、URL、错误处理和 APISIX list response unwrap。远端响应 unwrap 仍作为 client 内部 adapter，不作为 public API 暴露。

### 测试集中放在 `src/__tests__/`

将现有 `scripts/__tests__/apisix-sync.test.ts` 迁移拆分到 `src/__tests__/`：

- `manifest.test.ts`
- `validators.test.ts`
- `planner.test.ts`
- `applier.test.ts`
- `cli.test.ts` 或 `commands.test.ts`
- `apisix-admin-client.test.ts`

测试同时覆盖旧行为回归和新行为断言。

## Risks / Trade-offs

- [Risk] 旧运维脚本直接执行 `gateway/apisix/scripts/apisix-sync.ts` 会失败。→ Mitigation: README 明确 breaking change，根级和 package-level scripts 保持稳定入口。
- [Risk] JSON 输出字段变化会影响 CI 或运维脚本。→ Mitigation: proposal/spec/README 同步记录新结构，并在测试中锁定 `ignored[]` 和 `applied[]`。
- [Risk] 引入 Commander 可能改变错误文案和 help 格式。→ Mitigation: 测试关键行为而非完整文案快照，README 展示 package scripts 入口而不是依赖精确 help 文本。
- [Risk] 文件拆分可能在迁移中改变现有 diff/apply 语义。→ Mitigation: 保留旧行为回归测试，并在实现后运行 gateway package 的 test、typecheck、lint。
- [Risk] 不支持 env-only scope 会降低批量环境校验便利性。→ Mitigation: 这是有意取舍；跨 app 发布或校验未来通过显式 `--all-apps` 另行设计。
- [Risk] 资源模型仍写在 TypeScript 中，不支持运行时扩展。→ Mitigation: APISIX 资源模型属于同步器代码契约，使用 TS 类型和测试比外部配置更安全。

## Migration Plan

1. 新增 `gateway/apisix/src/` 模块结构和 Commander CLI。
2. 将现有单文件逻辑按模块迁移，保持 manifest 同步语义不变。
3. 删除 `gateway/apisix/scripts/apisix-sync.ts` 和旧测试目录。
4. 更新 package scripts、tsconfig include、lint script 和 README。
5. 迁移并扩充测试，覆盖旧行为和新 CLI/JSON 行为。
6. 运行 `pnpm --filter @iam/gateway-apisix test`、`typecheck`、`lint`。

回滚方式：恢复旧 `scripts/apisix-sync.ts`、package scripts、tsconfig include、README 和测试文件；移除 Commander 依赖。该回滚不影响 APISIX 远端配置或 manifest 内容。

## Open Questions

无。当前设计已确定不保留旧脚本 shim、使用 Commander、要求显式 `<env>:<app>` scope，并统一 JSON 输出结构。
