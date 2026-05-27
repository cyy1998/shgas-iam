## ADDED Requirements

### Requirement: 领域 DTO type 与领域 schema 同包维护
系统 SHALL 在 `packages/domain` 中为领域稳定 DTO schema 提供对应的 TypeScript type，并将这些 type 作为跨 app 消费的统一来源。

#### Scenario: app 消费领域稳定 DTO type
- **WHEN** app 或 package 需要引用 `packages/domain` 中已有稳定 DTO schema 对应的 TypeScript 类型
- **THEN** 系统 SHALL 允许调用方从 `@iam/domain/<domain>` 或 `@iam/domain` 导入对应 type
- **AND** 调用方 SHALL NOT 在本地重复通过同一个 domain schema 推导等价的领域稳定 DTO type

#### Scenario: schema 与 type 保持一致
- **WHEN** 领域稳定 DTO schema 的字段结构发生变化
- **THEN** 对应 TypeScript type SHALL 由该 schema 推导得到
- **AND** 系统 SHALL NOT 手写重复的 DTO 字段结构

### Requirement: 领域 DTO type 使用独立 type 文件
系统 SHALL 将领域稳定 DTO 的 TypeScript type 定义在对应 domain 子目录的独立 `.type.ts` 文件中。

#### Scenario: 新增领域 DTO type
- **WHEN** `packages/domain/src/<domain>/schema.ts` 新增跨 app 稳定复用的 `XxxDtoSchema`
- **THEN** 对应 `XxxDto` type SHALL 定义在 `packages/domain/src/<domain>/<domain>.type.ts`
- **AND** `schema.ts` SHALL NOT 混入该 DTO 的 type 声明

#### Scenario: 导出领域 DTO type
- **WHEN** domain 子模块存在 `<domain>.type.ts`
- **THEN** `packages/domain/src/<domain>/index.ts` SHALL 导出该 type 文件
- **AND** `packages/domain/src/index.ts` SHALL 继续聚合导出该 domain 子模块

### Requirement: app 私有类型保留在 app 内
系统 SHALL 仅将领域稳定 DTO type 收拢到 `packages/domain`，并将 app 私有接口类型保留在具体 app 中。

#### Scenario: admin 专属输入类型
- **WHEN** 类型表达 admin 分页查询、admin 创建、admin 更新、状态变更、树节点或其他管理端专属输入输出
- **THEN** 该类型 SHALL 保留在 `apps/admin-api` 对应 service 或 route 的 `.type.ts` 文件中

#### Scenario: route 和 VO 类型
- **WHEN** 类型表达 route handler、VO、状态文本、展示聚合字段或具体接口层视图
- **THEN** 该类型 SHALL 保留在具体 app 的 route 层
- **AND** 该类型 SHALL NOT 被移动到 `packages/domain`

### Requirement: 运行时 API 行为保持不变
系统 SHALL 在迁移领域 DTO type 归属时保持现有运行时 schema、mapper 和 API 行为不变。

#### Scenario: 类型归属迁移后接口响应不变
- **WHEN** 领域 DTO type 从 app 本地定义迁移到 `packages/domain`
- **THEN** DTO schema 的字段、OpenAPI schema 名称、mapper 输出和 REST/tRPC 响应结构 SHALL 保持不变
