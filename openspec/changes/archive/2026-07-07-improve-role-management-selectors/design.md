## Context

`apps/admin` 的角色管理页已经通过 `@admin/services/role` 消费 admin tRPC，角色创建契约使用 `clientCode`，角色分配创建契约按 `targetType` 使用 `orgCode`、`posCode` 或 `employmentId`。admin-api 服务层负责把这些稳定外部标识解析为数据库内部 id，并保持审计、画像 dirty 和授权语义。

当前前端问题主要是对象选择体验：管理员需要手填编码或 ID。仓库中已有可复用能力：

- `OrganizationTreeSelector` 已提供组织树加载和远程搜索。
- `admin.client.search` 支持按 client code/name/url/description 模糊搜索。
- `admin.position.search` 支持按岗位 code/name 模糊搜索和状态过滤。
- `admin.employment.search` 支持任职分页搜索、用户文本搜索、组织/岗位/状态过滤。

## Goals / Non-Goals

**Goals:**

- 管理员在角色管理页面创建角色时通过下拉选择所属应用。
- 管理员在角色详情中新增组织、岗位、任职分配时通过选择器选择目标对象。
- 选择器提交值继续符合现有 role create / role assignment create 契约。
- 切换分配类型后不会提交隐藏字段或旧字段。
- 任职选择器能通过常见信息定位可分配的启用任职。

**Non-Goals:**

- 不修改 `role`、`role_assignment`、`client`、`organization`、`position` 或 `employment` 数据库 schema。
- 不改变角色分配解析、授权命中、user-profile dirty、审计 action 或角色删除约束。
- 不引入新的前端状态管理库或通用表单框架。
- 不提供角色权限绑定管理入口。

## Decisions

### Decision 1: 前端选择器仍提交稳定业务标识

角色创建继续提交 `clientCode`；组织和岗位分配继续提交 `orgCode` / `posCode`；任职分配继续提交 `employmentId`。前端只负责把可读 label 映射到现有契约值，后端继续在 service 层校验对象是否存在、启用且未软删除。

理由：当前 admin-api 已经把外部输入和内部 id 解析隔离在业务服务内，保留该契约可以避免把 DB id 暴露为 client/organization/position 的主交互标识，也不会影响 REST 与 tRPC 共享 operation。

替代方案：新增 assignment create 输入直接提交内部 `targetId`。该方案减少一次服务层 resolve，但会让前端感知不同目标的内部 id 语义，并绕开现有 code 校验路径，不采用。

### Decision 2: 优先复用现有查询接口，必要时只增强任职搜索

应用、组织和岗位选择器直接复用现有 admin 查询能力。任职选择器先基于 `admin.employment.search` 实现；如果只按用户搜索不足以满足目标定位，则扩展任职搜索的 fuzzy text，使其同时匹配 `employment.id::text`、用户 username/name、任职组织 code/name 和岗位 code/name。

理由：这能把主要改动限制在 admin 前端，避免为每种目标新增 selector API。任职是唯一现有 fuzzy text 信息较窄的对象，增强搜索本身也能改善任职管理页查询能力。

替代方案：新增 `admin.role.assignmentTargets.search` 按 targetType 统一返回可分配对象。该方案接口语义更专用，但会引入新的 adapter/service/repository DTO 和测试面；当前场景可通过现有查询满足，暂不采用。

### Decision 3: 类型专属字段必须隔离

新增角色分配表单按 `targetType` 渲染不同字段，并在切换类型时清理 `orgCode`、`posCode`、`employmentId` 和不适用的 `includeDescendants`。非组织分配提交时不得携带 `includeDescendants=true`。

理由：现有后端契约会拒绝 position/employment 分配中的 `includeDescendants=true`。如果前端只隐藏字段但保留旧值，用户从组织切到岗位/任职后可能提交无效 payload。

替代方案：后端忽略非组织分配中的 `includeDescendants`。该方案会弱化已有输入校验，不采用。

### Decision 4: 下拉 label 使用业务可读摘要

选择器 label 需要同时显示名称和稳定标识：

- client: `clientName（clientCode）`
- organization: `orgName (orgCode)`，由组织树现有展示提供。
- position: `posName（posCode）`
- employment: `name（username） / org path / posName（posCode） / #id`

理由：管理员选择的是业务对象，不是裸编码；同时展示稳定标识便于核对和审计沟通。

## Risks / Trade-offs

- [Risk] 任职下拉的 label 过长，导致弹窗内换行或截断体验不佳。→ Mitigation: 选择器 label 使用紧凑文本，必要时在 option 中用两行展示姓名/组织岗位摘要，value 保持 `employmentId`。
- [Risk] 远程搜索在空关键字时返回过多对象。→ Mitigation: client/position 可加载第一页常用结果；employment 建议要求输入关键字或限制 pageSize，并默认过滤 `EmploymentStatus.Enable`。
- [Risk] 复用 `employment.search` 后，任职管理页搜索语义也会扩大。→ Mitigation: 增强只扩展 fuzzy text 的匹配字段，不改变 exactConditions、默认状态或返回结构。
- [Risk] 前端类型推断因 tRPC 输入变化暴露编译错误。→ Mitigation: 保持 role create / assignment create 输入不变；任职搜索若增强，只做向后兼容的 fuzzy behavior 改动。

## Migration Plan

无需数据迁移。部署顺序可按常规前后端一起发布；如果仅实现前端复用现有查询，不需要 admin-api 先行发布。若增强任职搜索，应先发布 admin-api 或与 admin 同批发布；旧前端继续兼容增强后的搜索契约。

回滚方式为回退 admin 前端改动；若包含任职搜索增强，后端增强是向后兼容行为，可随版本回退但不要求数据处理。

## Open Questions

- 任职选择器是否要求空关键字加载第一页启用任职，还是必须输入关键字后搜索？建议实现为必须输入关键字，避免在真实组织中加载无意义的大列表。
