# admin-api-adapter-simplification Specification

## Purpose
描述当前 admin-api REST/tRPC 适配层的统一声明方式、复杂 ops 层保留边界，以及从薄 handlers/trpc/ops 结构迁移到 adapter pattern 时的等价约束。

## Requirements
### Requirement: Simple admin operations can share REST and tRPC adapters without a mandatory ops layer
admin-api 中同时暴露 REST 和 tRPC 的简单业务操作 SHALL 能通过机械化 adapter helper 从同一份操作声明生成 REST handler 和 tRPC procedure，而不强制新增或保留只做透传的 `*.ops.ts`。

#### Scenario: Registering a simple operation
- **WHEN** 一个 admin 模块声明了输入 schema、业务 handler、REST 输入组装规则和 query/mutation 类型
- **THEN** 系统 SHALL 能从该声明注册对应 REST handler 和 tRPC procedure
- **THEN** REST handler SHALL 继续返回现有成功响应 envelope
- **THEN** tRPC procedure SHALL 继续使用现有 tRPC 错误映射语义

#### Scenario: Keeping service as the business boundary
- **WHEN** 一个简单 CRUD 操作通过 adapter helper 暴露给 REST 和 tRPC
- **THEN** 业务规则、事务编排和领域校验 MUST 保留在 service 或 repository 层
- **THEN** adapter helper、REST handler 和 tRPC procedure MUST 只处理协议适配、输入组装、上下文传递和响应转换

### Requirement: Ops layer remains available for complex cross-entry reuse
admin-api 模块 SHALL 允许在复杂 REST/tRPC 复用场景保留显式 `*.ops.ts`，并且简单 adapter helper MUST 不要求所有模块一次性迁移。

#### Scenario: Complex operation keeps ops
- **WHEN** 一个操作包含跨 service 编排、复杂输出转换、特殊 audit context 解析或 REST/tRPC 差异化行为
- **THEN** 模块 SHALL 可以继续使用显式 `*.ops.ts` 承载复用逻辑
- **THEN** REST handler 和 tRPC router SHALL 能继续调用该复用逻辑而不改变公开 contract

#### Scenario: Mixed migration state
- **WHEN** 仓库中同时存在已迁移到 adapter helper 的模块和仍使用 `*.ops.ts` 的模块
- **THEN** admin-api MUST 能正常 typecheck 和运行
- **THEN** 两种模式 MUST 遵守相同的 REST response envelope、tRPC procedure 类型和错误映射要求

### Requirement: All current admin dual-entry modules are covered by the new adapter pattern
当前存在于 `apps/admin-api/src/routes/admin/` 下的所有同时暴露 REST 和 tRPC 的模块 SHALL 能在同一 change 中迁移到新的 adapter pattern，且每个模块的公开 contract MUST 保持等价。

#### Scenario: Migrating all current modules
- **WHEN** user、position、organization、employment、client 和 audit 六个模块都迁移到 adapter pattern
- **THEN** 每个模块的 REST 路径、HTTP method、请求/响应 schema、tRPC router key 和业务语义 MUST 保持等价
- **THEN** 系统 SHALL 不再要求任何一个当前模块保留仅为透传而存在的薄 `*.ops.ts` 结构

#### Scenario: Naming the combined adapter entry
- **WHEN** 一个 admin 模块同时从同一份 operation 声明导出 REST handler 和 tRPC router
- **THEN** 该模块 SHALL 使用 `<domain>.adapter.ts` 承载这些适配定义
- **THEN** 该模块的 `<domain>.trpc.ts` SHALL 只作为 tRPC router 的稳定 re-export

### Requirement: Adapter migration preserves external contracts
迁移 admin-api REST/tRPC 适配层时，系统 MUST 保持现有 REST 路径、HTTP method、请求 schema、响应 schema、tRPC router key 和业务语义不变。

#### Scenario: Migrating any module
- **WHEN** 任一 admin 模块从薄 `handlers.ts` / `trpc.ts` / `ops.ts` 结构迁移到 adapter helper
- **THEN** 该模块现有 REST OpenAPI route 定义 MUST 保持等价
- **THEN** 该模块现有 tRPC router key MUST 保持等价
- **THEN** 该模块通过 REST 和 tRPC 调用的 service 方法及输出转换 MUST 保持等价
