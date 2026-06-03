## Context

`gateway/apisix` 最初作为 APISIX 配置管理目录引入，包含 `config/`、`manifests/`、`scripts/` 和 README。随着 `scripts/apisix-sync.ts` 承担 `validate`、`diff`、`apply`、环境变量渲染、远端状态读取、变更计划和测试覆盖，它已经具备独立工具包的特征。

当前根 `package.json` 直接用 `bun gateway/apisix/scripts/apisix-sync.ts` 调用 CLI，`yaml` 等依赖声明在根包中。这个方式可以工作，但会让 APISIX 同步工具游离于 pnpm workspace 和 Turbo 的 package 生命周期之外：依赖归属不清晰，`test`、`lint`、`typecheck` 不容易随 workspace 常规命令稳定执行，后续如果 IAM 后端需要复用 APISIX client 或 manifest 逻辑，也缺少明确导入边界。

约束是：这次变更只整理包边界和验证入口，不改变 APISIX manifest 格式、不改变同步行为、不迁移动态注册模型，也不改变 Docker/APISIX 部署拓扑。

## Goals / Non-Goals

**Goals:**

- 将 `gateway/apisix` 作为私有 pnpm workspace package 管理。
- 为 APISIX 同步工具提供 package 级 `validate`、`diff`、`apply`、`test`、`lint`、`typecheck` 脚本。
- 让 APISIX 同步工具的运行依赖和开发依赖归属到自身 package。
- 保留根级 `gateway:apisix:*` 脚本，作为现有文档和运维习惯的兼容入口。
- 让 package 能被 Turbo 常规任务发现，从而纳入最小可验证链路。

**Non-Goals:**

- 不改变 `gateway/apisix/manifests` 的文件结构、标签规则、敏感字段校验或引用校验。
- 不改变 `apisix-sync.ts` 的 CLI 参数、默认值、diff/apply 行为或 APISIX Admin API 请求语义。
- 不将整个 `gateway/` 目录变成一个泛化 package；本次边界只覆盖 APISIX 工具和配置。
- 不把 APISIX manifest 移入 `packages/`，避免运维配置与共享代码包混在一起。
- 不实现 IAM 动态注册 publisher 或新增数据库模型。

## Decisions

### Decision 1: 以 `gateway/apisix` 作为 package 根目录

`gateway/apisix` 同时拥有 APISIX 运行配置、manifest、README 和同步工具。将它直接作为 workspace package，可以保留当前运维目录语义，也让脚本、测试和依赖有清晰归属。

备选方案是新增 `packages/gateway-apisix`，只放同步工具源码，再让它读取 `gateway/apisix/manifests`。这个方案更像共享库，但会拆散 APISIX 运维资产，增加路径跳转和维护成本。当前阶段 `gateway/apisix` package 更贴近实际使用者。

### Decision 2: `pnpm-workspace.yaml` 纳入 `gateway/*`

在 workspace packages 中增加 `gateway/*`，让 `gateway/apisix/package.json` 被 pnpm 和 Turbo 发现。这样 package 级 `test`、`lint`、`typecheck` 可以进入常规任务图。

备选方案是继续只在根 package 添加更多脚本，例如 `gateway:apisix:test`。这能补齐部分命令，但不能解决依赖归属和 workspace package 边界问题。

### Decision 3: 根脚本保留为兼容包装

根 `gateway:apisix`、`gateway:apisix:validate`、`gateway:apisix:diff`、`gateway:apisix:apply` 应继续存在，但实现上委托到 `@iam/gateway-apisix` 的 package 脚本。这样 README、运维命令和已有使用习惯可以平滑过渡。

直接删除根脚本会让已有文档命令失效，收益不大。兼容包装能让仓库既有入口和 package 化入口同时成立。

### Decision 4: package 只暴露工具边界，不扩大运行时行为

`@iam/gateway-apisix` 应是 private package。第一阶段以 CLI 和测试为主，可以按现有文件结构保留 `scripts/apisix-sync.ts`；如果实现时为了导出边界更清晰，可在不改变行为的前提下拆分 `src/` 和 CLI 入口。

这避免为了“package 化”顺手做大型源码重构。后续如果 admin-api 或动态注册 publisher 需要复用 manifest/client 逻辑，再单独设计公共 exports。

## Risks / Trade-offs

- [Risk] 根脚本委托到 package 后，参数转发如果处理不当会破坏 `-- --env dev:iam` 这类调用。→ Mitigation: 保留现有 README 中的命令作为验收用例，验证 `validate`、`diff`、`apply --dry-run` 的参数透传。
- [Risk] Turbo 将新 package 纳入全局任务后，缺失脚本或类型配置会导致 `pnpm test/typecheck/lint` 新增失败点。→ Mitigation: package 初始即提供与仓库后端包一致的脚本，并用窄验证先跑通。
- [Risk] 迁移依赖时根包和 gateway package 重复声明依赖。→ Mitigation: 将 APISIX sync 专用依赖迁到 `@iam/gateway-apisix`，根包只保留确实服务于根工具链的依赖。
- [Risk] 为了 package 化过度重排目录，增加 review 噪音。→ Mitigation: 第一阶段尽量保留 `config/`、`manifests/`、`scripts/` 和 README 位置，必要重构另开 change。

## Migration Plan

1. 在 `gateway/apisix` 新增私有 package 元数据和脚本。
2. 将 workspace 配置扩展到 `gateway/*`。
3. 调整根 `gateway:apisix:*` 脚本，让它们委托到 `@iam/gateway-apisix`。
4. 将 APISIX sync 相关依赖从根包迁移到 gateway package。
5. 运行 package 级 `test`、`typecheck`、`lint` 和根级兼容命令验证。

回滚方式：恢复根脚本为直接执行 `bun gateway/apisix/scripts/apisix-sync.ts`，从 workspace 移除 `gateway/*`，并把相关依赖放回根包。该回滚不影响 APISIX 远端配置或 manifest 内容。

## Open Questions

- 是否在本次实现中拆出 `src/` 与 CLI 入口，还是先保留 `scripts/apisix-sync.ts` 单文件结构。
- 是否需要新增 package exports，供后续 IAM 动态注册 publisher 复用；如果没有 immediate consumer，可以暂缓。
