## Context

`packages/domain` 已经按业务域提供稳定 DTO schema，例如 `UserDtoSchema`、`OrganizationDtoSchema`、`EmploymentDtoSchema`、`ClientDtoSchema` 和 `PositionDtoSchema`。这些 schema 既用于运行时校验，也用于 OpenAPI 生成和跨 app 复用。

当前 TypeScript 类型定义仍不统一：一部分 app/service 在本地 `*.type.ts` 中通过 `z.infer<typeof XxxSchema>` 重复推导领域 DTO 类型，一部分 route 类型与 VO 类型也混在 app 侧。随着 `packages/domain` 成为稳定契约层，DTO schema 与 DTO type 分散会使类型重命名、导出审计和跨 app 消费变得更脆。

目标分层如下：

```txt
packages/domain/src/<domain>/
  schema.ts       运行时 schema、mapper、OpenAPI schema name
  <domain>.type.ts 由 schema 推导的领域稳定 DTO type
  index.ts        同时导出 schema 与 type

apps/<app>/src/services/<domain>/
  schema.ts       app 专属 query/create/update schema
  <domain>.type.ts app 专属 query/create/update type

apps/<app>/src/routes/<tier>/<domain>/
  schema.ts       VO schema
  <domain>.type.ts RouteHandler、VO type
```

## Goals / Non-Goals

**Goals:**

- 将领域稳定 DTO 的 TypeScript 类型定义到 `packages/domain` 自身。
- 每个涉及稳定 DTO type 的 domain 子目录使用独立 `<domain>.type.ts` 文件，不把 type 声明混入 `schema.ts`。
- 保持 schema 作为类型来源，type 通过 `z.infer<typeof XxxSchema>` 推导，避免手写结构漂移。
- 让 app 侧可通过 `@iam/domain/<domain>` 或 `@iam/domain` 导入稳定 DTO type。
- 清理 app/service 中重复定义的领域稳定 DTO type，同时保留 app 私有类型。

**Non-Goals:**

- 不改变 DTO schema 的字段、默认值、OpenAPI 名称或 mapper 行为。
- 不移动 admin 专属分页查询、创建、更新、状态变更等输入 schema 到 `packages/domain`。
- 不移动 `VoSchema`、`Vo`、`RouteHandler` 等展示层或路由层类型到 `packages/domain`。
- 不引入新依赖、不修改数据库 schema、不生成迁移。

## Decisions

### Decision: type 文件与 schema 文件分离

每个 domain 子目录使用独立 `<domain>.type.ts` 存放从稳定 schema 推导出的类型，例如 `packages/domain/src/user/user.type.ts`。`schema.ts` 继续只承载运行时 schema、DTO mapper 和 OpenAPI metadata。

备选方案是在 `schema.ts` 尾部直接导出 `export type UserDto = z.infer<typeof UserDtoSchema>`。该方案文件更少，但会让 schema 文件同时承担运行时契约和纯类型出口，和用户期望的“类型定义在单独 `.type` 文件中”不一致。

### Decision: domain 只导出领域稳定 DTO type

`packages/domain` 只承载跨 app 稳定复用的 DTO type，例如 `UserDto`、`UserDetailDto`、`UserCreateDto`、`OrganizationDto`、`OrganizationCreateDto`、`EmploymentDto`、`ClientDto`、`PositionDto`、`PrivilegeDto` 等。

admin 查询条件、admin create/update 输入、状态更新输入、树节点 DTO、VO 和 RouteHandler 留在对应 app。判断标准是：如果类型表达的是领域对象或领域 DTO，放 domain；如果类型表达的是某个 app 的接口形状、页面视图或操作输入，留 app。

### Decision: 以 schema 推导类型，不手写 DTO 结构

`.type.ts` 必须从同目录 `schema.ts` import type 对应 schema，并使用 `z.infer<typeof XxxSchema>` 推导。这样 schema 仍是单一结构来源，避免 DTO 字段在 schema 与 type 之间重复维护。

### Decision: 通过子模块 index 暴露稳定契约

每个 domain 子目录的 `index.ts` 同时导出 `schema.ts` 和 `<domain>.type.ts`。根 `packages/domain/src/index.ts` 继续聚合各 domain 子模块。现有 package exports 已支持 `@iam/domain/<domain>`，无需新增 package export pattern。

## Risks / Trade-offs

- [Risk] type-only 导入不规范可能在 `verbatimModuleSyntax` 下引入运行时 import。→ 实施时使用 `import type` 导入 schema/type，并通过 package typecheck 验证。
- [Risk] app 侧存在同名但语义不同的 DTO type。→ 迁移前逐项区分领域稳定 DTO 与 app 私有 DTO，只替换前者。
- [Risk] 循环依赖可能因 `.type.ts` import schema 暴露出来。→ `.type.ts` 只从同目录 `schema.ts` 导入 schema，不让 schema 反向导入 type。
- [Risk] 一次性迁移过宽导致无关 churn。→ 优先覆盖当前 `packages/domain` 已有 schema 对应的稳定 DTO type，再清理直接重复的 app 侧定义。
